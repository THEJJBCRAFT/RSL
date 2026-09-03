package de.redstonelabs.rsl;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;

/**
 * Nimmt ein fertiges Video aus der Oberflaeche entgegen und legt es im Film-Ordner des Handys ab.
 *
 * Das Video entsteht in der WebView (Canvas + MediaRecorder) und kann etliche Megabyte gross sein.
 * Ein einzelner Riesen-String durch die JavaScript-Bruecke ist heikel, darum kommt es in Stuecken:
 * erst {@link #begin}, dann beliebig oft {@link #chunk}, zum Schluss {@link #finish}. Die Stuecke
 * landen zuerst in einer Datei im Zwischenspeicher der App und wandern erst am Ende in die Galerie.
 */
final class VideoSaver {

    private final Context context;
    private File temp;
    private OutputStream sink;
    private String name;
    private String failure;
    /** Zuletzt gespeichertes Video - damit der Teilen-Knopf weiss, was er verschicken soll. */
    private Uri lastSaved;

    VideoSaver(Context context) {
        this.context = context.getApplicationContext();
    }

    Uri lastSaved() {
        return lastSaved;
    }

    /** Beginnt eine Uebertragung; ein noch offener Rest wird verworfen. */
    synchronized boolean begin(String fileName) {
        cancel();
        failure = null;
        name = safeName(fileName);
        try {
            temp = File.createTempFile("rsl-video", ".webm", context.getCacheDir());
            sink = new FileOutputStream(temp);
            return true;
        } catch (IOException error) {
            failure = "Kein Platz im Zwischenspeicher";
            cancel();
            return false;
        }
    }

    /** Haengt ein Base64-Stueck an. Bei false ist die Uebertragung gescheitert. */
    synchronized boolean chunk(String base64) {
        if (sink == null) return false;
        try {
            sink.write(Base64.decode(base64, Base64.DEFAULT));
            return true;
        } catch (IOException | IllegalArgumentException error) {
            failure = "Video konnte nicht zwischengespeichert werden";
            cancel();
            return false;
        }
    }

    /** Schliesst die Uebertragung ab und legt das Video in "Filme/RSL" ab. */
    synchronized String finish() {
        if (sink == null) return failure != null ? failure : "Nichts zu speichern";
        File file = temp;
        try {
            sink.close();
        } catch (IOException error) {
            // Der Inhalt steht schon in der Datei; ein Fehler beim Schliessen aendert daran nichts.
        }
        sink = null;
        temp = null;
        if (file == null || file.length() == 0) {
            if (file != null) file.delete();
            return "Video ist leer";
        }
        try {
            Uri saved = store(file);
            lastSaved = saved;
            return null;
        } catch (Exception error) {
            String message = error.getMessage();
            return message == null || message.isEmpty() ? "Speichern fehlgeschlagen" : message;
        } finally {
            file.delete();
        }
    }

    /** Bricht eine laufende Uebertragung ab und raeumt die Zwischendatei weg. */
    synchronized void cancel() {
        if (sink != null) {
            try {
                sink.close();
            } catch (IOException error) {
                // Beim Aufraeumen ist ein Fehler egal.
            }
            sink = null;
        }
        if (temp != null) {
            temp.delete();
            temp = null;
        }
    }

    private Uri store(File file) throws IOException {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = context.getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            values.put(MediaStore.MediaColumns.MIME_TYPE, "video/webm");
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/RSL");
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri item = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values);
            if (item == null) throw new IOException("Galerie nimmt die Datei nicht an");
            try (OutputStream out = resolver.openOutputStream(item)) {
                if (out == null) throw new IOException("Galerie nimmt die Datei nicht an");
                copy(file, out);
            } catch (IOException error) {
                resolver.delete(item, null, null);
                throw error;
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(item, done, null, null);
            return item;
        }

        // Bis Android 9: direkt in den oeffentlichen Film-Ordner schreiben und den Medien-Index anstossen.
        File folder = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), "RSL");
        if (!folder.exists() && !folder.mkdirs()) throw new IOException("Ordner Filme/RSL nicht anlegbar");
        File target = new File(folder, name);
        try (OutputStream out = new FileOutputStream(target)) {
            copy(file, out);
        }
        MediaScannerConnection.scanFile(context, new String[] { target.getAbsolutePath() },
                new String[] { "video/webm" }, null);
        return Uri.fromFile(target);
    }

    private static void copy(File from, OutputStream to) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        try (InputStream in = new java.io.FileInputStream(from)) {
            int read;
            while ((read = in.read(buffer)) > 0) to.write(buffer, 0, read);
        }
        to.flush();
    }

    /** Nur harmlose Zeichen im Dateinamen, und immer mit .webm am Ende. */
    private static String safeName(String wanted) {
        String base = wanted == null ? "" : wanted.trim();
        base = base.replaceAll("[^A-Za-z0-9._-]", "-");
        if (base.length() > 80) base = base.substring(0, 80);
        if (!base.toLowerCase(Locale.ROOT).endsWith(".webm")) base = base + ".webm";
        if (base.startsWith(".")) base = "rsl" + base;
        return base;
    }
}
