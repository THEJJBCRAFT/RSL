package de.redstonelabs.findmeinsoon;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.provider.Settings;
import android.view.View;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Native Huelle um die Find Mein Soon Web-App.
 *
 * Die Web-App liegt komplett im APK (Assets) und wird unter einer internen https-Adresse ausgeliefert, damit
 * Verschluesselung (WebCrypto) und Standortabfrage wie auf einer richtigen Website funktionieren. Es wird nichts
 * von einer Website nachgeladen; die Handys einer Gruppe tauschen ihre Daten verschluesselt ueber einen
 * oeffentlichen MQTT-Broker aus. Die Activity reicht die Standort-Berechtigung durch, oeffnet Karten- und
 * Fremdlinks in externen Apps, startet den Vordergrund-Dienst fuer den Hintergrund-Standort und zeigt
 * Alarme als echte Benachrichtigungen.
 */
public class MainActivity extends Activity implements ShareService.PositionSink {

    private static final String APP_HOST = "app.findmeinsoon.local";
    private static final String APP_URL = "https://" + APP_HOST + "/index.html";
    private static final String ASSET_ROOT = "find-mein-soon/";
    private static final String CHANNEL_ALARM = "alarm";
    private static final int REQUEST_LOCATION = 1001;
    private static final int REQUEST_NOTIFICATIONS = 1002;
    private static final int ALARM_NOTIFICATION_ID = 100;
    private static final Map<String, String> MIME_TYPES = new HashMap<>();

    static {
        MIME_TYPES.put("html", "text/html");
        MIME_TYPES.put("css", "text/css");
        MIME_TYPES.put("js", "text/javascript");
        MIME_TYPES.put("json", "application/json");
        MIME_TYPES.put("webmanifest", "application/manifest+json");
        MIME_TYPES.put("png", "image/png");
        MIME_TYPES.put("jpg", "image/jpeg");
        MIME_TYPES.put("jpeg", "image/jpeg");
        MIME_TYPES.put("svg", "image/svg+xml");
        MIME_TYPES.put("webp", "image/webp");
        MIME_TYPES.put("ico", "image/x-icon");
        MIME_TYPES.put("woff", "font/woff");
        MIME_TYPES.put("woff2", "font/woff2");
        MIME_TYPES.put("txt", "text/plain");
        MIME_TYPES.put("md", "text/markdown");
    }

    private WebView webView;
    private String pendingGeoOrigin;
    private GeolocationPermissions.Callback pendingGeoCallback;
    private boolean sharingWanted;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        webView = findViewById(R.id.webView);
        setupWebView();
        ShareService.setSink(this);

        // Standort-Entscheidungen nicht in der WebView speichern: die Android-Berechtigung
        // wird bei jedem Start neu geprueft (siehe onGeolocationPermissionsShowPrompt).
        GeolocationPermissions.getInstance().clearAll();

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            loadApp(getIntent());
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (joinCode(intent) != null) loadApp(intent);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    // Bewusst kein webView.onPause(): JavaScript-Timer und MQTT-Verbindung laufen weiter, der
    // Vordergrund-Dienst (ShareService) haelt den Prozess am Leben und liefert Positionen nach.

    @Override
    protected void onDestroy() {
        ShareService.setSink(null);
        if (isFinishing()) ShareService.stop(this);
        if (webView != null) {
            ((FrameLayout) webView.getParent()).removeView(webView);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        // Erst darf die Web-App offene Menues schliessen; sonst App in den Hintergrund statt beenden,
        // damit Standortfreigabe und Verbindung weiterlaufen.
        webView.evaluateJavascript("(function(){try{return window.fmsBack?String(window.fmsBack()):'false'}catch(e){return 'false'}})()", value -> {
            if ("\"true\"".equals(value)) return;
            if (webView != null && webView.canGoBack()) {
                webView.goBack();
                return;
            }
            moveTaskToBack(true);
        });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_LOCATION) {
            boolean granted = hasLocationPermission();
            if (pendingGeoCallback != null) {
                // retain=false: nicht dauerhaft merken, damit eine spaeter entzogene Android-Berechtigung neu abgefragt wird.
                pendingGeoCallback.invoke(pendingGeoOrigin, granted, false);
                pendingGeoCallback = null;
                pendingGeoOrigin = null;
            }
            if (granted && sharingWanted) startSharingService();
            if (!granted) Toast.makeText(this, R.string.location_denied, Toast.LENGTH_LONG).show();
        } else if (requestCode == REQUEST_NOTIFICATIONS) {
            if (sharingWanted) startSharingService();
        }
    }

    // ---------- Vordergrund-Dienst ----------

    private void setSharing(boolean on) {
        sharingWanted = on;
        if (!on) {
            ShareService.stop(this);
            return;
        }
        if (!hasLocationPermission()) {
            requestPermissions(new String[] { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, REQUEST_LOCATION);
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, REQUEST_NOTIFICATIONS);
            return;
        }
        startSharingService();
    }

    private void startSharingService() {
        if (!sharingWanted || !hasLocationPermission()) return;
        try {
            ShareService.start(this);
        } catch (RuntimeException error) {
            // z. B. Start aus dem Hintergrund verboten: dann eben nur, solange die App offen ist.
        }
    }

    /** Vom "Stopp"-Knopf der Benachrichtigung: Teilen auch in der Web-App pausieren. */
    void onSharingStoppedFromNotification() {
        sharingWanted = false;
        runOnUiThread(() -> {
            if (webView != null) webView.evaluateJavascript("window.fmsSetSharing && window.fmsSetSharing(false)", null);
        });
    }

    @Override
    public void onNativePosition(Location location) {
        if (webView == null) return;
        String call = String.format(Locale.ROOT,
                "window.fmsNativePosition && window.fmsNativePosition(%f,%f,%f,%s,%s,%d)",
                location.getLatitude(), location.getLongitude(), location.getAccuracy(),
                location.hasSpeed() ? String.format(Locale.ROOT, "%f", location.getSpeed()) : "null",
                location.hasBearing() ? String.format(Locale.ROOT, "%f", location.getBearing()) : "null",
                location.getTime());
        runOnUiThread(() -> {
            if (webView != null) webView.evaluateJavascript(call, null);
        });
    }

    // ---------- Alarm-Benachrichtigung ----------

    private void showAlarmNotification(String memberId, String name, String message, double lat, double lng) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ALARM, getString(R.string.channel_alarm), NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription(getString(R.string.channel_alarm_description));
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[] { 0, 400, 150, 400, 150, 600 });
            channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
                    new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            channel.setBypassDnd(true);
            manager.createNotificationChannel(channel);
        }

        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openIntent = PendingIntent.getActivity(this, 3, open, ShareService.pendingFlags());
        String title = getString(R.string.alarm_title, name);
        String text = message == null || message.isEmpty() ? getString(R.string.alarm_text_default) : message;

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ALARM)
                : legacyAlarmBuilder();
        builder.setSmallIcon(R.drawable.ic_stat_pin)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setContentIntent(openIntent)
                .setCategory(Notification.CATEGORY_ALARM)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setAutoCancel(false)
                .setOngoing(true);
        if (Double.isFinite(lat) && Double.isFinite(lng) && (lat != 0 || lng != 0)) {
            Uri route = Uri.parse(String.format(Locale.ROOT, "https://www.google.com/maps/dir/?api=1&destination=%f,%f&travelmode=walking", lat, lng));
            PendingIntent routeIntent = PendingIntent.getActivity(this, 4, new Intent(Intent.ACTION_VIEW, route), ShareService.pendingFlags());
            builder.addAction(new Notification.Action.Builder(null, getString(R.string.alarm_route), routeIntent).build());
        }
        manager.notify(ALARM_NOTIFICATION_ID, builder.build());
    }

    @SuppressWarnings("deprecation")
    private Notification.Builder legacyAlarmBuilder() {
        return new Notification.Builder(this)
                .setPriority(Notification.PRIORITY_MAX)
                .setDefaults(Notification.DEFAULT_ALL);
    }

    private void clearAlarmNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.cancel(ALARM_NOTIFICATION_ID);
    }

    // ---------- Bruecke zur Web-App ----------

    /** Wird der Web-App als window.FindMeinSoonNative zur Verfuegung gestellt. Es laedt nur unsere eigene Seite in der WebView. */
    private final class NativeBridge {
        @JavascriptInterface
        public void setSharing(boolean on) {
            runOnUiThread(() -> MainActivity.this.setSharing(on));
        }

        @JavascriptInterface
        public void showAlert(String memberId, String name, String message, double lat, double lng) {
            runOnUiThread(() -> showAlarmNotification(memberId, name, message, lat, lng));
        }

        @JavascriptInterface
        public void clearAlert() {
            runOnUiThread(MainActivity.this::clearAlarmNotification);
        }

        @JavascriptInterface
        public void share(String title, String text) {
            runOnUiThread(() -> {
                Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain")
                        .putExtra(Intent.EXTRA_SUBJECT, title).putExtra(Intent.EXTRA_TEXT, text);
                try {
                    startActivity(Intent.createChooser(send, title));
                } catch (ActivityNotFoundException error) {
                    Toast.makeText(MainActivity.this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void openSettings() {
            runOnUiThread(() -> {
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()));
                try {
                    startActivity(intent);
                } catch (ActivityNotFoundException error) {
                    Toast.makeText(MainActivity.this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public String version() {
            return BuildConfig.VERSION_NAME;
        }

        @JavascriptInterface
        public boolean isSharingServiceRunning() {
            return ShareService.isRunning();
        }
    }

    // ---------- WebView ----------

    @SuppressWarnings({ "SetJavaScriptEnabled", "AddJavascriptInterface" })
    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " FindMeinSoonApp/" + BuildConfig.VERSION_NAME);
        webView.setBackgroundColor(getResources().getColor(R.color.background, getTheme()));
        webView.addJavascriptInterface(new NativeBridge(), "FindMeinSoonNative");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri != null && "https".equalsIgnoreCase(uri.getScheme()) && APP_HOST.equalsIgnoreCase(uri.getHost())) {
                    return serveAsset(uri.getPath());
                }
                return null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleNavigation(request.getUrl());
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (hasLocationPermission()) {
                    callback.invoke(origin, true, false);
                    return;
                }
                pendingGeoOrigin = origin;
                pendingGeoCallback = callback;
                requestPermissions(new String[] {
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                }, REQUEST_LOCATION);
            }

            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                // window.open() und target="_blank": Ziel abfangen und extern oeffnen.
                WebView popup = new WebView(MainActivity.this);
                popup.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView popupView, WebResourceRequest request) {
                        handleNavigation(request.getUrl());
                        popupView.post(popupView::destroy);
                        return true;
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(popup);
                resultMsg.sendToTarget();
                return true;
            }
        });
    }

    /** Liefert eine Datei der Web-App aus den Assets. */
    private WebResourceResponse serveAsset(String path) {
        String file = path == null ? "" : path;
        while (file.startsWith("/")) file = file.substring(1);
        if (file.isEmpty() || file.endsWith("/")) file += "index.html";
        if (file.contains("..")) return notFound();

        String extension = file.contains(".") ? file.substring(file.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT) : "";
        String mime = MIME_TYPES.get(extension);
        if (mime == null) mime = "application/octet-stream";
        try {
            InputStream stream = getAssets().open(ASSET_ROOT + file);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            return new WebResourceResponse(mime, mime.startsWith("text/") || mime.contains("javascript") || mime.contains("json") ? "utf-8" : null, 200, "OK", headers, stream);
        } catch (IOException error) {
            return notFound();
        }
    }

    private WebResourceResponse notFound() {
        InputStream body = new ByteArrayInputStream("Nicht gefunden".getBytes(StandardCharsets.UTF_8));
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", Collections.emptyMap(), body);
    }

    /**
     * Entscheidet, ob eine Navigation in der WebView bleibt (eigene App) oder extern geoeffnet wird.
     * Rueckgabe true bedeutet: die WebView soll die URL NICHT selbst laden.
     */
    private boolean handleNavigation(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if ("about".equals(scheme) || "javascript".equals(scheme) || "data".equals(scheme) || "blob".equals(scheme)) {
            return false;
        }
        if ("https".equals(scheme) && APP_HOST.equalsIgnoreCase(uri.getHost())) {
            return false;
        }
        openExternal(uri);
        return true;
    }

    private void openExternal(Uri uri) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show();
        }
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    // ---------- Laden ----------

    private void loadApp(Intent intent) {
        String join = joinCode(intent);
        String url = join == null ? APP_URL : APP_URL + "#join=" + Uri.encode(join);
        webView.setVisibility(View.VISIBLE);
        webView.loadUrl(url);
    }

    /** Gruppencode aus einem Einladungslink (…/apps/find-mein-soon/#join=CODE oder ?join=CODE). */
    private static String joinCode(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data == null) return null;
        String join = data.getQueryParameter("join");
        if (join == null && data.getFragment() != null) {
            for (String part : data.getFragment().split("&")) {
                if (part.startsWith("join=")) join = part.substring(5);
            }
        }
        if (join == null) return null;
        String clean = join.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        return clean.isEmpty() ? null : clean;
    }
}
