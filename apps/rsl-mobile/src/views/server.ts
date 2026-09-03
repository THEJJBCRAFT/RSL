import type { View } from "../lib/router";
import { IS_NATIVE, mcPing, type McStatus } from "../lib/native";
import { countUp } from "../lib/motion";

const SERVERS = [
  { id: "boocord", host: "smp.boocord.com", name: "Boocord SMP" },
  { id: "gamercraft", host: "gamercraft.net", name: "GamerCraft" },
];

const REFRESH_MS = 45_000;

export function server(): View {
  let timer = 0;
  let alive = true;

  return {
    html: `
      <div class="head stagger">
        <span class="eyebrow">Verbindung</span>
        <h1>Server</h1>
        <p class="lead">
          Live-Status direkt über das Minecraft-Protokoll (Server List Ping),
          inklusive SRV-Auflösung — ohne fremde Status-Dienste.
        </p>
      </div>

      <div class="srvlist stagger">
        ${SERVERS.map(
          (s) => `
        <article class="srv" data-srv="${s.id}">
          <div class="srv__icon"><img alt="" hidden /><span class="srv__fallback">◆</span></div>
          <div class="srv__main">
            <div class="srv__title">
              <strong>${s.name}</strong>
              <code class="srv__host" title="Adresse">${s.host}</code>
              <span class="tag" data-role="state">prüfe …</span>
            </div>
            <p class="srv__motd" data-role="motd">–</p>
            <div class="srv__stats">
              <span><b data-role="players">0</b> / <span data-role="max">0</span> Spieler</span>
              <span><b data-role="ping">–</b> ms</span>
              <span data-role="version">–</span>
            </div>
          </div>
        </article>`,
        ).join("")}
      </div>

      <div class="row stagger" style="margin-top:18px">
        <button class="btn" id="srvRefresh" data-fx>
          Aktualisieren
          <svg class="btn__icon" viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 3v5h-5"/></svg>
        </button>
        <span class="srv__note" id="srvNote"></span>
      </div>
    `,

    mount(root) {
      const note = root.querySelector<HTMLElement>("#srvNote")!;

      const apply = (id: string, st: McStatus): void => {
        const card = root.querySelector<HTMLElement>(`[data-srv="${id}"]`);
        if (!card) return;
        const q = <T extends HTMLElement>(sel: string): T | null => card.querySelector<T>(sel);

        const state = q<HTMLElement>('[data-role="state"]');
        if (state) {
          state.textContent = st.online ? "online" : "offline";
          state.className = `tag ${st.online ? "tag--done" : "tag--failed"}`;
          if (!st.online && st.error) state.title = st.error;
        }
        const motd = q<HTMLElement>('[data-role="motd"]');
        if (motd) motd.textContent = st.online ? st.motd || "–" : (st.error ?? "nicht erreichbar");

        const players = q<HTMLElement>('[data-role="players"]');
        if (players) {
          if (st.online) countUp(players, st.players_online, 700);
          else players.textContent = "0";
        }
        const max = q<HTMLElement>('[data-role="max"]');
        if (max) max.textContent = String(st.players_max);
        const ping = q<HTMLElement>('[data-role="ping"]');
        if (ping) ping.textContent = st.online ? String(st.latency_ms) : "–";
        const version = q<HTMLElement>('[data-role="version"]');
        if (version) version.textContent = st.version || "–";

        const img = card.querySelector<HTMLImageElement>(".srv__icon img");
        const fallback = card.querySelector<HTMLElement>(".srv__fallback");
        if (img && fallback) {
          if (st.favicon) {
            img.src = st.favicon;
            img.hidden = false;
            fallback.hidden = true;
          } else {
            img.hidden = true;
            fallback.hidden = false;
          }
        }
      };

      const refresh = (): void => {
        if (!IS_NATIVE) {
          note.textContent = "Nur in der App verfügbar: Der Ping braucht eine direkte Verbindung zum Server, die ein Browser nicht öffnen darf.";
          return;
        }
        note.textContent = "";
        for (const s of SERVERS) {
          void mcPing(s.host).then((st) => {
            if (alive) apply(s.id, st);
          });
        }
      };

      root.querySelector("#srvRefresh")?.addEventListener("click", refresh);
      refresh();
      timer = window.setInterval(refresh, REFRESH_MS);
    },

    unmount() {
      alive = false;
      window.clearInterval(timer);
    },
  };
}
