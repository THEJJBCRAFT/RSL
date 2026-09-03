import { prefersReducedMotion } from "./motion";

/**
 * Weiche, wandernde Lichtfelder im Hintergrund.
 *
 * Der Trick für die Performance: gerendert wird auf einem winzigen Canvas
 * (rund ein Sechstel der Fensterbreite). Die Unschärfe kommt aus CSS, das
 * Hochskalieren macht der Compositor. Dadurch kostet ein Frame kaum etwas.
 */

type Blob = {
  hue: [number, number, number];
  r: number;
  ax: number;
  ay: number;
  fx: number;
  fy: number;
  px: number;
  py: number;
};

const SCALE = 0.16;
const FPS = 30;
const FRAME_MS = 1000 / FPS;

const BLOBS: Blob[] = [
  { hue: [139, 108, 255], r: 0.55, ax: 0.22, ay: 0.18, fx: 0.041, fy: 0.033, px: 0.0, py: 1.1 },
  { hue: [46, 230, 214], r: 0.48, ax: 0.26, ay: 0.2, fx: 0.029, fy: 0.047, px: 2.2, py: 0.4 },
  { hue: [255, 95, 158], r: 0.34, ax: 0.3, ay: 0.16, fx: 0.053, fy: 0.037, px: 4.1, py: 2.7 },
  { hue: [80, 120, 255], r: 0.42, ax: 0.18, ay: 0.24, fx: 0.036, fy: 0.025, px: 1.3, py: 3.6 },
];

export function startAurora(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return () => {};

  let w = 0;
  let h = 0;
  let raf = 0;
  let last = 0;
  let running = false;

  const resize = (): void => {
    w = Math.max(2, Math.round(canvas.clientWidth * SCALE));
    h = Math.max(2, Math.round(canvas.clientHeight * SCALE));
    canvas.width = w;
    canvas.height = h;
  };

  const draw = (t: number): void => {
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    for (const b of BLOBS) {
      const cx = (0.5 + Math.sin(t * b.fx + b.px) * b.ax) * w;
      const cy = (0.5 + Math.cos(t * b.fy + b.py) * b.ay) * h;
      const rad = b.r * Math.min(w, h) * 1.6;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      const [r, gr, bl] = b.hue;
      g.addColorStop(0, `rgba(${r},${gr},${bl},0.55)`);
      g.addColorStop(0.5, `rgba(${r},${gr},${bl},0.16)`);
      g.addColorStop(1, `rgba(${r},${gr},${bl},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  };

  const loop = (now: number): void => {
    raf = requestAnimationFrame(loop);
    if (now - last < FRAME_MS) return;
    last = now;
    draw(now / 1000);
  };

  const start = (): void => {
    if (running) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(loop);
  };

  const stop = (): void => {
    running = false;
    cancelAnimationFrame(raf);
  };

  // Nicht sichtbar heißt: nicht rechnen.
  const onVisibility = (): void => (document.hidden ? stop() : start());

  resize();
  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", onVisibility, { passive: true });

  if (prefersReducedMotion()) {
    draw(0); // Ein statisches Bild reicht.
  } else {
    start();
  }

  return () => {
    stop();
    window.removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
