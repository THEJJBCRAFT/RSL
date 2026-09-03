package de.redstonelabs.rsl;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Prueft die Anmeldung mit dem Microsoft-Konto und die Besitz-Pruefung - ohne echtes Konto.
 *
 * Dafuer laeuft ein nachgebauter Dienst mit, der sich wie Microsoft, Xbox Live und Minecraft
 * verhaelt: Er gibt einen Geraete-Code heraus, laesst die App zweimal ins Leere fragen ("der
 * Nutzer ist noch im Browser"), bestaetigt dann und reicht die Anmeldung weiter. Geprueft wird
 * nicht nur das Ergebnis, sondern auch, was die App unterwegs verschickt - falscher Aufbau an
 * einer Stelle, und die echte Anmeldung wuerde spaeter stumm scheitern.
 */
public final class MsAuthTest {

    private static int checks;
    private static int failures;

    public static void main(String[] args) throws Exception {
        signsInAndFindsTheAccount();
        reportsMissingProfile();
        reportsAccountWithoutMinecraft();
        reportsMissingXboxProfile();
        reportsDeclinedSignIn();
        reportsExpiredCode();
        stopsWhenCancelled();
        refreshesWithoutBrowser();

        System.out.println(checks + " Pruefungen, " + failures + " Fehler");
        if (failures > 0) System.exit(1);
    }

    /* ------------------------------- Pruefungen ------------------------------- */

    private static void signsInAndFindsTheAccount() throws Exception {
        try (Fake fake = new Fake()) {
            fake.pendingPolls = 2;
            MsAuth auth = MsAuth.against(fake.base(), "client-123");

            MsAuth.DeviceCode code = auth.start();
            check("Code fuer den Nutzer", "WXYZ-1234", code.userCode);
            check("Adresse fuer den Browser", "https://example.invalid/link", code.verificationUri);
            check("Anwendungs-ID geht mit", "client-123", fake.form("/devicecode").get("client_id"));
            check("Xbox-Berechtigung angefragt", "XboxLive.signin offline_access", fake.form("/devicecode").get("scope"));

            MsAuth.MsTokens tokens = auth.awaitConfirmation(code, () -> false);
            check("wartet, bis der Nutzer bestaetigt hat", 3, fake.hits("/token"));
            check("Geraete-Code geht mit", "device-abc", fake.form("/token").get("device_code"));
            check("richtige Anmelde-Art", "urn:ietf:params:oauth:grant-type:device_code", fake.form("/token").get("grant_type"));
            check("Zugriffs-Schluessel", "ms-access", tokens.accessToken);
            check("Erneuerungs-Schluessel", "ms-refresh", tokens.refreshToken);

            MsAuth.Account result = auth.finish(tokens);
            check("Xbox bekommt den Schluessel im richtigen Format", "d=ms-access",
                    fake.json("/xbl").getJSONObject("Properties").optString("RpsTicket"));
            check("XSTS fragt nach Minecraft", "rp://api.minecraftservices.com/",
                    fake.json("/xsts").optString("RelyingParty"));
            check("XSTS reicht das Xbox-Ticket weiter", "xbl-token",
                    fake.json("/xsts").getJSONObject("Properties").getJSONArray("UserTokens").optString(0));
            check("Minecraft bekommt Nutzer-Kennung und Ticket", "XBL3.0 x=uhs-1;xsts-token",
                    fake.json("/mclogin").optString("identityToken"));
            check("Besitz wird mit dem Minecraft-Schluessel abgefragt", "Bearer mc-access",
                    fake.header("/mcstore", "Authorization"));
            check("Profil wird mit dem Minecraft-Schluessel abgefragt", "Bearer mc-access",
                    fake.header("/mcprofile", "Authorization"));

            check("besitzt Minecraft", true, result.owns);
            check("Spielername", "Steve", result.name);
            check("UUID", "0123456789abcdef0123456789abcdef", result.uuid);
            check("aktueller Skin", "https://example.invalid/skin-neu.png", result.skinUrl);
            check("kein fehlendes Profil", false, result.profileMissing);
            check("Erneuerungs-Schluessel wird behalten", "ms-refresh", result.refreshToken);
        }
    }

    private static void reportsMissingProfile() throws Exception {
        try (Fake fake = new Fake()) {
            fake.profileStatus = 404;
            fake.profileBody = "{\"path\":\"/minecraft/profile\",\"errorMessage\":\"Not found\"}";
            MsAuth auth = MsAuth.against(fake.base(), "client-123");
            MsAuth.Account result = auth.finish(new MsAuth.MsTokens("ms-access", "ms-refresh"));
            check("Besitz erkannt, obwohl das Profil fehlt", true, result.owns);
            check("fehlendes Profil wird gemeldet", true, result.profileMissing);
            check("ohne Profil kein Name", "", result.name);
        }
    }

    private static void reportsAccountWithoutMinecraft() throws Exception {
        try (Fake fake = new Fake()) {
            fake.storeBody = "{\"items\":[]}";
            fake.profileStatus = 404;
            fake.profileBody = "{\"errorMessage\":\"Not found\"}";
            MsAuth auth = MsAuth.against(fake.base(), "client-123");
            MsAuth.Account result = auth.finish(new MsAuth.MsTokens("ms-access", "ms-refresh"));
            check("Konto ohne Minecraft wird erkannt", false, result.owns);
            check("kein falscher Profil-Hinweis", false, result.profileMissing);
        }
    }

    private static void reportsMissingXboxProfile() throws Exception {
        try (Fake fake = new Fake()) {
            fake.xstsStatus = 401;
            fake.xstsBody = "{\"XErr\":2148916233,\"Message\":\"\"}";
            MsAuth auth = MsAuth.against(fake.base(), "client-123");
            String message = failureOf(() -> auth.finish(new MsAuth.MsTokens("ms-access", "ms-refresh")));
            check("fehlendes Xbox-Profil wird erklaert",
                    "Zu diesem Microsoft-Konto gehoert kein Xbox-Profil. Einmal auf xbox.com anmelden, dann klappt es.",
                    message);
        }
    }

    private static void reportsDeclinedSignIn() throws Exception {
        try (Fake fake = new Fake()) {
            fake.pollError = "authorization_declined";
            MsAuth auth = MsAuth.against(fake.base(), "client-123");
            MsAuth.DeviceCode code = auth.start();
            check("abgelehnte Anmeldung wird gemeldet", "Die Anmeldung wurde abgelehnt.",
                    failureOf(() -> auth.awaitConfirmation(code, () -> false)));
        }
    }

    private static void reportsExpiredCode() throws Exception {
        try (Fake fake = new Fake()) {
            fake.pollError = "expired_token";
            MsAuth auth = MsAuth.against(fake.base(), "client-123");
            MsAuth.DeviceCode code = auth.start();
            check("abgelaufener Code wird gemeldet", "Der Code ist abgelaufen. Bitte neu anmelden.",
                    failureOf(() -> auth.awaitConfirmation(code, () -> false)));
        }
    }

    private static void stopsWhenCancelled() throws Exception {
        try (Fake fake = new Fake()) {
            fake.pendingPolls = 1000; // wuerde sonst ewig warten
            MsAuth auth = MsAuth.against(fake.base(), "client-123");
            MsAuth.DeviceCode code = auth.start();
            long start = System.currentTimeMillis();
            String message = failureOf(() -> auth.awaitConfirmation(code, () -> System.currentTimeMillis() - start > 300));
            check("Abbruch greift", "Anmeldung abgebrochen", message);
            check("Abbruch greift schnell", true, System.currentTimeMillis() - start < 3000);
        }
    }

    private static void refreshesWithoutBrowser() throws Exception {
        try (Fake fake = new Fake()) {
            MsAuth auth = MsAuth.against(fake.base(), "client-123");
            MsAuth.MsTokens tokens = auth.refresh("alt-refresh");
            check("erneuert ohne Browser", "ms-access", tokens.accessToken);
            check("neuer Erneuerungs-Schluessel wird uebernommen", "ms-refresh", tokens.refreshToken);
            check("alter Schluessel geht mit", "alt-refresh", fake.form("/token").get("refresh_token"));
            check("richtige Anmelde-Art", "refresh_token", fake.form("/token").get("grant_type"));
        }
    }

    /* -------------------------------- Werkzeug -------------------------------- */

    private interface Attempt {
        void run() throws Exception;
    }

    /** Fuehrt etwas aus, das scheitern soll, und gibt den Text des Fehlers zurueck. */
    private static String failureOf(Attempt attempt) {
        try {
            attempt.run();
            return "(kein Fehler)";
        } catch (MsAuth.AuthException error) {
            return error.getMessage();
        } catch (Exception error) {
            return "(unerwartet: " + error + ")";
        }
    }

    private static void check(String what, Object expected, Object actual) {
        checks++;
        boolean ok = expected == null ? actual == null : expected.equals(actual);
        if (!ok) {
            failures++;
            System.out.println("FEHLER: " + what + " - erwartet <" + expected + ">, bekommen <" + actual + ">");
        }
    }

    /** Der nachgebaute Dienst: Microsoft, Xbox Live und Minecraft in einem. */
    private static final class Fake implements AutoCloseable {
        private final HttpServer server;
        private final Map<String, List<String>> bodies = new HashMap<>();
        private final Map<String, Map<String, String>> headers = new HashMap<>();
        private final Map<String, AtomicInteger> counts = new HashMap<>();

        /** So oft antwortet der Dienst mit "der Nutzer ist noch im Browser". */
        int pendingPolls;
        String pollError;
        int xstsStatus = 200;
        String xstsBody = "{\"Token\":\"xsts-token\",\"DisplayClaims\":{\"xui\":[{\"uhs\":\"uhs-1\"}]}}";
        int profileStatus = 200;
        String profileBody = "{\"id\":\"0123456789abcdef0123456789abcdef\",\"name\":\"Steve\",\"skins\":["
                + "{\"id\":\"a\",\"state\":\"INACTIVE\",\"url\":\"https://example.invalid/skin-alt.png\"},"
                + "{\"id\":\"b\",\"state\":\"ACTIVE\",\"url\":\"https://example.invalid/skin-neu.png\"}]}";
        String storeBody = "{\"items\":[{\"name\":\"product_minecraft\"},{\"name\":\"game_minecraft\"}]}";

        Fake() throws Exception {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/", this::handle);
            server.start();
        }

        String base() {
            return "http://127.0.0.1:" + server.getAddress().getPort();
        }

        int hits(String path) {
            AtomicInteger count = counts.get(path);
            return count == null ? 0 : count.get();
        }

        /** Der zuletzt an diesen Pfad geschickte Formular-Inhalt, aufgeschluesselt. */
        Map<String, String> form(String path) {
            Map<String, String> out = new HashMap<>();
            for (String pair : last(path).split("&")) {
                int equals = pair.indexOf('=');
                if (equals <= 0) continue;
                out.put(decode(pair.substring(0, equals)), decode(pair.substring(equals + 1)));
            }
            return out;
        }

        JSONObject json(String path) {
            return new JSONObject(last(path));
        }

        String header(String path, String name) {
            Map<String, String> got = headers.get(path);
            return got == null ? "" : got.getOrDefault(name, "");
        }

        private String last(String path) {
            List<String> got = bodies.get(path);
            return got == null || got.isEmpty() ? "" : got.get(got.size() - 1);
        }

        private static String decode(String value) {
            try {
                return java.net.URLDecoder.decode(value, "UTF-8");
            } catch (Exception error) {
                return value;
            }
        }

        private void handle(HttpExchange exchange) throws java.io.IOException {
            String path = exchange.getRequestURI().getPath();
            counts.computeIfAbsent(path, key -> new AtomicInteger()).incrementAndGet();
            bodies.computeIfAbsent(path, key -> new ArrayList<>()).add(readAll(exchange.getRequestBody()));
            Map<String, String> got = new HashMap<>();
            String authorization = exchange.getRequestHeaders().getFirst("Authorization");
            if (authorization != null) got.put("Authorization", authorization);
            headers.put(path, got);

            switch (path) {
                case "/devicecode":
                    send(exchange, 200, new JSONObject()
                            .put("device_code", "device-abc")
                            .put("user_code", "WXYZ-1234")
                            .put("verification_uri", "https://example.invalid/link")
                            .put("interval", 1)
                            .put("expires_in", 900).toString());
                    return;
                case "/token":
                    handleToken(exchange);
                    return;
                case "/xbl":
                    send(exchange, 200, "{\"Token\":\"xbl-token\",\"DisplayClaims\":{\"xui\":[{\"uhs\":\"uhs-1\"}]}}");
                    return;
                case "/xsts":
                    send(exchange, xstsStatus, xstsBody);
                    return;
                case "/mclogin":
                    send(exchange, 200, "{\"access_token\":\"mc-access\",\"expires_in\":86400}");
                    return;
                case "/mcstore":
                    send(exchange, 200, storeBody);
                    return;
                case "/mcprofile":
                    send(exchange, profileStatus, profileBody);
                    return;
                default:
                    send(exchange, 404, "{}");
            }
        }

        private void handleToken(HttpExchange exchange) throws java.io.IOException {
            String body = last("/token");
            if (body.contains("grant_type=refresh_token")) {
                send(exchange, 200, "{\"access_token\":\"ms-access\",\"refresh_token\":\"ms-refresh\",\"expires_in\":3600}");
                return;
            }
            if (pollError != null) {
                send(exchange, 400, new JSONObject().put("error", pollError).toString());
                return;
            }
            if (hits("/token") <= pendingPolls) {
                // Genau wie bei Microsoft: ein Fehler-Status, der nur "noch nicht bestaetigt" heisst.
                String error = hits("/token") == pendingPolls ? "slow_down" : "authorization_pending";
                send(exchange, 400, new JSONObject().put("error", error).toString());
                return;
            }
            send(exchange, 200, "{\"access_token\":\"ms-access\",\"refresh_token\":\"ms-refresh\",\"expires_in\":3600}");
        }

        private static String readAll(InputStream stream) throws java.io.IOException {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int got;
            while ((got = stream.read(buffer)) > 0) out.write(buffer, 0, got);
            stream.close();
            return out.toString("UTF-8");
        }

        private static void send(HttpExchange exchange, int status, String body) throws java.io.IOException {
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, bytes.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(bytes);
            }
        }

        @Override
        public void close() {
            server.stop(0);
        }
    }

    private MsAuthTest() {}
}
