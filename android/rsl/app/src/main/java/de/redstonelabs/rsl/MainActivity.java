package de.redstonelabs.rsl;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Native Huelle um die RSL-Oberflaeche.
 *
 * Die Oberflaeche (apps/rsl-mobile) liegt komplett im APK und wird unter einer internen https-Adresse
 * ausgeliefert, damit sie sich wie eine richtige Website verhaelt. Nachgeladen wird nichts.
 *
 * Die Huelle uebernimmt genau das, was JavaScript auf einem Handy nicht selbst kann:
 * Minecraft-Server ueber eine rohe TCP-Verbindung anpingen, fertige Videos in die Galerie legen
 * und diese teilen. Alles andere - auch das Rendern der Videos - passiert in der WebView.
 */
public class MainActivity extends Activity {

    private static final String APP_HOST = "app.rsl.local";
    private static final String APP_URL = "https://" + APP_HOST + "/index.html";
    private static final String ASSET_ROOT = "web/";
    private static final Map<String, String> MIME_TYPES = new HashMap<>();

    static {
        MIME_TYPES.put("html", "text/html");
        MIME_TYPES.put("css", "text/css");
        MIME_TYPES.put("js", "text/javascript");
        MIME_TYPES.put("mjs", "text/javascript");
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
    }

    private WebView webView;
    private VideoSaver saver;
    private AccountStore account;
    private ExecutorService worker;
    /** Die Anmeldung wartet minutenlang auf den Browser - dafuer ein eigener Faden. */
    private Thread signIn;
    private volatile boolean signInCancelled;
    /** Zuletzt gemeldeter Stand der Anmeldung, um ihn bei Bedarf zu wiederholen. */
    private volatile JSONObject lastAccountEvent;
    /** Zeitpunkt des letzten Zurueck-Tippens: zweimal kurz hintereinander beendet die App. */
    private long lastBackPress;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        webView = findViewById(R.id.webView);
        saver = new VideoSaver(this);
        account = new AccountStore(this);
        worker = Executors.newSingleThreadExecutor();
        setupWebView();
        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(APP_URL);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        if (webView != null) webView.saveState(state);
    }

    @Override
    protected void onDestroy() {
        signInCancelled = true;
        if (worker != null) worker.shutdownNow();
        if (saver != null) saver.cancel();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        // Die Oberflaeche darf zuerst entscheiden (z. B. vom Bereich zurueck auf Start).
        webView.evaluateJavascript("(window.rslOnBack && window.rslOnBack()) === true", value -> {
            if ("true".equals(value)) return;
            long now = System.currentTimeMillis();
            if (now - lastBackPress < 2000) {
                finish();
                return;
            }
            lastBackPress = now;
            Toast.makeText(this, R.string.back_again, Toast.LENGTH_SHORT).show();
        });
    }

    // ---------- Bruecke zur Oberflaeche ----------

    private final class NativeBridge {

        @JavascriptInterface
        public String appInfo() {
            JSONObject info = new JSONObject();
            try {
                info.put("name", getString(R.string.app_name));
                info.put("version", BuildConfig.VERSION_NAME);
                info.put("os", "Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")");
                info.put("arch", Build.SUPPORTED_ABIS.length > 0 ? Build.SUPPORTED_ABIS[0] : Build.CPU_ABI);
                info.put("build", String.valueOf(BuildConfig.VERSION_CODE));
            } catch (org.json.JSONException ignored) {
                // Feste Schluessel, einfache Werte: kann nicht schiefgehen.
            }
            return info.toString();
        }

        @JavascriptInterface
        public void mcPing(String id, String host) {
            // Netzverkehr gehoert nicht auf den Bruecken-Thread: der blockiert sonst weitere Aufrufe.
            worker.execute(() -> {
                JSONObject status = McPing.ping(MainActivity.this, host);
                callJs("window.rslMcResult", id, status.toString());
            });
        }

        @JavascriptInterface
        public boolean saveBegin(String id, String name) {
            return saver.begin(name);
        }

        @JavascriptInterface
        public boolean saveChunk(String id, String base64) {
            return saver.chunk(base64);
        }

        @JavascriptInterface
        public void saveEnd(String id) {
            // Das Zusammenlegen kopiert etliche Megabyte - dafuer den Arbeits-Thread nehmen.
            worker.execute(() -> {
                String error = saver.finish();
                if (error == null) {
                    callJsResult(id, true, "In Filme/RSL gespeichert");
                } else {
                    callJsResult(id, false, error);
                }
            });
        }

        @JavascriptInterface
        public void saveCancel(String id) {
            saver.cancel();
        }

        @JavascriptInterface
        public boolean canShare() {
            return saver.lastSaved() != null;
        }

        @JavascriptInterface
        public void shareVideo() {
            Uri video = saver.lastSaved();
            if (video == null) return;
            runOnUiThread(() -> {
                Intent send = new Intent(Intent.ACTION_SEND)
                        .setType("video/webm")
                        .putExtra(Intent.EXTRA_STREAM, video)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startChooser(send, getString(R.string.share_video));
            });
        }

        @JavascriptInterface
        public void shareText(String title, String text) {
            runOnUiThread(() -> {
                Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain")
                        .putExtra(Intent.EXTRA_SUBJECT, title == null ? "" : title)
                        .putExtra(Intent.EXTRA_TEXT, text == null ? "" : text);
                startChooser(send, title);
            });
        }

        /* ------------------------------ Minecraft-Konto ------------------------------ */

        @JavascriptInterface
        public String accountState() {
            return account.state().toString();
        }

        @JavascriptInterface
        public void setClientId(String value) {
            account.setClientId(value);
        }

        @JavascriptInterface
        public void accountSignIn() {
            startSignIn();
        }

        @JavascriptInterface
        public void accountCancel() {
            signInCancelled = true;
        }

        @JavascriptInterface
        public void accountSignOut() {
            signInCancelled = true;
            account.clear();
            accountEvent(idleEvent());
        }

        @JavascriptInterface
        public void openLink(String url) {
            runOnUiThread(() -> handleNavigation(Uri.parse(url == null ? "" : url)));
        }

        @JavascriptInterface
        public void copyText(String text) {
            runOnUiThread(() -> {
                ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                if (clipboard == null) return;
                clipboard.setPrimaryClip(ClipData.newPlainText("RSL", text == null ? "" : text));
            });
        }
    }

    /* -------------------------------- Anmelde-Ablauf -------------------------------- */

    /**
     * Holt den Code, zeigt ihn an und wartet, bis der Nutzer im Browser bestaetigt hat.
     * Jeder Schritt geht als Meldung an die Oberflaeche, damit sie den Stand zeigen kann.
     */
    private void startSignIn() {
        if (signIn != null && signIn.isAlive()) {
            // Schon unterwegs: den zuletzt gezeigten Stand noch einmal schicken, damit die
            // Ansicht nach einem Wechsel in einen anderen Bereich nicht leer dasteht.
            if (lastAccountEvent != null) accountEvent(lastAccountEvent);
            return;
        }
        String clientId = account.clientId();
        if (clientId.isEmpty()) {
            accountEvent(errorEvent("Es fehlt die Microsoft-Anwendungs-ID. Sie steht in den Einstellungen."));
            return;
        }
        signInCancelled = false;
        signIn = new Thread(() -> {
            MsAuth auth = MsAuth.production(clientId);
            try {
                MsAuth.DeviceCode code = auth.start();
                JSONObject event = new JSONObject();
                event.put("stage", "code");
                event.put("userCode", code.userCode);
                event.put("verificationUri", code.verificationUri);
                event.put("expiresAt", code.expiresAtMillis);
                accountEvent(event);

                MsAuth.MsTokens tokens = auth.awaitConfirmation(code, () -> signInCancelled);
                accountEvent(stageEvent("checking"));
                MsAuth.Account result = auth.finish(tokens);
                account.save(result);

                JSONObject done = new JSONObject();
                done.put("stage", "done");
                done.put("account", account.state());
                accountEvent(done);
            } catch (MsAuth.AuthException error) {
                accountEvent(errorEvent(error.getMessage()));
            } catch (org.json.JSONException error) {
                accountEvent(errorEvent("Antwort nicht lesbar"));
            }
        }, "rsl-signin");
        signIn.start();
    }

    private JSONObject stageEvent(String stage) {
        try {
            return new JSONObject().put("stage", stage);
        } catch (org.json.JSONException error) {
            return new JSONObject();
        }
    }

    private JSONObject errorEvent(String message) {
        try {
            return new JSONObject().put("stage", "error")
                    .put("message", message == null || message.isEmpty() ? "Unbekannter Fehler" : message);
        } catch (org.json.JSONException error) {
            return new JSONObject();
        }
    }

    private JSONObject idleEvent() {
        try {
            return new JSONObject().put("stage", "idle").put("account", account.state());
        } catch (org.json.JSONException error) {
            return new JSONObject();
        }
    }

    private void accountEvent(JSONObject event) {
        lastAccountEvent = event;
        String call = "window.rslAccountEvent && window.rslAccountEvent(" + JSONObject.quote(event.toString()) + ")";
        webView.post(() -> webView.evaluateJavascript(call, null));
    }

    private void startChooser(Intent intent, String title) {
        try {
            startActivity(Intent.createChooser(intent, title));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show();
        }
    }

    /** Ruft eine Funktion der Oberflaeche mit zwei Text-Werten auf. */
    private void callJs(String function, String id, String payload) {
        String call = function + "(" + JSONObject.quote(id == null ? "" : id) + ","
                + JSONObject.quote(payload == null ? "" : payload) + ")";
        webView.post(() -> webView.evaluateJavascript(call, null));
    }

    /** Meldet das Ergebnis eines Speicher-Auftrags zurueck. */
    private void callJsResult(String id, boolean ok, String message) {
        String call = "window.rslSaveResult(" + JSONObject.quote(id == null ? "" : id) + "," + ok + ","
                + JSONObject.quote(message == null ? "" : message) + ")";
        webView.post(() -> webView.evaluateJavascript(call, null));
    }

    // ---------- WebView ----------

    @SuppressWarnings({ "SetJavaScriptEnabled", "AddJavascriptInterface" })
    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        // Die Vorschau der Video-Einheit laeuft ohne Antippen los.
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " RslApp/" + BuildConfig.VERSION_NAME);
        webView.setBackgroundColor(getResources().getColor(R.color.background, getTheme()));
        webView.addJavascriptInterface(new NativeBridge(), "RslNative");

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

        webView.setWebChromeClient(new WebChromeClient());
    }

    /** Liefert eine Datei der Oberflaeche aus den Assets. */
    private WebResourceResponse serveAsset(String path) {
        String file = path == null ? "" : path;
        while (file.startsWith("/")) file = file.substring(1);
        if (file.isEmpty() || file.endsWith("/")) file += "index.html";
        if (file.contains("..")) return notFound();

        String extension = file.contains(".") ? file.substring(file.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT) : "";
        String mime = MIME_TYPES.get(extension);
        if (mime == null) mime = "application/octet-stream";
        boolean text = mime.startsWith("text/") || mime.contains("javascript") || mime.contains("json")
                || mime.contains("svg");
        try {
            InputStream stream = getAssets().open(ASSET_ROOT + file);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            return new WebResourceResponse(mime, text ? "utf-8" : null, 200, "OK", headers, stream);
        } catch (IOException error) {
            return notFound();
        }
    }

    private WebResourceResponse notFound() {
        InputStream body = new ByteArrayInputStream("Nicht gefunden".getBytes(StandardCharsets.UTF_8));
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", Collections.emptyMap(), body);
    }

    /**
     * Entscheidet, ob eine Navigation in der WebView bleibt (eigene Oberflaeche) oder extern
     * geoeffnet wird. Rueckgabe true bedeutet: die WebView soll die Adresse NICHT selbst laden.
     */
    private boolean handleNavigation(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if ("about".equals(scheme) || "javascript".equals(scheme) || "data".equals(scheme) || "blob".equals(scheme)) {
            return false;
        }
        if ("https".equals(scheme) && APP_HOST.equalsIgnoreCase(uri.getHost())) return false;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, R.string.no_app_for_link, Toast.LENGTH_SHORT).show();
        }
        return true;
    }
}
