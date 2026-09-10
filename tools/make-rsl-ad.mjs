/**
 * Baut den Werbeclip fuer die RSL-App als MP4.
 *
 * Ablauf: Fehlen die Aufnahmen der echten App (tools/rsl-ad/captures),
 * nimmt tools/rsl-ad/capture.mjs sie zuerst auf. Dann wird tools/rsl-ad/ad.html
 * in einem Chromium geoeffnet, Bild fuer Bild ueber setTime(t) gestellt, jedes
 * Bild abfotografiert und direkt in ffmpeg geschoben. Nichts wird
 * zwischengespeichert, und weil die Zeit gesetzt und nicht gemessen wird, ist
 * jedes Bild genau dort, wo es hingehoert.
 *
 * Aufruf:
 *   node tools/make-rsl-ad.mjs                 # beide Formate
 *   node tools/make-rsl-ad.mjs wide            # nur 16:9
 *   node tools/make-rsl-ad.mjs tall            # nur 9:16
 *   node tools/make-rsl-ad.mjs --capture       # Aufnahmen erneuern, dann bauen
 *
 * Braucht die gebaute App unter apps/rsl-mobile/dist (npm run build:rsl-mobile).
 *
 * Braucht ein ffmpeg mit libx264. Wird eines im Pfad gefunden, wird das
 * genommen; sonst das aus dem npm-Paket @ffmpeg-installer/ffmpeg.
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const AD_DIR = join(repo, "tools", "rsl-ad");
const OUT_DIR = join(repo, "assets", "video");
const FPS = 30;

const FORMATS = {
  wide: { width: 1920, height: 1080, file: "rsl-werbung-16-9.mp4" },
  tall: { width: 1080, height: 1920, file: "rsl-werbung-9-16.mp4" }
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

/** ffmpeg finden: erst im Pfad, dann im npm-Paket. */
function findFfmpeg() {
  const inPath = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (inPath.status === 0) return "ffmpeg";
  const candidates = [
    join(repo, "node_modules", "@ffmpeg-installer", "linux-x64", "ffmpeg"),
    join(repo, "node_modules", "@ffmpeg-installer", "ffmpeg", "index.js")
  ];
  for (const path of candidates) {
    if (path.endsWith(".js")) continue;
    if (existsSync(path)) return path;
  }
  const env = process.env.FFMPEG_PATH;
  if (env && existsSync(env)) return env;
  console.error(
    "Kein ffmpeg mit libx264 gefunden.\n" +
    "Entweder ffmpeg installieren, oder einmalig:\n" +
    "  npm install --no-save @ffmpeg-installer/ffmpeg\n" +
    "oder den Pfad in FFMPEG_PATH setzen."
  );
  process.exit(1);
}

/** Die Aufnahmen der echten App - bei Bedarf frisch machen. */
function ensureCaptures(force) {
  const manifest = join(AD_DIR, "captures", "manifest.json");
  if (!force && existsSync(manifest)) return;
  console.log(force ? "Aufnahmen werden erneuert ..." : "Keine Aufnahmen gefunden - die App wird zuerst aufgenommen ...");
  const run = spawnSync(process.execPath, [join(AD_DIR, "capture.mjs")], { stdio: "inherit" });
  if (run.status !== 0 || !existsSync(manifest)) {
    console.error("Aufnahme fehlgeschlagen.");
    process.exit(1);
  }
}

function serve() {
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
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function render(browser, ffmpeg, name) {
  const format = FORMATS[name];
  const target = join(OUT_DIR, format.file);
  const page = await browser.newPage({
    viewport: { width: format.width, height: format.height },
    deviceScaleFactor: 1
  });
  page.on("pageerror", (error) => {
    console.error("Fehler in der Seite:", String(error));
    process.exitCode = 1;
  });

  await page.goto(`${base}/tools/rsl-ad/ad.html`, { waitUntil: "networkidle" });
  // Erst wenn alle Aufnahmen geladen sind, stimmt jedes Bild.
  await page.evaluate(() => window.adReady);
  await page.evaluate((f) => window.setFormat(f), name);
  const duration = await page.evaluate(() => window.adDuration);
  const frames = Math.round(duration * FPS);

  // x264 mit yuv420p und faststart: laeuft auf Handys, in Browsern und bei YouTube.
  const encoder = spawn(ffmpeg, [
    "-y",
    "-f", "image2pipe", "-c:v", "png", "-framerate", String(FPS), "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "19",
    "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.1",
    "-movflags", "+faststart",
    "-r", String(FPS),
    target
  ], { stdio: ["pipe", "ignore", "pipe"] });

  let ffmpegLog = "";
  encoder.stderr.on("data", (chunk) => { ffmpegLog += chunk.toString(); });
  const done = new Promise((resolve, reject) => {
    encoder.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg endete mit ${code}:\n${ffmpegLog.slice(-1500)}`))));
    encoder.on("error", reject);
  });

  process.stdout.write(`${name} (${format.width}x${format.height}, ${frames} Bilder): `);
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.setTime(t), i / FPS);
    const shot = await page.screenshot({ type: "png" });
    if (!encoder.stdin.write(shot)) {
      await new Promise((resolve) => encoder.stdin.once("drain", resolve));
    }
    if (i % 60 === 0) process.stdout.write(".");
  }
  encoder.stdin.end();
  await done;
  await page.close();

  const size = statSync(target).size;
  console.log(` fertig: ${format.file}, ${(size / 1048576).toFixed(1)} MB`);
  return target;
}

const wanted = process.argv.slice(2).filter((a) => FORMATS[a]);
const names = wanted.length ? wanted : Object.keys(FORMATS);

mkdirSync(OUT_DIR, { recursive: true });
const ffmpeg = findFfmpeg();
ensureCaptures(process.argv.includes("--capture"));
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();

try {
  for (const name of names) await render(browser, ffmpeg, name);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
