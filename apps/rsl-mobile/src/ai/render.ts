/**
 * ani0.0.1 — Renderer.
 *
 * Zeichnet eine Szene als Folge von Einzelbildern. Alles Zufällige wird einmal
 * beim Anlegen aus dem Seed berechnet und liegt danach fest; die Bewegung hängt
 * ausschließlich an der Zeit in Sekunden. Damit ist jedes Bild reproduzierbar.
 */

import { rng, shade, withAlpha, type Scene } from "./scene";
import { drawCharacter } from "./character";

type Star = { x: number; y: number; r: number; ph: number; sp: number };
type Cloud = { x: number; y: number; s: number; sp: number; parts: [number, number, number][] };
type Building = { x: number; w: number; h: number; win: number[] };
type Tree = { x: number; h: number; w: number; layer: number };
type Particle = { x: number; y: number; s: number; sp: number; ph: number; rot: number };
type Ray = { a: number; w: number; ph: number };

export type Renderer = {
  readonly width: number;
  readonly height: number;
  readonly scene: Scene;
  draw(ctx: CanvasRenderingContext2D, t: number, duration: number): void;
};

const TAU = Math.PI * 2;
/** Alle Ebenen setzen auf derselben Linie auf - sonst klafft ein Streifen Himmel. */
const HORIZON = 0.72;

export function createRenderer(scene: Scene, width: number, height: number): Renderer {
  const rand = rng(scene.seed ^ 0x9e3779b9);
  const P = scene.palette;

  /* ------------------------- einmalig ausgewürfelt ------------------------ */

  const stars: Star[] = [];
  const starCount = scene.place === "weltraum" ? 220 : scene.time === "nacht" || scene.weather === "sterne" ? 150 : 0;
  for (let i = 0; i < starCount; i++) {
    stars.push({
      x: rand(),
      y: rand() * 0.72,
      r: 0.4 + rand() * 1.6,
      ph: rand() * TAU,
      sp: 0.6 + rand() * 2.2,
    });
  }

  const clouds: Cloud[] = [];
  if (scene.place !== "weltraum" && scene.weather !== "nebel") {
    const n = scene.weather === "regen" ? 7 : 4;
    for (let i = 0; i < n; i++) {
      const parts: [number, number, number][] = [];
      const pn = 4 + Math.floor(rand() * 3);
      for (let k = 0; k < pn; k++) parts.push([(k - pn / 2) * 0.5 + rand() * 0.3, (rand() - 0.5) * 0.35, 0.5 + rand() * 0.6]);
      clouds.push({ x: rand(), y: 0.06 + rand() * 0.26, s: 0.5 + rand() * 0.9, sp: 0.004 + rand() * 0.008, parts });
    }
  }

  const skyline: Building[] = [];
  if (scene.place === "stadt" || scene.place === "dach" || scene.place === "schule") {
    for (let i = 0; i < 26; i++) {
      const win: number[] = [];
      for (let k = 0; k < 40; k++) win.push(rand());
      skyline.push({ x: rand(), w: 0.03 + rand() * 0.07, h: 0.1 + rand() * 0.3, win });
    }
    skyline.sort((a, b) => a.h - b.h);
  }

  const trees: Tree[] = [];
  if (scene.place === "wald") {
    for (let i = 0; i < 46; i++) {
      trees.push({ x: rand(), h: 0.16 + rand() * 0.3, w: 0.03 + rand() * 0.05, layer: rand() < 0.5 ? 0 : 1 });
    }
  }

  const peaks: number[] = [];
  if (scene.place === "berge") for (let i = 0; i < 7; i++) peaks.push(rand());

  const particles: Particle[] = [];
  const pCount =
    scene.weather === "sakura" ? 70 : scene.weather === "regen" ? 220 : scene.weather === "schnee" ? 130 : 34;
  for (let i = 0; i < pCount; i++) {
    particles.push({
      x: rand(),
      y: rand(),
      s: 0.4 + rand() * 0.9,
      sp: 0.5 + rand() * 1.1,
      ph: rand() * TAU,
      rot: rand() * TAU,
    });
  }

  const rays: Ray[] = [];
  if (scene.mood === "episch" || scene.mood === "dramatisch") {
    for (let i = 0; i < 26; i++) rays.push({ a: rand() * TAU, w: 0.01 + rand() * 0.05, ph: rand() * TAU });
  }

  const blinkPhase = rand() * 4;
  const swayPhase = rand() * TAU;
  const charX = 0.5 + (rand() - 0.5) * 0.16;

  // Kornmuster einmal vorrendern - pro Bild nur noch verschieben.
  const grain = document.createElement("canvas");
  grain.width = grain.height = 128;
  {
    const g = grain.getContext("2d");
    if (g) {
      const img = g.createImageData(128, 128);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 128 + (rand() - 0.5) * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }
  }

  /* -------------------------------- Kamera -------------------------------- */

  const easeInOut = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

  function camera(t: number, dur: number): { z: number; x: number; y: number } {
    const p = dur > 0 ? Math.min(1, t / dur) : 0;
    switch (scene.camera) {
      case "zoom":
        return { z: 1.0 + 0.2 * easeInOut(p), x: 0, y: -0.02 * easeInOut(p) };
      case "raus":
        return { z: 1.24 - 0.22 * easeInOut(p), x: 0, y: 0 };
      case "pan":
        return { z: 1.08, x: (0.5 - easeInOut(p)) * 0.16, y: 0 };
      case "shake": {
        const n = (a: number, b: number): number => Math.sin(t * a + b) * Math.sin(t * b * 1.7 + a);
        return { z: 1.06, x: n(21, 3) * 0.006, y: n(17, 5) * 0.006 };
      }
      default:
        // Auch "ruhig" atmet leicht - ein völlig starres Bild wirkt tot.
        return { z: 1.015 + 0.015 * Math.sin(t * 0.55), x: Math.sin(t * 0.31) * 0.004, y: Math.cos(t * 0.24) * 0.003 };
    }
  }

  /* ------------------------------- Ebenen --------------------------------- */

  function sunPos(W: number, H: number): { x: number; y: number; r: number } {
    switch (scene.time) {
      case "morgen":
        return { x: W * 0.22, y: H * 0.52, r: H * 0.075 };
      case "tag":
        return { x: W * 0.78, y: H * 0.16, r: H * 0.055 };
      case "abend":
        return { x: W * 0.72, y: H * 0.56, r: H * 0.095 };
      default:
        return { x: W * 0.76, y: H * 0.2, r: H * 0.058 };
    }
  }

  function drawSky(ctx: CanvasRenderingContext2D, W: number, H: number, t: number): void {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, P.skyTop);
    g.addColorStop(scene.time === "abend" ? 0.62 : 0.78, shade(P.skyBottom, -0.04));
    g.addColorStop(1, P.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    for (const s of stars) {
      const a = 0.35 + 0.65 * Math.abs(Math.sin(t * s.sp + s.ph));
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, TAU);
      ctx.fill();
    }

    const sun = sunPos(W, H);
    const glow = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, sun.r * 7);
    glow.addColorStop(0, withAlpha(P.sunGlow, 0.55));
    glow.addColorStop(0.35, withAlpha(P.sunGlow, 0.16));
    glow.addColorStop(1, withAlpha(P.sunGlow, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(sun.x - sun.r * 7, sun.y - sun.r * 7, sun.r * 14, sun.r * 14);

    ctx.fillStyle = P.sun;
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, sun.r, 0, TAU);
    if (scene.time === "nacht") {
      // Zweiter, versetzter Kreis im selben Pfad: mit evenodd bleibt eine Sichel
      // stehen, ohne dass etwas aus dem Himmel gestanzt wird.
      ctx.arc(sun.x + sun.r * 0.42, sun.y - sun.r * 0.24, sun.r * 0.92, 0, TAU);
      ctx.fill("evenodd");
    } else {
      ctx.fill();
    }
  }

  function drawClouds(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, off: number): void {
    for (const c of clouds) {
      const x = (((c.x + t * c.sp) % 1.3) - 0.15) * W + off * 0.3;
      const y = c.y * H;
      const s = c.s * H * 0.06;
      ctx.fillStyle = withAlpha(shade(P.skyBottom, scene.time === "nacht" ? -0.25 : 0.35), scene.weather === "regen" ? 0.75 : 0.4);
      for (const [dx, dy, r] of c.parts) {
        ctx.beginPath();
        ctx.arc(x + dx * s * 2, y + dy * s, r * s, 0, TAU);
        ctx.fill();
      }
    }
  }

  function drawFar(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, off: number): void {
    const horizon = H * HORIZON;

    if (scene.place === "weltraum") {
      for (let i = 0; i < 3; i++) {
        const cx = W * (0.2 + i * 0.32) + off * 0.2;
        const cy = H * (0.3 + i * 0.12);
        const r = H * (0.3 + i * 0.1);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, withAlpha(["#7a4bff", "#2ee6d6", "#ff5f9e"][i]!, 0.22));
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      const px = W * 0.74 + off * 0.35;
      const py = H * 0.62;
      const pr = H * 0.26;
      const pg = ctx.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
      pg.addColorStop(0, "#5b7ad6");
      pg.addColorStop(1, "#141a3a");
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, TAU);
      ctx.fill();
      return;
    }

    if (scene.place === "berge") {
      peaks.forEach((p, i) => {
        const x = (p * 1.3 - 0.15) * W + off * 0.25;
        const h = H * (0.18 + ((i * 7) % 5) * 0.045);
        ctx.fillStyle = i % 2 ? P.far : shade(P.far, -0.08);
        ctx.beginPath();
        ctx.moveTo(x - h * 1.5, horizon);
        ctx.lineTo(x, horizon - h);
        ctx.lineTo(x + h * 1.5, horizon);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = withAlpha(P.light, 0.75);
        ctx.beginPath();
        ctx.moveTo(x - h * 0.3, horizon - h * 0.8);
        ctx.lineTo(x, horizon - h);
        ctx.lineTo(x + h * 0.3, horizon - h * 0.8);
        ctx.closePath();
        ctx.fill();
      });
      return;
    }

    if (skyline.length) {
      const lit = scene.time === "nacht" || scene.time === "abend";
      for (const b of skyline) {
        const x = (b.x * 1.2 - 0.1) * W + off * 0.25;
        const w = b.w * W;
        const h = b.h * H;
        ctx.fillStyle = P.far;
        ctx.fillRect(x, horizon - h, w, h);
        if (lit) {
          const cols = Math.max(1, Math.floor(w / (W * 0.012)));
          const rows = Math.max(1, Math.floor(h / (H * 0.03)));
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const v = b.win[(r * cols + c) % b.win.length]!;
              if (v < 0.45) continue;
              // Ein paar Fenster flackern langsam.
              const flick = v > 0.93 ? 0.5 + 0.5 * Math.sin(t * 2 + v * 40) : 1;
              ctx.fillStyle = `rgba(255,226,150,${(0.5 * flick).toFixed(3)})`;
              ctx.fillRect(x + c * (w / cols) + w / cols * 0.25, horizon - h + r * (h / rows) + h / rows * 0.25, (w / cols) * 0.45, (h / rows) * 0.4);
            }
          }
        }
      }
      return;
    }

    if (trees.length) {
      for (const tr of trees.filter((x) => x.layer === 0)) {
        drawTree(ctx, (tr.x * 1.2 - 0.1) * W + off * 0.25, horizon, tr.h * H, tr.w * W, P.far);
      }
    }
  }

  function drawTree(ctx: CanvasRenderingContext2D, x: number, base: number, h: number, w: number, color: string): void {
    ctx.fillStyle = color;
    ctx.fillRect(x - w * 0.08, base - h * 0.25, w * 0.16, h * 0.25);
    for (let i = 0; i < 3; i++) {
      const y = base - h * (0.2 + i * 0.26);
      const ww = w * (1 - i * 0.22);
      ctx.beginPath();
      ctx.moveTo(x - ww, y);
      ctx.lineTo(x, y - h * 0.36);
      ctx.lineTo(x + ww, y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawMid(ctx: CanvasRenderingContext2D, W: number, H: number, off: number): void {
    const horizon = H * HORIZON;
    if (scene.place === "weltraum") return;

    if (trees.length) {
      for (const tr of trees.filter((x) => x.layer === 1)) {
        drawTree(ctx, (tr.x * 1.3 - 0.15) * W + off * 0.55, horizon, tr.h * H * 1.5, tr.w * W * 1.4, P.mid);
      }
      return;
    }

    if (scene.place === "schule") {
      // Ein Schulgebäude als kräftige Silhouette mit Fensterraster.
      const x = W * 0.08 + off * 0.55;
      const w = W * 0.84;
      const h = H * 0.34;
      ctx.fillStyle = P.mid;
      ctx.fillRect(x, horizon - h, w, h);
      ctx.fillStyle = shade(P.mid, -0.1);
      ctx.fillRect(x - w * 0.02, horizon - h - H * 0.02, w * 1.04, H * 0.02);
      ctx.fillStyle = withAlpha(P.light, scene.time === "nacht" ? 0.5 : 0.22);
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 12; c++) {
          ctx.fillRect(x + w * 0.05 + (c * w * 0.9) / 12, horizon - h + H * 0.05 + r * h * 0.3, (w * 0.9) / 12 - w * 0.02, h * 0.16);
        }
      }
      return;
    }

    if (skyline.length) {
      for (let i = 0; i < 10; i++) {
        const b = skyline[i]!;
        const x = (b.x * 1.4 - 0.2) * W + off * 0.55;
        ctx.fillStyle = P.mid;
        ctx.fillRect(x, horizon - b.h * H * 1.3, b.w * W * 1.3, b.h * H * 1.3);
      }
    }
  }

  function drawGround(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, off: number): void {
    if (scene.place === "weltraum") return;
    const horizon = H * HORIZON;

    const g = ctx.createLinearGradient(0, horizon, 0, H);
    g.addColorStop(0, shade(P.ground, 0.08));
    g.addColorStop(1, shade(P.ground, -0.28));
    ctx.fillStyle = g;
    ctx.fillRect(0, horizon, W, H - horizon);

    if (scene.place === "strand") {
      // Wellenkämme, die zum Betrachter hin größer werden.
      for (let i = 0; i < 9; i++) {
        const p = i / 9;
        const y = horizon + (H - horizon) * p * p;
        const a = 0.1 + p * 0.28;
        ctx.strokeStyle = withAlpha(P.light, a);
        ctx.lineWidth = Math.max(1, H * 0.004 * (0.4 + p));
        ctx.beginPath();
        for (let x = 0; x <= W; x += W / 40) {
          const yy = y + Math.sin(x * 0.02 + t * (1 + p * 2) + i) * H * 0.006 * (0.4 + p);
          if (x === 0) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      const sun = sunPos(W, H);
      const path = ctx.createLinearGradient(0, horizon, 0, H);
      path.addColorStop(0, withAlpha(P.sunGlow, 0.35));
      path.addColorStop(1, withAlpha(P.sunGlow, 0));
      ctx.fillStyle = path;
      ctx.beginPath();
      ctx.moveTo(sun.x - W * 0.03, horizon);
      ctx.lineTo(sun.x + W * 0.03, horizon);
      ctx.lineTo(sun.x + W * 0.16, H);
      ctx.lineTo(sun.x - W * 0.16, H);
      ctx.closePath();
      ctx.fill();
      return;
    }

    if (scene.place === "dach" || scene.place === "schule") {
      // Bodenfliesen in Fluchtperspektive.
      ctx.strokeStyle = withAlpha(P.shadow, 0.35);
      ctx.lineWidth = Math.max(1, H * 0.002);
      for (let i = -8; i <= 8; i++) {
        ctx.beginPath();
        ctx.moveTo(W * 0.5 + i * W * 0.02 + off * 0.8, horizon);
        ctx.lineTo(W * 0.5 + i * W * 0.28 + off * 0.9, H);
        ctx.stroke();
      }
      for (let i = 1; i < 7; i++) {
        const y = horizon + (H - horizon) * (i / 7) ** 1.8;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
    }

    const hg = ctx.createLinearGradient(0, horizon - H * 0.05, 0, horizon + H * 0.05);
    hg.addColorStop(0, withAlpha(P.sunGlow, 0));
    hg.addColorStop(0.5, withAlpha(P.sunGlow, 0.28));
    hg.addColorStop(1, withAlpha(P.sunGlow, 0));
    ctx.fillStyle = hg;
    ctx.fillRect(0, horizon - H * 0.05, W, H * 0.1);
  }

  /* ------------------------------- Partikel -------------------------------- */

  function drawParticles(ctx: CanvasRenderingContext2D, W: number, H: number, t: number): void {
    const w = scene.weather;

    if (w === "regen") {
      ctx.strokeStyle = "rgba(200,220,255,0.5)";
      ctx.lineWidth = Math.max(1, H * 0.0022);
      for (const p of particles) {
        const y = ((p.y + t * (1.4 + p.sp)) % 1.15) * H - H * 0.1;
        const x = ((p.x + y / H * 0.06) % 1) * W;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - W * 0.008, y + H * 0.05 * p.s);
        ctx.stroke();
      }
      return;
    }

    if (w === "schnee") {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      for (const p of particles) {
        const y = ((p.y + t * 0.06 * p.sp) % 1.1) * H - H * 0.05;
        const x = ((p.x + Math.sin(t * 0.5 + p.ph) * 0.02) % 1) * W;
        ctx.beginPath();
        ctx.arc(x, y, H * 0.004 * p.s, 0, TAU);
        ctx.fill();
      }
      return;
    }

    if (w === "sakura") {
      for (const p of particles) {
        const y = ((p.y + t * 0.07 * p.sp) % 1.1) * H - H * 0.05;
        const x = ((p.x + Math.sin(t * 0.7 + p.ph) * 0.035) % 1) * W;
        const s = H * 0.009 * p.s;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.rot + t * p.sp);
        ctx.fillStyle = `rgba(255,${170 + Math.floor(p.s * 40)},205,0.9)`;
        ctx.beginPath();
        ctx.ellipse(0, 0, s, s * 0.6, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      return;
    }

    if (w === "nebel") {
      for (let i = 0; i < 5; i++) {
        const y = H * (0.5 + i * 0.1);
        const g = ctx.createLinearGradient(0, y - H * 0.08, 0, y + H * 0.08);
        g.addColorStop(0, "rgba(255,255,255,0)");
        g.addColorStop(0.5, `rgba(230,238,255,${0.09 + i * 0.02})`);
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.save();
        ctx.translate(Math.sin(t * 0.15 + i) * W * 0.05, 0);
        ctx.fillRect(-W * 0.1, y - H * 0.08, W * 1.2, H * 0.16);
        ctx.restore();
      }
      return;
    }

    // Ruhige Szenen bekommen feine Lichtpunkte, damit das Bild lebt.
    for (const p of particles) {
      const y = ((p.y - t * 0.02 * p.sp + 1) % 1) * H;
      const x = ((p.x + Math.sin(t * 0.3 + p.ph) * 0.01) % 1) * W;
      ctx.fillStyle = withAlpha(P.light, 0.1 + 0.25 * Math.abs(Math.sin(t * p.sp + p.ph)));
      ctx.beginPath();
      ctx.arc(x, y, H * 0.0035 * p.s, 0, TAU);
      ctx.fill();
    }
  }

  /* -------------------------------- Effekte -------------------------------- */

  function drawFx(ctx: CanvasRenderingContext2D, W: number, H: number, t: number): void {
    if (rays.length) {
      const src = sunPos(W, H);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.translate(src.x, src.y);
      for (const ray of rays) {
        const a = ray.a + t * 0.12;
        const len = Math.hypot(W, H) * 2;
        const pulse = 0.02 + 0.035 * Math.abs(Math.sin(t * 1.6 + ray.ph));
        ctx.fillStyle = withAlpha(P.sunGlow, pulse);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a - ray.w) * len, Math.sin(a - ray.w) * len);
        ctx.lineTo(Math.cos(a + ray.w) * len, Math.sin(a + ray.w) * len);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    if (scene.time === "morgen" || scene.time === "abend") {
      const sun = sunPos(W, H);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < 7; i++) {
        const a = -1.3 + i * 0.16 + Math.sin(t * 0.2 + i) * 0.02;
        ctx.fillStyle = withAlpha(P.sunGlow, 0.05);
        ctx.beginPath();
        ctx.moveTo(sun.x, sun.y);
        ctx.lineTo(sun.x + Math.cos(a) * H * 2, sun.y + Math.sin(a) * H * 2);
        ctx.lineTo(sun.x + Math.cos(a + 0.05) * H * 2, sun.y + Math.sin(a + 0.05) * H * 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawFilm(ctx: CanvasRenderingContext2D, W: number, H: number, t: number): void {
    const v = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.35, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = 0.035;
    ctx.globalCompositeOperation = "overlay";
    const off = (Math.floor(t * 24) % 8) * 16;
    const pat = ctx.createPattern(grain, "repeat");
    if (pat) {
      ctx.translate(-off, off);
      ctx.fillStyle = pat;
      ctx.fillRect(0, -off, W + off * 2, H + off * 2);
    }
    ctx.restore();

    if (scene.mood === "episch" || scene.mood === "dramatisch") {
      const bar = H * 0.055;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, bar);
      ctx.fillRect(0, H - bar, W, bar);
    }
  }

  /* --------------------------------- Bild ---------------------------------- */

  function draw(ctx: CanvasRenderingContext2D, t: number, duration: number): void {
    const W = width;
    const H = height;
    const cam = camera(t, duration);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W * 0.5 + cam.x * W, H * 0.5 + cam.y * H);
    ctx.scale(cam.z, cam.z);
    ctx.translate(-W * 0.5, -H * 0.5);

    const off = cam.x * W;
    drawSky(ctx, W, H, t);
    drawClouds(ctx, W, H, t, off);
    drawFar(ctx, W, H, t, off);
    drawMid(ctx, W, H, off);
    drawGround(ctx, W, H, t, off);
    drawCharacter(ctx, W, H, t, scene, P, { blinkPhase, swayPhase, charX });
    drawParticles(ctx, W, H, t);
    drawFx(ctx, W, H, t);

    ctx.restore();
    drawFilm(ctx, W, H, t);
  }

  return { width, height, scene, draw };
}
