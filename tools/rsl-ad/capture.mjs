/**
 * Nimmt die RSL-App fuer den Werbeclip auf - echte Bilder, keine Attrappen.
 *
 * Die gebaute Oberflaeche (apps/rsl-mobile/dist) laeuft in einem Chromium in
 * Handy-Groesse mit einer nachgebauten Android-Bruecke (dieselbe wie im Test).
 * Aufgenommen wird, was der Clip spaeter in Bewegung setzt:
 *
 *   - lange Ansichten (Start, RSL AI) in drei Lagen - Kopfzeile, Inhalt, Menue -
 *     damit der Clip den Inhalt unter fester Kopfzeile und festem Menue scrollen kann
 *   - das Tippen eines Prompts, Zeichen fuer Zeichen, danach dieselbe Seite
 *     noch einmal in Lagen (zum Knopf "Video erzeugen" scrollen)
 *   - ein echter Render-Lauf mit Fortschritt und fertigem Bild (die Uhr der
 *     Seite laeuft dabei langsamer, damit jedes Bild scharf fotografiert wird)
 *   - Server-Ansicht waehrend und nach dem Ping
 *   - Konto: abgemeldet, Code-Anzeige, angemeldet
 *
 * Ergebnis: tools/rsl-ad/captures/ mit manifest.json. Wird nicht eingecheckt;
 * make-rsl-ad.mjs ruft dieses Skript auf, wenn die Aufnahmen fehlen.
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const dist = join(repo, "apps", "rsl-mobile", "dist");
const OUT = join(here, "captures");

const W = 390;
const H = 844;
const SCALE = 2;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

/* Die nachgebaute Huelle: antwortet wie die echte, nur ohne Netz. */
const BRIDGE = `
  const account = { clientId: "demo", signedIn: false, owns: false, profileMissing: false,
    name: "", uuid: "", skinUrl: "", since: 0 };
  const state = () => ({ ...account, configured: true });
  // Ein kleines blockiges Gesicht als Skin-Platzhalter, 64x64 wie ein echter Skin.
  function skin() {
    const c = document.createElement("canvas"); c.width = 64; c.height = 64;
    const g = c.getContext("2d");
    const px = (x, y, col) => { g.fillStyle = col; g.fillRect(8 + x, 8 + y, 1, 1); };
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px(x, y, y < 2 ? "#3b2a1e" : "#e0ac86");
    px(1, 3, "#f5f5f5"); px(2, 3, "#2d5be3"); px(5, 3, "#f5f5f5"); px(6, 3, "#2d5be3");
    px(3, 5, "#c98c66"); px(4, 5, "#c98c66");
    for (let x = 2; x < 6; x++) px(x, 6, "#8a4b3a");
    px(0, 2, "#3b2a1e"); px(7, 2, "#3b2a1e");
    return c.toDataURL("image/png");
  }
  window.__demo = {
    ping(host) {
      return host.indexOf("boocord") >= 0
        ? { online: true, host, motd: "Boocord SMP \\u2013 Season 4", players_online: 23, players_max: 60, version: "Paper 1.21.1", latency_ms: 38, favicon: null, error: null }
        : { online: true, host, motd: "GamerCraft Netzwerk", players_online: 7, players_max: 100, version: "Paper 1.20.4", latency_ms: 64, favicon: null, error: null };
    },
    pingDelay: 1500,
    finish() {
      Object.assign(account, { signedIn: true, owns: true, name: "JaroDelta",
        uuid: "0123456789abcdef0123456789abcdef", skinUrl: skin(), since: Date.now() });
      window.rslAccountEvent(JSON.stringify({ stage: "done", account: state() }));
    },
  };
  // Fuer die Aufnahme des Render-Laufs laeuft die Uhr der Seite auf Wunsch
  // langsamer: der Balken braucht dann statt 5 s eben 40 s, und jedes
  // Einzelbild bekommt Zeit fuer ein scharfes Foto in voller Aufloesung.
  window.__slow = 1;
  var realNow = Performance.prototype.now;
  Performance.prototype.now = function () { return realNow.call(this) / window.__slow; };
  window.RslNative = {
    appInfo: () => JSON.stringify({ name: "RSL", version: "0.1.13", os: "Android 14 (API 34)", arch: "arm64-v8a", build: "13" }),
    mcPing: (id, host) => setTimeout(() => window.rslMcResult(id, JSON.stringify(window.__demo.ping(host))), window.__demo.pingDelay),
    saveBegin: () => true, saveChunk: () => true,
    saveEnd: (id) => setTimeout(() => window.rslSaveResult(id, true, "In Filme/RSL gespeichert"), 50),
    saveCancel: () => {}, canShare: () => false, shareVideo: () => {}, shareText: () => {},
    accountState: () => JSON.stringify(state()),
    setClientId: () => {},
    accountSignIn: () => setTimeout(() => window.rslAccountEvent(JSON.stringify({
      stage: "code", userCode: "WXYZ-1234", verificationUri: "https://microsoft.com/link", expiresAt: Date.now() + 880000 })), 350),
    accountCancel: () => {}, accountSignOut: () => {}, openLink: () => {}, copyText: () => {},
  };
`;

function serve() {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://x").pathname);
    const file = join(dist, path === "/" ? "index.html" : path);
    if (!file.startsWith(dist) || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
    response.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

const manifest = { width: W, height: H, scale: SCALE, layered: {}, frames: {} };

async function main() {
  if (!existsSync(join(dist, "index.html"))) {
    console.error("apps/rsl-mobile/dist fehlt - zuerst: npm --prefix apps/rsl-mobile run build");
    process.exit(1);
  }
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: SCALE,
    isMobile: true,
    hasTouch: true,
    // Der Clip braucht ruhige Bilder: keine Klickgeraeusche, aber Aurora und Bewegung bleiben an.
  });
  await context.addInitScript(BRIDGE);
  await context.addInitScript(() => {
    localStorage.setItem("rsl.settings", JSON.stringify({ sound: false }));
  });

  const page = await context.newPage();
  page.on("pageerror", (error) => { console.error("Seite:", String(error)); process.exitCode = 1; });

  const open = async (route) => {
    await page.goto(base, { waitUntil: "networkidle" });
    await page.waitForSelector('html[data-boot="done"]', { timeout: 10000 });
    await page.waitForTimeout(1200);
    if (route === "konto") await page.click("#acctBtn");
    else if (route !== "start") await page.click(`.navitem[data-route="${route}"]`);
    await page.waitForTimeout(1300);
  };

  const shot = async (name) => {
    await page.screenshot({ path: join(OUT, `${name}.png`) });
    return name;
  };

  /** Mitte eines Elements in CSS-Pixeln - dort setzt der Clip den Finger. */
  const rect = async (selector) => page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), w: Math.round(b.width), h: Math.round(b.height) };
  }, selector);

  /* ------------------- lange Ansichten in drei Lagen ------------------- */

  /** Lagen vom aktuellen Zustand aufnehmen - ohne Neuladen. */
  const layersNow = async (name) => {
    const contentHeight = await page.evaluate(() => {
      const view = document.querySelector("#stage .view");
      view.scrollTop = 0;
      return Math.ceil(view.scrollHeight);
    });
    const bars = await page.evaluate(() => ({
      top: Math.round(document.querySelector(".topbar").getBoundingClientRect().height),
      nav: Math.round(document.querySelector(".tabbar").getBoundingClientRect().height),
    }));
    // Fenster so hoch machen, dass der ganze Inhalt ohne Scrollen sichtbar ist.
    await page.setViewportSize({ width: W, height: bars.top + contentHeight + bars.nav });
    await page.waitForTimeout(700);
    const rects = await page.evaluate(() => {
      const r = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
      return { top: r(".topbar"), body: r("#stage"), nav: r(".tabbar") };
    });
    for (const part of ["top", "body", "nav"]) {
      await page.screenshot({ path: join(OUT, `${name}-${part}.png`), clip: rects[part] });
    }
    manifest.layered[name] = {
      top: Math.round(rects.top.height),
      body: Math.round(rects.body.height),
      nav: Math.round(rects.nav.height),
    };
    await page.setViewportSize({ width: W, height: H });
    await page.waitForTimeout(500);
    console.log(`${name}: Inhalt ${Math.round(rects.body.height)} px hoch`);
  };

  const layered = async (route) => {
    await open(route);
    await layersNow(route);
  };

  await layered("start");
  await layered("ai");

  /* ------------------------- RSL AI: tippen, rendern ------------------------- */

  await open("ai");
  const prompt = "Anime-Mädchen, Tokyo bei Nacht, Regen, langsamer Zoom";
  await page.fill("#prompt", "");
  await page.waitForTimeout(400);
  const typing = [await shot("ai-type-00")];
  for (let i = 1; i <= prompt.length; i++) {
    await page.fill("#prompt", prompt.slice(0, i));
    await page.dispatchEvent("#prompt", "input");
    await page.waitForTimeout(60);
    typing.push(await shot(`ai-type-${String(i).padStart(2, "0")}`));
  }
  manifest.frames.typing = typing;
  await page.waitForTimeout(900); // die Vorschau zieht nach
  manifest.frames.typed = await shot("ai-typed");
  // Dieselbe Seite mit dem getippten Satz in Lagen - der Clip scrollt damit zum Knopf.
  await layersNow("ai-typed");

  // Zum Knopf "Video erzeugen" scrollen, so dass er gut im Daumenbereich sitzt.
  manifest.aiGoScroll = await page.evaluate(() => {
    const view = document.querySelector("#stage .view");
    const go = document.querySelector("#go").getBoundingClientRect();
    view.scrollTop = Math.round(view.scrollTop + go.top + go.height / 2 - view.clientHeight * 0.6);
    return view.scrollTop;
  });
  await page.waitForTimeout(600);
  manifest.frames.ready = await shot("ai-ready");
  manifest.rects = { goScrolled: await rect("#go") };

  // Der Render-Lauf laeuft in Echtzeit (5 s) - zu schnell fuer Fotos in
  // voller Aufloesung. Also die Uhr der Seite achtmal langsamer stellen und
  // in Ruhe Bild fuer Bild fotografieren; jedes bekommt seinen Zeitstempel.
  const SLOW = 8;
  await page.evaluate((f) => { window.__slow = f; }, SLOW);
  const clickedAt = Date.now();
  await page.click("#go");
  const running = [];
  const runningTimes = [];
  for (;;) {
    const state = await page.evaluate(() => ({
      done: !document.querySelector("#result").hidden,
      progress: document.querySelector("#progressTxt")?.textContent ?? "",
    }));
    if (state.done || Date.now() - clickedAt > 120000) break;
    const at = (Date.now() - clickedAt) / 1000 / SLOW;
    running.push(await shot(`ai-run-${String(running.length).padStart(2, "0")}`));
    runningTimes.push(Number(at.toFixed(3)));
  }
  await page.evaluate(() => { window.__slow = 1; });
  await page.waitForTimeout(600);
  manifest.frames.result = await shot("ai-result");
  manifest.frames.running = running;
  manifest.runningTimes = runningTimes;
  console.log(`RSL AI: ${typing.length} Tipp-Bilder, ${running.length} Render-Bilder (${runningTimes[runningTimes.length - 1]} s Render-Zeit)`);

  /* --------------------------------- Server --------------------------------- */

  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForSelector('html[data-boot="done"]');
  await page.waitForTimeout(1200);
  await page.click('.navitem[data-route="server"]');
  await page.waitForTimeout(500);
  manifest.frames.serverWait = await shot("server-wait");
  await page.waitForTimeout(2200);
  manifest.frames.serverDone = await shot("server-done");

  /* --------------------------------- Konto --------------------------------- */

  await open("konto");
  manifest.frames.kontoOut = await shot("konto-out");
  await page.click('[data-do="signin"]');
  await page.waitForSelector("#acctCode", { timeout: 5000 });
  await page.waitForTimeout(700);
  manifest.frames.kontoCode = await shot("konto-code");
  await page.evaluate(() => window.__demo.finish());
  await page.waitForTimeout(700);
  manifest.frames.kontoIn = await shot("konto-in");

  /* --------------------------------- Start --------------------------------- */

  await open("start");
  manifest.frames.start = await shot("start");

  /* ---------------------- Wo sitzen die Knoepfe? (fuer den Finger) ---------------------- */

  Object.assign(manifest.rects, {
    navAi: await rect('.navitem[data-route="ai"]'),
    navServer: await rect('.navitem[data-route="server"]'),
    acctBtn: await rect("#acctBtn"),
    cta: await rect('[data-action="start"]'),
  });
  await open("ai");
  manifest.rects.prompt = await rect("#prompt");
  manifest.rects.go = await rect("#go");
  await open("konto");
  manifest.rects.signin = await rect('[data-do="signin"]');

  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  console.log(`Aufnahmen liegen unter ${OUT}`);
}

await main();
