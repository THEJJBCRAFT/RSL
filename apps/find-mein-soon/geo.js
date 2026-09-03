// Standort von Find Mein Soon: Berechtigung erklaeren, GPS beobachten, Herzschlag, Stromsparmodus im Stillstand, Akku.
// Kennt keine Oberflaeche; alles geht ueber die `hooks` nach oben.
import { distanceMeters, formatDistance } from "./format.js";

export const HEARTBEAT_MS = 25000;
export const STILL_MS = 5 * 60 * 1000; // ohne Bewegung: Standort mit geringer Genauigkeit (Akku)

/**
 * hooks:
 *  nativeBridge          -> Android-Bruecke oder null
 *  isActive()            -> es gibt eine Sitzung
 *  isSharing()           -> Standort teilen ist an
 *  onStatus(text, kind)  -> Statuszeile ("ok", "warn", "error", "")
 *  onCard(permission)    -> Berechtigungskarte zeigen ("prompt" | "denied")
 *  onWatchStarted()      -> Beobachtung laeuft (Karte ausblenden, Android-Dienst starten)
 *  onHeartbeat()         -> alle 25 s (Zeitlimit pruefen, Stand senden)
 *  onPosition(position)  -> neue Position { lat, lng, accuracy, heading, speed, at }
 *  onBattery(percent)    -> Akkustand
 */
export function createGeo(hooks) {
  const geo = {
    watchId: null,
    heartbeatTimer: null,
    lowPower: false,
    lastMoveAt: 0,
    lastMovePos: null,
    asked: false,
    position: null,
    battery: null
  };

  // ---------- Geolocation ----------
  /** Standort starten: erst erklaeren, dann fragen. Der Herzschlag laeuft auch ohne Standort (Pause, keine Berechtigung). */
  function startGeolocation() {
    startHeartbeat();
    if (!("geolocation" in navigator)) {
      hooks.onStatus("Dein Gerät unterstützt keine Standortabfrage.", "error");
      return;
    }
    if (geo.watchId !== null) return;
    geoPermissionState().then(permission => {
      if (geo.watchId !== null || !hooks.isActive() || !hooks.isSharing()) return;
      if (permission === "granted" || geo.asked) startWatch();
      else hooks.onCard(permission);
    });
  }

  function geoPermissionState() {
    const bridge = hooks.nativeBridge;
    if (bridge && typeof bridge.locationPermission === "function") {
      try { return Promise.resolve(bridge.locationPermission() === "granted" ? "granted" : "prompt"); } catch {}
    }
    if (!navigator.permissions?.query) return Promise.resolve("prompt");
    return navigator.permissions.query({ name: "geolocation" }).then(result => result.state).catch(() => "prompt");
  }

  function startWatch(highAccuracy = !geo.lowPower) {
    if (geo.watchId !== null) navigator.geolocation.clearWatch(geo.watchId);
    hooks.onStatus("Standort wird gesucht ...", "");
    geo.watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
      enableHighAccuracy: highAccuracy,
      maximumAge: highAccuracy ? 5000 : 30000,
      timeout: 20000
    });
    hooks.onWatchStarted();
  }

  function stopWatch() {
    if (geo.watchId !== null) navigator.geolocation.clearWatch(geo.watchId);
    geo.watchId = null;
  }

  function startHeartbeat() {
    clearInterval(geo.heartbeatTimer);
    geo.heartbeatTimer = setInterval(() => {
      checkStillness();
      hooks.onHeartbeat();
    }, HEARTBEAT_MS);
  }

  function stopGeolocation() {
    stopWatch();
    clearInterval(geo.heartbeatTimer);
    geo.heartbeatTimer = null;
  }

  /** Nach 5 Minuten ohne Bewegung reicht der Netz-Standort; bei Bewegung geht es zurueck auf GPS. */
  function checkStillness() {
    if (!hooks.isSharing() || geo.watchId === null || !geo.position || geo.lowPower) return;
    if (Date.now() - geo.lastMoveAt > STILL_MS) {
      geo.lowPower = true;
      startWatch(false);
      nativeSetLowPower(true);
    }
  }

  function nativeSetLowPower(on) {
    const bridge = hooks.nativeBridge;
    if (!bridge || typeof bridge.setLowPower !== "function") return;
    try { bridge.setLowPower(Boolean(on)); } catch {}
  }

  function onPosition(position) {
    const coords = position.coords;
    const now = Date.now();
    geo.position = {
      lat: coords.latitude,
      lng: coords.longitude,
      accuracy: coords.accuracy,
      heading: Number.isFinite(coords.heading) ? coords.heading : null,
      speed: Number.isFinite(coords.speed) ? coords.speed : null,
      at: now
    };
    const moveThreshold = Math.max(30, Number(coords.accuracy) || 0);
    if (!geo.lastMovePos || distanceMeters(geo.position, geo.lastMovePos) > moveThreshold) {
      geo.lastMovePos = { lat: coords.latitude, lng: coords.longitude };
      geo.lastMoveAt = now;
      if (geo.lowPower) {
        geo.lowPower = false;
        startWatch(true);
        nativeSetLowPower(false);
      }
    }
    if (coords.accuracy > 1000) {
      hooks.onStatus(`Nur ungefährer Standort (±${formatDistance(coords.accuracy)}). Erlaube in den Einstellungen den genauen Standort.`, "warn");
    } else {
      hooks.onStatus(`Standort aktiv (±${Math.round(coords.accuracy)} m${geo.lowPower ? ", Stromsparmodus" : ""})`, "ok");
    }
    hooks.onPosition(geo.position);
  }

  function onPositionError(error) {
    const messages = {
      1: "Standort verweigert. Bitte in den Einstellungen erlauben.",
      2: "Standort gerade nicht verfügbar.",
      3: "Standortsuche dauert zu lange ..."
    };
    hooks.onStatus(messages[error.code] || "Standortfehler.", "error");
    if (error.code === 1) {
      stopWatch();
      hooks.onCard("denied");
    }
  }

  function watchBattery() {
    if (!navigator.getBattery) return;
    navigator.getBattery().then(battery => {
      const update = () => {
        geo.battery = Math.round(battery.level * 100);
        hooks.onBattery(geo.battery);
      };
      update();
      battery.addEventListener("levelchange", update);
    }).catch(() => {});
  }

  geo.start = startGeolocation;
  geo.stop = stopGeolocation;
  geo.startWatch = startWatch;
  geo.stopWatch = stopWatch;
  geo.startHeartbeat = startHeartbeat;
  geo.handleFix = onPosition;
  geo.watchBattery = watchBattery;
  geo.reset = () => {
    geo.lowPower = false;
    geo.asked = false;
    geo.lastMoveAt = 0;
    geo.lastMovePos = null;
  };
  return geo;
}
