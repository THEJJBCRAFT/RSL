/**
 * ani0.0.2 — Figuren im Ganzkörper und die Kampf-Effekte.
 *
 * Jede Figur ist ein kleines Skelett: Rumpf, Kopf, zwei Arme, zwei Beine mit
 * je zwei Segmenten. Eine Pose ist ein Satz Gelenkwinkel; Pose-Funktionen
 * rechnen die Winkel aus der Zeit, dadurch entsteht die Bewegung.
 */

import { shade, withAlpha } from "./scene";
import type { Role } from "./script";

const TAU = Math.PI * 2;
const INK = "#221c30";

/** #rrggbb mischen. */
function hexMix(a: string, b: string, p: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.max(0, Math.min(255, Math.round(v + (pb[i]! - v) * p))));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Cel-Schatten: nicht nur dunkler, sondern Richtung Blauviolett gedreht -
 * so machen es die Farbtabellen echter Produktionen.
 */
function celShadow(hex: string): string {
  return shade(hexMix(hex, "#41307a", 0.32), -0.16);
}

/** Hautschatten: rosig, kaum dunkler - Gesichter duerfen nicht "dreckig" werden. */
function celSkinShadow(hex: string): string {
  return shade(hexMix(hex, "#c9788a", 0.28), -0.03);
}

/** Highlight: leicht Richtung Warmgelb. */
function celLight(hex: string): string {
  return shade(hexMix(hex, "#ffe9b0", 0.45), 0.12);
}

export type ActorDesign = {
  role: Role;
  skin: string;
  hair: string;
  eye: string;
  outfit: string; //  Jacke/Mantel
  pants: string;
  trim: string; //    Kragen, Guertel, Absaetze
  accent: string; //  Farbe der Aura/Magie
  hairstyle: "spiky" | "flat" | "long";
  headband: boolean;
};

/** Rollen-Designs: Held gruen, Freund blau, Gegner rot/dunkel. */
export function designFor(role: Role): ActorDesign {
  switch (role) {
    case "held":
      return {
        role, skin: "#ffdcc8", hair: "#2b3252", eye: "#39ff8c",
        outfit: "#27324e", pants: "#1c2338", trim: "#2ee68c",
        accent: "#39ff8c", hairstyle: "spiky", headband: true,
      };
    case "freund":
      return {
        role, skin: "#ffdcc8", hair: "#8a6542", eye: "#5ab0ff",
        outfit: "#365a7a", pants: "#263b52", trim: "#a8ceec",
        accent: "#5ab0ff", hairstyle: "flat", headband: false,
      };
    case "gegner":
      return {
        role, skin: "#efd2c2", hair: "#260a16", eye: "#ff4a4a",
        outfit: "#421a26", pants: "#2a0f18", trim: "#8a2c3d",
        accent: "#ff4a4a", hairstyle: "long", headband: false,
      };
  }
}

/** Weisse Endform mit goldenen Linien fuer die Verwandlung. */
export function ascendedDesign(): ActorDesign {
  return {
    role: "held", skin: "#ffe6d6", hair: "#f4f0ff", eye: "#39ff8c",
    outfit: "#f5f3ff", pants: "#e6e2f2", trim: "#d9b24a",
    accent: "#39ff8c", hairstyle: "spiky", headband: false,
  };
}

/* --------------------------------- Posen --------------------------------- */

/** Winkel in Radiant, 0 = senkrecht nach unten, positiv = nach vorn (Blickrichtung). */
export type Pose = {
  lean: number; //      Rumpfneigung
  crouch: number; //    0..1, in die Knie
  armF: [number, number]; //  vorderer Arm: Schulter, Ellbogen
  armB: [number, number];
  legF: [number, number]; //  vorderes Bein: Hüfte, Knie
  legB: [number, number];
  head: number;
  airborne: number; //  Anhebung der Füße in Einheiten
};

const P0: Pose = {
  lean: 0,
  crouch: 0.04,
  armF: [0.16, 0.22],
  armB: [-0.14, 0.18],
  legF: [0.12, 0.1],
  legB: [-0.14, 0.14],
  head: 0,
  airborne: 0,
};

function mix(a: Pose, b: Pose, p: number): Pose {
  const m = (x: number, y: number): number => x + (y - x) * p;
  return {
    lean: m(a.lean, b.lean),
    crouch: m(a.crouch, b.crouch),
    armF: [m(a.armF[0], b.armF[0]), m(a.armF[1], b.armF[1])],
    armB: [m(a.armB[0], b.armB[0]), m(a.armB[1], b.armB[1])],
    legF: [m(a.legF[0], b.legF[0]), m(a.legF[1], b.legF[1])],
    legB: [m(a.legB[0], b.legB[0]), m(a.legB[1], b.legB[1])],
    head: m(a.head, b.head),
    airborne: m(a.airborne, b.airborne),
  };
}

const easeOut = (p: number): number => 1 - Math.pow(1 - p, 3);
const pulse = (p: number): number => (p < 0.5 ? easeOut(p * 2) : easeOut((1 - p) * 2));

export const poses = {
  idle(t: number): Pose {
    const b = Math.sin(t * 2.2) * 0.03;
    return { ...P0, lean: b * 0.4, crouch: 0.06 + b * 0.5, head: b };
  },

  guard(t: number): Pose {
    const b = Math.sin(t * 3) * 0.02;
    return {
      ...P0,
      lean: 0.16,
      crouch: 0.2 + b,
      armF: [1.35, 1.7],
      armB: [0.9, 1.9],
      legF: [0.42, 0.3],
      legB: [-0.3, 0.35],
    };
  },

  run(t: number): Pose {
    const ph = t * 11;
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    return {
      lean: 0.42,
      crouch: 0.14 + Math.abs(c) * 0.05,
      armF: [0.9 * s + 0.4, 1.2],
      armB: [-0.9 * s + 0.1, 1.1],
      legF: [s * 0.95, Math.max(0, -c) * 1.3 + 0.15],
      legB: [-s * 0.95, Math.max(0, c) * 1.3 + 0.15],
      head: 0.08,
      airborne: Math.max(0, Math.abs(s) - 0.55) * 0.5,
    };
  },

  /** p: 0..1 innerhalb des Schlags. */
  punch(p: number): Pose {
    const k = pulse(p);
    return {
      lean: 0.28 * k,
      crouch: 0.16,
      armF: [1.55 * k + 0.3, 0.25 + (1 - k) * 1.2],
      armB: [-0.5 * k, 1.6],
      legF: [0.5 * k + 0.1, 0.2],
      legB: [-0.4 * k - 0.05, 0.3],
      head: 0.05,
      airborne: 0,
    };
  },

  highKick(p: number): Pose {
    const k = pulse(p);
    return {
      lean: -0.35 * k,
      crouch: 0.12,
      armF: [0.7, 1.2],
      armB: [-1.1 * k, 0.9],
      legF: [2.35 * k + 0.1, 0.12 + (1 - k) * 0.9],
      legB: [-0.25, 0.2],
      head: -0.12 * k,
      airborne: 0.12 * k,
    };
  },

  lowKick(p: number): Pose {
    const k = pulse(p);
    return {
      lean: 0.5 * k,
      crouch: 0.42 * k + 0.1,
      armF: [0.9, 1.4],
      armB: [-0.8, 1.0],
      legF: [1.15 * k + 0.1, 0.1],
      legB: [-0.5 * k, 0.9 * k + 0.2],
      head: 0.1,
      airborne: 0,
    };
  },

  cast(p: number): Pose {
    const k = easeOut(Math.min(1, p * 2));
    return {
      ...P0,
      lean: 0.1,
      crouch: 0.1,
      armF: [1.9 * k, 0.4],
      armB: [0.7 * k, 1.3],
      head: 0.05,
    };
  },

  stagger(p: number): Pose {
    const k = pulse(p);
    return {
      ...P0,
      lean: -0.5 * k,
      crouch: 0.28 * k + 0.08,
      armF: [0.9 * k + 0.2, 0.8],
      armB: [-1.2 * k - 0.2, 0.6],
      head: -0.25 * k,
    };
  },

  /** Schwertstoß nach vorn. */
  stab(p: number): Pose {
    const k = easeOut(Math.min(1, p * 1.6));
    return {
      lean: 0.5 * k,
      crouch: 0.2,
      armF: [1.62 * k + 0.2, 0.12],
      armB: [-0.9 * k, 1.2],
      legF: [0.9 * k + 0.1, 0.25],
      legB: [-0.7 * k, 0.35],
      head: 0.06,
      airborne: 0,
    };
  },

  /** Getroffen und durchbohrt: Rücken durchgedrückt, Arme fallen. */
  impaled(p: number): Pose {
    const k = easeOut(p);
    return {
      lean: -0.35 * k,
      crouch: 0.1 + k * 0.15,
      armF: [0.2 - k * 0.5, 0.3],
      armB: [-0.2 - k * 0.4, 0.25],
      legF: [0.15, 0.2 + k * 0.3],
      legB: [-0.1, 0.2 + k * 0.4],
      head: -0.4 * k,
      airborne: 0,
    };
  },

  collapse(p: number): Pose {
    const k = easeOut(p);
    return {
      lean: 0.9 * k,
      crouch: 0.95 * k + 0.05,
      armF: [0.5, 0.9],
      armB: [-0.4, 0.8],
      legF: [0.6 * k, 1.5 * k + 0.2],
      legB: [-0.4 * k, 1.4 * k + 0.2],
      head: 0.55 * k,
      airborne: 0,
    };
  },

  lying(): Pose {
    return {
      lean: Math.PI / 2 - 0.08,
      crouch: 0.15,
      armF: [0.6, 0.5],
      armB: [-0.5, 0.4],
      legF: [0.25, 0.3],
      legB: [-0.2, 0.25],
      head: 0.3,
      airborne: 0,
    };
  },

  float(t: number): Pose {
    const b = Math.sin(t * 1.4) * 0.05;
    return {
      lean: -0.06,
      crouch: 0.05,
      armF: [0.55 + b, 0.35],
      armB: [-0.55 - b, 0.35],
      legF: [0.22, 0.35],
      legB: [-0.18, 0.3],
      head: -0.12,
      airborne: 0,
    };
  },

  raiseSwords(p: number): Pose {
    const k = easeOut(Math.min(1, p * 1.5));
    return {
      lean: -0.08 * k,
      crouch: 0.08,
      armF: [2.5 * k + 0.3, 0.15],
      armB: [-2.5 * k - 0.3, 0.15],
      // Breiter, fester Stand - keine ueberkreuzten Beine.
      legF: [0.3, 0.06],
      legB: [-0.32, 0.08],
      head: -0.18 * k,
      airborne: 0,
    };
  },
};

export { mix as mixPose };

/* ------------------------------ Figur zeichnen ---------------------------- */

export type ActorState = {
  design: ActorDesign;
  x: number; //       Fusspunkt
  y: number;
  h: number; //       Koerpergroesse in px
  face: 1 | -1; //    Blickrichtung
  pose: Pose;
  aura?: number; //   0..1 Staerke der Energie-Aura
  glowWhite?: number; // 0..1 weisses Ueberstrahlen (Verwandlung)
  sword?: "front" | "both" | null;
  crown?: boolean;
  goldTrim?: boolean;
  alpha?: number;
  angry?: boolean;
};

type Pt = { x: number; y: number; a: number };

/** Zweisegmentiges Glied mit Volumen: Ink-Rand, Farbe, Gelenkkappe. */
function limbV(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  a1: number,
  a2: number,
  l1: number,
  l2: number,
  w1: number,
  w2: number,
  color: string,
  face: number,
): Pt {
  const ax = x + Math.sin(a1) * l1 * face;
  const ay = y + Math.cos(a1) * l1;
  const bx = ax + Math.sin(a1 + a2) * l2 * face;
  const by = ay + Math.cos(a1 + a2) * l2;

  const seg = (x0: number, y0: number, x1: number, y1: number, w: number): void => {
    ctx.strokeStyle = INK;
    ctx.lineWidth = w + 2.6;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  };
  seg(x, y, ax, ay, w1);
  seg(ax, ay, bx, by, w2);
  // Cel-Schattenkante auf der lichtabgewandten Seite (Licht kommt von vorn).
  const sh = celShadow(color);
  const dx = -face * w1 * 0.22;
  ctx.strokeStyle = sh;
  ctx.lineWidth = w1 * 0.5;
  ctx.beginPath();
  ctx.moveTo(x + dx, y);
  ctx.lineTo(ax + dx, ay);
  ctx.stroke();
  ctx.lineWidth = w2 * 0.5;
  ctx.beginPath();
  ctx.moveTo(ax + dx, ay);
  ctx.lineTo(bx + dx, by);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(ax, ay, w1 * 0.5, 0, TAU);
  ctx.fill();
  return { x: bx, y: by, a: a1 + a2 };
}

function drawSword(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, len: number, glow: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = withAlpha(glow, 0.35);
  ctx.fillRect(-len * 0.06, -len, len * 0.12, len);
  ctx.fillStyle = "#e8ecfa";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-len * 0.035, 0);
  ctx.lineTo(-len * 0.035, -len * 0.92);
  ctx.lineTo(0, -len);
  ctx.lineTo(len * 0.035, -len * 0.92);
  ctx.lineTo(len * 0.035, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#c9a24a";
  ctx.fillRect(-len * 0.11, -len * 0.02, len * 0.22, len * 0.045);
  ctx.restore();
}

function drawShoe(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, face: number, color: string): void {
  ctx.fillStyle = color;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(x + face * u * 0.22, y - u * 0.1, u * 0.46, u * 0.22, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
}

function drawHead(ctx: CanvasRenderingContext2D, s: ActorState, hx: number, hy: number, hr: number, angry: boolean): void {
  const d = s.design;
  const face = s.face;

  // Lange Maehne haengt hinter dem Kopf - vor dem Schaedel zeichnen.
  if (d.hairstyle === "long") {
    ctx.fillStyle = d.hair;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(hx - face * hr * 0.95, hy - hr * 0.4);
    ctx.quadraticCurveTo(hx - face * hr * 2.0, hy + hr * 2.2, hx - face * hr * 1.35, hy + hr * 4.4);
    ctx.lineTo(hx - face * hr * 0.35, hy + hr * 4.2);
    ctx.quadraticCurveTo(hx - face * hr * 0.75, hy + hr * 2.0, hx - face * hr * 0.5, hy + hr * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Schaedel + Kinnpartie.
  ctx.fillStyle = d.skin;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(hx - face * hr * 0.62, hy + hr * 0.72);
  ctx.quadraticCurveTo(hx + face * hr * 0.15, hy + hr * 1.28, hx + face * hr * 0.72, hy + hr * 0.55);
  ctx.quadraticCurveTo(hx + face * hr * 0.3, hy + hr * 0.95, hx - face * hr * 0.3, hy + hr * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Ohr auf der Rueckseite.
  ctx.fillStyle = d.skin;
  ctx.beginPath();
  ctx.arc(hx - face * hr * 0.62, hy + hr * 0.18, hr * 0.18, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Cel-Schatten: schmale Sichel am lichtabgewandten Kopfrand.
  ctx.fillStyle = celSkinShadow(d.skin);
  ctx.beginPath();
  if (face > 0) {
    ctx.arc(hx, hy, hr * 0.96, Math.PI * 0.55, Math.PI * 1.45);
    ctx.arc(hx, hy, hr * 0.66, Math.PI * 1.45, Math.PI * 0.55, true);
  } else {
    ctx.arc(hx, hy, hr * 0.96, -Math.PI * 0.45, Math.PI * 0.45);
    ctx.arc(hx, hy, hr * 0.66, Math.PI * 0.45, -Math.PI * 0.45, true);
  }
  ctx.closePath();
  ctx.fill();

  // Haare.
  ctx.fillStyle = d.hair;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  if (d.hairstyle === "spiky") {
    ctx.beginPath();
    ctx.moveTo(hx + face * hr * 1.0, hy + hr * 0.05);
    const spikes = 7;
    for (let i = 0; i <= spikes; i++) {
      const ang = -Math.PI * 0.05 - (i / spikes) * Math.PI * 1.05;
      const rOut = hr * (i % 2 === 0 ? 1.65 : 1.15);
      ctx.lineTo(hx + Math.cos(ang) * rOut * face, hy + Math.sin(ang) * rOut);
      const angIn = ang - (Math.PI * 1.05) / spikes / 2;
      if (i < spikes) ctx.lineTo(hx + Math.cos(angIn) * hr * 1.0 * face, hy + Math.sin(angIn) * hr * 1.0);
    }
    ctx.lineTo(hx - face * hr * 1.0, hy + hr * 0.3);
    ctx.quadraticCurveTo(hx - face * hr * 0.4, hy - hr * 0.1, hx + face * hr * 0.1, hy - hr * 0.28);
    ctx.lineTo(hx + face * hr * 0.35, hy - 0.02 * hr);
    ctx.lineTo(hx + face * hr * 0.6, hy - hr * 0.42);
    ctx.lineTo(hx + face * hr * 0.85, hy - hr * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (d.hairstyle === "flat") {
    ctx.beginPath();
    ctx.arc(hx, hy - hr * 0.06, hr * 1.06, Math.PI * 0.85, Math.PI * 2.12);
    ctx.lineTo(hx + face * hr * 0.9, hy - hr * 0.12);
    ctx.lineTo(hx + face * hr * 0.55, hy - hr * 0.38);
    ctx.lineTo(hx + face * hr * 0.2, hy - hr * 0.12);
    ctx.lineTo(hx - face * hr * 0.25, hy - hr * 0.4);
    ctx.lineTo(hx - face * hr * 0.7, hy - hr * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(hx, hy - hr * 0.05, hr * 1.05, Math.PI * 0.8, Math.PI * 2.15);
    ctx.lineTo(hx + face * hr * 0.95, hy + hr * 0.1);
    ctx.lineTo(hx + face * hr * 0.62, hy - hr * 0.3);
    ctx.lineTo(hx + face * hr * 0.3, hy + hr * 0.05);
    ctx.lineTo(hx - face * hr * 0.1, hy - hr * 0.32);
    ctx.lineTo(hx - face * hr * 0.6, hy + hr * 0.02);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Ponyschatten: gezackter, schmaler Saum direkt am Haaransatz.
  ctx.fillStyle = celSkinShadow(d.skin);
  ctx.beginPath();
  ctx.moveTo(hx - face * hr * 0.7, hy - hr * 0.36);
  ctx.lineTo(hx - face * hr * 0.44, hy - hr * 0.18);
  ctx.lineTo(hx - face * hr * 0.18, hy - hr * 0.32);
  ctx.lineTo(hx + face * hr * 0.1, hy - hr * 0.16);
  ctx.lineTo(hx + face * hr * 0.38, hy - hr * 0.3);
  ctx.lineTo(hx + face * hr * 0.6, hy - hr * 0.18);
  ctx.lineTo(hx + face * hr * 0.76, hy - hr * 0.34);
  ctx.lineTo(hx + face * hr * 0.76, hy - hr * 0.44);
  ctx.lineTo(hx - face * hr * 0.7, hy - hr * 0.46);
  ctx.closePath();
  ctx.fill();

  // Haar-Glanzband: gezackter heller Streifen (chunk highlight).
  ctx.fillStyle = celLight(d.hair);
  ctx.beginPath();
  ctx.moveTo(hx - hr * 0.7, hy - hr * 0.62);
  ctx.lineTo(hx - hr * 0.34, hy - hr * 0.5);
  ctx.lineTo(hx - hr * 0.1, hy - hr * 0.72);
  ctx.lineTo(hx + hr * 0.2, hy - hr * 0.52);
  ctx.lineTo(hx + hr * 0.5, hy - hr * 0.7);
  ctx.lineTo(hx + hr * 0.66, hy - hr * 0.56);
  ctx.lineTo(hx + hr * 0.5, hy - hr * 0.86);
  ctx.lineTo(hx - hr * 0.4, hy - hr * 0.88);
  ctx.closePath();
  ctx.fill();

  // Stirnband.
  if (d.headband) {
    ctx.fillStyle = "#2a2438";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(hx - face * hr * 1.02, hy - hr * 0.28);
    ctx.lineTo(hx + face * hr * 1.0, hy - hr * 0.34);
    ctx.lineTo(hx + face * hr * 1.0, hy - hr * 0.08);
    ctx.lineTo(hx - face * hr * 1.02, hy - hr * 0.02);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#b8c4d8";
    ctx.beginPath();
    ctx.rect(hx + face * hr * 0.1 - hr * 0.28, hy - hr * 0.32, hr * 0.56, hr * 0.24);
    ctx.fill();
    ctx.stroke();
  }

  // Auge (grosses Anime-Auge in Blickrichtung).
  const ex = hx + face * hr * 0.45;
  const ey = hy + hr * 0.12;
  const ew = hr * 0.3;
  const eh = hr * 0.26;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(ex, ey, ew, eh, 0, 0, TAU);
  ctx.fill();
  const ig = ctx.createLinearGradient(ex, ey - eh, ex, ey + eh);
  ig.addColorStop(0, shade(d.eye, -0.3));
  ig.addColorStop(1, shade(d.eye, 0.25));
  ctx.fillStyle = ig;
  ctx.beginPath();
  ctx.ellipse(ex + face * ew * 0.15, ey, ew * 0.55, eh * 0.85, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#1a1428";
  ctx.beginPath();
  ctx.ellipse(ex + face * ew * 0.18, ey + eh * 0.05, ew * 0.24, eh * 0.42, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.arc(ex - face * ew * 0.1, ey - eh * 0.35, ew * 0.16, 0, TAU);
  ctx.fill();
  // Oberlid.
  ctx.strokeStyle = INK;
  ctx.lineWidth = hr * 0.09;
  ctx.beginPath();
  ctx.moveTo(ex - ew * 1.05, ey - eh * (angry ? 0.15 : 0.55));
  ctx.quadraticCurveTo(ex, ey - eh * 1.25, ex + ew * 1.05, ey - eh * 0.6);
  ctx.stroke();

  // Braue: im Zorn steil zur Nase hin.
  ctx.strokeStyle = shade(d.hair, -0.2);
  ctx.lineWidth = hr * 0.11;
  ctx.beginPath();
  if (angry) {
    ctx.moveTo(ex - face * ew * 1.2, hy - hr * 0.28);
    ctx.lineTo(ex + face * ew * 0.75, hy + hr * 0.02);
  } else {
    ctx.moveTo(ex - face * ew * 1.1, hy - hr * 0.2);
    ctx.quadraticCurveTo(ex, hy - hr * 0.32, ex + face * ew * 1.0, hy - hr * 0.18);
  }
  ctx.stroke();

  // Nase + Mund.
  ctx.strokeStyle = INK;
  ctx.lineWidth = hr * 0.05;
  ctx.beginPath();
  ctx.moveTo(hx + face * hr * 0.78, hy + hr * 0.42);
  ctx.lineTo(hx + face * hr * 0.72, hy + hr * 0.5);
  ctx.stroke();
  if (angry) {
    ctx.fillStyle = "#f2f2f2";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.rect(hx + face * hr * 0.36 - hr * 0.15, hy + hr * 0.62, hr * 0.3, hr * 0.11);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hx + face * hr * 0.36 - hr * 0.15, hy + hr * 0.675);
    ctx.lineTo(hx + face * hr * 0.36 + hr * 0.15, hy + hr * 0.675);
    ctx.stroke();
  } else {
    ctx.lineWidth = hr * 0.06;
    ctx.beginPath();
    ctx.moveTo(hx + face * hr * 0.24, hy + hr * 0.66);
    ctx.quadraticCurveTo(hx + face * hr * 0.42, hy + hr * 0.72, hx + face * hr * 0.56, hy + hr * 0.62);
    ctx.stroke();
  }
}

export function drawActor(ctx: CanvasRenderingContext2D, s: ActorState): void {
  const { design: d, pose: p, face } = s;
  const u = s.h / 7;
  const y0 = s.y - s.h + p.crouch * u * 1.6 + p.airborne * -u * 1.4;
  const angry = s.angry ?? (d.role === "gegner" || (s.aura ?? 0) > 0.55);

  ctx.save();
  if (s.alpha !== undefined) ctx.globalAlpha = s.alpha;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Aura hinter allem.
  if (s.aura && s.aura > 0.02) {
    const g = ctx.createRadialGradient(s.x, y0 + 3 * u, u, s.x, y0 + 3 * u, 4.6 * u);
    g.addColorStop(0, withAlpha(d.accent, 0.34 * s.aura));
    g.addColorStop(1, withAlpha(d.accent, 0));
    ctx.fillStyle = g;
    ctx.fillRect(s.x - 5 * u, y0 - 2.5 * u, 10 * u, 10 * u);
  }

  ctx.save();
  ctx.translate(s.x, y0 + 1.1 * u);
  ctx.rotate(p.lean * face);
  ctx.translate(-s.x, -(y0 + 1.1 * u));

  const neck = { x: s.x, y: y0 + 1.2 * u };
  const hip = { x: s.x - Math.sin(p.lean) * 0.64 * u * face, y: y0 + 3.15 * u };
  const legL = 1.8 * u;
  const armL = 1.3 * u;
  const shoulder = { x: neck.x, y: neck.y + 0.3 * u };
  const outfitDark = shade(d.outfit, -0.16);
  const pantsDark = shade(d.pants, -0.12);
  const shoeColor = shade(d.trim, -0.25);

  // Hinteres Bein + Schuh, hinterer Arm.
  const footB = limbV(ctx, hip.x, hip.y, p.legB[0], -p.legB[1], legL, legL, u * 0.68, u * 0.52, pantsDark, face);
  drawShoe(ctx, footB.x, footB.y, u, face, shade(shoeColor, -0.15));
  const handB = limbV(ctx, shoulder.x, shoulder.y, p.armB[0], p.armB[1], armL, armL, u * 0.5, u * 0.4, outfitDark, face);

  // Mantelschoss weht gegen die Bewegung.
  ctx.fillStyle = outfitDark;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(hip.x - u * 0.8 * face, hip.y - u * 0.55);
  ctx.quadraticCurveTo(hip.x - u * (1.7 + p.lean) * face, hip.y + u * 0.9, hip.x - u * 1.15 * face, hip.y + u * 1.5);
  ctx.lineTo(hip.x + u * 0.4 * face, hip.y + u * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Rumpf als Jacke: Schultern breit, Taille schmaler, Saum an der Huefte.
  ctx.fillStyle = d.outfit;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(neck.x - u * 1.0, neck.y + u * 0.28);
  ctx.quadraticCurveTo(neck.x - u * 1.15, neck.y + u * 1.2, hip.x - u * 0.85, hip.y + u * 0.35);
  ctx.lineTo(hip.x + u * 0.85, hip.y + u * 0.35);
  ctx.quadraticCurveTo(neck.x + u * 1.15, neck.y + u * 1.2, neck.x + u * 1.0, neck.y + u * 0.28);
  ctx.quadraticCurveTo(neck.x, neck.y - u * 0.05, neck.x - u * 1.0, neck.y + u * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Cel-Schatten: Rueckseite der Jacke als harte Flaeche.
  ctx.fillStyle = celShadow(d.outfit);
  ctx.beginPath();
  ctx.moveTo(neck.x - face * u * 1.0, neck.y + u * 0.3);
  ctx.quadraticCurveTo(neck.x - face * u * 1.12, neck.y + u * 1.2, hip.x - face * u * 0.85, hip.y + u * 0.32);
  ctx.lineTo(hip.x - face * u * 0.35, hip.y + u * 0.32);
  ctx.quadraticCurveTo(neck.x - face * u * 0.55, neck.y + u * 1.1, neck.x - face * u * 0.45, neck.y + u * 0.24);
  ctx.closePath();
  ctx.fill();

  // Kragen + Reissverschlusslinie + Guertel.
  ctx.fillStyle = d.trim;
  ctx.beginPath();
  ctx.moveTo(neck.x - u * 0.55 * face, neck.y + u * 0.1);
  ctx.lineTo(neck.x + u * 0.15 * face, neck.y + u * 0.75);
  ctx.lineTo(neck.x + u * 0.6 * face, neck.y + u * 0.12);
  ctx.lineTo(neck.x + u * 0.3 * face, neck.y - u * 0.02);
  ctx.lineTo(neck.x, neck.y + u * 0.35);
  ctx.lineTo(neck.x - u * 0.3 * face, neck.y - u * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.strokeStyle = withAlpha(INK, 0.55);
  ctx.beginPath();
  ctx.moveTo(neck.x + u * 0.12 * face, neck.y + u * 0.8);
  ctx.lineTo(hip.x + u * 0.05 * face, hip.y + u * 0.2);
  ctx.stroke();
  if (s.goldTrim) {
    ctx.strokeStyle = "#d9b24a";
    ctx.lineWidth = u * 0.12;
    ctx.beginPath();
    ctx.moveTo(neck.x - u * 0.72, neck.y + u * 0.5);
    ctx.lineTo(hip.x - u * 0.6, hip.y + u * 0.1);
    ctx.moveTo(neck.x + u * 0.72, neck.y + u * 0.5);
    ctx.lineTo(hip.x + u * 0.6, hip.y + u * 0.1);
    ctx.stroke();
  }
  ctx.fillStyle = d.trim;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.rect(hip.x - u * 0.85, hip.y + u * 0.18, u * 1.7, u * 0.3);
  ctx.fill();
  ctx.stroke();

  // Vorderes Bein + Schuh, vorderer Arm + Hand.
  const footF = limbV(ctx, hip.x, hip.y, p.legF[0], -p.legF[1], legL, legL, u * 0.7, u * 0.54, d.pants, face);
  drawShoe(ctx, footF.x, footF.y, u, face, shoeColor);
  const handF = limbV(ctx, shoulder.x, shoulder.y, p.armF[0], p.armF[1], armL, armL, u * 0.52, u * 0.42, d.outfit, face);

  // Haende.
  ctx.fillStyle = d.skin;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  for (const h of [handB, handF]) {
    ctx.beginPath();
    ctx.arc(h.x, h.y, u * 0.26, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }

  // Schwerter verlaengern den Unterarm.
  if (s.sword) {
    drawSword(ctx, handF.x, handF.y, (handF.a + Math.PI / 2) * face + (face < 0 ? Math.PI : 0), 2.6 * u, d.accent);
    if (s.sword === "both") {
      drawSword(ctx, handB.x, handB.y, (handB.a + Math.PI / 2) * face + (face < 0 ? Math.PI : 0), 2.6 * u, d.accent);
    }
  }

  // Hals + Kopf.
  const hr = u * 0.95;
  const hx = neck.x + Math.sin(p.head) * u * 0.5 * face;
  const hy = neck.y - hr * 0.98;
  ctx.strokeStyle = INK;
  ctx.lineWidth = u * 0.42 + 2.2;
  ctx.beginPath();
  ctx.moveTo(neck.x, neck.y + u * 0.1);
  ctx.lineTo(hx, hy + hr * 0.7);
  ctx.stroke();
  ctx.strokeStyle = d.skin;
  ctx.lineWidth = u * 0.42;
  ctx.beginPath();
  ctx.moveTo(neck.x, neck.y + u * 0.1);
  ctx.lineTo(hx, hy + hr * 0.7);
  ctx.stroke();

  drawHead(ctx, s, hx, hy, hr, angry);

  // Halsschatten in Kinnform.
  ctx.fillStyle = celSkinShadow(d.skin);
  ctx.beginPath();
  ctx.ellipse(hx, hy + hr * 1.02, hr * 0.3, hr * 0.12, 0, 0, TAU);
  ctx.fill();

  // Rim-Light: schmale warme Kante auf der Lichtseite der Silhouette.
  ctx.strokeStyle = withAlpha("#ffe6bf", 0.6);
  ctx.lineWidth = Math.max(1.2, u * 0.1);
  ctx.beginPath();
  ctx.arc(hx, hy, hr * 1.02, face > 0 ? -1.1 : Math.PI - 0.4, face > 0 ? 0.4 : Math.PI + 1.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(neck.x + face * u * 0.95, neck.y + u * 0.35);
  ctx.lineTo(hip.x + face * u * 0.8, hip.y - u * 0.4);
  ctx.stroke();

  if (s.crown) {
    ctx.fillStyle = "#ffe9a0";
    ctx.strokeStyle = "#c9a24a";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(hx - hr * 0.7, hy - hr * 1.15);
    ctx.lineTo(hx - hr * 0.45, hy - hr * 1.75);
    ctx.lineTo(hx - hr * 0.18, hy - hr * 1.25);
    ctx.lineTo(hx + hr * 0.18, hy - hr * 1.85);
    ctx.lineTo(hx + hr * 0.45, hy - hr * 1.25);
    ctx.lineTo(hx + hr * 0.7, hy - hr * 1.15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();

  // Weisses Ueberstrahlen fuer die Verwandlung.
  if (s.glowWhite && s.glowWhite > 0.02) {
    const g = ctx.createRadialGradient(s.x, y0 + 2.4 * u, u * 0.5, s.x, y0 + 2.4 * u, 5.5 * u);
    g.addColorStop(0, "rgba(255,255,255," + String(0.75 * s.glowWhite) + ")");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(s.x - 6 * u, y0 - 3 * u, 12 * u, 12 * u);
  }

  ctx.restore();
}

/* -------------------------------- Effekte -------------------------------- */

export function drawSlash(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a0: number, p: number, color: string): void {
  const sweep = 2.1;
  ctx.save();
  ctx.strokeStyle = withAlpha(color, 0.85 * (1 - p));
  ctx.lineWidth = r * 0.14 * (1 - p * 0.6);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(x, y, r * (0.7 + p * 0.5), a0, a0 + sweep * easeOut(p));
  ctx.stroke();
  ctx.restore();
}

export function drawProjectile(ctx: CanvasRenderingContext2D, x: number, y: number, dir: number, size: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  const g = ctx.createLinearGradient(-size * 3, 0, size, 0);
  g.addColorStop(0, withAlpha(color, 0));
  g.addColorStop(1, withAlpha(color, 0.9));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(-size, 0, size * 2.6, size * 0.42, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.55, size * 0.3, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function drawShield(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, p: number, color: string): void {
  const a = Math.min(1, p * 3) * (1 - Math.max(0, p - 0.6) * 2.5);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.max(0, a);
  ctx.strokeStyle = color;
  ctx.fillStyle = withAlpha(color, 0.16);
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * TAU + Math.PI / 6;
    const px = x + Math.cos(ang) * r;
    const py = y + Math.sin(ang) * r * 1.15;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Innenwaben
  ctx.lineWidth = r * 0.02;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * TAU + Math.PI / 6;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r * 1.15);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawBeam(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number, p: number, color: string): void {
  const grow = Math.min(1, p * 4);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.translate(x0, y0);
  ctx.rotate(a);
  const len = Math.hypot(x1 - x0, y1 - y0) * grow;
  const flicker = 0.85 + Math.sin(p * 90) * 0.15;
  const g = ctx.createLinearGradient(0, -w, 0, w);
  g.addColorStop(0, withAlpha(color, 0));
  g.addColorStop(0.5, withAlpha(color, 0.95 * flicker));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, -w, len, w * 2);
  ctx.fillStyle = `rgba(255,255,255,${0.8 * flicker})`;
  ctx.fillRect(0, -w * 0.3, len, w * 0.6);
  ctx.restore();
}

export function drawImpact(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, p: number, color: string): void {
  if (p >= 1) return;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.strokeStyle = withAlpha(color, 1 - p);
  ctx.lineWidth = r * 0.09 * (1 - p);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + 0.3;
    const r0 = r * (0.25 + p * 0.9);
    const r1 = r0 + r * 0.32 * (1 - p);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
    ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawSpeedlines(ctx: CanvasRenderingContext2D, W: number, H: number, strength: number, t: number): void {
  if (strength <= 0.02) return;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.strokeStyle = `rgba(255,255,255,${0.16 * strength})`;
  ctx.lineWidth = 1.4;
  const n = 26;
  for (let i = 0; i < n; i++) {
    const y = ((i * 0.83 + t * 3.1) % 1) * H;
    const len = W * (0.12 + ((i * 37) % 10) / 22);
    const x = ((i * 0.61 + t * 5.7) % 1.2) * W * 1.2 - W * 0.1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Hexagramm + Kreis, progressiv gezeichnet (0..1). */
export function drawSigil(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, p: number, color: string): void {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = r * 0.12;
  ctx.lineWidth = r * 0.045;
  ctx.lineCap = "round";

  const tri = (rot: number, prog: number): void => {
    if (prog <= 0) return;
    const pts = [0, 1, 2, 3].map((i) => {
      const a = rot + (i % 3) * ((TAU * 1) / 3) - Math.PI / 2;
      return [x + Math.cos(a) * r, y + Math.sin(a) * r] as const;
    });
    const total = 3;
    const seg = Math.min(total, prog * total);
    ctx.beginPath();
    ctx.moveTo(pts[0]![0], pts[0]![1]);
    for (let i = 1; i <= Math.ceil(seg); i++) {
      const p0 = pts[i - 1]!;
      const p1 = pts[i]!;
      const f = Math.min(1, seg - (i - 1));
      ctx.lineTo(p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f);
    }
    ctx.stroke();
  };

  tri(0, Math.min(1, p * 2.4));
  tri(Math.PI, Math.min(1, Math.max(0, p - 0.28) * 2.4));

  const circ = Math.max(0, p - 0.55) * 2.4;
  if (circ > 0) {
    ctx.beginPath();
    ctx.arc(x, y, r * 1.22, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, circ));
    ctx.stroke();
  }
  ctx.restore();
}
