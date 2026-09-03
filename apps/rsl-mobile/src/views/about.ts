import type { View } from "../lib/router";
import { IS_NATIVE, appInfo } from "../lib/native";

export function about(): View {
  return {
    html: `
      <div class="head stagger">
        <span class="eyebrow">Über</span>
        <h1>RSL</h1>
        <p class="lead">
          RSL fürs Handy: dieselbe Oberfläche wie am Rechner, nur ohne Fenster
          drumherum. Die Werte unten kommen aus der Android-Hülle.
        </p>
      </div>

      <dl class="kv stagger">
        <dt>Anwendung</dt><dd id="iName">-</dd>
        <dt>Version</dt><dd id="iVersion">-</dd>
        <dt>System</dt><dd id="iOs">-</dd>
        <dt>Architektur</dt><dd id="iArch">-</dd>
        <dt>Build</dt><dd id="iBuild">-</dd>
        <dt>Oberfläche</dt><dd>TypeScript + Vite, ohne Framework</dd>
      </dl>

      <div class="grid">
        <article class="card stagger" data-fx>
          <div class="card__icon">
            <svg viewBox="0 0 24 24"><path d="M12 3v3.2M12 17.8V21M4.2 7.6l2.8 1.6M17 14.8l2.8 1.6M19.8 7.6 17 9.2M7 14.8l-2.8 1.6"/><circle cx="12" cy="12" r="3.6"/></svg>
          </div>
          <h3>RSL AI</h3>
          <p>Erzeugt kurze Anime-Clips aus einem Prompt. Gerechnet wird im Gerät, das
             fertige Video landet auf Wunsch in den Downloads.</p>
        </article>
        <article class="card stagger" data-fx>
          <div class="card__icon">
            <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01"/></svg>
          </div>
          <h3>Server</h3>
          <p>Fragt die Minecraft-Server direkt über das Server-List-Ping-Protokoll ab,
             inklusive SRV-Auflösung. Ohne fremde Status-Dienste.</p>
        </article>
        <article class="card stagger" data-fx>
          <div class="card__icon">
            <svg viewBox="0 0 24 24"><path d="M12 3l7.5 4v6c0 4.4-3.1 7.5-7.5 8.5C7.6 20.5 4.5 17.4 4.5 13V7L12 3Z"/><path d="m9 12 2.2 2.2L15.4 10"/></svg>
          </div>
          <h3>Bleibt auf dem Gerät</h3>
          <p>Kein Konto, keine Anmeldung, keine Übertragung von Prompts oder Videos.
             Die App braucht das Netz nur für den Server-Ping.</p>
        </article>
      </div>
    `,
    mount(root) {
      const put = (id: string, value: string): void => {
        const el = root.querySelector<HTMLElement>(`#${id}`);
        if (el) el.textContent = value;
      };

      const info = IS_NATIVE ? appInfo() : null;
      if (!info) {
        put("iName", "RSL");
        put("iVersion", "Browser-Vorschau");
        put("iOs", navigator.platform || "-");
        put("iArch", "-");
        put("iBuild", "-");
        return;
      }
      put("iName", info.name);
      put("iVersion", info.version);
      put("iOs", info.os);
      put("iArch", info.arch);
      put("iBuild", info.build);
    },
  };
}
