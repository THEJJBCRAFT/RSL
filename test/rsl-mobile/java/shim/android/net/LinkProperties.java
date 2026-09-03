package android.net;

import java.net.InetAddress;
import java.util.Collections;
import java.util.List;

/** Ersatzteil fuer den Test: im Test gibt es keine Namensserver aus dem Netz. */
public class LinkProperties {
    public List<InetAddress> getDnsServers() {
        return Collections.emptyList();
    }
}
