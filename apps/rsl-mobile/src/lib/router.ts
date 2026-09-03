import { fromHTML, stagger } from "./dom";
import { animate, EASE_IN_OUT, EASE_OUT } from "./motion";

export type View = {
  html: string;
  /** Wird aufgerufen, sobald die Ansicht im Dokument hängt. */
  mount?: (root: HTMLElement) => void;
  /** Aufräumen beim Verlassen (Timer, Listener). */
  unmount?: () => void;
};

type Entry = { id: string; view: () => View };

export class Router {
  private readonly stage: HTMLElement;
  private readonly entries: Entry[];
  private readonly listeners = new Set<(id: string) => void>();

  private currentId = "";
  private currentEl: HTMLElement | null = null;
  private currentView: View | null = null;
  /** Zähler gegen Wettläufe bei sehr schnellen Klicks. */
  private token = 0;

  constructor(stage: HTMLElement, entries: Entry[]) {
    this.stage = stage;
    this.entries = entries;
  }

  onChange(fn: (id: string) => void): void {
    this.listeners.add(fn);
  }

  get current(): string {
    return this.currentId;
  }

  indexOf(id: string): number {
    return this.entries.findIndex((e) => e.id === id);
  }

  go(id: string): void {
    if (id === this.currentId) return;
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) return;

    const dir = this.currentId === "" ? 0 : Math.sign(this.indexOf(id) - this.indexOf(this.currentId));
    const run = ++this.token;

    const prevEl = this.currentEl;
    const prevView = this.currentView;

    const view = entry.view();
    const el = fromHTML(`<section class="view" data-view="${id}">${view.html}</section>`);
    stagger(el);
    this.stage.appendChild(el);
    view.mount?.(el);

    this.currentId = id;
    this.currentEl = el;
    this.currentView = view;
    this.listeners.forEach((fn) => fn(id));

    // Die alte Ansicht räumt sich selbst ab, sobald sie ausgeblendet ist.
    if (prevEl) {
      prevEl.classList.add("view--leaving");
      const out = animate(
        prevEl,
        [
          { opacity: 1, transform: "translate3d(0,0,0)" },
          { opacity: 0, transform: `translate3d(0,${dir >= 0 ? -14 : 14}px,0)` },
        ],
        { duration: 200, easing: EASE_IN_OUT, fill: "forwards" },
      );
      out.addEventListener(
        "finish",
        () => {
          prevView?.unmount?.();
          prevEl.remove();
        },
        { once: true },
      );
    }

    const enter = animate(
      el,
      [
        { opacity: 0, transform: `translate3d(0,${dir <= 0 ? -16 : 16}px,0)` },
        { opacity: 1, transform: "translate3d(0,0,0)" },
      ],
      { duration: 420, easing: EASE_OUT },
    );

    // Erst wenn die Ansicht sitzt, starten die gestaffelten Kind-Animationen.
    requestAnimationFrame(() => {
      if (run !== this.token) return;
      el.classList.add("view--entered");
    });

    enter.addEventListener("finish", () => el.style.removeProperty("will-change"), { once: true });
  }
}
