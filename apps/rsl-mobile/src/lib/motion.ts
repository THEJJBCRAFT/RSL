/**
 * Zentrale Motion-Helfer.
 *
 * Zwei Regeln halten die App flüssig:
 *  - Es wird nur `transform` und `opacity` animiert.
 *  - Zeiger-Effekte laufen über genau einen delegierten Listener und ein rAF.
 */

const reduceQuery = matchMedia("(prefers-reduced-motion: reduce)");

export function prefersReducedMotion(): boolean {
  return reduceQuery.matches;
}

export const EASE_OUT = "cubic-bezier(.16,1,.3,1)";
export const EASE_IN_OUT = "cubic-bezier(.65,0,.35,1)";

/** Wie `Element.animate`, respektiert aber die Systemeinstellung. */
export function animate(
  el: Element,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): Animation {
  const opts = prefersReducedMotion() ? { ...options, duration: 1, delay: 0 } : options;
  return el.animate(keyframes, opts);
}

/* ------------------------------------------------------------------ */
/* Zeiger-Effekte: Glanzpunkt (--mx/--my) und magnetischer Zug (--dx/--dy) */
/* ------------------------------------------------------------------ */

let queued = false;
let lastX = 0;
let lastY = 0;
let lastTarget: Element | null = null;
let hovered: HTMLElement | null = null;
let hoveredRect: DOMRect | null = null;

function clearFx(el: HTMLElement): void {
  el.style.removeProperty("--mx");
  el.style.removeProperty("--my");
  el.style.removeProperty("--dx");
  el.style.removeProperty("--dy");
}

function flush(): void {
  queued = false;
  // Das Event-Ziel reicht - kein elementFromPoint, das würde Layout erzwingen.
  const el = lastTarget ? lastTarget.closest<HTMLElement>("[data-fx]") : null;

  if (el !== hovered) {
    if (hovered) clearFx(hovered);
    hovered = el;
    hoveredRect = el ? el.getBoundingClientRect() : null;
  }
  if (!el || !hoveredRect) return;

  const r = hoveredRect;
  const x = lastX - r.left;
  const y = lastY - r.top;
  el.style.setProperty("--mx", `${x.toFixed(1)}px`);
  el.style.setProperty("--my", `${y.toFixed(1)}px`);

  // Magnetischer Zug: der Button folgt dem Cursor ein paar Pixel weit.
  const magnet = Number(el.dataset.magnet ?? 0);
  if (magnet > 0 && !prefersReducedMotion()) {
    const dx = (x / r.width - 0.5) * magnet * 2;
    const dy = (y / r.height - 0.5) * magnet * 2;
    el.style.setProperty("--dx", `${dx.toFixed(2)}px`);
    el.style.setProperty("--dy", `${dy.toFixed(2)}px`);
  }
}

function onPointerMove(e: PointerEvent): void {
  lastX = e.clientX;
  lastY = e.clientY;
  lastTarget = e.target instanceof Element ? e.target : null;
  if (queued) return;
  queued = true;
  requestAnimationFrame(flush);
}

function invalidate(): void {
  hoveredRect = hovered ? hovered.getBoundingClientRect() : null;
}

function onPointerDown(e: PointerEvent): void {
  const target = e.target instanceof Element ? e.target.closest<HTMLElement>(".btn") : null;
  if (!target || prefersReducedMotion()) return;
  spawnRipple(target, e.clientX, e.clientY);
}

function spawnRipple(host: HTMLElement, clientX: number, clientY: number): void {
  const r = host.getBoundingClientRect();
  const size = Math.hypot(r.width, r.height) * 2;
  const ripple = document.createElement("span");
  ripple.className = "ripple";
  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${clientX - r.left}px`;
  ripple.style.top = `${clientY - r.top}px`;
  host.appendChild(ripple);

  ripple
    .animate(
      [
        { transform: "translate(-50%,-50%) scale(0)", opacity: 0.5 },
        { transform: "translate(-50%,-50%) scale(1)", opacity: 0 },
      ],
      { duration: 620, easing: EASE_OUT },
    )
    .addEventListener("finish", () => ripple.remove(), { once: true });
}

/** Einmal beim Start aufrufen. Danach genügt `data-fx` am Element. */
export function initPointerFx(): void {
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("resize", invalidate, { passive: true });
  // Rechtecke werden beim Scrollen ungültig -> in der Capture-Phase mitnehmen.
  window.addEventListener("scroll", invalidate, { passive: true, capture: true });
  window.addEventListener(
    "blur",
    () => {
      if (hovered) clearFx(hovered);
      hovered = null;
      hoveredRect = null;
    },
    { passive: true },
  );
}

/** Zählt eine Zahl weich hoch. Wird für die Kennzahlen benutzt. */
export function countUp(el: HTMLElement, to: number, duration = 1100): void {
  if (prefersReducedMotion()) {
    el.textContent = String(to);
    return;
  }
  const start = performance.now();
  const step = (now: number): void => {
    const p = Math.min(1, (now - start) / duration);
    // easeOutExpo
    const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
    el.textContent = Math.round(to * eased).toLocaleString("de-DE");
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
