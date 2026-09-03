// Nachrichtenformat von Find Mein Soon: Themen, Ablaufzeiten, Pruefung eingehender Daten. Ohne DOM, in Node testbar.

export const PROTOCOL_VERSION = 2; // steht in jeder Nachricht, damit alte und neue Apps sich nicht stumm missverstehen
export const MEMBER_EXPIRY_S = 7 * 24 * 60 * 60;
export const META_EXPIRY_S = 60 * 24 * 60 * 60;
export const TOMBSTONE_EXPIRY_S = 24 * 60 * 60;
export const MEMBER_MAX_AGE_MS = 48 * 60 * 60 * 1000;
export const STALE_MS = 3 * 60 * 1000;
export const OFFLINE_MS = 15 * 60 * 1000;
export const MEMBER_COLORS = ["#4ff4cf", "#ff3248", "#ffd166", "#8b5cf6", "#38bdf8", "#fb923c", "#a3e635", "#f472b6"];

/** Wurzel-Thema einer Gruppe: fms/v<Protokoll>/<Themen-ID>. */
export function topicRoot(secrets) {
  return `fms/v${secrets.version}/${secrets.topicId}`;
}

/** Abschiedsnachricht (v2): ersetzt den eigenen retained Eintrag und verfaellt von selbst. */
export function farewell() {
  return { left: true, ts: Date.now(), proto: PROTOCOL_VERSION };
}

/** Zeitpunkt eines Mitglieds in unserer Uhr: Versatz der Senderuhr (bei Live-Nachrichten gemessen) wird herausgerechnet. */
export function memberTime(member, iso) {
  const time = Date.parse(iso || "");
  if (!Number.isFinite(time)) return 0;
  return time + (Number.isFinite(member.skew) ? member.skew : 0);
}

export function isOffline(member) {
  return Date.now() - memberTime(member, member.lastSeen) > OFFLINE_MS;
}

export function sanitizeMember(id, data) {
  const num = value => (value !== null && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null);
  const lat = num(data.lat);
  const lng = num(data.lng);
  const valid = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  return {
    id,
    name: cleanText(data.name, 40) || "Unbekannt",
    color: /^#[0-9a-f]{6}$/i.test(String(data.color || "")) ? data.color : colorFor(id),
    lat: valid ? lat : null,
    lng: valid ? lng : null,
    accuracy: num(data.accuracy),
    heading: num(data.heading),
    speed: num(data.speed),
    battery: num(data.battery),
    sharing: data.sharing !== false,
    alert: data.alert && data.alert.active ? { active: true, message: cleanText(data.alert.message, 160), since: String(data.alert.since || "") } : null,
    responding: typeof data.responding === "string" && /^[a-z0-9]{1,32}$/.test(data.responding) ? data.responding : null,
    locatedAt: typeof data.locatedAt === "string" ? data.locatedAt : null,
    lastSeen: typeof data.lastSeen === "string" ? data.lastSeen : new Date().toISOString(),
    ts: Number(data.ts || 0),
    receivedAt: Date.now()
  };
}

export function sanitizeMeeting(point) {
  if (!point || typeof point !== "object") return null;
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, label: cleanText(point.label, 40) || "Treffpunkt", setBy: cleanText(point.setBy, 40) || "?", setAt: String(point.setAt || "") };
}

export function cleanText(value, max) {
  // eslint-disable-next-line no-control-regex -- Steuerzeichen aus fremden Texten entfernen
  return String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
}

export function colorFor(id) {
  let hash = 0;
  for (const char of String(id)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return MEMBER_COLORS[hash % MEMBER_COLORS.length];
}
