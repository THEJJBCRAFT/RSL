import "./styles.css";

import { ROUTES } from "./routes";
import { Router } from "./lib/router";
import { initNav } from "./lib/nav";
import { initPointerFx } from "./lib/motion";
import { startAurora } from "./lib/aurora";
import { startWorker } from "./ai/worker";
import { initClickSounds } from "./lib/sound";

const root = document.documentElement;

/** Gespeicherte Schalter aus den Einstellungen anwenden, bevor etwas sichtbar wird. */
function applyStoredSettings(): void {
  try {
    const saved = JSON.parse(localStorage.getItem("rsl.settings") ?? "{}") as Record<string, boolean>;
    if (saved.aurora === false) root.dataset.aurora = "off";
    if (saved.motion === false) root.dataset.motion = "off";
  } catch {
    /* fehlerhafte Daten einfach ignorieren */
  }
}

function q<T extends HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Element fehlt: ${selector}`);
  return el;
}

function boot(): void {
  applyStoredSettings();

  // Verlaufs-Definition für die Icons der aktiven Nav-Zeile.
  document.body.insertAdjacentHTML(
    "beforeend",
    `<svg width="0" height="0" aria-hidden="true" style="position:absolute">
       <defs>
         <linearGradient id="navGrad" x1="0" y1="0" x2="1" y2="1">
           <stop offset="0" stop-color="#8b6cff"/><stop offset="1" stop-color="#2ee6d6"/>
         </linearGradient>
       </defs>
     </svg>`,
  );

  initPointerFx();
  initClickSounds();
  // Render-Einheit für die Video-API: nimmt Aufträge entgegen, auch von außen.
  startWorker();
  startAurora(q<HTMLCanvasElement>("#aurora"));

  const router = new Router(
    q("#stage"),
    ROUTES.map((r) => ({ id: r.id, view: r.view })),
  );
  initNav(q("#nav"), q("#pill"), ROUTES, router);

  // Knöpfe der Startseite verdrahten - über Delegation, damit es bei
  // jedem Ansichtswechsel ohne erneutes Binden funktioniert.
  q("#stage").addEventListener("click", (e) => {
    const action = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-action]")?.dataset.action : null;
    if (action === "start") router.go("ai");
    if (action === "docs") router.go("info");
  });

  router.go(ROUTES[0]!.id);

  // Boot-Sequenz: Logo zeichnen, dann Shell aufblenden, dann Fenster zeigen.
  root.dataset.boot = "running";
  window.setTimeout(() => {
    root.dataset.boot = "done";
  }, 820);
}

// Erst rendern, dann anzeigen: so gibt es kein Aufblitzen.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
