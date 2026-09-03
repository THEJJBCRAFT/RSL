package de.redstonelabs.rsl;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * Anmeldung mit dem Microsoft-Konto und Pruefung, ob es Minecraft besitzt.
 *
 * Ein Feld fuer Benutzername und Passwort gibt es bewusst nicht: Die alten Mojang-Konten sind
 * abgeschafft, und Microsoft laesst einen Passwort-Login von fremden Programmen gar nicht zu.
 * Stattdessen der Weg, den auch die Launcher nehmen (Geraete-Code):
 *
 *   1. Die App holt sich einen kurzen Code und zeigt ihn an.
 *   2. Der Nutzer meldet sich damit im Browser bei Microsoft an - Passwort und Zwei-Faktor
 *      bleiben komplett bei Microsoft, die App sieht davon nichts.
 *   3. Die App fragt so lange nach, bis die Anmeldung bestaetigt ist, und bekommt einen Schluessel.
 *   4. Damit geht es weiter ueber Xbox Live (XBL, dann XSTS) zu Minecraft.
 *   5. Zum Schluss: Besitzt das Konto Minecraft, und wie heisst der Spieler?
 *
 * Diese Klasse kommt ohne Android aus - sie spricht nur HTTP und JSON. Dadurch laesst sie sich
 * auf dem Rechner gegen einen nachgebauten Microsoft-Dienst testen (test/rsl-mobile).
 */
final class MsAuth {

    /** Fehler mit einem Text, der so in der App stehen darf. */
    static final class AuthException extends Exception {
        AuthException(String message) {
            super(message);
        }
    }

    /** Wird beim Warten auf die Bestaetigung immer wieder gefragt. */
    interface Cancel {
        boolean cancelled();
    }

    /** Der Code, den der Nutzer im Browser eingibt. */
    static final class DeviceCode {
        final String deviceCode;
        final String userCode;
        final String verificationUri;
        final int intervalSeconds;
        final long expiresAtMillis;

        DeviceCode(String deviceCode, String userCode, String verificationUri, int intervalSeconds, long expiresAtMillis) {
            this.deviceCode = deviceCode;
            this.userCode = userCode;
            this.verificationUri = verificationUri;
            this.intervalSeconds = intervalSeconds;
            this.expiresAtMillis = expiresAtMillis;
        }
    }

    /** Was Microsoft nach der Bestaetigung herausgibt. */
    static final class MsTokens {
        final String accessToken;
        final String refreshToken;

        MsTokens(String accessToken, String refreshToken) {
            this.accessToken = accessToken;
            this.refreshToken = refreshToken;
        }
    }

    /** Das Ergebnis: wer ist angemeldet, und besitzt das Konto Minecraft? */
    static final class Account {
        boolean owns;
        /** Konto besitzt Minecraft, hat aber noch keinen Spielernamen festgelegt. */
        boolean profileMissing;
        String name = "";
        String uuid = "";
        String skinUrl = "";
        String mcToken = "";
        long mcExpiresAtMillis;
        String refreshToken = "";
    }

    private static final int TIMEOUT_MS = 15000;
    /** Grosszuegig, aber nicht endlos - eine Antwort dieser Dienste ist immer klein. */
    private static final int MAX_BODY = 512 * 1024;

    private final String clientId;
    private final String deviceCodeUrl;
    private final String tokenUrl;
    private final String xblUrl;
    private final String xstsUrl;
    private final String mcLoginUrl;
    private final String mcStoreUrl;
    private final String mcProfileUrl;

    private MsAuth(String clientId, String deviceCodeUrl, String tokenUrl, String xblUrl, String xstsUrl,
                   String mcLoginUrl, String mcStoreUrl, String mcProfileUrl) {
        this.clientId = clientId;
        this.deviceCodeUrl = deviceCodeUrl;
        this.tokenUrl = tokenUrl;
        this.xblUrl = xblUrl;
        this.xstsUrl = xstsUrl;
        this.mcLoginUrl = mcLoginUrl;
        this.mcStoreUrl = mcStoreUrl;
        this.mcProfileUrl = mcProfileUrl;
    }

    static MsAuth production(String clientId) {
        return new MsAuth(
                clientId,
                "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode",
                "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
                "https://user.auth.xboxlive.com/user/authenticate",
                "https://xsts.auth.xboxlive.com/xsts/authorize",
                "https://api.minecraftservices.com/authentication/login_with_xbox",
                "https://api.minecraftservices.com/entitlements/mcstore",
                "https://api.minecraftservices.com/minecraft/profile");
    }

    /** Nur fuer den Test: alle Adressen liegen unter einer Basis. */
    static MsAuth against(String base, String clientId) {
        return new MsAuth(clientId, base + "/devicecode", base + "/token", base + "/xbl", base + "/xsts",
                base + "/mclogin", base + "/mcstore", base + "/mcprofile");
    }

    /* ------------------------------- Schritt 1 und 2 ------------------------------- */

    /** Holt den Code, den der Nutzer im Browser eingibt. */
    DeviceCode start() throws AuthException {
        String body = form("client_id", clientId, "scope", "XboxLive.signin offline_access");
        JSONObject answer = postForm(deviceCodeUrl, body, "Microsoft antwortet nicht");
        String device = answer.optString("device_code", "");
        String user = answer.optString("user_code", "");
        String uri = answer.optString("verification_uri", "https://www.microsoft.com/link");
        if (device.isEmpty() || user.isEmpty()) {
            throw new AuthException(describe(answer, "Microsoft hat keinen Anmelde-Code herausgegeben"));
        }
        int interval = Math.max(1, answer.optInt("interval", 5));
        long expires = System.currentTimeMillis() + Math.max(60, answer.optInt("expires_in", 900)) * 1000L;
        return new DeviceCode(device, user, uri, interval, expires);
    }

    /**
     * Fragt so lange nach, bis der Nutzer die Anmeldung im Browser bestaetigt hat.
     * Wartet dazwischen genau so lange, wie Microsoft es vorgibt.
     */
    MsTokens awaitConfirmation(DeviceCode code, Cancel cancel) throws AuthException {
        int wait = code.intervalSeconds;
        while (true) {
            if (cancel != null && cancel.cancelled()) throw new AuthException("Anmeldung abgebrochen");
            if (System.currentTimeMillis() > code.expiresAtMillis) {
                throw new AuthException("Der Code ist abgelaufen. Bitte neu anmelden.");
            }
            sleepSeconds(wait, cancel);
            if (cancel != null && cancel.cancelled()) throw new AuthException("Anmeldung abgebrochen");

            String body = form("client_id", clientId,
                    "grant_type", "urn:ietf:params:oauth:grant-type:device_code",
                    "device_code", code.deviceCode);
            JSONObject answer = postForm(tokenUrl, body, "Microsoft antwortet nicht");
            String token = answer.optString("access_token", "");
            if (!token.isEmpty()) {
                return new MsTokens(token, answer.optString("refresh_token", ""));
            }
            String error = answer.optString("error", "");
            switch (error) {
                case "authorization_pending":
                    break; // Der Nutzer ist noch im Browser - weiter warten.
                case "slow_down":
                    wait += 5;
                    break;
                case "authorization_declined":
                    throw new AuthException("Die Anmeldung wurde abgelehnt.");
                case "expired_token":
                    throw new AuthException("Der Code ist abgelaufen. Bitte neu anmelden.");
                case "bad_verification_code":
                    throw new AuthException("Der Code wurde nicht angenommen. Bitte neu anmelden.");
                default:
                    throw new AuthException(describe(answer, "Die Anmeldung hat nicht geklappt"));
            }
        }
    }

    /** Meldet mit einem gespeicherten Erneuerungs-Schluessel erneut an, ohne Browser. */
    MsTokens refresh(String refreshToken) throws AuthException {
        String body = form("client_id", clientId, "grant_type", "refresh_token", "refresh_token", refreshToken);
        JSONObject answer = postForm(tokenUrl, body, "Microsoft antwortet nicht");
        String token = answer.optString("access_token", "");
        if (token.isEmpty()) {
            throw new AuthException(describe(answer, "Die gespeicherte Anmeldung gilt nicht mehr"));
        }
        String next = answer.optString("refresh_token", "");
        return new MsTokens(token, next.isEmpty() ? refreshToken : next);
    }

    /* ------------------------------- Schritt 3 bis 5 ------------------------------- */

    /** Xbox Live, XSTS, Minecraft - und dann die Frage nach dem Besitz. */
    Account finish(MsTokens ms) throws AuthException {
        JSONObject xbl = postJson(xblUrl, xblRequest(ms.accessToken), null, "Xbox Live antwortet nicht");
        String xblToken = xbl.optString("Token", "");
        String userHash = firstUserHash(xbl);
        if (xblToken.isEmpty() || userHash.isEmpty()) {
            throw new AuthException("Xbox Live hat die Anmeldung nicht angenommen.");
        }

        JSONObject xsts = postJson(xstsUrl, xstsRequest(xblToken), null, "Xbox Live (XSTS) antwortet nicht");
        String xstsToken = xsts.optString("Token", "");
        if (xstsToken.isEmpty()) throw new AuthException(xstsProblem(xsts));

        String identity = "XBL3.0 x=" + userHash + ";" + xstsToken;
        JSONObject mc = postJson(mcLoginUrl, jsonOf("identityToken", identity), null, "Minecraft antwortet nicht");
        String mcToken = mc.optString("access_token", "");
        if (mcToken.isEmpty()) {
            throw new AuthException("Minecraft hat die Anmeldung nicht angenommen.");
        }

        Account account = new Account();
        account.mcToken = mcToken;
        account.mcExpiresAtMillis = System.currentTimeMillis() + Math.max(60, mc.optInt("expires_in", 86400)) * 1000L;
        account.refreshToken = ms.refreshToken;

        // Besitz: der Konto-Bestand nennt die gekauften Sachen ...
        boolean entitled = false;
        try {
            JSONObject store = getJson(mcStoreUrl, mcToken, "Minecraft antwortet nicht");
            JSONArray items = store.optJSONArray("items");
            entitled = items != null && items.length() > 0;
        } catch (AuthException error) {
            // Der Bestand ist nur die eine Haelfte; das Spielerprofil unten entscheidet mit.
            entitled = false;
        }

        // ... und das Spielerprofil gibt es nur, wenn das Konto Minecraft wirklich besitzt.
        JSONObject profile;
        try {
            profile = getJson(mcProfileUrl, mcToken, "Minecraft antwortet nicht");
        } catch (AuthException error) {
            profile = null;
        }

        if (profile != null && !profile.optString("id", "").isEmpty()) {
            account.owns = true;
            account.uuid = profile.optString("id", "");
            account.name = profile.optString("name", "");
            account.skinUrl = activeSkin(profile);
        } else if (entitled) {
            account.owns = true;
            account.profileMissing = true;
        }
        return account;
    }

    /* ---------------------------------- Anfragen ---------------------------------- */

    private static JSONObject xblRequest(String msToken) {
        try {
            JSONObject properties = new JSONObject();
            properties.put("AuthMethod", "RPS");
            properties.put("SiteName", "user.auth.xboxlive.com");
            properties.put("RpsTicket", "d=" + msToken);
            JSONObject request = new JSONObject();
            request.put("Properties", properties);
            request.put("RelyingParty", "http://auth.xboxlive.com");
            request.put("TokenType", "JWT");
            return request;
        } catch (JSONException error) {
            throw new IllegalStateException(error);
        }
    }

    private static JSONObject xstsRequest(String xblToken) {
        try {
            JSONObject properties = new JSONObject();
            properties.put("SandboxId", "RETAIL");
            properties.put("UserTokens", new JSONArray().put(xblToken));
            JSONObject request = new JSONObject();
            request.put("Properties", properties);
            request.put("RelyingParty", "rp://api.minecraftservices.com/");
            request.put("TokenType", "JWT");
            return request;
        } catch (JSONException error) {
            throw new IllegalStateException(error);
        }
    }

    private static String firstUserHash(JSONObject answer) {
        JSONObject claims = answer.optJSONObject("DisplayClaims");
        JSONArray xui = claims == null ? null : claims.optJSONArray("xui");
        JSONObject first = xui == null ? null : xui.optJSONObject(0);
        return first == null ? "" : first.optString("uhs", "");
    }

    /** Xbox nennt den Grund als Zahl; die haeufigen Faelle bekommen einen verstaendlichen Satz. */
    private static String xstsProblem(JSONObject answer) {
        String code = answer.optString("XErr", "");
        switch (code) {
            case "2148916233":
                return "Zu diesem Microsoft-Konto gehoert kein Xbox-Profil. Einmal auf xbox.com anmelden, dann klappt es.";
            case "2148916235":
                return "Xbox Live ist im Land dieses Kontos nicht verfuegbar.";
            case "2148916236":
            case "2148916237":
                return "Fuer dieses Konto ist eine Erwachsenen-Bestaetigung noetig.";
            case "2148916238":
                return "Das ist ein Kinderkonto. Es muss erst einer Familie zugeordnet werden.";
            default:
                return "Xbox Live hat die Anmeldung nicht angenommen.";
        }
    }

    private JSONObject postForm(String url, String body, String whenUnreachable) throws AuthException {
        return request(url, "POST", "application/x-www-form-urlencoded", body.getBytes(StandardCharsets.UTF_8),
                null, whenUnreachable);
    }

    private JSONObject postJson(String url, JSONObject body, String bearer, String whenUnreachable) throws AuthException {
        return request(url, "POST", "application/json", body.toString().getBytes(StandardCharsets.UTF_8),
                bearer, whenUnreachable);
    }

    private JSONObject getJson(String url, String bearer, String whenUnreachable) throws AuthException {
        return request(url, "GET", null, null, bearer, whenUnreachable);
    }

    private JSONObject request(String url, String method, String contentType, byte[] body, String bearer,
                               String whenUnreachable) throws AuthException {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setRequestMethod(method);
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);
            connection.setRequestProperty("Accept", "application/json");
            if (contentType != null) connection.setRequestProperty("Content-Type", contentType);
            if (bearer != null) connection.setRequestProperty("Authorization", "Bearer " + bearer);
            if (body != null) {
                connection.setDoOutput(true);
                // Bewusst ohne setFixedLengthStreamingMode: damit gibt es bei einem 401 keinen
                // Antwort-Text mehr - und genau als 401 meldet Xbox "kein Xbox-Profil".
                // Die Anfragen hier sind ein paar Zeilen gross, das darf ruhig gepuffert werden.
                try (OutputStream out = connection.getOutputStream()) {
                    out.write(body);
                }
            }
            int status = connection.getResponseCode();
            String text = read(status >= 400 ? connection.getErrorStream() : connection.getInputStream());
            JSONObject answer = text.isEmpty() ? new JSONObject() : new JSONObject(text);
            // Die Geraete-Code-Anmeldung meldet ihr "noch nicht bestaetigt" als Fehler-Status;
            // das ist kein Ausfall, sondern gehoert zum Ablauf. Darum kommt der Text nach oben.
            if (status >= 400 && !answer.has("error") && !answer.has("XErr")) {
                throw new AuthException(describe(answer, whenUnreachable + " (Status " + status + ")"));
            }
            return answer;
        } catch (JSONException error) {
            throw new AuthException(whenUnreachable + ": Antwort nicht lesbar");
        } catch (IOException error) {
            throw new AuthException(whenUnreachable + ": keine Verbindung");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String read(InputStream stream) throws IOException {
        if (stream == null) return "";
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int got;
        while ((got = stream.read(buffer)) > 0) {
            out.write(buffer, 0, got);
            if (out.size() > MAX_BODY) break;
        }
        stream.close();
        return out.toString("UTF-8");
    }

    /** Nimmt die Beschreibung des Dienstes, wenn es eine gibt - sonst den eigenen Satz. */
    private static String describe(JSONObject answer, String fallback) {
        String description = answer.optString("error_description", "");
        if (!description.isEmpty()) {
            int cut = description.indexOf('\n');
            return cut > 0 ? description.substring(0, cut).trim() : description;
        }
        String message = answer.optString("errorMessage", "");
        return message.isEmpty() ? fallback : message;
    }

    private static String activeSkin(JSONObject profile) {
        JSONArray skins = profile.optJSONArray("skins");
        if (skins == null) return "";
        for (int i = 0; i < skins.length(); i++) {
            JSONObject skin = skins.optJSONObject(i);
            if (skin != null && "ACTIVE".equalsIgnoreCase(skin.optString("state", ""))) {
                return skin.optString("url", "");
            }
        }
        JSONObject first = skins.optJSONObject(0);
        return first == null ? "" : first.optString("url", "");
    }

    private static JSONObject jsonOf(String key, String value) {
        try {
            return new JSONObject().put(key, value);
        } catch (JSONException error) {
            throw new IllegalStateException(error);
        }
    }

    private static String form(String... pairs) {
        StringBuilder out = new StringBuilder();
        for (int i = 0; i + 1 < pairs.length; i += 2) {
            if (out.length() > 0) out.append('&');
            out.append(encode(pairs[i])).append('=').append(encode(pairs[i + 1]));
        }
        return out.toString();
    }

    private static String encode(String value) {
        try {
            return URLEncoder.encode(value, "UTF-8");
        } catch (IOException error) {
            throw new IllegalStateException(error);
        }
    }

    private static void sleepSeconds(int seconds, Cancel cancel) throws AuthException {
        // In kleinen Schritten schlafen, damit ein Abbruch sofort greift.
        for (int i = 0; i < seconds * 4; i++) {
            if (cancel != null && cancel.cancelled()) throw new AuthException("Anmeldung abgebrochen");
            try {
                Thread.sleep(250);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                throw new AuthException("Anmeldung abgebrochen");
            }
        }
    }
}
