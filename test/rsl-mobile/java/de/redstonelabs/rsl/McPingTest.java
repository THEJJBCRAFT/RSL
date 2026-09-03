package de.redstonelabs.rsl;

import android.content.Context;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

/**
 * Prueft den Minecraft-Ping und den SRV-Nachschlag der Android-Huelle - ohne Android.
 *
 * Der Test startet einen kleinen Server, der genau das Status-Protokoll spricht, und laesst
 * die echte Klasse McPing dagegen laufen. Fuer den DNS-Teil wird eine Antwort gebaut, wie sie
 * ein Namensserver schicken wuerde (inklusive Namens-Verweis), und wieder ausgelesen.
 */
public final class McPingTest {

    private static int checks;
    private static int failures;

    public static void main(String[] args) throws Exception {
        pingReadsStatus();
        pingFlattensChatAndStripsColours();
        pingReportsClosedPort();
        pingRejectsEmptyHost();
        varIntRoundTrip();
        srvAnswerIsRead();
        srvAnswerWithWrongIdIsIgnored();

        System.out.println(checks + " Pruefungen, " + failures + " Fehler");
        if (failures > 0) System.exit(1);
    }

    /* ------------------------------- Pruefungen ------------------------------- */

    private static void pingReadsStatus() throws Exception {
        String json = "{\"version\":{\"name\":\"1.20.4\"},\"players\":{\"online\":7,\"max\":60},"
                + "\"description\":\"Boocord SMP\"}";
        try (FakeServer server = new FakeServer(json)) {
            JSONObject status = McPing.ping(new Context(), "127.0.0.1:" + server.port());
            check("online", true, status.optBoolean("online"));
            check("Host bleibt die eingegebene Adresse", "127.0.0.1:" + server.port(), status.optString("host"));
            check("Spieler online", 7, status.optInt("players_online"));
            check("Spieler maximal", 60, status.optInt("players_max"));
            check("Version", "1.20.4", status.optString("version"));
            check("MOTD", "Boocord SMP", status.optString("motd"));
            check("kein Fehler", true, status.isNull("error"));
            check("Handshake nennt Host", "127.0.0.1", server.handshakeHost());
            check("Handshake nennt Port", server.port(), server.handshakePort());
            check("Handshake will Status", 1, server.nextState());
        }
    }

    private static void pingFlattensChatAndStripsColours() throws Exception {
        String json = "{\"version\":{\"name\":\"\\u00a7aPaper 1.21\"},\"players\":{\"online\":0,\"max\":20},"
                + "\"description\":{\"text\":\"\\u00a7bGamer\",\"extra\":[{\"text\":\"Craft\"},\" Netzwerk\"]}}";
        try (FakeServer server = new FakeServer(json)) {
            JSONObject status = McPing.ping(new Context(), "127.0.0.1:" + server.port());
            check("MOTD zusammengesetzt und ohne Farbcodes", "GamerCraft Netzwerk", status.optString("motd"));
            check("Version ohne Farbcodes", "Paper 1.21", status.optString("version"));
            check("kein Favicon", true, status.isNull("favicon"));
        }
    }

    private static void pingReportsClosedPort() throws Exception {
        int port;
        try (ServerSocket probe = new ServerSocket(0)) {
            port = probe.getLocalPort();
        }
        JSONObject status = McPing.ping(new Context(), "127.0.0.1:" + port);
        check("geschlossener Port ist offline", false, status.optBoolean("online"));
        check("geschlossener Port nennt einen Grund", false, status.isNull("error"));
        check("Spielerzahl bleibt 0", 0, status.optInt("players_online"));
    }

    private static void pingRejectsEmptyHost() {
        JSONObject status = McPing.ping(new Context(), "   ");
        check("leere Adresse ist offline", false, status.optBoolean("online"));
        check("leere Adresse nennt einen Grund", "Keine Adresse", status.optString("error"));
    }

    private static void varIntRoundTrip() throws Exception {
        // Protokoll -1 ist der Grund fuer die vorzeichenlose Schiebung; die anderen Werte
        // decken die Grenzen zwischen ein, zwei und drei Bytes ab.
        int[] values = { 0, 1, 127, 128, 255, 25565, 2097151, -1 };
        for (int value : values) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            invokeWriteVarInt(out, value);
            int back = invokeReadVarInt(new java.io.ByteArrayInputStream(out.toByteArray()));
            check("VarInt " + value, value, back);
        }
    }

    private static void srvAnswerIsRead() {
        int id = 0x4242;
        byte[] query = Dns.buildQuery(id, "_minecraft._tcp.example.com");
        check("Frage endet auf Typ SRV und Klasse IN", "0 33 0 1",
                (query[query.length - 4] & 0xFF) + " " + (query[query.length - 3] & 0xFF) + " "
                        + (query[query.length - 2] & 0xFF) + " " + (query[query.length - 1] & 0xFF));

        byte[] answer = srvAnswer(id, query, "mc.example.net", 25577);
        Dns.Srv srv = Dns.parseSrv(answer, id);
        check("SRV gefunden", true, srv != null);
        if (srv != null) {
            check("SRV-Ziel", "mc.example.net", srv.host);
            check("SRV-Port", 25577, srv.port);
        }
    }

    private static void srvAnswerWithWrongIdIsIgnored() {
        int id = 0x1234;
        byte[] query = Dns.buildQuery(id, "_minecraft._tcp.example.com");
        byte[] answer = srvAnswer(id, query, "mc.example.net", 25577);
        check("fremde Antwort wird verworfen", null, Dns.parseSrv(answer, id + 1));
    }

    /* ------------------------------- Werkzeug ------------------------------- */

    /** Baut eine DNS-Antwort mit einem SRV-Eintrag; der Ziel-Name nutzt einen Verweis. */
    private static byte[] srvAnswer(int id, byte[] query, String target, int port) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(id >> 8);
        out.write(id & 0xFF);
        out.write(0x81); // Antwort, Rekursion erwuenscht
        out.write(0x80); // Rekursion verfuegbar, kein Fehler
        out.write(0x00); out.write(0x01); // eine Frage
        out.write(0x00); out.write(0x01); // eine Antwort
        out.write(0x00); out.write(0x00);
        out.write(0x00); out.write(0x00);
        // Frage unveraendert uebernehmen (ab Byte 12 bis zum Ende der Anfrage).
        out.write(query, 12, query.length - 12);
        // Antwort: Name als Verweis auf die Frage (0xC00C), Typ SRV, Klasse IN, TTL 60.
        out.write(0xC0); out.write(0x0C);
        out.write(0x00); out.write(33);
        out.write(0x00); out.write(0x01);
        out.write(0x00); out.write(0x00); out.write(0x00); out.write(60);
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        body.write(0x00); body.write(0x0A); // Prioritaet
        body.write(0x00); body.write(0x05); // Gewicht
        body.write(port >> 8); body.write(port & 0xFF);
        for (String label : target.split("\\.")) {
            byte[] bytes = label.getBytes(StandardCharsets.UTF_8);
            body.write(bytes.length);
            body.write(bytes, 0, bytes.length);
        }
        body.write(0);
        byte[] data = body.toByteArray();
        out.write(data.length >> 8);
        out.write(data.length & 0xFF);
        out.write(data, 0, data.length);
        return out.toByteArray();
    }

    private static void invokeWriteVarInt(ByteArrayOutputStream out, int value) throws Exception {
        java.lang.reflect.Method method =
                McPing.class.getDeclaredMethod("writeVarInt", ByteArrayOutputStream.class, int.class);
        method.setAccessible(true);
        method.invoke(null, out, value);
    }

    private static int invokeReadVarInt(InputStream in) throws Exception {
        java.lang.reflect.Method method = McPing.class.getDeclaredMethod("readVarInt", InputStream.class);
        method.setAccessible(true);
        return (Integer) method.invoke(null, in);
    }

    private static void check(String what, Object expected, Object actual) {
        checks++;
        boolean ok = expected == null ? actual == null : expected.equals(actual);
        if (!ok) {
            failures++;
            System.out.println("FEHLER: " + what + " - erwartet <" + expected + ">, bekommen <" + actual + ">");
        }
    }

    /** Ein Server, der genau einmal das Status-Protokoll spricht. */
    private static final class FakeServer implements AutoCloseable {
        private final ServerSocket socket;
        private final Thread thread;
        private volatile String handshakeHost = "";
        private volatile int handshakePort;
        private volatile int nextState;

        FakeServer(String json) throws Exception {
            socket = new ServerSocket(0, 1, java.net.InetAddress.getByName("127.0.0.1"));
            thread = new Thread(() -> serve(json));
            thread.setDaemon(true);
            thread.start();
        }

        int port() {
            return socket.getLocalPort();
        }

        String handshakeHost() {
            waitForClient();
            return handshakeHost;
        }

        int handshakePort() {
            waitForClient();
            return handshakePort;
        }

        int nextState() {
            waitForClient();
            return nextState;
        }

        private void waitForClient() {
            try {
                thread.join(3000);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
            }
        }

        private void serve(String json) {
            try (Socket client = socket.accept()) {
                DataInputStream in = new DataInputStream(client.getInputStream());
                readVarIntQuiet(in); // Laenge des Handshakes
                readVarIntQuiet(in); // Paket-Id
                readVarIntQuiet(in); // Protokoll-Version
                int hostLength = readVarIntQuiet(in);
                byte[] host = new byte[hostLength];
                in.readFully(host);
                handshakeHost = new String(host, StandardCharsets.UTF_8);
                handshakePort = (in.readByte() & 0xFF) << 8 | (in.readByte() & 0xFF);
                nextState = readVarIntQuiet(in);
                readVarIntQuiet(in); // Laenge der Status-Anfrage
                readVarIntQuiet(in); // Paket-Id der Status-Anfrage

                byte[] payload = json.getBytes(StandardCharsets.UTF_8);
                ByteArrayOutputStream body = new ByteArrayOutputStream();
                writeVarIntQuiet(body, 0x00);
                writeVarIntQuiet(body, payload.length);
                body.write(payload, 0, payload.length);
                byte[] data = body.toByteArray();
                ByteArrayOutputStream packet = new ByteArrayOutputStream();
                writeVarIntQuiet(packet, data.length);
                packet.write(data, 0, data.length);
                OutputStream out = client.getOutputStream();
                out.write(packet.toByteArray());
                out.flush();
            } catch (Exception error) {
                // Der Test meldet den Fehler ueber die ausbleibende Antwort.
            }
        }

        private static int readVarIntQuiet(DataInputStream in) throws Exception {
            int value = 0;
            int shift = 0;
            while (true) {
                int b = in.read();
                if (b < 0) throw new java.io.EOFException();
                value |= (b & 0x7F) << shift;
                if ((b & 0x80) == 0) return value;
                shift += 7;
            }
        }

        private static void writeVarIntQuiet(ByteArrayOutputStream out, int value) {
            int rest = value;
            while (true) {
                int part = rest & 0x7F;
                rest >>>= 7;
                if (rest != 0) part |= 0x80;
                out.write(part);
                if (rest == 0) return;
            }
        }

        @Override
        public void close() throws Exception {
            socket.close();
        }
    }
}
