/**
 * Klick-Sounds.
 *
 * Komplett synthetisch über WebAudio - keine Audiodateien, kein Netzwerk.
 * Ein delegierter pointerdown-Listener deckt alle Knöpfe ab. Der Schalter
 * "Klickgeräusche" in den Einstellungen (localStorage) schaltet alles stumm.
 */

let ctx: AudioContext | null = null;

function enabled(): boolean {
  try {
    const s = JSON.parse(localStorage.getItem("rsl.settings") ?? "{}") as Record<string, boolean>;
    return s.sound !== false;
  } catch {
    return true;
  }
}

function audio(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext({ latencyHint: "interactive" });
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

type ClickKind = "soft" | "primary" | "toggle" | "nav";

/** Kurzer, dezenter Klick: Sinus-Blip mit schnellem Abfall plus Tick-Rauschen. */
function play(kind: ClickKind): void {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + 0.001;

  const master = ac.createGain();
  master.gain.value = 0.14;
  master.connect(ac.destination);

  const blip = (freq0: number, freq1: number, start: number, dur: number, gain: number): void => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq0, t0 + start);
    osc.frequency.exponentialRampToValueAtTime(freq1, t0 + start + dur);
    g.gain.setValueAtTime(gain, t0 + start);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + start + dur);
    osc.connect(g).connect(master);
    osc.start(t0 + start);
    osc.stop(t0 + start + dur + 0.02);
  };

  // Winziger Rausch-Tick macht den Klick "mechanisch".
  const tick = (start: number, gain: number): void => {
    const len = Math.floor(ac.sampleRate * 0.012);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2500;
    const g = ac.createGain();
    g.gain.value = gain;
    src.connect(hp).connect(g).connect(master);
    src.start(t0 + start);
  };

  switch (kind) {
    case "primary":
      tick(0, 0.5);
      blip(880, 660, 0, 0.05, 0.5);
      blip(1320, 1100, 0.045, 0.06, 0.35);
      break;
    case "toggle":
      tick(0, 0.4);
      blip(520, 940, 0, 0.055, 0.5);
      break;
    case "nav":
      tick(0, 0.35);
      blip(1500, 1150, 0, 0.035, 0.4);
      break;
    default:
      tick(0, 0.4);
      blip(1800, 1250, 0, 0.03, 0.4);
  }
}

export function initClickSounds(): void {
  window.addEventListener(
    "pointerdown",
    (e) => {
      if (!enabled()) return;
      const el = e.target instanceof Element ? e.target : null;
      if (!el) return;
      if (el.closest(".switch")) play("toggle");
      else if (el.closest(".btn--primary")) play("primary");
      else if (el.closest(".navitem")) play("nav");
      else if (el.closest(".btn, .chip, select.input, [data-play], [data-chip]")) play("soft");
    },
    { passive: true, capture: true },
  );
}
