/**
 * Nimmt eine Szene als webm auf.
 *
 * Aufgezeichnet wird in Echtzeit über `captureStream` — dadurch stimmt die
 * Laufzeit des fertigen Videos exakt, auch wenn ein einzelnes Bild mal länger
 * braucht. Die Bewegung hängt an der verstrichenen Zeit, nicht an der Bildnummer.
 */

import type { Renderer } from "./render";

export type RenderOptions = {
  width: number;
  height: number;
  fps: number;
  seconds: number;
};

function pickMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return "video/webm";
}

export function isRecordingSupported(): boolean {
  return typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function";
}

export async function renderToWebm(
  renderer: Renderer,
  opts: RenderOptions,
  onProgress?: (p: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  if (!isRecordingSupported()) throw new Error("Diese Umgebung kann kein Video aufnehmen");

  const canvas = document.createElement("canvas");
  canvas.width = opts.width;
  canvas.height = opts.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Kein 2D-Kontext verfügbar");

  // Erstes Bild vor dem Start, damit die Aufnahme nicht mit Schwarz beginnt.
  renderer.draw(ctx, 0, opts.seconds);

  const stream = canvas.captureStream(opts.fps);
  const mimeType = pickMimeType();
  const bitrate = Math.round(opts.width * opts.height * opts.fps * 0.14);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    recorder.onerror = () => reject(new Error("Aufnahme fehlgeschlagen"));
  });

  recorder.start(200);

  const started = performance.now();
  await new Promise<void>((resolve, reject) => {
    const step = (): void => {
      if (signal?.aborted) {
        reject(new Error("abgebrochen"));
        return;
      }
      const elapsed = (performance.now() - started) / 1000;
      if (elapsed >= opts.seconds) {
        renderer.draw(ctx, opts.seconds, opts.seconds);
        onProgress?.(1);
        resolve();
        return;
      }
      renderer.draw(ctx, elapsed, opts.seconds);
      onProgress?.(elapsed / opts.seconds);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }).catch((err) => {
    recorder.stop();
    stream.getTracks().forEach((t) => t.stop());
    throw err;
  });

  // Dem Rekorder einen Moment lassen, damit das letzte Bild noch mitkommt.
  await new Promise((r) => setTimeout(r, Math.max(120, 1000 / opts.fps)));
  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());
  return finished;
}

/** Endlosschleife für die Live-Vorschau im Modul. */
export function startPreview(canvas: HTMLCanvasElement, renderer: Renderer, seconds: number): () => void {
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return () => {};
  let raf = 0;
  let stopped = false;
  const t0 = performance.now();

  const loop = (): void => {
    if (stopped) return;
    const t = ((performance.now() - t0) / 1000) % seconds;
    renderer.draw(ctx, t, seconds);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}
