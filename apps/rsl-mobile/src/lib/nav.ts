import type { Route } from "../routes";
import type { Router } from "./router";

/**
 * Baut das Menü am unteren Rand und führt die Markierungs-Pille.
 * Die Pille ist ein einziges Element, das nur per `transform` wandert.
 */
export function initNav(navRoot: HTMLElement, pill: HTMLElement, routes: Route[], router: Router): void {
  const frag = document.createDocumentFragment();

  routes.forEach((route, i) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "navitem";
    item.dataset.route = route.id;
    item.dataset.fx = "";
    item.style.setProperty("--i", String(i));
    item.innerHTML =
      `<svg class="navitem__icon" viewBox="0 0 24 24">${route.icon}</svg>` + `<span>${route.label}</span>`;
    frag.appendChild(item);
  });

  navRoot.appendChild(frag);

  const items = Array.from(navRoot.querySelectorAll<HTMLElement>(".navitem"));

  const movePill = (id: string): void => {
    const item = items.find((n) => n.dataset.route === id);
    // Bereiche ausserhalb des Menues (z. B. das Konto) markieren kein Feld.
    pill.dataset.off = item ? "" : "true";
    if (!item) {
      items.forEach((n) => n.removeAttribute("aria-current"));
      return;
    }
    pill.style.setProperty("--pill-w", `${item.offsetWidth}px`);
    pill.style.setProperty("--pill-x", `${item.offsetLeft}px`);
    items.forEach((n) => {
      if (n === item) n.setAttribute("aria-current", "page");
      else n.removeAttribute("aria-current");
    });
  };

  navRoot.addEventListener("click", (e) => {
    const item = e.target instanceof Element ? e.target.closest<HTMLElement>(".navitem") : null;
    const id = item?.dataset.route;
    if (id) router.go(id);
  });

  // Am Rechner (Browser-Vorschau) springen die Ziffern 1-9 direkt in den Bereich.
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const target = e.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    const n = Number(e.key);
    if (!Number.isInteger(n) || n < 1 || n > routes.length) return;
    const route = routes[n - 1];
    if (route) router.go(route.id);
  });

  router.onChange(movePill);

  // Beim ersten Setzen darf die Pille nicht von links hereinrutschen.
  requestAnimationFrame(() => {
    movePill(router.current);
    requestAnimationFrame(() => pill.classList.add("is-armed"));
  });

  // Drehen des Geräts ändert die Breite der Felder - die Pille zieht mit.
  window.addEventListener("resize", () => movePill(router.current), { passive: true });
}
