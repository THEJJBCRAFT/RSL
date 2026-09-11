/**
 * Nimmt die Webseite fuer den Werbeclip auf - ganze Seiten als ein Bild,
 * einmal fuers Querformat (Rechner, 1440 px breit) und einmal fuers
 * Hochformat (Handy, 390 px breit). Der Clip scrollt spaeter durch die Bilder.
 *
 * Seiten: Startseite (nach "Eintreten"), Redstone Labs, RSL Mods & Plugins,
 * App Store (mit den echten Release-Angaben statt der GitHub-Abfrage).
 *
 * Ergebnis: tools/rsl-ad/captures/site-<geraet>-<seite>.png, Hoehen in
 * manifest.json unter "site". Laeuft nach capture.mjs (das Manifest muss da sein).
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const OUT = join(here, "captures");
const MANIFEST = join(OUT, "manifest.json");

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".json": "application/json",
  ".woff2": "font/woff2", ".mp4": "video/mp4",
};

const PAGES = {
  index: "/index.html",
  labs: "/categories/redstone-labs/index.html",
  library: "/categories/redstone-labs/library/index.html",
  store: "/apps/store/index.html",
};
const DEVICES = {
  wide: { width: 1440, height: 900, scale: 1, isMobile: false },
  tall: { width: 390, height: 844, scale: 2, isMobile: true },
};

/* Die echten Angaben der beiden Releases (Stand der Aufnahme). */
const RELEASES = {
  "rsl-latest": { name: "RSL APK (Build 13)", published_at: "2026-09-03T11:39:20Z",
    assets: [{ name: "RSL.apk", size: 370790, download_count: 2, browser_download_url: "https://github.com/THEJJBCRAFT/RSL/releases/download/rsl-latest/RSL.apk" }] },
  "find-mein-soon-latest": { name: "Find Mein Soon APK (Build 22)", published_at: "2026-09-02T18:17:23Z",
    assets: [{ name: "FindMeinSoon.apk", size: 683602, download_count: 0, browser_download_url: "https://github.com/THEJJBCRAFT/RSL/releases/download/find-mein-soon-latest/FindMeinSoon.apk" }] },
};

function serve() {
  const server = createServer((request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url, "http://x").pathname));
    const file = join(repo, path.endsWith("/") ? `${path}index.html` : path);
    if (!file.startsWith(repo) || !existsSync(file)) { response.writeHead(404).end(); return; }
    response.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
    response.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

if (!existsSync(MANIFEST)) {
  console.error("captures/manifest.json fehlt - zuerst: node tools/rsl-ad/capture.mjs");
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
manifest.site = {};

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();

for (const [device, d] of Object.entries(DEVICES)) {
  const context = await browser.newContext({
    viewport: { width: d.width, height: d.height }, deviceScaleFactor: d.scale,
    isMobile: d.isMobile, hasTouch: d.isMobile, reducedMotion: "reduce", locale: "de-DE",
  });
  await context.route("https://api.github.com/**", (route) => {
    const tag = route.request().url().split("/").pop();
    const body = RELEASES[tag];
    if (body) route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    else route.abort();
  });
  // Lichtkegel am Mauszeiger, "Intro erneut"-Knopf und "nach oben" stoeren im Bild.
  await context.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = ".cursor-light, .skip-button, .to-top, .rsl-toast { display: none !important; }";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(style));
  });
  manifest.site[device] = {};

  for (const [key, path] of Object.entries(PAGES)) {
    const page = await context.newPage();
    page.on("pageerror", (error) => console.error(`${device}/${key}:`, String(error)));
    await page.goto(base + path, { waitUntil: "networkidle" });
    if (key === "index") {
      // Das Intro der Startseite laeuft je nach Geraet unterschiedlich lang - Knopf direkt ausloesen.
      await page.evaluate(() => document.querySelector("#enterButton").click());
      await page.waitForTimeout(900);
    }
    await page.waitForTimeout(700);
    const height = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
    const name = `site-${device}-${key}`;
    await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
    manifest.site[device][key] = { file: name, width: d.width, height, scale: d.scale };
    console.log(`${device}/${key}: ${d.width} x ${height} px`);
    await page.close();
  }
  await context.close();
}

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
await browser.close();
await new Promise((resolve) => server.close(resolve));
console.log(`Webseiten-Aufnahmen liegen unter ${OUT}`);
