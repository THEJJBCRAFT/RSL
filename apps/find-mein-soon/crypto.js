// Verschluesselung und Gruppencodes von Find Mein Soon. Reine Funktionen ohne DOM, auch in Node testbar.
//
// Protokoll v1 (8-stelliger Code): PBKDF2 liefert Schluessel und Themen-ID in einem Rutsch, Nachrichten ohne Kanal-Bindung.
// Protokoll v2 (12-stelliger Code): PBKDF2 streckt den Code, HKDF trennt Schluessel und Themen-ID; jede Nachricht ist
// ueber AES-GCM an ihr Thema gebunden (kopierte Nachrichten sind auf anderen Themen ungueltig) und Verlassen ist eine
// verschluesselte Abschiedsnachricht statt einer beliebig faelschbaren leeren Nachricht.

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 12; // neue Gruppen (Protokoll v2): 60 Bit Zufall, angezeigt als XXXX-XXXX-XXXX
export const LEGACY_CODE_LENGTH = 8; // Gruppen der ersten Version (Protokoll v1)
export const KEY_ITERATIONS = 100000; // v1
export const KEY_ITERATIONS_V2 = 250000;

const crypto = globalThis.crypto;
// Abgeleitete Schluessel je Code, damit ein Wiederverbinden das PBKDF2 nicht wiederholt.
const secretsCache = new Map();

export function clearSecretsCache() {
  secretsCache.clear();
}

// ---------- Verschluesselung ----------
// Protokoll v1 (8-stelliger Code): PBKDF2 liefert Schluessel und Themen-ID in einem Rutsch, Nachrichten ohne Kanal-Bindung.
// Protokoll v2 (12-stelliger Code): PBKDF2 streckt den Code, HKDF trennt Schluessel und Themen-ID; jede Nachricht ist
// ueber AES-GCM an ihr Thema gebunden (kopierte Nachrichten sind auf anderen Themen ungueltig) und Verlassen ist eine
// verschluesselte Abschiedsnachricht statt einer beliebig faelschbaren leeren Nachricht.
export function protocolFor(code) {
  return code.length === LEGACY_CODE_LENGTH ? 1 : 2;
}

export async function deriveGroupSecrets(code) {
  const cached = secretsCache.get(code);
  if (cached) return cached;
  const enc = text => new TextEncoder().encode(text);
  const version = protocolFor(code);
  const material = await crypto.subtle.importKey("raw", enc(code), "PBKDF2", false, ["deriveBits"]);
  let secrets;
  if (version === 1) {
    const bytes = new Uint8Array(await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: enc("find-mein-soon-v1"), iterations: KEY_ITERATIONS, hash: "SHA-256" },
      material,
      512
    ));
    const key = await crypto.subtle.importKey("raw", bytes.slice(0, 32), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    secrets = { version, key, topicId: toHex(bytes.slice(32, 48)) };
  } else {
    const prk = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: enc("find-mein-soon-v2"), iterations: KEY_ITERATIONS_V2, hash: "SHA-256" },
      material,
      256
    );
    const hkdf = await crypto.subtle.importKey("raw", prk, "HKDF", false, ["deriveBits"]);
    const derive = (info, bits) => crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: enc("find-mein-soon-v2"), info: enc(info) }, hkdf, bits);
    const key = await crypto.subtle.importKey("raw", await derive("fms-v2/key", 256), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    secrets = { version, key, topicId: toHex(new Uint8Array(await derive("fms-v2/topic", 128))) };
  }
  secretsCache.set(code, secrets);
  return secrets;
}

export function aadFor(version, topic) {
  return version >= 2 ? new TextEncoder().encode(String(topic)) : undefined;
}

export async function encrypt(key, version, data, topic) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(data));
  const params = { name: "AES-GCM", iv };
  const aad = aadFor(version, topic);
  if (aad) params.additionalData = aad;
  const cipher = new Uint8Array(await crypto.subtle.encrypt(params, key, plain));
  const out = new Uint8Array(iv.length + cipher.length);
  out.set(iv, 0);
  out.set(cipher, iv.length);
  return out;
}

export async function decrypt(key, version, payload, topic) {
  const bytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
  if (bytes.length < 13) throw new Error("zu kurz");
  const params = { name: "AES-GCM", iv: bytes.slice(0, 12) };
  const aad = aadFor(version, topic);
  if (aad) params.additionalData = aad;
  const plain = await crypto.subtle.decrypt(params, key, bytes.slice(12));
  return JSON.parse(new TextDecoder().decode(plain));
}

export function toHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export function newGroupCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

export function cleanCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);
}

/** Anzeigeform: Vierergruppen mit Bindestrich (ABCD-EFGH-JKLM). */
export function formatCode(code) {
  return cleanCode(code).replace(/(.{4})(?=.)/g, "$1-");
}

/** Holt den Code auch aus eingefuegtem Einladungstext oder einem Link heraus (8 oder 12 Zeichen, mit oder ohne Bindestriche). */
export function extractCode(value) {
  const raw = String(value || "");
  const validLength = code => code.length === CODE_LENGTH || code.length === LEGACY_CODE_LENGTH;
  // Einladungslink: nur, wenn der Code darin vollstaendig ist (abgeschnittener Text faellt auf "Code: …" zurueck).
  const fromLink = raw.match(/join=([A-Za-z0-9-]{8,14})/);
  if (fromLink && validLength(cleanCode(fromLink[1]))) return cleanCode(fromLink[1]);
  const upper = raw.toUpperCase();
  // Bloecke bewusst mit allen Buchstaben/Ziffern, damit ein Tippfehler (0 statt O) als solcher gemeldet wird
  // statt den Code stumm zu verkuerzen.
  const block = "[A-Z0-9]{4}";
  const full = `${block}-?${block}-?${block}`;
  const legacy = `${block}-?${block}`;
  const labelled = upper.match(new RegExp(`CODE[:\\s]*((?:${full})|(?:${legacy}))(?=[^A-Z0-9]|$)`));
  if (labelled) return cleanCode(labelled[1]);
  if (upper.replace(/[^A-Z0-9]/g, "").length > CODE_LENGTH) {
    // Laengerer Text ohne "Code:": das letzte 12-stellige Wort ist der Code (steht in Einladungen am Ende).
    const tokens = [...upper.matchAll(new RegExp(`(?:^|[^A-Z0-9])(${full})(?=[^A-Z0-9]|$)`, "g"))];
    if (tokens.length) return cleanCode(tokens[tokens.length - 1][1]);
  }
  return cleanCode(raw);
}

export function randomId(bytes) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
}
