/**
 * ani0.0.2 — Kino-Renderer.
 *
 * Nimmt ein Storyboard und rendert es als Film: harte Schnitte zwischen den
 * Einstellungen, jede Einstellung mit eigener Choreografie, Untertitel für
 * Dialogzeilen, Letterbox-Balken, Kamerawackeln bei Treffern.
 */

import { buildScene, rng, shade, withAlpha, type Scene } from "./scene";
import type { Renderer } from "./render";
import { drawCharacter } from "./character";
import {
  ascendedDesign,
  designFor,
  drawActor,
  drawBeam,
  drawImpact,
  drawProjectile,
  drawShield,
  drawSigil,
  drawSlash,
  drawSpeedlines,
  mixPose,
  poses,
} from "./actors";
import type { Shot, Storyboard } from "./script";

const TAU = Math.PI * 2;

export function createCinemaRenderer(board: Storyboard, prompt: string, width: number, height: number): Renderer {
  // Grundstimmung aus dem Gesamttext: Palette, Ort, Zeit.
  const scene = buildScene(`${prompt} episch dramatisch`, board.seed);
  const P = scene.palette;
  const rand = rng(board.seed ^ 0x51ed270b);

  const held = designFor("held");
  const freund = designFor("freund");
  const gegner = designFor("gegner");
  const ascended = ascendedDesign();

  /* --------------------- Kulisse: Schlachtfeld-Ruinen --------------------- */

  const ruins: { x: number; w: number; h: number; broken: number }[] = [];
  for (let i = 0; i < 14; i++) {
    ruins.push({ x: rand(), w: 0.04 + rand() * 0.08, h: 0.08 + rand() * 0.22, broken: rand() });
  }
  const cracks: { x: number; a: number; l: number }[] = [];
  for (let i = 0; i < 9; i++) {
    cracks.push({ x: 0.1 + rand() * 0.8, a: (rand() - 0.5) * 0.9, l: 0.05 + rand() * 0.1 });
  }
  const embers: { x: number; y: number; s: number; ph: number }[] = [];
  for (let i = 0; i < 40; i++) {
    embers.push({ x: rand(), y: rand(), s: 0.4 + rand() * 0.8, ph: rand() * TAU });
  }

  const GROUND = 0.78;

  /* --------- Anime-Timing: Posen auf 2ern/3ern, Rest laeuft fluessig -------- */

  /** Posen-Uhr auf 12 fps (animation on twos). */
  const Q12 = (t: number): number => Math.floor(t * 12) / 12;
  /** Ruhige Posen auf 8 fps (threes). */
  const Q8 = (t: number): number => Math.floor(t * 8) / 8;

  /* ------------------------ Speedline-Hintergrund ------------------------- */

  function drawSpeedBG(ctx: CanvasRenderingContext2D, W: number, H: number, t: number): void {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#131a36");
    g.addColorStop(1, "#1d2547");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Streifen alle 2 Ticks neu wuerfeln -> "boiling" wie von Hand gezeichnet.
    const tick = Math.floor(t * 12) >> 1;
    const r = rng((board.seed ^ (tick * 2654435761)) >>> 0);
    for (let i = 0; i < 46; i++) {
      const y = r() * H;
      const len = W * (0.18 + r() * 0.55);
      const x = r() * (W + len) - len;
      ctx.strokeStyle = `rgba(225,235,255,${(0.12 + r() * 0.4).toFixed(3)})`;
      ctx.lineWidth = 0.8 + r() * 2.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y + (r() - 0.5) * H * 0.02);
      ctx.stroke();
    }
  }

  /* ----------------- Impact-Frames: Invertierung + Zacken ------------------ */

  function impactFrames(ctx: CanvasRenderingContext2D, W: number, H: number, x: number, y: number, t: number, p: number): void {
    // p: 0..1 innerhalb des Treffer-Fensters. Erste Haelfte: harte Frames.
    if (p < 0.42) {
      const frame = Math.floor(t * 24) % 2;
      if (frame === 0) {
        // Vollbild invertieren - der klassische Impact-Frame.
        ctx.save();
        ctx.globalCompositeOperation = "difference";
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      } else {
        ctx.fillStyle = `rgba(255,255,255,${(0.9 * (1 - p / 0.42)).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
      }
    }
    // Radiale Zackenlinien vom Trefferpunkt, mit Jitter.
    if (p < 0.8) {
      const tick = Math.floor(t * 24);
      const r = rng((board.seed ^ (tick * 40503)) >>> 0);
      ctx.save();
      ctx.strokeStyle = `rgba(255,255,255,${(0.85 * (1 - p)).toFixed(3)})`;
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU + r() * 0.3;
        const r0 = H * (0.1 + r() * 0.1 + p * 0.25);
        const r1 = r0 + H * (0.06 + r() * 0.22) * (1 - p);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
        ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /* ------------------- Truemmer (kantig, wie im Anime) --------------------- */

  const shards: { a: number; sp: number; rot: number; rsp: number; size: number; tone: number }[] = [];
  for (let i = 0; i < 22; i++) {
    shards.push({
      a: Math.PI + rand() * Math.PI, // nach oben/seitlich
      sp: 0.35 + rand() * 0.85,
      rot: rand() * TAU,
      rsp: (rand() - 0.5) * 12,
      size: 0.012 + rand() * 0.02,
      tone: rand(),
    });
  }

  function drawShards(ctx: CanvasRenderingContext2D, W: number, H: number, ox: number, oy: number, life: number): void {
    if (life <= 0 || life > 1) return;
    for (const sh of shards) {
      const vx = Math.cos(sh.a) * sh.sp * W * 0.5;
      const vy = Math.sin(sh.a) * sh.sp * H * 0.9;
      const x = ox + vx * life;
      const y = oy + vy * life + H * 1.1 * life * life; // Schwerkraft
      if (y > H) continue;
      const s = sh.size * H * (1 - life * 0.4);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(sh.rot + sh.rsp * life);
      const tone = Math.floor(120 + sh.tone * 80);
      ctx.fillStyle = `rgb(${tone},${tone - 15},${tone - 25})`;
      ctx.strokeStyle = "rgba(20,16,30,0.8)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-s, -s * 0.6);
      ctx.lineTo(s * 0.8, -s);
      ctx.lineTo(s, s * 0.7);
      ctx.lineTo(-s * 0.7, s * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ------------- Photography-Pass (Bloom, Para, Grading) ------------------- */

  const bloom = document.createElement("canvas");
  bloom.width = Math.max(2, Math.ceil(width / 4));
  bloom.height = Math.max(2, Math.ceil(height / 4));
  const bloomCtx = bloom.getContext("2d");

  function photography(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    // Diffusion/Bloom: Viertel-Aufloesung, geblurt, per screen zurueck.
    if (bloomCtx) {
      bloomCtx.drawImage(ctx.canvas, 0, 0, bloom.width, bloom.height);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.26;
      ctx.filter = "blur(5px)";
      ctx.drawImage(bloom, 0, 0, W, H);
      ctx.filter = "none";
      ctx.restore();
    }
    // "Para": diagonaler Licht-Gradient von der Lichtseite.
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    const para = ctx.createLinearGradient(W, 0, 0, H);
    para.addColorStop(0, "rgba(255,226,180,0.55)");
    para.addColorStop(0.5, "rgba(255,226,180,0)");
    para.addColorStop(1, "rgba(28,20,58,0.5)");
    ctx.fillStyle = para;
    ctx.fillRect(0, 0, W, H);
    // Farb-Grading nach Tageszeit.
    const tint =
      scene.time === "nacht" ? "rgba(45,95,150,0.6)" : scene.time === "abend" ? "rgba(255,140,60,0.5)" : "rgba(255,220,170,0.35)";
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawBackdrop(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, heat = 0): void {
    const gy = H * GROUND;

    const sky = ctx.createLinearGradient(0, 0, 0, gy);
    sky.addColorStop(0, heat > 0 ? mixColor(P.skyTop, "#7a1f0e", heat) : P.skyTop);
    sky.addColorStop(1, heat > 0 ? mixColor(P.skyBottom, "#ff7a30", heat) : P.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, gy);

    // Ruinen-Silhouetten.
    for (const r of ruins) {
      const x = r.x * W;
      const w = r.w * W;
      const h = r.h * H;
      ctx.fillStyle = mixColor(shade(P.far, -0.05), P.skyBottom, 0.35);
      ctx.beginPath();
      ctx.moveTo(x, gy);
      ctx.lineTo(x, gy - h);
      ctx.lineTo(x + w * r.broken, gy - h - w * 0.4 * (r.broken - 0.5));
      ctx.lineTo(x + w, gy - h * (0.55 + r.broken * 0.4));
      ctx.lineTo(x + w, gy);
      ctx.closePath();
      ctx.fill();
    }

    // Boden.
    const g = ctx.createLinearGradient(0, gy, 0, H);
    g.addColorStop(0, heat > 0 ? mixColor(shade(P.ground, 0.05), "#8a2a10", heat) : shade(P.ground, 0.05));
    g.addColorStop(1, heat > 0 ? mixColor(shade(P.ground, -0.3), "#3a0d05", heat) : shade(P.ground, -0.3));
    ctx.fillStyle = g;
    ctx.fillRect(0, gy, W, H - gy);

    // Risse im Boden; bei Hitze glühen sie.
    ctx.strokeStyle = heat > 0 ? withAlpha("#ffb14a", 0.4 + heat * 0.5) : withAlpha(P.shadow, 0.5);
    ctx.lineWidth = Math.max(1, H * 0.0035);
    for (const c of cracks) {
      const x = c.x * W;
      const y = gy + (H - gy) * 0.3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.sin(c.a) * c.l * W, y + c.l * H);
      ctx.lineTo(x + Math.sin(c.a) * c.l * W * 1.6, y + c.l * H * 2);
      ctx.stroke();
    }

    // Funken/Asche steigen auf.
    for (const e of embers) {
      const y = ((e.y - t * 0.05 * e.s + 1) % 1) * gy;
      const x = ((e.x + Math.sin(t * 0.6 + e.ph) * 0.012) % 1) * W;
      ctx.fillStyle = withAlpha(heat > 0.3 ? "#ffb14a" : P.light, 0.14 + 0.3 * Math.abs(Math.sin(t * e.s + e.ph)));
      ctx.beginPath();
      ctx.arc(x, y, H * 0.003 * e.s, 0, TAU);
      ctx.fill();
    }
  }

  function mixColor(a: string, b: string, p: number): string {
    // beide sind #rrggbb
    const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
    const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
    const c = pa.map((v, i) => Math.round(v + (pb[i]! - v) * Math.min(1, p)));
    return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }

  /* ------------------------------ Untertitel ------------------------------ */

  function drawSubtitle(ctx: CanvasRenderingContext2D, W: number, H: number, text: string, color: string, p: number): void {
    const a = Math.min(1, p * 6) * Math.min(1, (1 - p) * 8);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    const size = Math.max(13, H * 0.045);
    ctx.font = `600 ${size}px "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    const y = H * 0.88;
    ctx.lineWidth = size * 0.22;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText(text, W / 2, y, W * 0.9);
    ctx.fillStyle = color;
    ctx.fillText(text, W / 2, y, W * 0.9);
    ctx.restore();
  }

  /* --------------------------- Nahaufnahme-Gesicht ------------------------- */

  function closeupScene(role: "held" | "freund" | "gegner", overrides: Partial<Scene["character"]>): Scene {
    const base = { ...scene, character: { ...scene.character } };
    if (role === "held") {
      base.character.hairColor = "#3a4166";
      base.character.eyeColor = "#39ff8c";
      base.character.outfit = "hoodie";
      base.character.outfitColor = "#27324e";
    } else if (role === "gegner") {
      base.character.hairColor = "#3a1020";
      base.character.eyeColor = "#ff4a4a";
      base.character.outfit = "ruestung";
      base.character.outfitColor = "#421a26";
    } else {
      base.character.hairColor = "#7a5a3c";
      base.character.eyeColor = "#5ab0ff";
      base.character.outfitColor = "#365a7a";
    }
    base.character.hairStyle = "kurz";
    base.character.catEars = false;
    base.character.present = true;
    Object.assign(base.character, overrides);
    return base;
  }

  const charOpts = { blinkPhase: rand() * 4, swayPhase: rand() * TAU, charX: 0.5 };

  /* ------------------------------ Einstellungen ---------------------------- */

  type ShotCtx = {
    ctx: CanvasRenderingContext2D;
    W: number;
    H: number;
    t: number; //  Zeit innerhalb der Einstellung
    dur: number;
    p: number; //  t/dur
    shot: Shot;
  };

  function shotEstablish(s: ShotCtx): void {
    drawBackdrop(s.ctx, s.W, s.H, s.t);
    const gy = s.H * GROUND;
    const h = s.H * 0.4;
    drawActor(s.ctx, { design: held, x: s.W * 0.24, y: gy, h, face: 1, pose: poses.idle(Q8(s.t)), aura: 0.25 });
    drawActor(s.ctx, { design: freund, x: s.W * 0.42, y: gy, h: h * 0.96, face: 1, pose: poses.idle(Q8(s.t) + 1) });
    drawActor(s.ctx, {
      design: gegner,
      x: s.W * 0.78,
      y: gy,
      h: h * 1.06,
      face: -1,
      pose: poses.idle(Q8(s.t) + 2),
      aura: 0.3,
      sword: "front",
    });
  }

  function shotImpale(s: ShotCtx): void {
    drawBackdrop(s.ctx, s.W, s.H, s.t);
    const gy = s.H * GROUND;
    const h = s.H * 0.42;
    const strike = 0.32; //  Zeitpunkt des Stoßes (Anteil)
    const p = s.p;
    // Posen-Uhr auf 12 fps; im Hit-Stop-Fenster friert die Pose kurz ein.
    let pp = Math.min(1, Q12(s.t) / s.dur);
    if (p >= strike && p < strike + 0.05) pp = strike; // Hit-Stop

    // Gegner stößt zu.
    const enemyPose = pp < strike ? poses.stab((pp / strike) * 0.55) : poses.stab(0.9);
    drawActor(s.ctx, { design: gegner, x: s.W * 0.66, y: gy, h: h * 1.06, face: -1, pose: enemyPose, sword: "front", aura: 0.35 });

    // Freund: erst stehen, dann durchbohrt, dann zusammensacken.
    let friendPose;
    if (pp < strike) friendPose = poses.idle(Q8(s.t));
    else if (pp < 0.62) friendPose = poses.impaled((pp - strike) / 0.3);
    else friendPose = mixPose(poses.impaled(1), poses.collapse((pp - 0.62) / 0.38), Math.min(1, (pp - 0.62) / 0.38));
    drawActor(s.ctx, { design: freund, x: s.W * 0.46, y: gy, h: h * 0.96, face: -1, pose: friendPose });

    // Held im Vordergrund, angeschnitten, erstarrt.
    drawActor(s.ctx, { design: held, x: s.W * 0.12, y: gy + h * 0.35, h: h * 1.35, face: 1, pose: poses.idle(Q8(s.t) * 0.2) });

    // Einschlagmoment: weißer Blitz + Wirkungslinien.
    const dt = p - strike;
    if (dt >= 0 && dt < 0.12) {
      s.ctx.fillStyle = `rgba(255,255,255,${(1 - dt / 0.12) * 0.85})`;
      s.ctx.fillRect(0, 0, s.W, s.H);
    }
    if (dt >= 0 && dt < 0.3) drawImpact(s.ctx, s.W * 0.48, gy - h * 0.55, s.H * 0.2, dt / 0.3, "#ffffff");
    if (dt >= 0 && dt < 0.22) impactFrames(s.ctx, s.W, s.H, s.W * 0.48, gy - h * 0.55, s.t, dt / 0.22);
  }

  function shotShock(s: ShotCtx): void {
    // Stille: kaum Bewegung, entsättigter Hintergrund, zitternde Nahaufnahme.
    const g = s.ctx.createLinearGradient(0, 0, 0, s.H);
    g.addColorStop(0, shade(P.skyTop, -0.25));
    g.addColorStop(1, shade(P.skyBottom, -0.35));
    s.ctx.fillStyle = g;
    s.ctx.fillRect(0, 0, s.W, s.H);

    const tremor = Math.sin(s.t * 34) * s.H * 0.0016;
    s.ctx.save();
    s.ctx.translate(tremor, -tremor * 0.6);
    const face = closeupScene("held", { smile: -0.7 });
    drawCharacter(s.ctx, s.W, s.H * 1.35, s.t * 0.12, face, P, { ...charOpts, blinkPhase: 99 });
    s.ctx.restore();

    // Vignette enger ziehen.
    const v = s.ctx.createRadialGradient(s.W / 2, s.H * 0.42, s.H * 0.2, s.W / 2, s.H * 0.42, s.H * 0.85);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.7)");
    s.ctx.fillStyle = v;
    s.ctx.fillRect(0, 0, s.W, s.H);
  }

  function shotDialog(s: ShotCtx): void {
    const role = s.shot.speaker ?? "held";
    const g = s.ctx.createLinearGradient(0, 0, 0, s.H);
    g.addColorStop(0, shade(P.skyTop, role === "gegner" ? -0.3 : -0.1));
    g.addColorStop(1, shade(P.skyBottom, -0.2));
    s.ctx.fillStyle = g;
    s.ctx.fillRect(0, 0, s.W, s.H);

    const face = closeupScene(role, { smile: role === "gegner" ? -1 : -0.3 });
    drawCharacter(s.ctx, s.W, s.H * 1.3, s.t * 0.4, face, P, charOpts);

    // Mouth Flaps: zu / halb / offen im 3er-Takt, wie im TV-Anime.
    if (s.shot.text && s.p > 0.06 && s.p < 0.9) {
      const H13 = s.H * 1.3;
      const r = H13 * 0.152;
      const mx = s.W * 0.5;
      const my = H13 * 0.4 + r * 0.92;
      const phase = Math.floor(s.t * 7) % 3;
      if (phase > 0) {
        s.ctx.fillStyle = face.character.skin;
        s.ctx.beginPath();
        s.ctx.ellipse(mx, my, r * 0.2, r * 0.14, 0, 0, TAU);
        s.ctx.fill();
        s.ctx.fillStyle = "#5a2d33";
        s.ctx.strokeStyle = "#2a2233";
        s.ctx.lineWidth = Math.max(1, r * 0.025);
        s.ctx.beginPath();
        s.ctx.ellipse(mx, my + r * 0.02, r * 0.11, phase === 1 ? r * 0.045 : r * 0.09, 0, 0, TAU);
        s.ctx.fill();
        s.ctx.stroke();
        if (phase === 2) {
          s.ctx.fillStyle = "#f2f2f2";
          s.ctx.fillRect(mx - r * 0.09, my - r * 0.055, r * 0.18, r * 0.035);
        }
      }
    }

    if (s.shot.text) {
      const color = role === "gegner" ? "#ff9a9a" : role === "freund" ? "#a8d4ff" : "#b8ffd0";
      drawSubtitle(s.ctx, s.W, s.H, `„${s.shot.text}“`, color, s.p);
    }
  }

  function shotFight(s: ShotCtx): void {
    const gy = s.H * GROUND;
    const h = s.H * 0.42;

    // Posen-Uhr auf 12 fps; Kamera und Effekte laufen fluessig weiter.
    const bt = Q12(s.t);
    const beatDur = 4.4;
    const beat = (bt % beatDur) / beatDur;
    const beatIdx = Math.floor(bt / beatDur);
    const smoothBeat = (s.t % beatDur) / beatDur;

    // Waehrend der Schlagphasen ersetzen Speedlines den Hintergrund komplett.
    const speedPhase = beat < 0.45 || beat >= 0.74;
    if (speedPhase) drawSpeedBG(s.ctx, s.W, s.H, s.t);
    else drawBackdrop(s.ctx, s.W, s.H, s.t);

    // Dutch Angle: pro Beat fest gekippt, nicht animiert.
    const dutch = [(-0.06), 0.08, -0.05, 0.07][beatIdx % 4]!;
    s.ctx.save();
    s.ctx.translate(s.W / 2, s.H / 2);
    s.ctx.rotate(dutch);
    s.ctx.scale(1.06, 1.06);
    s.ctx.translate(-s.W / 2, -s.H / 2);

    const heroX = s.W * 0.34;
    const enemyX = s.W * 0.68;

    let heroPose;
    let enemyPose;
    let heroXNow = heroX;
    const hits: { x: number; y: number; p: number }[] = [];
    let ghostPoses: { pose: ReturnType<typeof poses.punch>; x: number; alpha: number }[] = [];

    if (beat < 0.22) {
      // Dash + Fauststoss. Anticipation lang, Aktion kurz, Endpose halten.
      const p = beat / 0.22;
      heroXNow = heroX + (enemyX - s.W * 0.1 - heroX) * p * p * 0.55;
      if (p < 0.55) {
        heroPose = poses.run(bt);
        // Nachbilder beim Dash.
        ghostPoses = [
          { pose: poses.run(bt - 0.09), x: heroXNow - s.W * 0.05, alpha: 0.16 },
          { pose: poses.run(bt - 0.045), x: heroXNow - s.W * 0.025, alpha: 0.3 },
        ];
      } else {
        // Hit-Stop: Pose friert am Kontakt kurz ein.
        const hp = p > 0.72 && p < 0.8 ? 0.72 : p;
        heroPose = poses.punch((hp - 0.55) / 0.45);
        // Multiples: der Arm mehrfach entlang des Bogens.
        if (p > 0.6 && p < 0.78) {
          ghostPoses = [
            { pose: poses.punch(Math.max(0, (hp - 0.62) / 0.45)), x: heroXNow, alpha: 0.35 },
            { pose: poses.punch(Math.max(0, (hp - 0.68) / 0.45)), x: heroXNow, alpha: 0.18 },
          ];
        }
      }
      enemyPose = p > 0.7 ? poses.stagger((p - 0.7) / 0.3) : poses.guard(bt);
      if (smoothBeat / 0.22 > 0.72 && smoothBeat / 0.22 < 1) {
        hits.push({ x: enemyX - s.W * 0.05, y: gy - h * 0.62, p: (smoothBeat / 0.22 - 0.72) / 0.28 });
      }
    } else if (beat < 0.45) {
      const p = (beat - 0.22) / 0.23;
      heroXNow = enemyX - s.W * 0.14;
      const hp = p > 0.44 && p < 0.52 ? 0.44 : p; // Hit-Stop
      heroPose = poses.highKick(hp);
      // Smear: Bein als Multiples auf dem Bogen.
      if (p > 0.3 && p < 0.5) {
        ghostPoses = [
          { pose: poses.highKick(Math.max(0, hp - 0.1)), x: heroXNow, alpha: 0.3 },
          { pose: poses.highKick(Math.max(0, hp - 0.2)), x: heroXNow, alpha: 0.15 },
        ];
      }
      enemyPose = p > 0.44 ? poses.stagger((p - 0.44) / 0.56) : poses.guard(bt);
      const sp = (smoothBeat - 0.22) / 0.23;
      if (sp > 0.44 && sp < 0.85) hits.push({ x: enemyX - s.W * 0.04, y: gy - h * 0.78, p: (sp - 0.44) / 0.41 });
    } else if (beat < 0.74) {
      const p = (beat - 0.45) / 0.29;
      heroXNow = s.W * 0.4;
      enemyPose = poses.cast(p);
      heroPose = poses.guard(bt);
      const px = enemyX - (enemyX - heroXNow - s.W * 0.06) * Math.min(1, ((smoothBeat - 0.45) / 0.29) * 1.6);
      if (p < 0.62) drawProjectile(s.ctx, px, gy - h * 0.55, -1, s.H * 0.022, gegner.accent);
      drawShield(s.ctx, heroXNow + s.W * 0.07, gy - h * 0.5, s.H * 0.13, Math.max(0, ((smoothBeat - 0.45) / 0.29) - 0.35), held.accent);
    } else {
      const p = (beat - 0.74) / 0.26;
      heroXNow = enemyX - s.W * 0.15;
      const hp = p > 0.5 && p < 0.58 ? 0.5 : p;
      heroPose = poses.lowKick(hp);
      enemyPose = p > 0.5 ? poses.stagger((p - 0.5) / 0.5) : poses.guard(bt);
      const sp = (smoothBeat - 0.74) / 0.26;
      if (sp > 0.5 && sp < 0.85) hits.push({ x: enemyX - s.W * 0.05, y: gy - h * 0.2, p: (sp - 0.5) / 0.35 });
    }

    drawActor(s.ctx, { design: gegner, x: enemyX, y: gy, h: h * 1.06, face: -1, pose: enemyPose ?? poses.guard(bt), aura: 0.35, sword: null });
    for (const g of ghostPoses) {
      drawActor(s.ctx, { design: held, x: g.x, y: gy, h, face: 1, pose: g.pose, alpha: g.alpha });
    }
    drawActor(s.ctx, { design: held, x: heroXNow, y: gy, h, face: 1, pose: heroPose ?? poses.idle(bt), aura: 0.8, angry: true });

    // Gruene Schlagspur.
    if (beat < 0.22 && beat / 0.22 > 0.55) drawSlash(s.ctx, heroXNow + s.W * 0.05, gy - h * 0.6, h * 0.42, -1.2, (beat / 0.22 - 0.55) / 0.45, held.accent);
    if (beat >= 0.22 && beat < 0.45) drawSlash(s.ctx, heroXNow + s.W * 0.03, gy - h * 0.7, h * 0.5, 2.4, (beat - 0.22) / 0.23, held.accent);

    for (const hit of hits) drawImpact(s.ctx, hit.x, hit.y, s.H * 0.14, hit.p, "#ffffff");

    s.ctx.restore();

    // Impact-Frames NACH dem Zuruecksetzen der Kamera - Vollbild.
    for (const hit of hits) {
      if (hit.p < 0.5) impactFrames(s.ctx, s.W, s.H, hit.x, hit.y, s.t, hit.p * 2);
    }
    drawSpeedlines(s.ctx, s.W, s.H, speedPhase ? 0.35 : 0.7, s.t);
  }

  function shotBeamhit(s: ShotCtx): void {
    drawBackdrop(s.ctx, s.W, s.H, s.t);
    const gy = s.H * GROUND;
    const h = s.H * 0.42;
    const p = s.p;
    const pp = Math.min(1, Q12(s.t) / s.dur);

    const enemyX = s.W * 0.82;
    drawActor(s.ctx, { design: gegner, x: enemyX, y: gy, h: h * 1.05, face: -1, pose: poses.cast(Math.min(1, pp * 3)), aura: 0.7 });

    if (p > 0.18) {
      const bp = (p - 0.18) / 0.4;
      drawBeam(s.ctx, enemyX - s.W * 0.05, gy - h * 0.62, s.W * 0.22, gy - h * 0.35, s.H * 0.05, Math.min(1, bp), gegner.accent);
    }

    let heroPose;
    let heroY = gy;
    let heroX = s.W * 0.3;
    if (pp < 0.3) heroPose = poses.guard(Q8(s.t));
    else if (pp < 0.5) {
      const k = (pp - 0.3) / 0.2;
      heroPose = poses.stagger(0.8);
      heroX = s.W * (0.3 - k * 0.09);
      heroY = gy + k * s.H * 0.03;
    } else {
      heroPose = poses.lying();
      heroX = s.W * 0.21;
      heroY = gy + s.H * 0.03;
    }
    drawActor(s.ctx, { design: held, x: heroX, y: heroY, h, face: 1, pose: heroPose, aura: p < 0.5 ? 0.4 : 0.05 });

    // Kantige Truemmer fliegen beim Einschlag.
    if (p > 0.42) drawShards(s.ctx, s.W, s.H, s.W * 0.24, gy - h * 0.1, (p - 0.42) / 0.5);

    if (p > 0.42 && p < 0.72) drawImpact(s.ctx, s.W * 0.24, gy - h * 0.1, s.H * 0.24, (p - 0.42) / 0.3, gegner.accent);
    if (p > 0.42 && p < 0.58) impactFrames(s.ctx, s.W, s.H, s.W * 0.24, gy - h * 0.1, s.t, (p - 0.42) / 0.16);
  }

  function shotFloatglow(s: ShotCtx): void {
    const p = s.p;
    drawBackdrop(s.ctx, s.W, s.H, s.t);
    const gy = s.H * GROUND;
    const h = s.H * 0.42;

    // Vom Liegen zum Schweben.
    const pp = Math.min(1, Q12(s.t) / s.dur);
    const rise = easeIn(Math.max(0, (p - 0.25) / 0.75));
    const y = gy + s.H * 0.03 - rise * s.H * 0.3;
    const pose = pp < 0.25 ? poses.lying() : mixPose(poses.lying(), poses.float(Q8(s.t)), Math.min(1, (pp - 0.25) / 0.4));
    drawActor(s.ctx, { design: held, x: s.W * 0.42, y, h, face: 1, pose, glowWhite: Math.min(1, p * 1.4), aura: 0.3 });

    // Das Leuchten erfasst die Umgebung.
    if (p > 0.5) {
      s.ctx.fillStyle = `rgba(255,255,255,${((p - 0.5) / 0.5) * 0.55})`;
      s.ctx.fillRect(0, 0, s.W, s.H);
    }
  }

  function shotTransform(s: ShotCtx): void {
    const p = s.p;
    // Fast weiße Bühne, Figur schwebt mittig und wechselt das Design.
    s.ctx.fillStyle = mixColor("#dfe6ff", "#ffffff", p);
    s.ctx.fillRect(0, 0, s.W, s.H);

    const morph = Math.min(1, Math.max(0, (p - 0.15) / 0.55));
    const design = morph < 0.5 ? held : ascended;
    const h = s.H * 0.46;
    const y = s.H * 0.72 + Math.sin(s.t * 1.2) * s.H * 0.012;

    // Lichtstrahlen hinter der Figur.
    s.ctx.save();
    s.ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU + s.t * 0.25;
      s.ctx.fillStyle = withAlpha("#fff6c8", 0.1 + 0.06 * Math.sin(s.t * 2 + i));
      s.ctx.beginPath();
      s.ctx.moveTo(s.W * 0.5, s.H * 0.45);
      s.ctx.lineTo(s.W * 0.5 + Math.cos(a - 0.04) * s.W, s.H * 0.45 + Math.sin(a - 0.04) * s.W);
      s.ctx.lineTo(s.W * 0.5 + Math.cos(a + 0.04) * s.W, s.H * 0.45 + Math.sin(a + 0.04) * s.W);
      s.ctx.closePath();
      s.ctx.fill();
    }
    s.ctx.restore();

    drawActor(s.ctx, {
      design,
      x: s.W * 0.5,
      y,
      h,
      face: 1,
      pose: poses.float(Q8(s.t)),
      glowWhite: 0.5 + Math.sin(s.t * 3) * 0.1,
      crown: morph > 0.65,
      goldTrim: morph > 0.5,
      sword: p > 0.8 ? "both" : null,
      aura: 0.2,
    });

    // Beim Design-Wechsel ein Blitz, damit der Schnitt nicht auffällt.
    const flash = Math.abs(morph - 0.5) < 0.06 ? 1 - Math.abs(morph - 0.5) / 0.06 : 0;
    if (flash > 0) {
      s.ctx.fillStyle = `rgba(255,255,255,${flash * 0.9})`;
      s.ctx.fillRect(0, 0, s.W, s.H);
    }

    // Schwerter fliegen aus Licht in die Hände.
    if (p > 0.7 && p < 0.85) {
      const k = (p - 0.7) / 0.15;
      for (const side of [-1, 1]) {
        const sx = s.W * (0.5 + side * (0.42 - 0.28 * k));
        const sy = s.H * (0.35 + 0.22 * k);
        s.ctx.fillStyle = withAlpha("#ffffff", 0.9 - k * 0.4);
        s.ctx.beginPath();
        s.ctx.ellipse(sx, sy, s.H * 0.05 * (1 - k * 0.5), s.H * 0.012, side * 0.6, 0, TAU);
        s.ctx.fill();
      }
    }
  }

  function shotEyesopen(s: ShotCtx): void {
    s.ctx.fillStyle = "#0a0d18";
    s.ctx.fillRect(0, 0, s.W, s.H);
    const p = s.p;

    // Extreme Nahaufnahme: nur die Augenpartie.
    const open = Math.min(1, Math.max(0.04, (p - 0.25) / 0.35));
    const eyeW = s.W * 0.16;
    const eyeH = s.H * 0.14 * open;
    const y = s.H * 0.48;

    for (const side of [-1, 1]) {
      const x = s.W * 0.5 + side * s.W * 0.19;
      // Glühen
      const g = s.ctx.createRadialGradient(x, y, 0, x, y, eyeW * 1.4);
      g.addColorStop(0, withAlpha("#39ff8c", 0.5 * open));
      g.addColorStop(1, "rgba(0,0,0,0)");
      s.ctx.fillStyle = g;
      s.ctx.fillRect(x - eyeW * 1.5, y - eyeW * 1.5, eyeW * 3, eyeW * 3);

      s.ctx.fillStyle = "#f5efe8";
      s.ctx.beginPath();
      s.ctx.ellipse(x, y, eyeW, eyeH, 0, 0, TAU);
      s.ctx.fill();
      const ig = s.ctx.createRadialGradient(x, y, 0, x, y, eyeW * 0.55);
      ig.addColorStop(0, "#b8ffd6");
      ig.addColorStop(0.6, "#39ff8c");
      ig.addColorStop(1, "#0d7a44");
      s.ctx.fillStyle = ig;
      s.ctx.beginPath();
      s.ctx.ellipse(x, y, eyeW * 0.52, eyeH * 0.9, 0, 0, TAU);
      s.ctx.fill();
      s.ctx.fillStyle = "#06251a";
      s.ctx.beginPath();
      s.ctx.ellipse(x, y, eyeW * 0.2, eyeH * 0.5, 0, 0, TAU);
      s.ctx.fill();
      // Lider
      s.ctx.strokeStyle = "#1a1626";
      s.ctx.lineWidth = s.H * 0.02;
      s.ctx.beginPath();
      s.ctx.moveTo(x - eyeW * 1.1, y - eyeH * 0.7);
      s.ctx.quadraticCurveTo(x, y - eyeH * 1.7, x + eyeW * 1.1, y - eyeH * 0.8);
      s.ctx.stroke();
    }
  }

  function shotSigil(s: ShotCtx): void {
    drawBackdrop(s.ctx, s.W, s.H, s.t, 0.15);
    const gy = s.H * GROUND;
    const h = s.H * 0.44;
    const p = s.p;

    drawActor(s.ctx, {
      design: ascended,
      x: s.W * 0.32,
      y: gy,
      h,
      face: 1,
      pose: poses.raiseSwords(Math.min(1, (Q12(s.t) / s.dur) * 2)),
      sword: "both",
      crown: true,
      goldTrim: true,
      aura: 0.6,
      glowWhite: 0.2,
    });

    drawSigil(s.ctx, s.W * 0.62, s.H * 0.42, s.H * 0.2, Math.min(1, p * 1.25), "#39ff8c");

    if (s.shot.text) {
      drawSubtitle(s.ctx, s.W, s.H, `„${s.shot.text}“`, "#b8ffd0", p);
    }
  }

  function shotFinale(s: ShotCtx): void {
    const p = s.p;
    const heat = Math.min(1, p * 1.6);
    drawBackdrop(s.ctx, s.W, s.H, s.t, heat);
    const gy = s.H * GROUND;
    const h = s.H * 0.42;

    drawActor(s.ctx, {
      design: ascended,
      x: s.W * 0.28,
      y: gy,
      h,
      face: 1,
      pose: poses.raiseSwords(1),
      sword: "both",
      crown: true,
      goldTrim: true,
      aura: 0.7,
      glowWhite: 0.3 + p * 0.4,
    });

    // Gegner löst sich im Licht auf.
    const dissolve = Math.max(0, (p - 0.35) / 0.5);
    drawActor(s.ctx, {
      design: gegner,
      x: s.W * 0.72,
      y: gy,
      h: h * 1.05,
      face: -1,
      pose: poses.stagger(Math.min(1, (Q12(s.t) / s.dur) * 2) * 0.8),
      alpha: Math.max(0, 1 - dissolve),
      aura: 0.2,
    });
    if (dissolve > 0 && dissolve < 1) {
      // Auflösungs-Partikel steigen von der Silhouette auf.
      for (let i = 0; i < 24; i++) {
        const px = s.W * 0.72 + Math.sin(i * 2.7) * s.W * 0.05;
        const py = gy - ((i * 53) % 100) / 100 * h - dissolve * s.H * 0.2;
        s.ctx.fillStyle = withAlpha("#ffffff", (1 - dissolve) * 0.8);
        s.ctx.beginPath();
        s.ctx.arc(px, py, s.H * 0.006, 0, TAU);
        s.ctx.fill();
      }
    }

    // Alles geht in Weiß auf.
    const white = Math.max(0, (p - 0.55) / 0.45);
    if (white > 0) {
      s.ctx.fillStyle = `rgba(255,255,255,${easeIn(white)})`;
      s.ctx.fillRect(0, 0, s.W, s.H);
    }
  }

  const easeIn = (p: number): number => p * p;

  const SHOT_FN: Record<Shot["kind"], (s: ShotCtx) => void> = {
    establish: shotEstablish,
    impale: shotImpale,
    shock: shotShock,
    dialog: shotDialog,
    fight: shotFight,
    beamhit: shotBeamhit,
    floatglow: shotFloatglow,
    transform: shotTransform,
    eyesopen: shotEyesopen,
    sigil: shotSigil,
    finale: shotFinale,
  };

  /** Kamerawackeln je Einstellung. */
  function shakeFor(kind: Shot["kind"], p: number): number {
    switch (kind) {
      case "fight":
        return 0.004;
      case "beamhit":
        return p > 0.4 && p < 0.7 ? 0.012 : 0.003;
      case "finale":
        return 0.006 + p * 0.006;
      case "impale":
        return p > 0.3 && p < 0.45 ? 0.008 : 0;
      default:
        return 0;
    }
  }

  /* --------------------------------- Bild ---------------------------------- */

  function draw(ctx: CanvasRenderingContext2D, t: number, _duration: number): void {
    const W = width;
    const H = height;

    // Aktuelle Einstellung finden.
    let idx = board.shots.length - 1;
    for (let i = 0; i < board.shots.length; i++) {
      if (t < board.starts[i]! + board.shots[i]!.dur) {
        idx = i;
        break;
      }
    }
    const shot = board.shots[idx]!;
    const local = Math.min(shot.dur, Math.max(0, t - board.starts[idx]!));
    const p = shot.dur > 0 ? local / shot.dur : 0;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    const mag = shakeFor(shot.kind, p) * H;
    const sx = mag ? Math.sin(local * 47) * Math.sin(local * 13 + 2) * mag : 0;
    const sy = mag ? Math.sin(local * 39 + 1) * Math.sin(local * 17) * mag : 0;

    ctx.save();
    ctx.translate(sx, sy);
    SHOT_FN[shot.kind]({ ctx, W, H, t: local, dur: shot.dur, p, shot });
    ctx.restore();

    // Photography-Pass: Bloom, Licht-Gradient, Grading - wie die
    // Satsuei-Stufe einer echten Produktion.
    photography(ctx, W, H);

    // Harte Schnitte weich abfedern: 4 Frames aus Schwarz.
    if (local < 0.14 && idx > 0) {
      ctx.fillStyle = `rgba(0,0,0,${1 - local / 0.14})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Letterbox immer, das ist der Kino-Look.
    const bar = H * 0.06;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, bar);
    ctx.fillRect(0, H - bar, W, bar);

    // Vignette.
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.4)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  return { width, height, scene, draw };
}
