package de.redstonelabs.rsl;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

/**
 * Minecraft Server List Ping.
 *
 * Spricht das Status-Protokoll direkt (Handshake + Status Request), so wie es der Rust-Teil der
 * Windows-App tut - inklusive SRV-Aufloesung wie im echten Client: erst "_minecraft._tcp.&lt;host&gt;"
 * nachschlagen, sonst Port 25565. Es ist kein fremder Status-Dienst im Spiel.
 */
final class McPing {

    private static final int TIMEOUT_MS = 6000;
    private static final int MAX_JSON = 512 * 1024;

    private McPing() {}

    /** Fragt den Server ab und liefert das Ergebnis als JSON fuer die Oberflaeche. */
    static JSONObject ping(Context context, String displayHost) {
        String host = displayHost == null ? "" : displayHost.trim();
        if (host.isEmpty()) return offline(displayHost, "Keine Adresse");

        int port = -1;
        int colon = host.lastIndexOf(':');
        if (colon > 0 && host.indexOf(':') == colon) {
            try {
                port = Integer.parseInt(host.substring(colon + 1));
                host = host.substring(0, colon);
            } catch (NumberFormatException error) {
                port = -1;
            }
        }

        String target = host;
        if (port <= 0) {
            Dns.Srv srv = Dns.lookupMinecraft(context, host);
            if (srv != null) {
                target = srv.host;
                port = srv.port;
            } else {
                port = 25565;
            }
        }

        try {
            return query(displayHost, target, port);
        } catch (Exception error) {
            return offline(displayHost, reason(error));
        }
    }

    private static JSONObject query(String displayHost, String host, int port) throws Exception {
        long start = System.nanoTime();
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), TIMEOUT_MS);
            socket.setSoTimeout(TIMEOUT_MS);
            socket.setTcpNoDelay(true);

            OutputStream out = socket.getOutputStream();
            // Handshake: id 0, Protokoll -1 (Status), Host, Port, Next-State 1.
            ByteArrayOutputStream handshake = new ByteArrayOutputStream();
            writeVarInt(handshake, 0x00);
            writeVarInt(handshake, -1);
            byte[] hostBytes = host.getBytes(StandardCharsets.UTF_8);
            writeVarInt(handshake, hostBytes.length);
            handshake.write(hostBytes);
            handshake.write((port >> 8) & 0xFF);
            handshake.write(port & 0xFF);
            writeVarInt(handshake, 1);

            ByteArrayOutputStream packet = new ByteArrayOutputStream();
            byte[] body = handshake.toByteArray();
            writeVarInt(packet, body.length);
            packet.write(body);
            // Status Request: leeres Paket mit id 0.
            packet.write(0x01);
            packet.write(0x00);
            out.write(packet.toByteArray());
            out.flush();

            DataInputStream in = new DataInputStream(socket.getInputStream());
            readVarInt(in); // Paketlaenge
            readVarInt(in); // Paket-Id
            int jsonLength = readVarInt(in);
            if (jsonLength <= 0 || jsonLength > MAX_JSON) throw new IllegalStateException("Antwort unbrauchbar");
            byte[] json = new byte[jsonLength];
            in.readFully(json);
            long latency = (System.nanoTime() - start) / 1_000_000L;

            JSONObject status = new JSONObject(new String(json, StandardCharsets.UTF_8));
            JSONObject players = status.optJSONObject("players");
            JSONObject version = status.optJSONObject("version");

            JSONObject result = new JSONObject();
            result.put("online", true);
            result.put("host", displayHost);
            result.put("motd", stripCodes(flattenChat(status.opt("description"))));
            result.put("players_online", players == null ? 0 : players.optInt("online", 0));
            result.put("players_max", players == null ? 0 : players.optInt("max", 0));
            result.put("version", version == null ? "" : stripCodes(version.optString("name", "")));
            result.put("latency_ms", latency);
            String favicon = status.optString("favicon", "");
            result.put("favicon", favicon.startsWith("data:image/") ? favicon : JSONObject.NULL);
            result.put("error", JSONObject.NULL);
            return result;
        }
    }

    private static JSONObject offline(String host, String error) {
        JSONObject result = new JSONObject();
        try {
            result.put("online", false);
            result.put("host", host == null ? "" : host);
            result.put("motd", "");
            result.put("players_online", 0);
            result.put("players_max", 0);
            result.put("version", "");
            result.put("latency_ms", 0);
            result.put("favicon", JSONObject.NULL);
            result.put("error", error);
        } catch (org.json.JSONException ignored) {
            // Feste Schluessel und einfache Werte: kann nicht schiefgehen.
        }
        return result;
    }

    private static String reason(Exception error) {
        if (error instanceof java.net.SocketTimeoutException) return "Zeitüberschreitung";
        if (error instanceof java.net.UnknownHostException) return "Adresse nicht gefunden";
        if (error instanceof java.net.ConnectException) return "Keine Verbindung";
        if (error instanceof java.io.EOFException) return "Verbindung abgebrochen";
        String message = error.getMessage();
        return message == null || message.isEmpty() ? "Nicht erreichbar" : message;
    }

    /* ---------------------------- Protokoll-Kleinkram ---------------------------- */

    private static void writeVarInt(ByteArrayOutputStream out, int value) {
        // Negative Werte (Protokoll -1) fuellen alle 32 Bit, darum ohne Vorzeichen schieben.
        int rest = value;
        while (true) {
            int part = rest & 0x7F;
            rest >>>= 7;
            if (rest != 0) part |= 0x80;
            out.write(part);
            if (rest == 0) return;
        }
    }

    private static int readVarInt(InputStream in) throws Exception {
        int value = 0;
        int shift = 0;
        while (true) {
            int b = in.read();
            if (b < 0) throw new java.io.EOFException();
            value |= (b & 0x7F) << shift;
            if ((b & 0x80) == 0) return value;
            shift += 7;
            if (shift >= 35) throw new IllegalStateException("VarInt zu lang");
        }
    }

    /** Chat-Komponenten (Text, Objekt mit text/extra, Liste) zu einer Zeile plaetten. */
    private static String flattenChat(Object value) {
        if (value == null || value == JSONObject.NULL) return "";
        if (value instanceof String) return (String) value;
        if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value;
            StringBuilder out = new StringBuilder();
            for (int i = 0; i < array.length(); i++) out.append(flattenChat(array.opt(i)));
            return out.toString();
        }
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value;
            StringBuilder out = new StringBuilder(object.optString("text", ""));
            JSONArray extra = object.optJSONArray("extra");
            if (extra != null) {
                for (int i = 0; i < extra.length(); i++) out.append(flattenChat(extra.opt(i)));
            }
            return out.toString();
        }
        return "";
    }

    /** Farbcodes (Paragraf-Zeichen plus ein Zeichen) entfernen. */
    private static String stripCodes(String text) {
        if (text == null) return "";
        StringBuilder out = new StringBuilder(text.length());
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '§') {
                i++; // das Zeichen dahinter gehoert zum Code
            } else {
                out.append(c);
            }
        }
        return out.toString().trim();
    }
}
