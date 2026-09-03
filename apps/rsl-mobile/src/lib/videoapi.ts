/**
 * Auftragsverwaltung für RSL AI - App-interne Fassung.
 *
 * Am PC läuft dieselbe Oberfläche gegen einen lokalen HTTP-Dienst im Rust-Teil.
 * Auf dem Handy gibt es den nicht, also liegt die Warteschlange hier in der App.
 * Die Schnittstelle ist absichtlich Wort für Wort dieselbe geblieben: Die
 * Render-Einheit und die Ansicht merken den Unterschied nicht.
 *
 * Gerendert wird ohnehin im WebView (Canvas + MediaRecorder), nur die Verwaltung
 * der Aufträge und das fertige Video liegen jetzt im Arbeitsspeicher der App.
 */

export type JobState = "queued" | "rendering" | "done" | "failed";

export type JobRequest = {
  prompt: string;
  model: string;
  seconds: number;
  fps: number;
  width: number;
  height: number;
  seed?: number | null;
};

export type Job = {
  id: string;
  request: JobRequest;
  state: JobState;
  progress: number;
  error: string | null;
  created: number;
  finished: number | null;
  video: string | null;
  bytes: number | null;
  scene: unknown | null;
};

export type ModelCard = {
  id: string;
  name: string;
  family: string;
  version: string;
  focus: string;
  kind: string;
  status: string;
  description: string;
  limits: { max_seconds: number; max_fps: number; max_width: number; max_height: number };
  output: string;
};

const LIMITS = { max_seconds: 90, max_fps: 60, max_width: 1920, max_height: 1080 };
const SHORT_LIMITS = { max_seconds: 20, max_fps: 60, max_width: 1920, max_height: 1080 };

const MODELS: ModelCard[] = [
  {
    id: "ani0.0.4",
    name: "ani 0.0.4",
    family: "ani",
    version: "0.0.4",
    focus: "anime",
    kind: "prozedural-deterministisch",
    status: "vorschau",
    description:
      "Anime-Look-Fassung nach Studio-Vorbild: Cel-Shading mit hueverschobenen Schattenfarben, " +
      "Animation on twos (12 fps Figuren-Sampling), Impact-Frames, Smear-Frames, " +
      "Speedline-Hintergründe, Glow/Diffusion-Compositing und malerischere Hintergründe mit Tiefendunst.",
    limits: LIMITS,
    output: "video/webm",
  },
  {
    id: "ani0.0.3",
    name: "ani 0.0.3",
    family: "ani",
    version: "0.0.3",
    focus: "anime",
    kind: "prozedural-deterministisch",
    status: "vorschau",
    description:
      "Wie 0.0.2, aber mit vollwertigen Anime-Figuren in den Totalen: Gesichter mit Augen und Brauen, " +
      "Stachelfrisuren, Stirnband, Jacken mit Kragen und Gürtel, wütende Kampf-Mimik und Nachbilder beim Sprint.",
    limits: LIMITS,
    output: "video/webm",
  },
  {
    id: "ani0.0.2",
    name: "ani 0.0.2",
    family: "ani",
    version: "0.0.2",
    focus: "anime",
    kind: "prozedural-deterministisch",
    status: "vorschau",
    description:
      "Versteht neben einfachen Prompts auch ganze Drehbücher (Szene 1/2/3, Dialoge in Anführungszeichen, " +
      "Rollen Held/Freund/Gegner) und schneidet daraus einen Kurzfilm aus mehreren Einstellungen: " +
      "Kampf-Choreografie, Energiestrahlen, Schilde, Verwandlung, Zauberkreis, Finale. Untertitel für Dialogzeilen.",
    limits: LIMITS,
    output: "video/webm",
  },
  {
    id: "ani0.0.1",
    name: "ani 0.0.1",
    family: "ani",
    version: "0.0.1",
    focus: "anime",
    kind: "prozedural-deterministisch",
    status: "vorschau",
    description:
      "Erste Fassung. Liest den Prompt über ein Anime-Lexikon aus (Figur, Haare, Augen, Kleidung, Ort, " +
      "Tageszeit, Wetter, Stimmung, Kamera) und rendert daraus eine animierte Szene. " +
      "Gleicher Prompt und gleicher Seed ergeben exakt dasselbe Video.",
    limits: SHORT_LIMITS,
    output: "video/webm",
  },
];

const DEFAULTS = { model: "ani0.0.4", seconds: 6, fps: 30, width: 960, height: 540 };

const jobs = new Map<string, Job>();
/** Fertige Videos, damit die Ansicht sie abspielen und speichern kann. */
const blobs = new Map<string, Blob>();
const urls = new Map<string, string>();
let counter = 0;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function limitsFor(model: string): ModelCard["limits"] {
  return (MODELS.find((m) => m.id === model) ?? MODELS[0]!).limits;
}

export function listModels(): Promise<{ models: ModelCard[] }> {
  return Promise.resolve({ models: MODELS.map((m) => ({ ...m })) });
}

export function generate(body: Partial<JobRequest> & { prompt: string }): Promise<Job> {
  const model = MODELS.some((m) => m.id === body.model) ? body.model! : DEFAULTS.model;
  const lim = limitsFor(model);
  const request: JobRequest = {
    prompt: String(body.prompt ?? "").slice(0, 4000),
    model,
    seconds: clamp(Number(body.seconds ?? DEFAULTS.seconds), 1, lim.max_seconds),
    fps: clamp(Number(body.fps ?? DEFAULTS.fps), 1, lim.max_fps),
    width: clamp(Number(body.width ?? DEFAULTS.width), 64, lim.max_width),
    height: clamp(Number(body.height ?? DEFAULTS.height), 64, lim.max_height),
    seed: body.seed ?? null,
  };
  const job: Job = {
    id: `job-${Date.now().toString(36)}-${++counter}`,
    request,
    state: "queued",
    progress: 0,
    error: null,
    created: Date.now(),
    finished: null,
    video: null,
    bytes: null,
    scene: null,
  };
  jobs.set(job.id, job);
  return Promise.resolve({ ...job });
}

export function getJob(id: string): Promise<Job> {
  const job = jobs.get(id);
  if (!job) return Promise.reject(new Error("Auftrag nicht gefunden"));
  return Promise.resolve({ ...job });
}

export function listJobs(): Promise<{ jobs: Job[] }> {
  const all = [...jobs.values()].sort((a, b) => b.created - a.created).map((j) => ({ ...j }));
  return Promise.resolve({ jobs: all });
}

export function deleteJob(id: string): Promise<void> {
  const url = urls.get(id);
  if (url) URL.revokeObjectURL(url);
  urls.delete(id);
  blobs.delete(id);
  jobs.delete(id);
  return Promise.resolve();
}

/* --------------------- nur für die Render-Einheit ------------------------ */

export function claimJob(): Promise<{ job: Job | null }> {
  for (const job of [...jobs.values()].sort((a, b) => a.created - b.created)) {
    if (job.state === "queued") {
      job.state = "rendering";
      job.progress = 0;
      return Promise.resolve({ job: { ...job } });
    }
  }
  return Promise.resolve({ job: null });
}

export function reportProgress(id: string, progress: number, scene?: unknown): Promise<void> {
  const job = jobs.get(id);
  if (job) {
    job.progress = clamp(Number(progress) || 0, 0, 1);
    if (scene !== undefined) job.scene = scene;
  }
  return Promise.resolve();
}

export function reportError(id: string, message: string): Promise<void> {
  const job = jobs.get(id);
  if (job) {
    job.state = "failed";
    job.error = message;
    job.finished = Date.now();
  }
  return Promise.resolve();
}

export function uploadResult(id: string, blob: Blob): Promise<Job> {
  const job = jobs.get(id);
  if (!job) return Promise.reject(new Error("Auftrag nicht gefunden"));
  const previous = urls.get(id);
  if (previous) URL.revokeObjectURL(previous);
  blobs.set(id, blob);
  urls.set(id, URL.createObjectURL(blob));
  job.state = "done";
  job.progress = 1;
  job.bytes = blob.size;
  job.video = `/videos/${id}.webm`;
  job.finished = Date.now();
  return Promise.resolve({ ...job });
}

export function videoUrl(job: Job): Promise<string | null> {
  return Promise.resolve(urls.get(job.id) ?? null);
}

/** Das fertige Video als Datei - zum Speichern über die Android-Hülle. */
export function videoBlob(id: string): Blob | null {
  return blobs.get(id) ?? null;
}
