package de.redstonelabs.rsl;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONException;
import org.json.JSONObject;

import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Merkt sich die Anmeldung zwischen zwei App-Starts.
 *
 * Name, UUID und der Besitz-Vermerk sind harmlos und liegen im Klartext. Der Erneuerungs-Schluessel
 * von Microsoft ist dagegen so gut wie ein Dauer-Zugang zum Konto: Er wird mit einem Schluessel aus
 * dem Android-Schluesselspeicher verschluesselt, der das Geraet nicht verlassen kann und beim
 * Deinstallieren mit verschwindet. Selbst wer die Datei aus der App herauskopiert, kann damit
 * nichts anfangen.
 */
final class AccountStore {

    private static final String FILE = "rsl.account";
    private static final String KEY_ALIAS = "rsl-account-v1";
    private static final String TRANSFORM = "AES/GCM/NoPadding";
    private static final int TAG_BITS = 128;
    private static final int IV_BYTES = 12;

    private final SharedPreferences prefs;

    AccountStore(Context context) {
        prefs = context.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    /* --------------------------------- Anwendungs-ID --------------------------------- */

    String clientId() {
        return prefs.getString("clientId", "");
    }

    void setClientId(String value) {
        String cleaned = value == null ? "" : value.trim();
        prefs.edit().putString("clientId", cleaned).apply();
    }

    /* ----------------------------------- Anmeldung ----------------------------------- */

    /** Der Stand, wie ihn die Oberflaeche braucht. */
    JSONObject state() {
        JSONObject out = new JSONObject();
        try {
            out.put("configured", !clientId().isEmpty());
            out.put("clientId", clientId());
            out.put("signedIn", !refreshToken().isEmpty());
            out.put("owns", prefs.getBoolean("owns", false));
            out.put("profileMissing", prefs.getBoolean("profileMissing", false));
            out.put("name", prefs.getString("name", ""));
            out.put("uuid", prefs.getString("uuid", ""));
            out.put("skinUrl", prefs.getString("skinUrl", ""));
            out.put("since", prefs.getLong("since", 0));
        } catch (JSONException error) {
            // Feste Schluessel, einfache Werte: kann nicht schiefgehen.
        }
        return out;
    }

    void save(MsAuth.Account account) {
        SharedPreferences.Editor edit = prefs.edit();
        edit.putBoolean("owns", account.owns);
        edit.putBoolean("profileMissing", account.profileMissing);
        edit.putString("name", account.name == null ? "" : account.name);
        edit.putString("uuid", account.uuid == null ? "" : account.uuid);
        edit.putString("skinUrl", account.skinUrl == null ? "" : account.skinUrl);
        edit.putLong("since", System.currentTimeMillis());
        String sealed = seal(account.refreshToken);
        if (sealed == null) {
            // Ohne sicheren Platz wird der Schluessel gar nicht erst abgelegt: dann meldet man
            // sich beim naechsten Start eben neu an. Das ist besser als ihn offen hinzulegen.
            edit.remove("refresh");
        } else {
            edit.putString("refresh", sealed);
        }
        edit.apply();
    }

    String refreshToken() {
        String sealed = prefs.getString("refresh", "");
        if (sealed.isEmpty()) return "";
        String open = unseal(sealed);
        return open == null ? "" : open;
    }

    void clear() {
        prefs.edit()
                .remove("refresh").remove("owns").remove("profileMissing")
                .remove("name").remove("uuid").remove("skinUrl").remove("since")
                .apply();
    }

    /* ------------------------------- Schluesselspeicher ------------------------------- */

    private String seal(String plain) {
        if (plain == null || plain.isEmpty()) return null;
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORM);
            cipher.init(Cipher.ENCRYPT_MODE, key());
            byte[] iv = cipher.getIV();
            byte[] secret = cipher.doFinal(plain.getBytes("UTF-8"));
            byte[] both = new byte[iv.length + secret.length];
            System.arraycopy(iv, 0, both, 0, iv.length);
            System.arraycopy(secret, 0, both, iv.length, secret.length);
            return Base64.encodeToString(both, Base64.NO_WRAP);
        } catch (Exception error) {
            return null;
        }
    }

    private String unseal(String sealed) {
        try {
            byte[] both = Base64.decode(sealed, Base64.NO_WRAP);
            if (both.length <= IV_BYTES) return null;
            byte[] iv = new byte[IV_BYTES];
            System.arraycopy(both, 0, iv, 0, IV_BYTES);
            Cipher cipher = Cipher.getInstance(TRANSFORM);
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(TAG_BITS, iv));
            byte[] plain = cipher.doFinal(both, IV_BYTES, both.length - IV_BYTES);
            return new String(plain, "UTF-8");
        } catch (Exception error) {
            // Schluessel weg (z. B. nach dem Zuruecksetzen der Bildschirmsperre): neu anmelden.
            return null;
        }
    }

    private static SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        KeyStore.Entry entry = store.getEntry(KEY_ALIAS, null);
        if (entry instanceof KeyStore.SecretKeyEntry) {
            return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }
}
