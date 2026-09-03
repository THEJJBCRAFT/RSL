/**
 * Ende-zu-Ende-Test der RSL-App im mobilen Browser.
 *
 * Gestartet wird die gebaute Oberflaeche (apps/rsl-mobile/dist) in einem Chromium mit
 * Handy-Abmessungen. Die Android-Huelle gibt es hier nicht, also wird sie nachgebaut:
 * eine Attrappe von window.RslNative beantwortet Ping- und Speicher-Aufrufe genauso, wie
 * es die echte Huelle tut. So laeuft der ganze Weg durch die Bruecke wirklich mit -
 * inklusive der Stueckelung langer Videos.
 */
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..", "..", "apps", "rsl-mobile");
const dist = join(app, "dist");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
};

let checks = 0;
let failures = 0;

function check(what, expected, actual) {
  checks++;
  const ok = Object.is(expected, actual);
  if (!ok) {
    failures++;
    console.log(`FEHLER: ${what} - erwartet <${expected}>, bekommen <${actual}>`);
  }
}

function ensureBuilt() {
  if (existsSync(join(dist, "index.html"))) return;
  console.log("dist fehlt - Oberflaeche wird gebaut ...");
  if (!existsSync(join(app, "node_modules"))) {
    spawnSync("npm", ["ci"], { cwd: app, stdio: "inherit" });
  }
  const built = spawnSync("npm", ["run", "build"], { cwd: app, stdio: "inherit" });
  if (built.status !== 0) {
    console.error("Die Oberflaeche liess sich nicht bauen.");
    process.exit(1);
  }
}

/** Die Attrappe der Android-Huelle - laeuft im Browser, bevor die App startet. */
const FAKE_BRIDGE = `
  window.__rsl = { pings: [], chunks: 0, saved: null, shared: false, name: null };
  let buffer = [];
  window.RslNative = {
    appInfo: () => JSON.stringify({
      name: "RSL", version: "9.9.9", os: "Android 14 (API 34)", arch: "arm64-v8a", build: "42",
    }),
    mcPing: (id, host) => {
      window.__rsl.pings.push(host);
      const online = host.indexOf("boocord") >= 0;
      setTimeout(() => window.rslMcResult(id, JSON.stringify(online ? {
        online: true, host, motd: "Boocord SMP", players_online: 7, players_max: 60,
        version: "1.20.4", latency_ms: 42, favicon: null, error: null,
      } : {
        online: false, host, motd: "", players_online: 0, players_max: 0,
        version: "", latency_ms: 0, favicon: null, error: "Keine Verbindung",
      })), 20);
    },
    saveBegin: (id, name) => { buffer = []; window.__rsl.name = name; window.__rsl.chunks = 0; return true; },
    saveChunk: (id, base64) => { buffer.push(atob(base64)); window.__rsl.chunks++; return true; },
    saveEnd: (id) => {
      const bytes = buffer.join("");
      let sum = 0;
      for (let i = 0; i < bytes.length; i++) sum = (sum + bytes.charCodeAt(i) * (i % 7 + 1)) % 4294967296;
      window.__rsl.saved = { length: bytes.length, sum };
      setTimeout(() => window.rslSaveResult(id, true, "In Filme/RSL gespeichert"), 10);
    },
    saveCancel: () => { buffer = []; },
    canShare: () => window.__rsl.saved !== null,
    shareVideo: () => { window.__rsl.shared = true; },
    shareText: () => {},

    accountState: () => JSON.stringify(state()),
    setClientId: (value) => { account.clientId = value; },
    accountSignIn: () => {
      account.signInCalls++;
      setTimeout(() => window.rslAccountEvent(JSON.stringify({
        stage: "code",
        userCode: "WXYZ-1234",
        verificationUri: "https://example.invalid/link",
        expiresAt: Date.now() + 900000,
      })), 20);
    },
    accountCancel: () => { account.cancelled++; },
    accountSignOut: () => {
      Object.assign(account, { signedIn: false, owns: false, profileMissing: false, name: "", uuid: "", skinUrl: "" });
      window.rslAccountEvent(JSON.stringify({ stage: "idle", account: state() }));
    },
    openLink: (url) => { account.opened = url; },
    copyText: (text) => { account.copied = text; },
  };

  // Der Stand des Kontos, wie ihn die echte Huelle herausgibt.
  const account = {
    clientId: "", signedIn: false, owns: false, profileMissing: false,
    name: "", uuid: "", skinUrl: "", since: 0,
    signInCalls: 0, cancelled: 0, opened: "", copied: "",
  };
  window.__acct = account;
  function state() {
    return { ...account, configured: account.clientId !== "" };
  }
  // Damit der Test eine fertige Anmeldung nachstellen kann.
  window.__acctFinish = (patch) => {
    Object.assign(account, { signedIn: true }, patch);
    window.rslAccountEvent(JSON.stringify({ stage: "done", account: state() }));
  };
  window.__acctFail = (message) => {
    window.rslAccountEvent(JSON.stringify({ stage: "error", message }));
  };
`;

ensureBuilt();

const server = createServer((request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  const file = join(dist, path === "/" ? "index.html" : path);
  if (!file.startsWith(dist) || !existsSync(file)) {
    response.writeHead(404).end("Nicht gefunden");
    return;
  }
  response.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
  response.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});

const problems = [];
page.on("pageerror", (error) => problems.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") problems.push(message.text());
});

await page.addInitScript(FAKE_BRIDGE);
await page.goto(base, { waitUntil: "networkidle" });
await page.waitForSelector('html[data-boot="done"]', { timeout: 10000 });

/* ---------------------------- Aufbau und Menue ---------------------------- */

check("keine Fensterknoepfe mehr", 0, await page.locator(".wbtn").count());
check("Menue mit fuenf Feldern", 5, await page.locator(".navitem").count());

const bar = await page.evaluate(() => {
  const tab = document.querySelector(".tabbar").getBoundingClientRect();
  const item = document.querySelector(".navitem").getBoundingClientRect();
  return { bottom: Math.round(tab.bottom), height: Math.round(item.height), inner: window.innerHeight };
});
check("Menue sitzt am unteren Rand", bar.inner, bar.bottom);
check("Trefferflaeche mindestens 48 Punkte", true, bar.height >= 48);

/* ------------------------------- Info-Seite ------------------------------- */

await page.click('.navitem[data-route="info"]');
await page.waitForTimeout(600);
check("Version aus der Huelle", "9.9.9", await page.textContent("#iVersion"));
check("System aus der Huelle", "Android 14 (API 34)", await page.textContent("#iOs"));
check("Build aus der Huelle", "42", await page.textContent("#iBuild"));

/* -------------------------------- Server --------------------------------- */

await page.click('.navitem[data-route="server"]');
await page.waitForTimeout(900);
const pings = await page.evaluate(() => window.__rsl.pings);
check("beide Server werden angepingt", 2, pings.length);
const online = await page.textContent(".srv[data-srv=\"boocord\"]");
check("MOTD des erreichbaren Servers", true, online.includes("Boocord SMP"));
check("Spielerzahl des erreichbaren Servers", true, online.includes("7"));
const offline = await page.textContent(".srv[data-srv=\"gamercraft\"]");
check("Grund beim nicht erreichbaren Server", true, offline.includes("Keine Verbindung"));

/* ------------------------- RSL AI: erzeugen und speichern ------------------------- */

await page.click('.navitem[data-route="ai"]');
await page.waitForTimeout(600);
await page.selectOption("#secs", { index: 0 });
await page.click("#go");
await page.waitForSelector("#result:not([hidden])", { timeout: 180000 });

const size = await page.evaluate(async () => {
  const blob = await fetch(document.querySelector("#result").src).then((r) => r.blob());
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let sum = 0;
  for (let i = 0; i < bytes.length; i++) sum = (sum + bytes[i] * ((i % 7) + 1)) % 4294967296;
  return { length: bytes.length, sum };
});
check("Video ist groesser als ein Stueck (192 KiB)", true, size.length > 192 * 1024);

check("Teilen ist vor dem Speichern verborgen", true, await page.locator("#shareVideo").isHidden());
await page.click("#saveVideo");
// Auf das sichtbare Ergebnis warten, nicht auf den Zwischenstand in der Attrappe:
// die Rueckmeldung geht denselben Weg wie bei der echten Huelle und braucht einen Moment.
await page.waitForFunction(
  () => document.querySelector("#viewerBadge").textContent === "In Filme/RSL gespeichert",
  null,
  { timeout: 30000 },
);
const saved = await page.evaluate(() => window.__rsl);
check("Video kommt vollstaendig an", size.length, saved.saved.length);
check("Video kommt unveraendert an", size.sum, saved.saved.sum);
check("Video wird in Stuecken uebertragen", true, saved.chunks > 1);
check("Dateiname endet auf .webm", true, saved.name.endsWith(".webm"));
check("Rueckmeldung der Huelle steht im Bild", "In Filme/RSL gespeichert", await page.textContent("#viewerBadge"));
check("Teilen erscheint nach dem Speichern", true, await page.locator("#shareVideo").isVisible());
await page.click("#shareVideo");
check("Teilen geht an die Huelle", true, await page.evaluate(() => window.__rsl.shared));

/* --------------------------------- Konto --------------------------------- */

check("Kopfzeile zeigt die Anmeldung", "Anmelden", await page.textContent("#acctLabel"));
await page.click("#acctBtn");
await page.waitForTimeout(700);
check("Konto-Bereich ist offen", "konto", await page.evaluate(() => document.querySelector(".view").dataset.view));
check("kein Menuefeld markiert", 0, await page.locator(".navitem[aria-current]").count());
check("Pille ist ausgeblendet", "true", await page.getAttribute("#pill", "data-off"));

// Ohne Anwendungs-ID gibt es statt eines Anmelde-Knopfs die Anleitung.
check("Anleitung statt Anmelde-Knopf", 0, await page.locator('[data-do="signin"]').count());
check("Schritte werden erklaert", 4, await page.locator(".steps li").count());
await page.click('[data-do="azure"]');
check("Azure-Portal wird geoeffnet", true, (await page.evaluate(() => window.__acct.opened)).includes("portal.azure.com"));

// Anwendungs-ID in den Einstellungen hinterlegen.
await page.click('.navitem[data-route="einstellungen"]');
await page.waitForTimeout(700);
await page.fill("#clientId", "  11111111-2222-3333-4444-555555555555  ");
await page.dispatchEvent("#clientId", "change");
check("ID kommt bei der Huelle an", "11111111-2222-3333-4444-555555555555", await page.evaluate(() => window.__acct.clientId));
check("Feld raeumt Leerzeichen weg", "11111111-2222-3333-4444-555555555555", await page.inputValue("#clientId"));
check("Rueckmeldung im Feld", "Gespeichert.", await page.textContent("#clientIdNote"));

// Jetzt zeigt der Konto-Bereich den Anmelde-Knopf.
await page.click("#acctBtn");
await page.waitForTimeout(700);
check("Anmelde-Knopf ist da", 1, await page.locator('[data-do="signin"]').count());
await page.click('[data-do="signin"]');
await page.waitForSelector("#acctCode", { timeout: 5000 });
check("Code wird angezeigt", "WXYZ-1234", await page.textContent("#acctCode"));
await page.click('[data-do="copy"]');
check("Code wird kopiert", "WXYZ-1234", await page.evaluate(() => window.__acct.copied));
await page.click('[data-do="open"]');
check("Anmelde-Seite wird geoeffnet", "https://example.invalid/link", await page.evaluate(() => window.__acct.opened));
check("Restzeit laeuft mit", true, /^Code noch 1[45]:\d\d g/.test(await page.textContent("#acctLeft")));

// Konto mit Minecraft.
// Der Skin als eingebettetes Bild: der Test soll nichts aus dem Netz holen.
const SKIN = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
await page.evaluate((skin) => window.__acctFinish({
  owns: true, name: "Steve", uuid: "0123456789abcdef0123456789abcdef", skinUrl: skin,
}), SKIN);
await page.waitForTimeout(300);
check("Spielername steht da", "Steve", await page.textContent("#acctWho"));
check("UUID mit Bindestrichen", "01234567-89ab-cdef-0123-456789abcdef", await page.textContent("#acctUuid"));
check("Besitz wird bestaetigt", true, (await page.textContent("#acctVerdict")).includes("besitzt Minecraft"));
check("Kopfzeile zeigt den Namen", "Steve", await page.textContent("#acctLabel"));
check("Kopfzeile zeigt den Skin", "on", await page.getAttribute("#acctHead", "data-skin"));

// Konto mit Minecraft, aber ohne festgelegten Namen.
await page.evaluate(() => window.__acctFinish({ owns: true, profileMissing: true, name: "", uuid: "", skinUrl: "" }));
await page.waitForTimeout(300);
check("fehlender Spielername wird erklaert", true, (await page.textContent("#acctVerdict")).includes("keinen"));

// Konto ohne Minecraft.
await page.evaluate(() => window.__acctFinish({ owns: false, profileMissing: false }));
await page.waitForTimeout(300);
check("fehlendes Minecraft wird gemeldet", true, (await page.textContent("#acctVerdict")).includes("kein Minecraft"));

// Fehler aus der Huelle.
await page.evaluate(() => window.__acctFail("Zu diesem Konto gehoert kein Xbox-Profil."));
await page.waitForTimeout(300);
check("Fehler der Huelle steht im Bild", "Zu diesem Konto gehoert kein Xbox-Profil.", await page.textContent("#acctError"));

// Abmelden.
await page.click('[data-do="signout"]');
await page.waitForTimeout(300);
check("nach dem Abmelden wieder der Anmelde-Knopf", 1, await page.locator('[data-do="signin"]').count());
check("Kopfzeile wieder neutral", "Anmelden", await page.textContent("#acctLabel"));

/* ------------------------------ Zurueck-Taste ------------------------------ */

check("aus einem Bereich zurueck auf Start", true, await page.evaluate(() => window.rslOnBack()));
await page.waitForTimeout(500);
check("Start ist wieder da", "start", await page.evaluate(() => document.querySelector(".view").dataset.view));
check("auf Start darf die Huelle schliessen", false, await page.evaluate(() => window.rslOnBack()));

/* -------------------------------- Abschluss -------------------------------- */

checks++;
if (problems.length > 0) {
  failures++;
  console.log(`FEHLER: Meldungen in der Konsole - ${problems.join(" | ")}`);
}

await browser.close();
await new Promise((resolve) => server.close(resolve));

console.log(`${checks} Pruefungen, ${failures} Fehler`);
process.exit(failures > 0 ? 1 : 0);
