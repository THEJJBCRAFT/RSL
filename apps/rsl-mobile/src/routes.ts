import type { View } from "./lib/router";
import { home } from "./views/home";
import { server } from "./views/server";
import { settings } from "./views/settings";
import { ai } from "./views/ai";
import { about } from "./views/about";
import { account } from "./views/account";

export type Route = {
  id: string;
  label: string;
  /** Innenleben des Nav-Icons (stroke-basiert, 24x24). */
  icon: string;
  view: () => View;
  /** Nicht im Menue unten - erreichbar ueber die Kopfzeile. */
  hidden?: boolean;
};

export const ROUTES: Route[] = [
  {
    id: "start",
    label: "Start",
    icon: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.5 20v-5.5h5V20"/>',
    view: home,
  },
  {
    id: "ai",
    label: "RSL AI",
    icon: '<path d="M12 3v3.2M12 17.8V21M4.2 7.6l2.8 1.6M17 14.8l2.8 1.6M19.8 7.6 17 9.2M7 14.8l-2.8 1.6"/><circle cx="12" cy="12" r="3.6"/>',
    view: ai,
  },
  {
    id: "server",
    label: "Server",
    icon: '<rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01"/>',
    view: server,
  },
  {
    id: "einstellungen",
    label: "Einstellungen",
    icon: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/>',
    view: settings,
  },
  {
    id: "info",
    label: "Info",
    icon: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.6h.01"/>',
    view: about,
  },
  {
    // Das Konto haengt oben rechts in der Kopfzeile - unten waere das sechste Feld zu schmal.
    id: "konto",
    label: "Konto",
    icon: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20c1.2-3.4 4-5 7.5-5s6.3 1.6 7.5 5"/>',
    view: account,
    hidden: true,
  },
];

/** Die Ziele, die unten im Menue stehen. */
export const NAV_ROUTES: Route[] = ROUTES.filter((route) => !route.hidden);
