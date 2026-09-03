import type { View } from "../lib/router";
import { buildRenderer, type Built } from "../ai/model";
import { makeScreenplay } from "../ai/script";
import { startPreview } from "../ai/recorder";
import { onWorkerEvent } from "../ai/worker";
import * as api from "../lib/videoapi";
import { IS_NATIVE, saveVideo, canShareVideo, shareVideo } from "../lib/native";

const EXAMPLE = "Anime-Mädchen mit langen rosa Haaren und blauen Augen, Schuluniform, Dach, Sonnenuntergang, Kirschblüten, ruhig, langsamer Zoom";

const CHIPS = [
  "Anime-Mädchen",
  "lange rosa Haare",
  "blaue Augen",
  "Schuluniform",
  "Kimono",
  "Katzenohren",
  "Dach",
  "Tokyo bei Nacht",
  "Wald",
  "Strand",
  "Weltraum",
  "Sonnenuntergang",
  "Kirschblüten",
  "Regen",
  "Schnee",
  "episch",
  "fröhlich",
  "langsamer Zoom",
];

const PRESETS = [
  { w: 640, h: 360, label: "640 × 360" },
  { w: 854, h: 480, label: "854 × 480" },
  { w: 1280, h: 720, label: "1280 × 720" },
];

function fmtBytes(n: number | null): string {
  if (!n) return "–";
  return n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} kB`;
}

export function ai(): View {
  let stopPreview: (() => void) | null = null;
  let stopWorkerEvents: (() => void) | null = null;
  let debounce = 0;
  let poll = 0;
  let built: Built | null = null;
  let busy = false;
  /** Letztes fertiges Video - fuer den Speichern-Knopf. */
  let lastResultId: string | null = null;

  return {
    html: `
      <div class="head stagger">
        <span class="eyebrow">Generativ</span>
        <h1>RSL <span class="grad">AI</span></h1>
        <p class="lead">
          Prompt eingeben, Modell wählen, erzeugen. Gerendert wird direkt auf dem
          Gerät — nichts wird hochgeladen, kein Konto nötig.
        </p>
      </div>

      <div class="modelbar stagger">
        <div class="modelbar__id">
          <strong>ani0.0.4</strong>
          <span class="tag">Vorschau</span>
          <span class="tag">nur Anime</span>
          <span class="tag">versteht Drehbücher</span>
        </div>
        <div class="modelbar__api">
          <span class="status__led" aria-hidden="true"></span>
          <span id="apiState">Warteschlange in der App</span>
        </div>
      </div>

      <div class="studio stagger">
        <section class="studio__left">
          <label class="field">
            <span class="field__lbl">Prompt</span>
            <textarea id="prompt" class="input input--area" rows="4"
              placeholder="${EXAMPLE}" spellcheck="false">${EXAMPLE}</textarea>
          </label>

          <div class="chips" id="chips">
            ${CHIPS.map((c) => `<button type="button" class="chip" data-chip="${c}">${c}</button>`).join("")}
          </div>

          <div class="controls">
            <label class="field">
              <span class="field__lbl">Länge</span>
              <select class="input" id="secs">
                <option value="3">3 s</option>
                <option value="5" selected>5 s</option>
                <option value="8">8 s</option>
                <option value="12">12 s</option>
              </select>
            </label>
            <label class="field">
              <span class="field__lbl">Bildrate</span>
              <select class="input" id="fps">
                <option value="24" selected>24 fps</option>
                <option value="30">30 fps</option>
                <option value="60">60 fps</option>
              </select>
            </label>
            <label class="field">
              <span class="field__lbl">Auflösung</span>
              <select class="input" id="res">
                ${PRESETS.map((p, i) => `<option value="${i}"${i === 1 ? " selected" : ""}>${p.label}</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span class="field__lbl">Seed</span>
              <div class="seedrow">
                <input class="input" id="seed" type="number" min="0" step="1" placeholder="aus Prompt" />
                <button class="btn btn--icon" id="dice" title="Zufälliger Seed" data-fx>
                  <svg class="btn__icon" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 9h.01M15 15h.01M15 9h.01M9 15h.01"/></svg>
                </button>
              </div>
            </label>
          </div>

          <div class="row">
            <button class="btn btn--primary btn--lg" id="go" data-fx data-magnet="6">
              Video erzeugen
              <svg class="btn__icon" viewBox="0 0 24 24"><path d="M6 4.5v15l13-7.5-13-7.5Z"/></svg>
            </button>
            <button class="btn btn--ghost" id="mkScript" data-fx title="Baut aus der aktuellen Eingabe ein komplettes Drehbuch">Drehbuch erzeugen</button>
            <button class="btn btn--ghost" id="saveVideo" data-fx>Video speichern</button>
            <button class="btn btn--ghost" id="shareVideo" data-fx hidden>Teilen</button>
          </div>

          <div class="progress" id="progress" hidden>
            <div class="progress__bar"><span id="progressFill"></span></div>
            <span class="progress__txt" id="progressTxt">0 %</span>
          </div>
        </section>

        <section class="studio__right">
          <div class="viewer">
            <canvas id="preview" width="854" height="480"></canvas>
            <video id="result" controls loop hidden playsinline></video>
            <span class="viewer__badge" id="viewerBadge">Live-Vorschau</span>
          </div>
          <div class="scenetags" id="sceneTags"></div>
        </section>
      </div>

      <h3 class="section stagger">Aufträge</h3>
      <div class="panel stagger" id="jobs"><div class="setting"><div class="setting__txt"><span>Noch nichts erzeugt.</span></div></div></div>
    `,

    mount(root) {
      const $ = <T extends HTMLElement>(sel: string): T => root.querySelector<T>(sel)!;
      const promptEl = $<HTMLTextAreaElement>("#prompt");
      const previewCanvas = $<HTMLCanvasElement>("#preview");
      const video = $<HTMLVideoElement>("#result");
      const badge = $("#viewerBadge");
      const tagsEl = $("#sceneTags");
      const progress = $("#progress");
      const fill = $("#progressFill");
      const progressTxt = $("#progressTxt");
      const goBtn = $<HTMLButtonElement>("#go");
      const jobsEl = $("#jobs");

      /* ------------------------- Live-Vorschau ------------------------- */

      const refreshPreview = (): void => {
        stopPreview?.();
        const seedRaw = $<HTMLInputElement>("#seed").value.trim();
        const seed = seedRaw === "" ? undefined : Number(seedRaw);
        built = buildRenderer(
          promptEl.value || EXAMPLE,
          Number.isFinite(seed) ? seed : undefined,
          previewCanvas.width,
          previewCanvas.height,
        );
        tagsEl.innerHTML = built.tags.map((t) => `<span class="tag">${t}</span>`).join("");
        if (!busy) {
          video.hidden = true;
          previewCanvas.hidden = false;
          const secs = built.seconds ?? Number($<HTMLSelectElement>("#secs").value);
          badge.textContent = built.storyboard
            ? `Live-Vorschau · Drehbuch · ${built.storyboard.shots.length} Einstellungen · ${Math.round(secs)} s`
            : "Live-Vorschau";
          stopPreview = startPreview(previewCanvas, built.renderer, secs);
        }
      };

      const schedulePreview = (): void => {
        window.clearTimeout(debounce);
        debounce = window.setTimeout(refreshPreview, 320);
      };

      promptEl.addEventListener("input", schedulePreview);
      $("#seed").addEventListener("input", schedulePreview);
      $("#secs").addEventListener("change", refreshPreview);

      $("#chips").addEventListener("click", (e) => {
        const chip = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-chip]") : null;
        if (!chip) return;
        const value = chip.dataset.chip!;
        const cur = promptEl.value.trim();
        promptEl.value = cur ? `${cur}, ${value}` : value;
        refreshPreview();
      });

      $("#mkScript").addEventListener("click", () => {
        // Die aktuelle Eingabe wird als Idee benutzt; ist sie schon ein
        // Drehbuch, passiert nichts.
        if (built?.storyboard) return;
        promptEl.value = makeScreenplay(promptEl.value === EXAMPLE ? "" : promptEl.value);
        refreshPreview();
      });

      $("#dice").addEventListener("click", () => {
        $<HTMLInputElement>("#seed").value = String(Math.floor(Math.random() * 1_000_000));
        refreshPreview();
      });

      /* ---------------------------- Aufträge ---------------------------- */

      const renderJobs = (jobs: api.Job[]): void => {
        if (!jobs.length) {
          jobsEl.innerHTML = `<div class="setting"><div class="setting__txt"><span>Noch nichts erzeugt.</span></div></div>`;
          return;
        }
        jobsEl.innerHTML = jobs
          .slice(0, 8)
          .map(
            (j) => `
          <div class="setting" data-job="${j.id}">
            <div class="setting__txt">
              <strong>${j.request.prompt.slice(0, 68)}${j.request.prompt.length > 68 ? "…" : ""}</strong>
              <span>${j.request.width}×${j.request.height} · ${j.request.seconds} s · ${j.request.fps} fps · ${fmtBytes(j.bytes)}</span>
            </div>
            <span class="tag tag--${j.state}">${j.state}</span>
            ${j.state === "done" ? `<button class="btn btn--sm" data-play="${j.id}" data-fx>Ansehen</button>` : ""}
          </div>`,
          )
          .join("");
      };

      const refreshJobs = (): void => {
        void api
          .listJobs()
          .then((r) => renderJobs(r.jobs))
          .catch(() => {});
      };

      jobsEl.addEventListener("click", (e) => {
        const id = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-play]")?.dataset.play : null;
        if (!id) return;
        void api.getJob(id).then(showResult);
      });

      const showResult = async (job: api.Job): Promise<void> => {
        const url = await api.videoUrl(job);
        if (!url) return;
        lastResultId = job.id;
        stopPreview?.();
        stopPreview = null;
        previewCanvas.hidden = true;
        video.hidden = false;
        video.src = url;
        badge.textContent = `Ergebnis · ${fmtBytes(job.bytes)}`;
        void video.play().catch(() => {});
      };

      /* --------------------------- Erzeugen ---------------------------- */

      const setProgress = (p: number): void => {
        progress.hidden = false;
        fill.style.transform = `scaleX(${Math.max(0.02, p).toFixed(3)})`;
        progressTxt.textContent = `${Math.round(p * 100)} %`;
      };

      goBtn.addEventListener("click", () => {
        if (busy) return;
        const preset = PRESETS[Number($<HTMLSelectElement>("#res").value)]!;
        const seedRaw = $<HTMLInputElement>("#seed").value.trim();
        const body = {
          prompt: promptEl.value.trim() || EXAMPLE,
          model: "ani0.0.4",
          seconds: Number($<HTMLSelectElement>("#secs").value),
          fps: Number($<HTMLSelectElement>("#fps").value),
          width: preset.w,
          height: preset.h,
          ...(seedRaw === "" ? {} : { seed: Number(seedRaw) }),
        };

        busy = true;
        goBtn.disabled = true;
        goBtn.textContent = "läuft …";
        // Die Vorschau anhalten, damit die Aufnahme die volle Bildrate bekommt.
        stopPreview?.();
        stopPreview = null;
        badge.textContent = "wird gerendert …";
        setProgress(0);

        void api
          .generate(body)
          .then((job) => {
            window.clearInterval(poll);
            poll = window.setInterval(() => {
              void api
                .getJob(job.id)
                .then((j) => {
                  setProgress(j.progress);
                  if (j.state === "done") {
                    window.clearInterval(poll);
                    finish();
                    void showResult(j);
                    refreshJobs();
                  } else if (j.state === "failed") {
                    window.clearInterval(poll);
                    finish();
                    badge.textContent = `Fehler: ${j.error ?? "unbekannt"}`;
                    refreshJobs();
                  }
                })
                .catch(() => {});
            }, 250);
            refreshJobs();
          })
          .catch((err: unknown) => {
            finish();
            badge.textContent = `API nicht erreichbar: ${err instanceof Error ? err.message : String(err)}`;
          });
      });

      const finish = (): void => {
        busy = false;
        goBtn.disabled = false;
        goBtn.innerHTML = `Video erzeugen <svg class="btn__icon" viewBox="0 0 24 24"><path d="M6 4.5v15l13-7.5-13-7.5Z"/></svg>`;
        progress.hidden = true;
      };

      // Auf dem Handy gibt es keinen Ordner zum Oeffnen: Das fertige Video wandert
      // auf Wunsch in die Galerie (Filme/RSL), von dort laesst es sich teilen.
      const shareBtn = $("#shareVideo") as HTMLButtonElement;
      shareBtn.hidden = !canShareVideo();

      $("#saveVideo").addEventListener("click", () => {
        const blob = lastResultId ? api.videoBlob(lastResultId) : null;
        if (!blob) {
          badge.textContent = "Erst ein Video erzeugen";
          return;
        }
        if (!IS_NATIVE) {
          badge.textContent = "Speichern geht nur in der App";
          return;
        }
        badge.textContent = "wird gespeichert \u2026";
        void saveVideo(`rsl-${lastResultId}.webm`, blob).then((r) => {
          badge.textContent = r.message;
          shareBtn.hidden = !r.ok;
        });
      });

      shareBtn.addEventListener("click", () => shareVideo());

      /* ---------------------------- Zustand ---------------------------- */

      stopWorkerEvents = onWorkerEvent((job, phase) => {
        if (phase === "progress") setProgress(job.progress);
      });

      const apiState = root.querySelector("#apiState");
      if (apiState) apiState.textContent = "Warteschlange in der App";

      refreshPreview();
      refreshJobs();
    },

    unmount() {
      stopPreview?.();
      stopWorkerEvents?.();
      window.clearTimeout(debounce);
      window.clearInterval(poll);
    },
  };
}
