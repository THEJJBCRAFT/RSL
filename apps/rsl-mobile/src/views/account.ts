import type { View } from "../lib/router";
import {
  IS_NATIVE,
  accountCancel,
  accountSignIn,
  accountSignOut,
  accountState,
  copyText,
  onAccountEvent,
  openLink,
  type AccountEvent,
  type AccountState,
} from "../lib/native";

const AZURE = "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade";

/**
 * Minecraft-Konto: anmelden und prüfen, ob das Konto Minecraft besitzt.
 *
 * Ein Feld für Passwörter gibt es hier bewusst nicht. Microsoft lässt das für fremde Programme
 * gar nicht zu, und richtig wäre es auch nicht: Die App zeigt einen Code, angemeldet wird im
 * Browser bei Microsoft. Die App bekommt danach nur einen Schlüssel für dieses eine Konto.
 */
export function account(): View {
  let stop: (() => void) | null = null;
  let deadline = 0;
  let tick = 0;

  return {
    html: `
      <div class="head stagger">
        <span class="eyebrow">Anmeldung</span>
        <h1>Minecraft-<span class="grad">Konto</span></h1>
        <p class="lead">
          Melde dich mit deinem Microsoft-Konto an. Die App prüft danach, ob das Konto
          Minecraft besitzt, und zeigt Spielername und Skin.
        </p>
      </div>

      <div class="acctcard stagger">
        <div class="acctcard__body" id="acctBody"></div>
      </div>

      <div class="acctnote stagger">
        <h3>Warum kein Passwort-Feld?</h3>
        <p>
          Die alten Mojang-Konten gibt es nicht mehr, und Microsoft erlaubt fremden Programmen
          keine Passwort-Anmeldung. Der Weg über den Code ist derselbe, den auch die großen
          Launcher nehmen: Passwort und Zwei-Faktor bleiben bei Microsoft, die App sieht davon nichts.
        </p>
      </div>
    `,

    mount(root) {
      const body = root.querySelector<HTMLElement>("#acctBody");
      if (!body) return;

      const render = (state: AccountState, event: AccountEvent | null): void => {
        if (!IS_NATIVE) {
          body.innerHTML = `<p class="acctcard__hint">Die Anmeldung geht nur in der App, nicht in der Browser-Vorschau.</p>`;
          return;
        }
        if (!state.configured) {
          body.innerHTML = setup();
          return;
        }
        if (event?.stage === "code") {
          body.innerHTML = waiting(event);
          return;
        }
        if (event?.stage === "checking") {
          body.innerHTML = `<p class="acctcard__hint">Konto wird geprüft &hellip;</p>`;
          return;
        }
        const trouble = event?.stage === "error" ? problem(event.message ?? "") : "";
        body.innerHTML = trouble + (state.signedIn ? signedIn(state) : signedOut());
      };

      // Die verbleibende Zeit des Codes: sofort hinschreiben, dann jede Sekunde nachziehen.
      const paintLeft = (): void => {
        const left = root.querySelector<HTMLElement>("#acctLeft");
        if (!left || !deadline) return;
        const seconds = Math.max(0, Math.round((deadline - Date.now()) / 1000));
        left.textContent = `Code noch ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} gültig`;
      };

      const refresh = (event: AccountEvent | null = null): void => {
        const state = event?.account ?? accountState();
        deadline = event?.stage === "code" ? (event.expiresAt ?? 0) : 0;
        render(state, event);
        paintLeft();
      };

      tick = window.setInterval(paintLeft, 1000);

      stop = onAccountEvent((event) => refresh(event));

      root.addEventListener("click", (e) => {
        const target = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-do]") : null;
        switch (target?.dataset.do) {
          case "signin":
            body.innerHTML = `<p class="acctcard__hint">Code wird geholt &hellip;</p>`;
            accountSignIn();
            break;
          case "cancel":
            accountCancel();
            refresh();
            break;
          case "signout":
            accountSignOut();
            break;
          case "open":
            openLink(target.dataset.url ?? "https://www.microsoft.com/link");
            break;
          case "copy":
            copyText(target.dataset.code ?? "");
            target.textContent = "Kopiert";
            break;
          case "azure":
            openLink(AZURE);
            break;
        }
      });

      refresh();
    },

    unmount() {
      stop?.();
      window.clearInterval(tick);
    },
  };
}

/* -------------------------------- Bausteine -------------------------------- */

function setup(): string {
  return `
    <p class="acctcard__hint">
      Für die Anmeldung fehlt noch die Microsoft-Anwendungs-ID. Sie ist kostenlos und in
      fünf Minuten angelegt:
    </p>
    <ol class="steps">
      <li>Im Azure-Portal auf <strong>App-Registrierungen</strong> gehen und eine neue Registrierung anlegen.</li>
      <li>Als Kontotyp <strong>Nur persönliche Microsoft-Konten</strong> wählen, keine Weiterleitungs-Adresse eintragen.</li>
      <li>Unter <strong>Authentifizierung</strong> die Option <strong>Öffentliche Clientflows zulassen</strong> auf <strong>Ja</strong> stellen.</li>
      <li>Die <strong>Anwendungs-ID (Client)</strong> kopieren und in den Einstellungen dieser App einfügen.</li>
    </ol>
    <div class="row">
      <button class="btn btn--ghost" data-fx data-do="azure">Azure-Portal öffnen</button>
    </div>
  `;
}

function signedOut(): string {
  return `
    <p class="acctcard__hint">
      Beim Antippen zeigt dir die App einen kurzen Code. Den gibst du im Browser bei Microsoft
      ein &ndash; dein Passwort bekommt die App nie zu sehen.
    </p>
    <div class="row">
      <button class="btn btn--primary btn--lg" data-fx data-magnet="6" data-do="signin">
        Mit Microsoft anmelden
      </button>
    </div>
  `;
}

function waiting(event: AccountEvent): string {
  const code = event.userCode ?? "";
  const uri = event.verificationUri ?? "https://www.microsoft.com/link";
  return `
    <p class="acctcard__hint">Öffne die Seite, melde dich an und gib diesen Code ein:</p>
    <div class="code" id="acctCode">${escape(code)}</div>
    <p class="acctcard__sub"><span id="acctLeft"></span></p>
    <div class="row">
      <button class="btn btn--primary" data-fx data-do="open" data-url="${escape(uri)}">Seite öffnen</button>
      <button class="btn btn--ghost" data-fx data-do="copy" data-code="${escape(code)}">Code kopieren</button>
      <button class="btn btn--ghost" data-fx data-do="cancel">Abbrechen</button>
    </div>
    <p class="acctcard__sub">Die App wartet, bis du im Browser fertig bist.</p>
  `;
}

function signedIn(state: AccountState): string {
  const head = state.skinUrl
    ? `<span class="skin" style="background-image:url('${escape(state.skinUrl)}')" aria-hidden="true"></span>`
    : `<span class="skin skin--none" aria-hidden="true">?</span>`;
  const title = state.name || (state.owns ? "Noch kein Spielername" : "Angemeldet");
  return `
    <div class="who">
      ${head}
      <div class="who__txt">
        <strong id="acctWho">${escape(title)}</strong>
        <span id="acctUuid">${state.uuid ? escape(dashed(state.uuid)) : "&ndash;"}</span>
      </div>
    </div>
    ${verdict(state)}
    <div class="row">
      <button class="btn btn--ghost" data-fx data-do="signout">Abmelden</button>
    </div>
  `;
}

function verdict(state: AccountState): string {
  if (state.owns && state.profileMissing) {
    return `<p class="verdict verdict--warn" id="acctVerdict">Das Konto besitzt Minecraft, hat aber noch keinen
      Spielernamen. Einmal im offiziellen Launcher anmelden und den Namen festlegen.</p>`;
  }
  if (state.owns) {
    return `<p class="verdict verdict--ok" id="acctVerdict">Dieses Konto besitzt Minecraft (Java Edition).</p>`;
  }
  return `<p class="verdict verdict--bad" id="acctVerdict">In diesem Konto steckt kein Minecraft (Java Edition).
    Für die AFK-Wache braucht es ein Konto, das das Spiel besitzt.</p>`;
}

function problem(message: string): string {
  return `<p class="verdict verdict--bad" id="acctError">${escape(message)}</p>`;
}

/** UUID mit Bindestrichen, wie sie sonst überall steht. */
function dashed(id: string): string {
  if (id.length !== 32) return id;
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
