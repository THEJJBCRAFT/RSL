/**
 * ani0.0.1 — Figur.
 *
 * Brustbild in Anime-Proportionen: großer Kopf, kurzer Hals, Schultern knapp
 * unter dem Kinn. Zwischen Pony und Augen bleibt Stirn frei, damit die Brauen
 * sichtbar sind und der Blick nicht grimmig wirkt.
 */

import { shade, withAlpha, type Palette, type Scene } from "./scene";

const TAU = Math.PI * 2;
const INK = "#2a2233";

export type CharacterOpts = {
  blinkPhase: number;
  swayPhase: number;
  charX: number;
};

function blink(t: number, phase: number): number {
  const cycle = 3.6;
  const p = (t + phase) % cycle;
  if (p > 0.13) return 1;
  return Math.max(0.06, Math.abs(Math.cos((p / 0.13) * Math.PI)));
}

export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  t: number,
  scene: Scene,
  P: Palette,
  opts: CharacterOpts,
): void {
  const c = scene.character;
  if (!c.present) return;

  const r = H * 0.152;
  const breathe = Math.sin(t * 1.5) * r * 0.018;
  const bob = Math.sin(t * 0.8 + 0.4) * r * 0.022;
  const sway = Math.sin(t * 1.1 + opts.swayPhase) * 0.055;

  const cx = W * opts.charX;
  const cy = H * 0.4 + bob;
  const chinY = cy + r * 1.22;
  const shoulderY = cy + r * 1.78 + breathe;

  const hairDark = shade(c.hairColor, -0.3);
  const hairLight = shade(c.hairColor, 0.32);

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = INK;
  const line = Math.max(1.4, r * 0.032);

  /* ------------------------- hinteres Haar & Zöpfe ------------------------ */

  ctx.fillStyle = hairDark;
  ctx.beginPath();
  const backBottom =
    c.hairStyle === "lang" ? cy + r * 3.0 : c.hairStyle === "kurz" ? cy + r * 1.35 : cy + r * 2.0;
  ctx.moveTo(cx - r * 1.16, cy - r * 0.1);
  ctx.quadraticCurveTo(cx - r * (1.34 + sway), backBottom - r * 0.5, cx - r * 0.78, backBottom);
  ctx.lineTo(cx + r * 0.78, backBottom);
  ctx.quadraticCurveTo(cx + r * (1.34 + sway), backBottom - r * 0.5, cx + r * 1.16, cy - r * 0.1);
  ctx.quadraticCurveTo(cx, cy - r * 1.5, cx - r * 1.16, cy - r * 0.1);
  ctx.closePath();
  ctx.fill();

  if (c.hairStyle === "twintails") {
    for (const s of [-1, 1]) {
      const bx = cx + s * r * 1.02;
      const by = cy - r * 0.5;
      ctx.fillStyle = c.hairColor;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      // Weit nach außen, dann in langem Bogen nach unten - sonst wirkt es wie ein Ohr.
      ctx.quadraticCurveTo(bx + s * r * (1.5 + sway * s * 3), by + r * 0.5, bx + s * r * (1.32 + sway * s * 2), by + r * 2.6);
      ctx.quadraticCurveTo(bx + s * r * 0.95, by + r * 1.9, bx + s * r * 0.5, by + r * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = line;
      ctx.stroke();
      // Haltebänder
      ctx.fillStyle = "#e2495c";
      ctx.beginPath();
      ctx.ellipse(bx + s * r * 0.42, by + r * 0.35, r * 0.17, r * 0.11, s * 0.4, 0, TAU);
      ctx.fill();
    }
  }

  if (c.hairStyle === "pferdeschwanz") {
    const s = opts.charX < 0.5 ? 1 : -1;
    const bx = cx + s * r * 0.95;
    ctx.fillStyle = c.hairColor;
    ctx.beginPath();
    ctx.moveTo(bx, cy - r * 0.62);
    ctx.quadraticCurveTo(bx + s * r * (1.7 + sway * s * 3), cy + r * 0.35, bx + s * r * (1.15 + sway * s * 2), cy + r * 2.5);
    ctx.quadraticCurveTo(bx + s * r * 0.55, cy + r * 1.1, bx - s * r * 0.05, cy - r * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = line;
    ctx.stroke();
  }

  /* -------------------------------- Körper -------------------------------- */

  ctx.fillStyle = c.outfitColor;
  ctx.beginPath();
  ctx.moveTo(cx - r * 1.62, H);
  ctx.lineTo(cx - r * 1.42, shoulderY + r * 0.25);
  ctx.quadraticCurveTo(cx - r * 1.24, shoulderY - r * 0.18, cx - r * 0.44, shoulderY - r * 0.34);
  ctx.lineTo(cx + r * 0.44, shoulderY - r * 0.34);
  ctx.quadraticCurveTo(cx + r * 1.24, shoulderY - r * 0.18, cx + r * 1.42, shoulderY + r * 0.25);
  ctx.lineTo(cx + r * 1.62, H);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = line;
  ctx.stroke();

  drawOutfit(ctx, cx, r, shoulderY, H, c, line);

  /* --------------------------------- Hals --------------------------------- */

  ctx.fillStyle = shade(c.skin, -0.06);
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.3, chinY - r * 0.14);
  ctx.lineTo(cx - r * 0.34, shoulderY - r * 0.2);
  ctx.lineTo(cx + r * 0.34, shoulderY - r * 0.2);
  ctx.lineTo(cx + r * 0.3, chinY - r * 0.14);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = line;
  ctx.stroke();

  /* --------------------------------- Kopf --------------------------------- */

  ctx.fillStyle = c.skin;
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.arc(cx, cy, r, Math.PI, 0);
  ctx.lineTo(cx + r, cy + r * 0.28);
  ctx.quadraticCurveTo(cx + r * 0.88, cy + r * 0.98, cx, chinY);
  ctx.quadraticCurveTo(cx - r * 0.88, cy + r * 0.98, cx - r, cy + r * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = line;
  ctx.stroke();

  // Schatten unter dem Kinn auf dem Hals.
  ctx.fillStyle = "rgba(120,80,90,0.18)";
  ctx.beginPath();
  ctx.ellipse(cx, chinY + r * 0.06, r * 0.3, r * 0.1, 0, 0, TAU);
  ctx.fill();

  /* --------------------------------- Augen -------------------------------- */

  const eyeY = cy + r * 0.42;
  const exOff = r * 0.47;
  const eyeW = r * 0.32;
  const eyeH = r * 0.4 * blink(t, opts.blinkPhase);

  for (const s of [-1, 1]) {
    const ex = cx + s * exOff;

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, eyeW, eyeH, 0, 0, TAU);
    ctx.fill();

    const ig = ctx.createLinearGradient(ex, eyeY - eyeH, ex, eyeY + eyeH);
    ig.addColorStop(0, shade(c.eyeColor, -0.3));
    ig.addColorStop(1, shade(c.eyeColor, 0.28));
    ctx.fillStyle = ig;
    ctx.beginPath();
    ctx.ellipse(ex, eyeY + eyeH * 0.06, eyeW * 0.78, eyeH * 0.84, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "#241d33";
    ctx.beginPath();
    ctx.ellipse(ex, eyeY + eyeH * 0.08, eyeW * 0.36, eyeH * 0.48, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.beginPath();
    ctx.arc(ex - s * eyeW * 0.3, eyeY - eyeH * 0.36, eyeW * 0.26, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + s * eyeW * 0.34, eyeY + eyeH * 0.42, eyeW * 0.13, 0, TAU);
    ctx.fill();

    // Oberlid: flacher Bogen, außen leicht verlängert. Nicht bis zur Nasenwurzel
    // ziehen, sonst lesen die beiden Striche zusammen als zornige Braue.
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, r * 0.062);
    ctx.beginPath();
    ctx.moveTo(ex - s * eyeW * 0.98, eyeY - eyeH * 0.42);
    ctx.quadraticCurveTo(ex, eyeY - eyeH * 1.28, ex + s * eyeW * 1.16, eyeY - eyeH * 0.62);
    ctx.stroke();

    ctx.lineWidth = Math.max(1, r * 0.026);
    ctx.beginPath();
    ctx.moveTo(ex - eyeW * 0.5, eyeY + eyeH * 1.06);
    ctx.quadraticCurveTo(ex, eyeY + eyeH * 1.18, ex + eyeW * 0.55, eyeY + eyeH * 0.98);
    ctx.stroke();

    // Braue auf der freien Stirn.
    ctx.strokeStyle = hairDark;
    ctx.lineWidth = Math.max(1.4, r * 0.036);
    const browY = cy - r * 0.14 + (c.smile < 0 ? r * 0.03 : 0);
    ctx.beginPath();
    ctx.moveTo(ex - s * eyeW * 0.85, browY + (c.smile < 0 ? -r * 0.05 : r * 0.04));
    ctx.quadraticCurveTo(ex, browY - r * 0.07, ex + s * eyeW * 0.95, browY + r * 0.02);
    ctx.stroke();
  }

  /* ---------------------------- Mund und Wangen --------------------------- */

  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1.2, r * 0.03);
  const my = cy + r * 0.92;
  ctx.beginPath();
  if (c.smile > 0.5) {
    ctx.moveTo(cx - r * 0.13, my - r * 0.03);
    ctx.quadraticCurveTo(cx, my + r * 0.13, cx + r * 0.13, my - r * 0.03);
  } else if (c.smile < 0) {
    ctx.moveTo(cx - r * 0.11, my + r * 0.04);
    ctx.quadraticCurveTo(cx, my - r * 0.05, cx + r * 0.11, my + r * 0.04);
  } else {
    ctx.moveTo(cx - r * 0.09, my);
    ctx.quadraticCurveTo(cx, my + r * 0.06, cx + r * 0.09, my);
  }
  ctx.stroke();

  // Nasenandeutung: ein Punkt reicht.
  ctx.fillStyle = "rgba(180,120,120,0.5)";
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.04, cy + r * 0.72, r * 0.035, r * 0.025, 0, 0, TAU);
  ctx.fill();

  if (c.smile >= 0) {
    ctx.fillStyle = "rgba(255,140,150,0.3)";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + s * r * 0.74, cy + r * 0.72, r * 0.19, r * 0.1, 0, 0, TAU);
      ctx.fill();
    }
  }

  /* ---------------------------------- Pony -------------------------------- */

  const sw = sway * r * 0.5;
  ctx.fillStyle = c.hairColor;
  ctx.beginPath();
  ctx.moveTo(cx - r * 1.05, cy + r * 0.2);
  ctx.quadraticCurveTo(cx - r * 1.16, cy - r * 1.02, cx + sw, cy - r * 1.1);
  ctx.quadraticCurveTo(cx + r * 1.16, cy - r * 1.02, cx + r * 1.05, cy + r * 0.2);
  // Untere Kante: weiche Strähnen, die über der Stirn enden.
  ctx.lineTo(cx + r * 0.98, cy - r * 0.24);
  ctx.quadraticCurveTo(cx + r * 0.84, cy - r * 0.62, cx + r * 0.62, cy - r * 0.36);
  ctx.quadraticCurveTo(cx + r * 0.48, cy - r * 0.2, cx + r * 0.3 + sw, cy - r * 0.5);
  ctx.quadraticCurveTo(cx + r * 0.1 + sw, cy - r * 0.76, cx - r * 0.12 + sw, cy - r * 0.44);
  ctx.quadraticCurveTo(cx - r * 0.32 + sw, cy - r * 0.22, cx - r * 0.5, cy - r * 0.48);
  ctx.quadraticCurveTo(cx - r * 0.72, cy - r * 0.7, cx - r * 0.98, cy - r * 0.24);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = line;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // Glanzband.
  ctx.fillStyle = withAlpha(hairLight, 0.5);
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.08, cy - r * 0.74, r * 0.58, r * 0.11, -0.14, 0, TAU);
  ctx.fill();

  /* ----------------------------- Seitensträhnen --------------------------- */

  ctx.fillStyle = c.hairColor;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * r * 1.02, cy - r * 0.25);
    ctx.quadraticCurveTo(cx + s * r * (1.16 + sway * s), cy + r * 0.55, cx + s * r * 0.86, cy + r * 1.22);
    ctx.quadraticCurveTo(cx + s * r * 0.74, cy + r * 0.5, cx + s * r * 0.8, cy - r * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = line;
    ctx.stroke();
  }

  /* --------------------- langes Haar über der Schulter -------------------- */

  if (c.hairStyle === "lang") {
    ctx.fillStyle = c.hairColor;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * r * 1.0, cy + r * 0.1);
      ctx.quadraticCurveTo(cx + s * r * (1.24 + sway * s), cy + r * 1.6, cx + s * r * 1.06, H);
      ctx.lineTo(cx + s * r * 0.66, H);
      ctx.quadraticCurveTo(cx + s * r * 0.82, cy + r * 1.5, cx + s * r * 0.76, cy + r * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = line;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
  }

  /* ------------------------------ Katzenohren ----------------------------- */

  if (c.catEars) {
    for (const s of [-1, 1]) {
      ctx.fillStyle = c.hairColor;
      ctx.beginPath();
      ctx.moveTo(cx + s * r * 0.34, cy - r * 0.9);
      ctx.lineTo(cx + s * r * 0.74, cy - r * 1.72);
      ctx.lineTo(cx + s * r * 0.96, cy - r * 0.72);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = line;
      ctx.stroke();
      ctx.fillStyle = "#ffb9c9";
      ctx.beginPath();
      ctx.moveTo(cx + s * r * 0.52, cy - r * 0.92);
      ctx.lineTo(cx + s * r * 0.74, cy - r * 1.44);
      ctx.lineTo(cx + s * r * 0.86, cy - r * 0.82);
      ctx.closePath();
      ctx.fill();
    }
  }

  /* ------------------------------- Randlicht ------------------------------ */

  const side = scene.time === "morgen" ? -1 : 1;
  ctx.strokeStyle = withAlpha(P.light, 0.45);
  ctx.lineWidth = Math.max(1.5, r * 0.05);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.03, side < 0 ? Math.PI * 1.02 : Math.PI * 1.52, side < 0 ? Math.PI * 1.48 : Math.PI * 1.98);
  ctx.stroke();

  ctx.restore();
}

function drawOutfit(
  ctx: CanvasRenderingContext2D,
  cx: number,
  r: number,
  shoulderY: number,
  H: number,
  c: Scene["character"],
  line: number,
): void {
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = line;

  switch (c.outfit) {
    case "schuluniform": {
      // Weißes Oberteil unter dem Matrosenkragen.
      ctx.fillStyle = "#f4f6ff";
      ctx.beginPath();
      ctx.moveTo(cx - r * 1.1, shoulderY + r * 0.1);
      ctx.lineTo(cx - r * 0.42, shoulderY - r * 0.32);
      ctx.lineTo(cx + r * 0.42, shoulderY - r * 0.32);
      ctx.lineTo(cx + r * 1.1, shoulderY + r * 0.1);
      ctx.lineTo(cx + r * 1.2, H);
      ctx.lineTo(cx - r * 1.2, H);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Kragen als V, das vorne zusammenläuft.
      ctx.fillStyle = shade(c.outfitColor, -0.12);
      ctx.beginPath();
      ctx.moveTo(cx - r * 1.05, shoulderY + r * 0.06);
      ctx.lineTo(cx - r * 0.42, shoulderY - r * 0.34);
      ctx.lineTo(cx, shoulderY + r * 0.72);
      ctx.lineTo(cx + r * 0.42, shoulderY - r * 0.34);
      ctx.lineTo(cx + r * 1.05, shoulderY + r * 0.06);
      ctx.lineTo(cx + r * 0.66, shoulderY + r * 0.34);
      ctx.lineTo(cx, shoulderY + r * 1.05);
      ctx.lineTo(cx - r * 0.66, shoulderY + r * 0.34);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#e2495c";
      ctx.beginPath();
      ctx.moveTo(cx, shoulderY + r * 0.5);
      ctx.lineTo(cx - r * 0.26, shoulderY + r * 0.86);
      ctx.lineTo(cx, shoulderY + r * 0.74);
      ctx.lineTo(cx + r * 0.26, shoulderY + r * 0.86);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }

    case "kimono": {
      ctx.fillStyle = shade(c.outfitColor, 0.3);
      ctx.beginPath();
      ctx.moveTo(cx - r * 1.1, shoulderY + r * 0.05);
      ctx.lineTo(cx - r * 0.4, shoulderY - r * 0.32);
      ctx.lineTo(cx + r * 0.24, shoulderY + r * 1.3);
      ctx.lineTo(cx - r * 0.6, shoulderY + r * 1.3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = shade(c.outfitColor, 0.12);
      ctx.beginPath();
      ctx.moveTo(cx + r * 1.1, shoulderY + r * 0.05);
      ctx.lineTo(cx + r * 0.4, shoulderY - r * 0.32);
      ctx.lineTo(cx - r * 0.24, shoulderY + r * 1.3);
      ctx.lineTo(cx + r * 0.6, shoulderY + r * 1.3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#d94f6a";
      ctx.fillRect(cx - r * 1.3, shoulderY + r * 1.3, r * 2.6, r * 0.45);
      ctx.strokeRect(cx - r * 1.3, shoulderY + r * 1.3, r * 2.6, r * 0.45);
      break;
    }

    case "hoodie": {
      ctx.fillStyle = shade(c.outfitColor, 0.14);
      ctx.beginPath();
      ctx.ellipse(cx, shoulderY - r * 0.05, r * 1.15, r * 0.55, 0, Math.PI, 0);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "#f0f2ff";
      ctx.lineWidth = Math.max(1.5, r * 0.04);
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + s * r * 0.2, shoulderY + r * 0.2);
        ctx.lineTo(cx + s * r * 0.28, shoulderY + r * 1.0);
        ctx.stroke();
      }
      break;
    }

    case "ruestung": {
      ctx.fillStyle = "#9aa6c4";
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(cx + s * r * 1.28, shoulderY + r * 0.28, r * 0.5, r * 0.36, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = "#b7c2dd";
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.86, shoulderY + r * 0.02);
      ctx.lineTo(cx + r * 0.86, shoulderY + r * 0.02);
      ctx.lineTo(cx + r * 0.66, shoulderY + r * 1.5);
      ctx.lineTo(cx - r * 0.66, shoulderY + r * 1.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }

    default: {
      ctx.fillStyle = shade(c.outfitColor, 0.22);
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.9, shoulderY - r * 0.2);
      ctx.lineTo(cx + r * 0.9, shoulderY - r * 0.2);
      ctx.lineTo(cx + r * 1.5, H);
      ctx.lineTo(cx - r * 1.5, H);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}
