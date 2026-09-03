// Formatierung und kleine Rechenhelfer von Find Mein Soon. Ohne DOM, in Node testbar.
import { OFFLINE_MS } from "./protocol.js";

// ---------- Helpers ----------
export function distanceMeters(a, b) {
  const R = 6371000;
  const toRad = value => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "?";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0).replace(".", ",")} km`;
}

export function formatClock(time) {
  if (!Number.isFinite(time) || !time) return "?";
  return new Date(time).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export function formatAgo(iso) {
  const time = typeof iso === "number" ? iso : Date.parse(iso || "");
  if (!Number.isFinite(time) || !time) return "nie";
  const diff = Date.now() - time;
  if (diff < 20000) return "gerade eben";
  if (diff < 60000) return `vor ${Math.round(diff / 1000)} Sek.`;
  if (diff < 3600000) return `vor ${Math.round(diff / 60000)} Min.`;
  if (diff < OFFLINE_MS * 8) return `vor ${Math.round(diff / 3600000)} Std.`;
  return new Date(time).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function initials(name) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase() || "?";
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
}

/** "20:00" oder "2" (Stunden) -> Zeitpunkt, bis zu dem geteilt wird. */
export function parseUntil(text) {
  const value = String(text || "").trim().replace(",", ".");
  const clock = value.match(/^(\d{1,2})[:.](\d{2})$/);
  if (clock && Number(clock[1]) < 24 && Number(clock[2]) < 60) {
    const date = new Date();
    date.setHours(Number(clock[1]), Number(clock[2]), 0, 0);
    if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1);
    return date.getTime();
  }
  const hours = Number(value.replace(/\s*(h|std\.?|stunden?)$/i, ""));
  if (Number.isFinite(hours) && hours > 0 && hours <= 48) return Date.now() + hours * 3600000;
  return null;
}

export function brokerHost(url) {
  try { return new URL(url).host.replace(/:\d+$/, ""); } catch { return url; }
}

/** Nur verschluesselte wss://-Adressen (oder ws:// auf dem eigenen Rechner zum Testen) sind als Verbindungsdienst erlaubt. */
export function validBrokerUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname);
    if (url.protocol !== "wss:" && !(url.protocol === "ws:" && local)) return null;
    if (url.username || url.password) return null;
    return String(value).trim();
  } catch {
    return null;
  }
}
