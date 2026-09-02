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
            hideError();
            webView.loadUrl(data.toString());
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onPause() {
        webView.onPause();
        super.onPause();
    }

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
        pendingGeoCallback.invoke(pendingGeoOrigin, granted, granted);
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
        settings.setDatabaseEnabled(true);
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
                mainFrameFailed = false;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    mainFrameFailed = true;
                    showError(getString(R.string.error_network, String.valueOf(error.getDescription())));
                }
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) {
                    mainFrameFailed = true;
                    showError(getString(R.string.error_http, response.getStatusCode()));
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!mainFrameFailed) hideError();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (hasLocationPermission()) {
                    callback.invoke(origin, true, true);
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
        hideError();
        Uri data = intent == null ? null : intent.getData();
        String url = data != null && isAppUrl(data) ? data.toString() : getAppUrl();
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
        if (!value.endsWith("/") && (uri.getPath() == null || uri.getPath().isEmpty())) value = value + "/";
        return value;
    }
}
