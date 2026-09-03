/**
 * Prueft den App Store der Webseite (apps/store).
 *
 * Die Seite holt Fassung, Groesse, Datum und Downloads live von GitHub. Im Test antwortet
 * statt GitHub eine Attrappe, damit die Zahlen bekannt sind und der Test ohne Netz laeuft.
 * Geprueft wird beides: dass die Angaben ankommen und dass die Seite auch ohne sie
 * benutzbar bleibt - die Download-Links muessen in jedem Fall stimmen.
 */
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PAGE = "/apps/store/index.html";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

let checks = 0;
let failures = 0;

function check(what, expected, actual) {
  checks++;
  if (!Object.is(expected, actual)) {
    failures++;
    console.log(`FEHLER: ${what} - erwartet <${expected}>, bekommen <${actual}>`);
  }
}

/** Antwort, wie sie GitHub fuer ein Release liefert. */
function release(tag, asset, size, downloads) {
  return {
    name: `Beispiel APK (Build 42)`,
    published_at: "2026-08-14T10:20:30Z",
    assets: [
      { name: "andere-datei.txt", size: 12, download_count: 1, browser_download_url: "https://example.invalid/x" },
      {
        name: asset,
        size,
        download_count: downloads,
        browser_download_url: `https://github.com/THEJJBCRAFT/RSL/releases/download/${tag}/${asset}`,
      },
    ],
  };
}

const server = createServer((request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, "http://x").pathname));
  const file = join(repo, path.endsWith("/") ? `${path}index.html` : path);
  if (!file.startsWith(repo) || !existsSync(file)) {
    response.writeHead(404).end("Nicht gefunden");
    return;
  }
  response.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
  response.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();

/* ------------------------- Mit Angaben von GitHub ------------------------- */

const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const problems = [];
page.on("pageerror", (error) => problems.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") problems.push(message.text());
});

// Statt GitHub antwortet die Attrappe.
await page.route("https://api.github.com/**", (route) => {
  const url = route.request().url();
  const body = url.endsWith("find-mein-soon-latest")
    ? release("find-mein-soon-latest", "FindMeinSoon.apk", 3_355_443, 1240)
    : release("rsl-latest", "RSL.apk", 370_546, 7);
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
});

await page.goto(base + PAGE, { waitUntil: "networkidle" });
await page.waitForTimeout(400);

check("beide Apps in der Liste", 2, await page.locator(".store-row").count());
check("Empfehlung ist da", 1, await page.locator(".store-feature").count());
check("Empfehlung ist Find Mein Soon", "Find Mein Soon", await page.textContent(".store-feature h2"));
check(
  "Groesse aus dem Release",
  true,
  (await page.textContent('.store-row[data-open="find-mein-soon"]')).includes("3,2 MB"),
);

/* -------------------------------- Suche -------------------------------- */

await page.fill("#storeSearch", "server");
await page.waitForTimeout(200);
check("Suche findet ueber den Text", 1, await page.locator(".store-row").count());
check("und zwar RSL", "RSL", await page.textContent(".store-row strong"));
check("Empfehlung tritt bei der Suche zurueck", 0, await page.locator(".store-feature").count());

await page.fill("#storeSearch", "gibtsnicht");
await page.waitForTimeout(200);
check("nichts gefunden wird gesagt", 1, await page.locator(".store-empty").count());

await page.fill("#storeSearch", "");
await page.waitForTimeout(200);
check("leere Suche zeigt wieder alles", 2, await page.locator(".store-row").count());

/* ------------------------------ App-Seite ------------------------------ */

await page.click('.store-row[data-open="rsl"] .store-row__main');
await page.waitForTimeout(300);
check("App-Seite offen", "RSL", await page.textContent(".store-head h1"));
check("Adresse merkt sich die App", true, page.url().endsWith("#app=rsl"));
check("Bildschirmfotos dabei", 4, await page.locator(".store-shots img").count());

const facts = await page.locator(".store-facts strong").allTextContents();
check("Downloads aus dem Release", "7", facts[0]);
check("Groesse aus dem Release", "362 KB", facts[1]);
check("Fassung aus dem Release", "Build 42", facts[2]);
check("Android-Anforderung", "7.0+", facts[3]);
check("Datum aus dem Release", true, (await page.textContent(".store-info")).includes("14. August 2026"));

const href = await page.getAttribute(".store-cta .btn-download", "href");
check("Download zeigt auf das Release", "https://github.com/THEJJBCRAFT/RSL/releases/download/rsl-latest/RSL.apk", href);
check("Download ist als Datei markiert", "", await page.getAttribute(".store-cta .btn-download", "download"));

await page.click("[data-back]");
await page.waitForTimeout(300);
check("zurueck in der Liste", 2, await page.locator(".store-row").count());

// Direkt mit einer Adresse einsteigen.
await page.goto(`${base}${PAGE}#app=find-mein-soon`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
check("Adresse fuehrt direkt zur App", "Find Mein Soon", await page.textContent(".store-head h1"));
check("Web-Fassung wird angeboten", 1, await page.locator('.store-ghost[href*="find-mein-soon"]').count());

// Ein Klick auf "Installieren" in der Liste darf nicht die App-Seite oeffnen.
await page.goto(base + PAGE, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.evaluate(() => {
  document.querySelectorAll("a[download]").forEach((a) => a.removeAttribute("href"));
});
await page.click('.store-row[data-open="rsl"] .btn-download');
await page.waitForTimeout(300);
check("Installieren oeffnet nicht die App-Seite", 2, await page.locator(".store-row").count());

/* ------------------------------ Ohne GitHub ------------------------------ */

const offline = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
offline.on("pageerror", (error) => problems.push(`ohne Netz: ${error}`));
await offline.route("https://api.github.com/**", (route) => route.abort());
await offline.goto(base + PAGE, { waitUntil: "networkidle" });
await offline.waitForTimeout(400);

check("Liste steht auch ohne GitHub", 2, await offline.locator(".store-row").count());
const fallback = await offline.getAttribute('.store-row[data-open="rsl"] .btn-download', "href");
check(
  "Download-Link stimmt auch ohne GitHub",
  "https://github.com/THEJJBCRAFT/RSL/releases/download/rsl-latest/RSL.apk",
  fallback,
);

// Auf dem Handy darf nichts seitlich herausragen.
const overflow = await offline.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check("kein seitliches Rausragen", true, overflow <= 1);

await offline.click('.store-row[data-open="rsl"] .store-row__main');
await offline.waitForTimeout(300);
check("App-Seite auch auf dem Handy", "RSL", await offline.textContent(".store-head h1"));
const detailOverflow = await offline.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check("App-Seite ragt nicht heraus", true, detailOverflow <= 1);

/* ------------------------------- Abschluss ------------------------------- */

checks++;
if (problems.length > 0) {
  failures++;
  console.log(`FEHLER: Meldungen in der Konsole - ${problems.join(" | ")}`);
}

await browser.close();
await new Promise((resolve) => server.close(resolve));

console.log(`${checks} Pruefungen, ${failures} Fehler`);
process.exit(failures > 0 ? 1 : 0);
