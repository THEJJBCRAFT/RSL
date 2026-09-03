/**
 * Render-Einheit.
 *
 * Läuft im Hintergrund der App, holt sich wartende Aufträge von der API,
 * rendert sie mit ani0.0.1 und liefert das Ergebnis zurück. Aufträge von außen
 * (curl, ein anderes Programm) landen genauso hier wie die aus dem Menü.
 */

import { buildRenderer } from "./model";
import { renderToWebm } from "./recorder";
import { claimJob, reportError, reportProgress, uploadResult, type Job } from "../lib/videoapi";

const IDLE_MS = 800;

type Listener = (job: Job, phase: "start" | "progress" | "done" | "error") => void;

let running = false;
let busy = false;
const listeners = new Set<Listener>();

export function onWorkerEvent(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(job: Job, phase: Parameters<Listener>[1]): void {
  listeners.forEach((fn) => fn(job, phase));
}

async function handle(job: Job): Promise<void> {
  const r = job.request;
  const built = buildRenderer(r.prompt, r.seed ?? undefined, r.width, r.height);
  // Ein Drehbuch bringt seine Laenge selbst mit.
  const seconds = built.seconds ?? r.seconds;
  emit(job, "start");

  try {
    await reportProgress(job.id, 0, { ...built.scene, tags: built.tags });
    let lastSent = 0;
    const blob = await renderToWebm(
      built.renderer,
      { width: r.width, height: r.height, fps: r.fps, seconds },
      (p) => {
        job.progress = p;
        emit(job, "progress");
        // Nicht jeden Frame melden - alle 4 % reicht völlig.
        if (p - lastSent >= 0.04 || p === 1) {
          lastSent = p;
          void reportProgress(job.id, p).catch(() => {});
        }
      },
    );
    const done = await uploadResult(job.id, blob);
    emit(done, "done");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await reportError(job.id, message).catch(() => {});
    emit({ ...job, state: "failed", error: message }, "error");
  }
}

async function tick(): Promise<void> {
  if (!running || busy) return;
  busy = true;
  try {
    const { job } = await claimJob();
    if (job) await handle(job);
  } catch {
    // API nicht erreichbar - beim nächsten Durchlauf erneut versuchen.
  } finally {
    busy = false;
  }
}

export function startWorker(): () => void {
  if (running) return () => {};
  running = true;
  const timer = window.setInterval(() => void tick(), IDLE_MS);
  void tick();
  return () => {
    running = false;
    window.clearInterval(timer);
  };
}
