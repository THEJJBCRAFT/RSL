// Erzeugt die PNG-Icons fuer Find Mein Soon (Web-App und Android-App) ohne externe Abhaengigkeiten.
// Aufruf: node tools/make-find-mein-soon-icons.js
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.join(__dirname, "..");
const webIconDir = path.join(root, "apps", "find-mein-soon", "icons");
const androidResDir = path.join(root, "android", "find-mein-soon", "app", "src", "main", "res");

// Android-Dichten: Basisgroesse fuer Launcher-Icons ist 48dp, fuer Adaptive-Icon-Ebenen 108dp.
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

main();

function main() {
  fs.mkdirSync(webIconDir, { recursive: true });
  writePng(path.join(webIconDir, "icon-192.png"), render(192, "app"));
  writePng(path.join(webIconDir, "icon-512.png"), render(512, "app"));
  writePng(path.join(webIconDir, "icon-maskable-512.png"), render(512, "maskable"));
  console.log(`Web-Icons geschrieben nach ${webIconDir}`);

  Object.entries(densities).forEach(([name, factor]) => {
    const dir = path.join(androidResDir, `mipmap-${name}`);
    fs.mkdirSync(dir, { recursive: true });
    writePng(path.join(dir, "ic_launcher.png"), render(Math.round(48 * factor), "app"));
    writePng(path.join(dir, "ic_launcher_round.png"), render(Math.round(48 * factor), "round"));
    writePng(path.join(dir, "ic_launcher_foreground.png"), render(Math.round(108 * factor), "foreground"));
  });
  console.log(`Android-Icons geschrieben nach ${androidResDir}`);
}

// mode: "app" (abgerundetes Quadrat), "maskable" (volle Flaeche, Inhalt kleiner),
// "round" (Kreis), "foreground" (transparente Adaptive-Icon-Ebene, Inhalt im sicheren Bereich).
function render(size, mode) {
  const pixels = Buffer.alloc(size * size * 4);
  const samples = 3;
  const options = {
    cornerRadius: mode === "app" ? 0.22 : 0,
    circle: mode === "round",
    scale: mode === "maskable" ? 0.78 : mode === "foreground" ? 0.6 : 1,
    transparentBackground: mode === "foreground"
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = (x + (sx + 0.5) / samples) / size;
          const py = (y + (sy + 0.5) / samples) / size;
          const color = shade(px, py, options);
          r += color[0] * color[3];
          g += color[1] * color[3];
          b += color[2] * color[3];
          a += color[3];
        }
      }
      const count = samples * samples;
      const offset = (y * size + x) * 4;
      if (a > 0) {
        pixels[offset] = Math.round(r / a);
        pixels[offset + 1] = Math.round(g / a);
        pixels[offset + 2] = Math.round(b / a);
      }
      pixels[offset + 3] = Math.round((a / count) * 255);
    }
  }
  return { size, pixels };
}

// Liefert [r, g, b, alpha] fuer eine Position in 0..1 Koordinaten.
function shade(px, py, options) {
  let coverage = 1;
  if (options.circle) coverage = circleCoverage(px, py);
  else if (options.cornerRadius > 0) coverage = roundedRectCoverage(px, py, options.cornerRadius);
  if (coverage <= 0) return [0, 0, 0, 0];

  // Hintergrund: dunkler Verlauf von Navy nach Schwarz (oder transparent fuer die Adaptive-Icon-Ebene).
  const t = Math.min(1, Math.max(0, px * 0.4 + py * 0.9));
  const background = mix([16, 26, 44], [5, 7, 11], t);
  let layer = options.transparentBackground ? [0, 0, 0, 0] : [background[0], background[1], background[2], 1];

  const dx = (px - 0.5) / options.scale;
  const dy = (py - 0.5) / options.scale;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Radar-Ringe in Aqua.
  for (const ring of [0.44, 0.34, 0.24]) {
    const edge = Math.abs(dist - ring);
    if (edge < 0.012) {
      const strength = (1 - edge / 0.012) * (0.55 - (0.44 - ring) * 0.6);
      layer = over(layer, [79, 244, 207], strength);
    }
  }

  // Radar-Kegel (leichter Schimmer oben rechts).
  const angle = Math.atan2(dy, dx);
  if (dist < 0.44 && angle > -1.35 && angle < -0.35) {
    const strength = (1 - dist / 0.44) * 0.22 * (1 - Math.abs(angle + 0.85) / 0.5);
    layer = over(layer, [79, 244, 207], Math.max(0, strength));
  }

  // Pin: Kreis oben + Spitze unten.
  const pinCy = -0.06;
  const pinR = 0.17;
  const pdx = dx;
  const pdy = dy - pinCy;
  const inCircle = Math.sqrt(pdx * pdx + pdy * pdy) <= pinR;
  const tipY = pinCy + 0.34;
  let inTip = false;
  if (dy > pinCy && dy <= tipY) {
    const progress = (dy - pinCy) / (tipY - pinCy);
    inTip = Math.abs(pdx) <= pinR * (1 - progress);
  }
  if (inCircle || inTip) {
    const shadeAmount = Math.min(1, Math.max(0, (pdy + pinR) / (2 * pinR)));
    let pin = mix([255, 92, 110], [139, 7, 20], shadeAmount * 0.9);
    // Weisser Kern.
    const coreR = pinR * 0.42;
    const core = Math.sqrt(pdx * pdx + pdy * pdy);
    if (core <= coreR) {
      const soft = core > coreR - 0.01 ? (coreR - core) / 0.01 : 1;
      pin = mix(pin, [255, 255, 255], Math.max(0, Math.min(1, soft)));
    }
    layer = over(layer, pin, 1);
  }

  // Weisser Rand um den Pin fuer Kontrast.
  const outline = pinOutline(pdx, pdy, pinR, pinCy, tipY, dy);
  if (outline > 0) layer = over(layer, [255, 255, 255], outline);

  return [layer[0], layer[1], layer[2], layer[3] * coverage];
}

function pinOutline(pdx, pdy, pinR, pinCy, tipY, dy) {
  const width = 0.016;
  const circleDist = Math.sqrt(pdx * pdx + pdy * pdy);
  const progress = Math.min(1, Math.max(0, (dy - pinCy) / (tipY - pinCy)));
  const halfWidth = pinR * (1 - progress);
  const insideTip = dy > pinCy && dy <= tipY && Math.abs(pdx) <= halfWidth;
  const insideCircle = circleDist <= pinR;

  let d = Infinity;
  // Kreiskontur nur dort, wo sie nicht im Inneren der Spitze liegt.
  if (!(insideTip && Math.abs(pdx) < halfWidth - width)) d = Math.abs(circleDist - pinR);
  // Spitzenkontur nur ausserhalb des Kreises.
  if (dy > pinCy && dy <= tipY + width && !(insideCircle && circleDist < pinR - width)) {
    d = Math.min(d, Math.abs(Math.abs(pdx) - halfWidth) * 0.9);
  }
  if (d > width) return 0;
  return (1 - d / width) * 0.9;
}

function roundedRectCoverage(px, py, r) {
  const x = Math.min(px, 1 - px);
  const y = Math.min(py, 1 - py);
  if (x >= r || y >= r) return 1;
  const dx = r - x;
  const dy = r - y;
  return Math.sqrt(dx * dx + dy * dy) <= r ? 1 : 0;
}

function circleCoverage(px, py) {
  const dx = px - 0.5;
  const dy = py - 0.5;
  return Math.sqrt(dx * dx + dy * dy) <= 0.5 ? 1 : 0;
}

function mix(a, b, t) {
  const k = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

// "Source over"-Compositing mit nicht-vormultipliziertem Alpha.
function over(dst, rgb, srcAlpha) {
  const sa = Math.min(1, Math.max(0, srcAlpha));
  if (sa <= 0) return dst;
  const da = dst[3];
  const outA = sa + da * (1 - sa);
  if (outA <= 0) return [0, 0, 0, 0];
  const blend = index => (rgb[index] * sa + dst[index] * da * (1 - sa)) / outA;
  return [blend(0), blend(1), blend(2), outA];
}

function writePng(file, image) {
  const { size, pixels } = image;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
  fs.writeFileSync(file, png);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

var crcTable = null;

function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) crc = crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
