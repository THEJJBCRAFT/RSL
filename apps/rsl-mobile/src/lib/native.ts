/**
 * Brücke zur Android-Hülle.
 *
 * Alles, was JavaScript auf einem Handy nicht selbst kann, läuft über dieses Modul:
 * Minecraft-Server anpingen (rohes TCP), Videos speichern und teilen, App-Infos.
 * Ohne Hülle (normaler Browser) meldet jede Funktion ehrlich, dass sie nicht geht,
 * statt still zu scheitern.
 */

type NativeBridge = {
  appInfo(): string;
  /** Startet einen Ping; das Ergebnis kommt über window.rslMcResult zurück. */
  mcPing(id: string, host: string): void;
  /** Speichert ein Video in den Downloads; Antwort über window.rslSaveResult. */
  saveVideo(id: string, name: string, dataUrl: string): void;
  shareText(title: string, text: string): void;
};

declare global {
  interface Window {
    RslNative?: NativeBridge;
    rslMcResult?: (id: string, json: string) => void;
    rslSaveResult?: (id: string, ok: boolean, message: string) => void;
  }
}

const bridge: NativeBridge | null =
  typeof window.RslNative === "object" && window.RslNative ? window.RslNative : null;

/** Läuft die Oberfläche in der Android-Hülle? */
export const IS_NATIVE = bridge !== null;

export type AppInfo = {
  name: string;
  version: string;
  os: string;
  arch: string;
  build: string;
};

export type McStatus = {
  online: boolean;
  host: string;
  motd: string;
  players_online: number;
  players_max: number;
  version: string;
  latency_ms: number;
  favicon: string | null;
  error: string | null;
};

export function appInfo(): AppInfo | null {
  if (!bridge) return null;
  try {
    return JSON.parse(bridge.appInfo()) as AppInfo;
  } catch {
    return null;
  }
}

/* Offene Anfragen an die Hülle. Die Antwort kommt asynchron über einen Rückruf,
   damit der Ping die Oberfläche nicht blockiert. */
let counter = 0;
const pending = new Map<string, (value: never) => void>();

function ask<T>(start: (id: string) => void, timeoutMs: number, onTimeout: () => T): Promise<T> {
  return new Promise<T>((resolve) => {
    const id = `r${++counter}`;
    let done = false;
    const finish = (value: T): void => {
      if (done) return;
      done = true;
      pending.delete(id);
      resolve(value);
    };
    pending.set(id, finish as (value: never) => void);
    window.setTimeout(() => finish(onTimeout()), timeoutMs);
    start(id);
  });
}

window.rslMcResult = (id, json) => {
  const done = pending.get(id);
  if (!done) return;
  try {
    (done as (v: McStatus) => void)(JSON.parse(json) as McStatus);
  } catch {
    (done as (v: McStatus) => void)(offline("", "Antwort nicht lesbar"));
  }
};

window.rslSaveResult = (id, ok, message) => {
  const done = pending.get(id);
  if (done) (done as (v: { ok: boolean; message: string }) => void)({ ok, message });
};

function offline(host: string, error: string): McStatus {
  return {
    online: false,
    host,
    motd: "",
    players_online: 0,
    players_max: 0,
    version: "",
    latency_ms: 0,
    favicon: null,
    error,
  };
}

/** Fragt den Status eines Minecraft-Servers ab. */
export function mcPing(host: string): Promise<McStatus> {
  if (!bridge) return Promise.resolve(offline(host, "Nur in der App verfügbar"));
  return ask<McStatus>(
    (id) => bridge.mcPing(id, host),
    9000,
    () => offline(host, "Zeitüberschreitung"),
  );
}

/** Legt ein fertiges Video im Download-Ordner des Handys ab. */
export function saveVideo(name: string, blob: Blob): Promise<{ ok: boolean; message: string }> {
  if (!bridge) return Promise.resolve({ ok: false, message: "Nur in der App verfügbar" });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve({ ok: false, message: "Video konnte nicht gelesen werden" });
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      void ask<{ ok: boolean; message: string }>(
        (id) => bridge.saveVideo(id, name, dataUrl),
        30000,
        () => ({ ok: false, message: "Zeitüberschreitung beim Speichern" }),
      ).then(resolve);
    };
    reader.readAsDataURL(blob);
  });
}

export function shareText(title: string, text: string): void {
  if (!bridge) return;
  try {
    bridge.shareText(title, text);
  } catch {
    /* Teilen ist eine Zugabe, kein Muss */
  }
}
