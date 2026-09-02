package de.redstonelabs.findmeinsoon;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.view.View;
import android.webkit.GeolocationPermissions;
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
 * oeffentlichen MQTT-Broker aus. Die Activity reicht die Standort-Berechtigung durch und oeffnet Karten- und
 * Fremdlinks in externen Apps.
 */
public class MainActivity extends Activity {

    private static final String APP_HOST = "app.findmeinsoon.local";
    private static final String APP_URL = "https://" + APP_HOST + "/index.html";
    private static final String ASSET_ROOT = "find-mein-soon/";
    private static final int REQUEST_LOCATION = 1001;
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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        webView = findViewById(R.id.webView);
        setupWebView();

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

    // Bewusst kein webView.onPause(): das wuerde JavaScript-Timer und die Standortabfrage anhalten,
    // sobald der Bildschirm ausgeht. So laufen Standort-Updates weiter, solange Android die App am Leben laesst.

    @Override
    protected void onDestroy() {
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
        if (webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQUEST_LOCATION || pendingGeoCallback == null) return;
        boolean granted = hasLocationPermission();
        // retain=false: nicht dauerhaft merken, damit eine spaeter entzogene Android-Berechtigung neu abgefragt wird.
        pendingGeoCallback.invoke(pendingGeoOrigin, granted, false);
        pendingGeoCallback = null;
        pendingGeoOrigin = null;
        if (!granted) {
            Toast.makeText(this, R.string.location_denied, Toast.LENGTH_LONG).show();
        }
    }

    // ---------- WebView ----------

    @SuppressWarnings("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " FindMeinSoonApp/" + BuildConfig.VERSION_NAME);
        webView.setBackgroundColor(getResources().getColor(R.color.background, getTheme()));

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri != null && APP_HOST.equalsIgnoreCase(uri.getHost())) {
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
            headers.put("Access-Control-Allow-Origin", "*");
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
        String url = join == null ? APP_URL : APP_URL + "?join=" + Uri.encode(join);
        webView.setVisibility(View.VISIBLE);
        webView.loadUrl(url);
    }

    /** Gruppencode aus einem Einladungslink (…/apps/find-mein-soon/?join=CODE), falls die App darueber geoeffnet wurde. */
    private static String joinCode(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data == null) return null;
        String join = data.getQueryParameter("join");
        if (join == null) return null;
        String clean = join.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        return clean.isEmpty() ? null : clean;
    }
}
