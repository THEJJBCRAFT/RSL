import type { View } from "../lib/router";

type Toggle = { key: string; title: string; text: string; on: boolean };

const TOGGLES: Toggle[] = [
  { key: "motion", title: "Animationen", text: "Übergänge und Hintergrundbewegung", on: true },
  { key: "aurora", title: "Hintergrundlicht", text: "Weiche Farbflächen hinter der Oberfläche", on: true },
  { key: "sound", title: "Klickgeräusche", text: "Dezente Klicks bei Knöpfen, Menü und Schaltern", on: true },
];

const STORE = "rsl.settings";

function load(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

function save(state: Record<string, boolean>): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
  } catch {
    /* Speichern ist hier kein kritischer Pfad */
  }
}

export function settings(): View {
  const state = load();

  return {
    html: `
      <div class="head stagger">
        <span class="eyebrow">Verhalten</span>
        <h1>Einstellungen</h1>
        <p class="lead">
          Die Schalter merken sich ihren Zustand auf dem Gerät. Wer Akku sparen
          oder es ruhiger mag, schaltet Hintergrundlicht und Animationen ab.
        </p>
      </div>

      <div class="panel stagger">
        ${TOGGLES.map((t) => {
          const on = state[t.key] ?? t.on;
          return `
          <div class="setting">
            <div class="setting__txt"><strong>${t.title}</strong><span>${t.text}</span></div>
            <button class="switch" role="switch" data-key="${t.key}" aria-checked="${on}" aria-label="${t.title}"></button>
          </div>`;
        }).join("")}
      </div>
    `,
    mount(root) {
      root.addEventListener("click", (e) => {
        const sw = e.target instanceof Element ? e.target.closest<HTMLElement>(".switch") : null;
        const key = sw?.dataset.key;
        if (!sw || !key) return;

        const next = sw.getAttribute("aria-checked") !== "true";
        sw.setAttribute("aria-checked", String(next));
        state[key] = next;
        save(state);

        // Zwei Schalter greifen direkt in die Darstellung ein.
        if (key === "aurora") document.documentElement.dataset.aurora = next ? "on" : "off";
        if (key === "motion") document.documentElement.dataset.motion = next ? "on" : "off";
      });
    },
  };
}
