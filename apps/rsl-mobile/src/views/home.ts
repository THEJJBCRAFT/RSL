import type { View } from "../lib/router";
import { countUp } from "../lib/motion";

const CARDS = [
  {
    icon: '<path d="M13 2 4.5 13H11l-1 9 8.5-11H12l1-9Z"/>',
    title: "Sofort startklar",
    text: "Menü, Übergänge und Bühne sind fertig verdrahtet. Neue Bereiche kommen als eine Datei dazu.",
  },
  {
    icon: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 2"/>',
    title: "60 Bilder pro Sekunde",
    text: "Animiert wird ausschließlich über transform und opacity - der Compositor macht die Arbeit, nicht der Hauptthread.",
  },
  {
    icon: '<path d="M12 3l7.5 4v6c0 4.4-3.1 7.5-7.5 8.5C7.6 20.5 4.5 17.4 4.5 13V7L12 3Z"/><path d="m9 12 2.2 2.2L15.4 10"/>',
    title: "Läuft ohne Server",
    text: "Alles passiert auf dem Gerät: Die Videos werden hier gerendert, nichts wird hochgeladen.",
  },
  {
    icon: '<path d="M4 16.5 12 21l8-4.5"/><path d="M4 12 12 16.5 20 12"/><path d="M12 3 4 7.5 12 12l8-4.5L12 3Z"/>',
    title: "Platz nach oben",
    text: "Die Struktur ist so gebaut, dass weitere Bereiche - etwa die AFK-Wache per Fernsteuerung - später dazukommen.",
  },
];

export function home(): View {
  return {
    html: `
      <div class="head stagger">
        <span class="eyebrow">Content Cr3w</span>
        <h1>Willkommen bei <span class="grad">RSL</span></h1>
        <p class="lead">
          Dieselbe Oberfläche wie am Rechner, nur fürs Handy gebaut: Menü unten im
          Daumenbereich, große Flächen zum Antippen, gleiche Farben und Bewegungen.
        </p>
      </div>

      <div class="row stagger">
        <button class="btn btn--primary btn--lg" data-fx data-magnet="6" data-action="start">
          Zur RSL AI
          <svg class="btn__icon" viewBox="0 0 24 24"><path d="M5 12h13"/><path d="m12.5 6 6 6-6 6"/></svg>
        </button>
        <button class="btn btn--lg btn--ghost" data-fx data-magnet="4" data-action="docs">
          Über die App
        </button>
      </div>

      <div class="stats stagger">
        <div class="stat"><div class="stat__val" data-count="5">0</div><div class="stat__lbl">Bereiche</div></div>
        <div class="stat"><div class="stat__val" data-count="60">0</div><div class="stat__lbl">FPS Ziel</div></div>
        <div class="stat"><div class="stat__val" data-count="0">0</div><div class="stat__lbl">Laufzeit-Pakete</div></div>
        <div class="stat"><div class="stat__val" data-count="4">0</div><div class="stat__lbl">KI-Modelle</div></div>
      </div>

      <div class="grid">
        ${CARDS.map(
          (c) => `
          <article class="card stagger" data-fx>
            <div class="card__icon"><svg viewBox="0 0 24 24">${c.icon}</svg></div>
            <h3>${c.title}</h3>
            <p>${c.text}</p>
          </article>`,
        ).join("")}
      </div>
    `,
    mount(root) {
      // Zahlen laufen erst hoch, wenn die Karte eingeflogen ist.
      window.setTimeout(() => {
        root.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
          countUp(el, Number(el.dataset.count ?? 0));
        });
      }, 260);
    },
  };
}
