package de.redstonelabs.findmeinsoon;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.text.InputType;
import android.util.TypedValue;
import android.view.View;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Native Huelle um die Find Mein Soon Web-App.
 *
 * Die Activity laedt die gehostete Web-App in einer WebView, reicht die Standort-Berechtigung
 * an die Seite durch, oeffnet Karten- und Fremdlinks in externen Apps und bietet einen
 * Fallback-Bildschirm, ueber den sich die Server-Adresse ohne Neubau aendern laesst.
 */
public class MainActivity extends Activity {

    private static final String PREFS = "find_mein_soon";
    private static final String PREF_APP_URL = "app_url";
    private static final String SETTINGS_SCHEME = "findmeinsoon";
    private static final int REQUEST_LOCATION = 1001;

    private WebView webView;
    private View errorView;
    private TextView errorText;
    private boolean mainFrameFailed;
    // URL der Navigation, fuer die ein Fehler gemeldet wurde: onReceivedHttpError kommt VOR onPageStarted
    // derselben Navigation, deshalb darf onPageStarted die Markierung dafuer nicht zuruecksetzen.
    private String failedUrl;
    // Zaehlt Navigationen, damit ein spaeter Callback von evaluateJavascript nicht zu einer neueren Seite gehoert.
    private int loadGeneration;
    // true, wenn wir selbst die App-Adresse laden: dann wird die naechste geladene Seite auf die App geprueft.
    private boolean expectApp;
    private String pendingGeoOrigin;
    private GeolocationPermissions.Callback pendingGeoCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        errorView = findViewById(R.id.errorView);
        errorText = findViewById(R.id.errorText);
        findViewById(R.id.retryButton).setOnClickListener(view -> loadApp(null));
        findViewById(R.id.changeUrlButton).setOnClickListener(view -> showUrlDialog());

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
        Uri data = intent.getData();
        if (data != null && isAppUrl(data)) {
            startLoad(data.toString());
        }
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
        if (errorView.getVisibility() != View.VISIBLE && webView.canGoBack()) {
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
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " FindMeinSoonApp/" + BuildConfig.VERSION_NAME);
        webView.setBackgroundColor(getResources().getColor(R.color.background, getTheme()));

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleNavigation(request.getUrl());
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                loadGeneration++;
                if (failedUrl == null || !failedUrl.equals(url)) {
                    mainFrameFailed = false;
                    failedUrl = null;
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    markFailed(request.getUrl().toString(), getString(R.string.error_network, String.valueOf(error.getDescription())));
                }
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) {
                    markFailed(request.getUrl().toString(), getString(R.string.error_http, response.getStatusCode()));
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (mainFrameFailed) return;
                hideError();
                boolean isWebPage = url != null && (url.startsWith("http://") || url.startsWith("https://"));
                boolean check = isAppPage(url) || (expectApp && isWebPage);
                if (isWebPage) expectApp = false;
                if (check) verifyAppLoaded(view, url, loadGeneration);
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

    /**
     * Entscheidet, ob eine Navigation in der WebView bleibt (eigene Website) oder extern geoeffnet wird.
     * Rueckgabe true bedeutet: die WebView soll die URL NICHT selbst laden.
     */
    private boolean handleNavigation(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();

        if (SETTINGS_SCHEME.equals(scheme)) {
            runOnUiThread(this::showUrlDialog);
            return true;
        }
        if ("about".equals(scheme) || "javascript".equals(scheme) || "data".equals(scheme) || "blob".equals(scheme)) {
            return false;
        }
        if (("http".equals(scheme) || "https".equals(scheme)) && isAppUrl(uri)) {
            return false;
        }
        openExternal(uri);
        return true;
    }

    private void markFailed(String url, String message) {
        mainFrameFailed = true;
        failedUrl = url;
        showError(message);
    }

    /**
     * Prueft nach dem Laden, ob unter der Adresse wirklich Find Mein Soon liegt. Hosting-Dienste antworten bei
     * falscher Adresse gern mit einer Textseite wie "Not Found" (auch mit Status 200), die sonst als App durchginge.
     */
    private void verifyAppLoaded(WebView view, String finishedUrl, int generation) {
        view.evaluateJavascript(
                "(function(){return !!(document.getElementById('app') && document.getElementById('setupForm'));})()",
                value -> {
                    // null: Seite ist inzwischen weg; andere Generation: es laeuft schon eine neuere Navigation.
                    if (webView == null || value == null || generation != loadGeneration || mainFrameFailed) return;
                    if ("true".equals(value)) return;
                    markFailed(finishedUrl, getString(R.string.error_not_app, getAppUrl()));
                });
    }

    /**
     * Liegt die geladene Seite im App-Ordner? Vergleicht Host (ohne Gross-/Kleinschreibung) und Pfad-Praefix,
     * ignoriert Schema und Port, weil die WebView nach Weiterleitungen (z. B. http -> https) die endgueltige URL meldet.
     */
    private boolean isAppPage(String url) {
        if (url == null) return false;
        Uri page = Uri.parse(url);
        Uri app = Uri.parse(getAppUrl());
        if (page.getHost() == null || app.getHost() == null || !page.getHost().equalsIgnoreCase(app.getHost())) return false;
        String appPath = folderPath(app.getPath());
        String pagePath = page.getPath() == null || page.getPath().isEmpty() ? "/" : page.getPath();
        return pagePath.startsWith(appPath);
    }

    private static String folderPath(String path) {
        String value = path == null || path.isEmpty() ? "/" : path;
        if (value.endsWith("/index.html")) value = value.substring(0, value.length() - "index.html".length());
        if (!value.endsWith("/")) value = value + "/";
        return value;
    }

    private boolean isAppUrl(Uri uri) {
        Uri app = Uri.parse(getAppUrl());
        String host = uri.getHost();
        return host != null && host.equalsIgnoreCase(app.getHost());
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

    // ---------- Laden / Fehler ----------

    private void loadApp(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        startLoad(data != null && isAppUrl(data) ? data.toString() : getAppUrl());
    }

    private void startLoad(String url) {
        mainFrameFailed = false;
        failedUrl = null;
        expectApp = true;
        hideError();
        webView.loadUrl(url);
    }

    private void showError(String message) {
        errorText.setText(message);
        errorView.setVisibility(View.VISIBLE);
    }

    private void hideError() {
        errorView.setVisibility(View.GONE);
    }

    // ---------- Server-Adresse ----------

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private String getAppUrl() {
        String stored = prefs().getString(PREF_APP_URL, null);
        return stored == null || stored.isEmpty() ? BuildConfig.APP_URL : stored;
    }

    private void showUrlDialog() {
        EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setText(getAppUrl());
        input.setSelection(input.getText().length());
        int padding = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 20, getResources().getDisplayMetrics());
        FrameLayout container = new FrameLayout(this);
        container.setPadding(padding, padding / 2, padding, 0);
        container.addView(input);

        new AlertDialog.Builder(this)
                .setTitle(R.string.url_dialog_title)
                .setMessage(R.string.url_dialog_message)
                .setView(container)
                .setPositiveButton(R.string.url_dialog_save, (dialog, which) -> {
                    String url = normalizeUrl(input.getText().toString());
                    if (url == null) {
                        Toast.makeText(this, R.string.url_invalid, Toast.LENGTH_LONG).show();
                        return;
                    }
                    prefs().edit().putString(PREF_APP_URL, url).apply();
                    loadApp(null);
                })
                .setNeutralButton(R.string.url_dialog_reset, (dialog, which) -> {
                    prefs().edit().remove(PREF_APP_URL).apply();
                    loadApp(null);
                })
                .setNegativeButton(R.string.url_dialog_cancel, null)
                .show();
    }

    private static String normalizeUrl(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty()) return null;
        if (!value.matches("(?i)^https?://.*")) value = "https://" + value;
        Uri uri = Uri.parse(value);
        if (uri.getHost() == null || uri.getHost().isEmpty()) return null;
        if (uri.getQuery() != null || uri.getFragment() != null) return value;
        // Ordner-Adressen brauchen einen Schraegstrich am Ende, sonst stimmen die relativen Pfade der Web-App nicht.
        String path = uri.getPath() == null ? "" : uri.getPath();
        String lastSegment = path.substring(path.lastIndexOf('/') + 1);
        if (!value.endsWith("/") && !lastSegment.contains(".")) value = value + "/";
        return value;
    }
}
