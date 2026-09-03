package android.content;

/**
 * Ersatzteil fuer den Test: Auf dem Rechner gibt es kein Android, aber McPing und Dns
 * reichen den Context nur durch. Mehr als der Name des Netz-Dienstes wird nicht gebraucht.
 */
public class Context {
    public static final String CONNECTIVITY_SERVICE = "connectivity";

    public Object getSystemService(String name) {
        return null;
    }

    public Context getApplicationContext() {
        return this;
    }
}
