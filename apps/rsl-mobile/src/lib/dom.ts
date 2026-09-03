/** Baut aus einem HTML-String ein Element. Genau ein Wurzelknoten erwartet. */
export function fromHTML<T extends HTMLElement = HTMLElement>(html: string): T {
  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  const node = tpl.content.firstElementChild;
  if (!node) throw new Error("fromHTML: leeres Markup");
  return node as T;
}

/** Nummeriert Elemente durch, damit CSS daraus Staffel-Verzögerungen rechnet. */
export function stagger(root: ParentNode, selector = ".stagger"): void {
  root.querySelectorAll<HTMLElement>(selector).forEach((node, i) => {
    node.style.setProperty("--i", String(i));
  });
}

export function on<K extends keyof HTMLElementEventMap>(
  target: EventTarget,
  type: K,
  handler: (ev: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions,
): void {
  target.addEventListener(type, handler as EventListener, options);
}
