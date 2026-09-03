package de.redstonelabs.rsl;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.os.Build;

import java.io.ByteArrayOutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Random;

/**
 * Kleiner DNS-Fragesteller fuer SRV-Eintraege.
 *
 * Android bringt keinen SRV-Nachschlag mit (InetAddress kann nur A/AAAA, und den JNDI-DNS-Anbieter
 * aus dem Java-Standard gibt es hier nicht). Fuer Minecraft ist SRV aber Pflicht: Adressen wie
 * "smp.boocord.com" zeigen ueber "_minecraft._tcp.smp.boocord.com" auf einen anderen Rechner und
 * einen anderen Port. Darum bauen wir die DNS-Anfrage selbst und schicken sie an die Namensserver
 * des aktuellen Netzes.
 */
final class Dns {

    /** Ziel eines SRV-Eintrags. */
    static final class Srv {
        final String host;
        final int port;

        Srv(String host, int port) {
            this.host = host;
            this.port = port;
        }
    }

    private static final int TYPE_SRV = 33;
    private static final int TIMEOUT_MS = 2500;
    private static final Random RANDOM = new Random();

    private Dns() {}

    /**
     * Loest "_minecraft._tcp.&lt;host&gt;" auf. Gibt null zurueck, wenn es keinen Eintrag gibt oder
     * die Anfrage nicht durchkommt - dann gilt der Standardport.
     */
    static Srv lookupMinecraft(Context context, String host) {
        String name = "_minecraft._tcp." + host;
        byte[] query;
        int id = RANDOM.nextInt(0xFFFF);
        try {
            query = buildQuery(id, name);
        } catch (IllegalArgumentException error) {
            return null;
        }
        for (InetAddress server : dnsServers(context)) {
            byte[] answer = ask(server, query);
            if (answer == null) continue;
            Srv srv = parseSrv(answer, id);
            if (srv != null) return srv;
        }
        return null;
    }

    /** Namensserver des aktiven Netzes; ohne Treffer die oeffentlichen von Cloudflare und Google. */
    private static List<InetAddress> dnsServers(Context context) {
        List<InetAddress> out = new ArrayList<>();
        try {
            ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Network active = cm.getActiveNetwork();
                LinkProperties props = active == null ? null : cm.getLinkProperties(active);
                if (props != null) out.addAll(props.getDnsServers());
            }
        } catch (RuntimeException error) {
            // Ohne Netz-Auskunft bleibt es bei den oeffentlichen Servern unten.
        }
        try {
            out.add(InetAddress.getByName("1.1.1.1"));
            out.add(InetAddress.getByName("8.8.8.8"));
        } catch (Exception error) {
            // Sollte nicht passieren: das sind rohe IP-Adressen, kein Nachschlag noetig.
        }
        return out;
    }

    private static byte[] ask(InetAddress server, byte[] query) {
        DatagramSocket socket = null;
        try {
            socket = new DatagramSocket();
            socket.setSoTimeout(TIMEOUT_MS);
            socket.send(new DatagramPacket(query, query.length, new InetSocketAddress(server, 53)));
            byte[] buffer = new byte[1500];
            DatagramPacket reply = new DatagramPacket(buffer, buffer.length);
            socket.receive(reply);
            byte[] out = new byte[reply.getLength()];
            System.arraycopy(buffer, 0, out, 0, out.length);
            return out;
        } catch (Exception error) {
            return null;
        } finally {
            if (socket != null) socket.close();
        }
    }

    /** Paket-sichtbar, damit der Test (test/rsl-mobile) Bauen und Lesen gegeneinander pruefen kann. */
    static byte[] buildQuery(int id, String name) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(id >> 8);
        out.write(id & 0xFF);
        out.write(0x01); // Standardanfrage, Rekursion erwuenscht
        out.write(0x00);
        out.write(0x00); out.write(0x01); // eine Frage
        out.write(0x00); out.write(0x00); // keine Antworten
        out.write(0x00); out.write(0x00);
        out.write(0x00); out.write(0x00);
        writeName(out, name);
        out.write(0x00); out.write(TYPE_SRV);
        out.write(0x00); out.write(0x01); // Klasse IN
        return out.toByteArray();
    }

    private static void writeName(ByteArrayOutputStream out, String name) {
        for (String label : name.split("\\.")) {
            byte[] bytes = label.getBytes(java.nio.charset.StandardCharsets.UTF_8);
            if (bytes.length == 0) continue;
            if (bytes.length > 63) throw new IllegalArgumentException("Label zu lang");
            out.write(bytes.length);
            out.write(bytes, 0, bytes.length);
        }
        out.write(0);
    }

    /** Liest den ersten SRV-Eintrag aus der Antwort. Paket-sichtbar fuer den Test. */
    static Srv parseSrv(byte[] data, int expectedId) {
        try {
            if (data.length < 12) return null;
            if (((data[0] & 0xFF) << 8 | (data[1] & 0xFF)) != expectedId) return null;
            if ((data[3] & 0x0F) != 0) return null; // Fehlercode vom Server
            int questions = (data[4] & 0xFF) << 8 | (data[5] & 0xFF);
            int answers = (data[6] & 0xFF) << 8 | (data[7] & 0xFF);
            int pos = 12;
            for (int i = 0; i < questions; i++) {
                pos = skipName(data, pos) + 4;
            }
            for (int i = 0; i < answers; i++) {
                pos = skipName(data, pos);
                if (pos + 10 > data.length) return null;
                int type = (data[pos] & 0xFF) << 8 | (data[pos + 1] & 0xFF);
                int length = (data[pos + 8] & 0xFF) << 8 | (data[pos + 9] & 0xFF);
                int body = pos + 10;
                if (body + length > data.length) return null;
                if (type == TYPE_SRV && length >= 7) {
                    int port = (data[body + 4] & 0xFF) << 8 | (data[body + 5] & 0xFF);
                    String target = readName(data, body + 6);
                    if (target != null && !target.isEmpty() && port > 0) {
                        return new Srv(target.toLowerCase(Locale.ROOT), port);
                    }
                }
                pos = body + length;
            }
            return null;
        } catch (RuntimeException error) {
            return null;
        }
    }

    /** Position hinter einem Namen; Verweise (Kompression) sind zwei Bytes lang. */
    private static int skipName(byte[] data, int pos) {
        while (pos < data.length) {
            int len = data[pos] & 0xFF;
            if (len == 0) return pos + 1;
            if ((len & 0xC0) == 0xC0) return pos + 2;
            pos += len + 1;
        }
        return pos;
    }

    /** Liest einen Namen und folgt dabei Verweisen. */
    private static String readName(byte[] data, int pos) {
        StringBuilder out = new StringBuilder();
        int jumps = 0;
        while (pos >= 0 && pos < data.length) {
            int len = data[pos] & 0xFF;
            if (len == 0) break;
            if ((len & 0xC0) == 0xC0) {
                if (pos + 1 >= data.length || ++jumps > 16) return null;
                pos = (len & 0x3F) << 8 | (data[pos + 1] & 0xFF);
                continue;
            }
            if (pos + 1 + len > data.length) return null;
            if (out.length() > 0) out.append('.');
            out.append(new String(data, pos + 1, len, java.nio.charset.StandardCharsets.UTF_8));
            pos += len + 1;
        }
        return out.toString();
    }
}
