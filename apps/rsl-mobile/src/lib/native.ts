/**
 * Brücke zur Android-Hülle.
 *
 * Alles, was JavaScript auf einem Handy nicht selbst kann, läuft über dieses Modul:
 * Minecraft-Server anpingen (rohe TCP-Verbindung), fertige Videos in die Galerie legen
 * und teilen, App-Infos lesen. Ohne Hülle (normaler Browser) meldet jede Funktion ehrlich,
 * dass sie nicht geht, statt still zu scheitern.
 */

type NativeBridge = {
  appInfo(): string;
  /** Startet einen Ping; das Ergebnis kommt über window.rslMcResult zurück. */
  mcPing(id: string, host: string): void;
  /** Beginnt eine Video-Übertragung. false heißt: gar nicht erst weitermachen. */
  saveBegin(id: string, name: string): boolean;
  /** Hängt ein Base64-Stück an. false heißt: abgebrochen. */
  saveChunk(id: string, base64: string): boolean;
  /** Schließt ab und legt das Video ab; Antwort über window.rslSaveResult. */
  saveEnd(id: string): void;
  saveCancel(id: string): void;
  /** Gibt es ein gespeichertes Video zum Teilen? */
  canShare(): boolean;
  shareVideo(): void;
  shareText(title: string, text: string): void;
  /** Stand des Minecraft-Kontos als JSON. */
  accountState(): string;
  setClientId(value: string): void;
  accountSignIn(): void;
  accountCancel(): void;
  accountSignOut(): void;
  openLink(url: string): void;
  copyText(text: string): void;
};

declare global {
  interface Window {
    RslNative?: NativeBridge;
    rslMcResult?: (id: string, json: string) => void;
    rslSaveResult?: (id: string, ok: boolean, message: string) => void;
    /** Die Hülle fragt hier nach, bevor sie die App schließt. */
    rslOnBack?: () => boolean;
    /** Meldungen der Hülle zum Anmelde-Ablauf. */
    rslAccountEvent?: (json: string) => void;
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

export type SaveResult = { ok: boolean; message: string };

export function appInfo(): AppInfo | null {
  if (!bridge) return null;
  try {
    return JSON.parse(bridge.appInfo()) as AppInfo;
  } catch {
    return null;
  }
}

/* Offene Anfragen an die Hülle. Die Antwort kommt asynchron über einen Rückruf,
   damit weder Ping noch Speichern die Oberfläche anhalten. */
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
  if (done) (done as (v: SaveResult) => void)({ ok, message });
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

/* Ein fertiges Video kann etliche Megabyte groß sein. Ein einziger Riesen-String durch die
   Brücke ist heikel, darum geht es in Stücken hinüber. 192 KiB teilen sich glatt durch drei,
   also lässt sich jedes Stück für sich als Base64 lesen. */
const CHUNK_BYTES = 192 * 1024;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

/** Legt ein fertiges Video im Film-Ordner des Handys ab. */
export async function saveVideo(name: string, blob: Blob): Promise<SaveResult> {
  if (!bridge) return { ok: false, message: "Nur in der App verfügbar" };

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await blob.arrayBuffer());
  } catch {
    return { ok: false, message: "Video konnte nicht gelesen werden" };
  }
  if (bytes.length === 0) return { ok: false, message: "Video ist leer" };

  return ask<SaveResult>(
    (id) => {
      if (!bridge.saveBegin(id, name)) {
        window.rslSaveResult?.(id, false, "Speichern nicht möglich");
        return;
      }
      for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
        const piece = toBase64(bytes.subarray(offset, offset + CHUNK_BYTES));
        if (!bridge.saveChunk(id, piece)) {
          window.rslSaveResult?.(id, false, "Übertragung abgebrochen");
          return;
        }
      }
      bridge.saveEnd(id);
    },
    120000,
    () => ({ ok: false, message: "Zeitüberschreitung beim Speichern" }),
  );
}

/** Gibt es ein gespeichertes Video, das sich teilen lässt? */
export function canShareVideo(): boolean {
  if (!bridge) return false;
  try {
    return bridge.canShare();
  } catch {
    return false;
  }
}

/** Öffnet die Teilen-Auswahl für das zuletzt gespeicherte Video. */
export function shareVideo(): void {
  if (!bridge) return;
  try {
    bridge.shareVideo();
  } catch {
    /* Teilen ist eine Zugabe, kein Muss */
  }
}

/* ------------------------------ Minecraft-Konto ------------------------------ */

export type AccountState = {
  /** Ist die Microsoft-Anwendungs-ID hinterlegt? Ohne sie geht gar nichts. */
  configured: boolean;
  clientId: string;
  signedIn: boolean;
  owns: boolean;
  /** Konto besitzt Minecraft, hat aber noch keinen Spielernamen festgelegt. */
  profileMissing: boolean;
  name: string;
  uuid: string;
  skinUrl: string;
  since: number;
};

export type AccountEvent = {
  stage: "code" | "checking" | "done" | "error" | "idle";
  userCode?: string;
  verificationUri?: string;
  expiresAt?: number;
  message?: string;
  account?: AccountState;
};

const LOGGED_OUT: AccountState = {
  configured: false,
  clientId: "",
  signedIn: false,
  owns: false,
  profileMissing: false,
  name: "",
  uuid: "",
  skinUrl: "",
  since: 0,
};

export function accountState(): AccountState {
  if (!bridge) return { ...LOGGED_OUT };
  try {
    return { ...LOGGED_OUT, ...(JSON.parse(bridge.accountState()) as Partial<AccountState>) };
  } catch {
    return { ...LOGGED_OUT };
  }
}

export function setClientId(value: string): void {
  bridge?.setClientId(value);
}

export function accountSignIn(): void {
  bridge?.accountSignIn();
}

export function accountCancel(): void {
  bridge?.accountCancel();
}

export function accountSignOut(): void {
  bridge?.accountSignOut();
}

/** Öffnet eine Adresse im Browser des Handys. */
export function openLink(url: string): void {
  bridge?.openLink(url);
}

export function copyText(text: string): void {
  bridge?.copyText(text);
}

const accountListeners = new Set<(event: AccountEvent) => void>();

/** Hört auf den Anmelde-Ablauf. Der Rückgabewert meldet die Ansicht wieder ab. */
export function onAccountEvent(listener: (event: AccountEvent) => void): () => void {
  accountListeners.add(listener);
  return () => accountListeners.delete(listener);
}

window.rslAccountEvent = (json) => {
  let event: AccountEvent;
  try {
    event = JSON.parse(json) as AccountEvent;
  } catch {
    event = { stage: "error", message: "Antwort nicht lesbar" };
  }
  accountListeners.forEach((listener) => listener(event));
};
