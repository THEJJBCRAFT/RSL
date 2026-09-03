/**
 * ani0.0.1 — Prompt-Leser.
 *
 * Der Prompt wird gegen ein Anime-Lexikon gelesen (deutsch und englisch) und
 * daraus eine vollständig bestimmte Szene gebaut. Alles was nicht erkannt wird,
 * fließt in einen Hash und legt über den Zufallsgeber die offenen Felder fest.
 * Gleicher Prompt + gleicher Seed = exakt dieselbe Szene.
 */

export type HairStyle = "lang" | "kurz" | "twintails" | "pferdeschwanz";
export type Place = "schule" | "stadt" | "wald" | "strand" | "berge" | "weltraum" | "dach" | "leer";
export type TimeOfDay = "morgen" | "tag" | "abend" | "nacht";
export type Weather = "klar" | "regen" | "schnee" | "sakura" | "nebel" | "sterne";
export type Mood = "ruhig" | "froehlich" | "traurig" | "episch" | "dramatisch";
export type CameraMove = "ruhig" | "zoom" | "raus" | "pan" | "shake";
export type Outfit = "schuluniform" | "kimono" | "hoodie" | "kleid" | "ruestung";

export type Palette = {
  skyTop: string;
  skyBottom: string;
  sun: string;
  sunGlow: string;
  far: string;
  mid: string;
  near: string;
  ground: string;
  light: string;
  shadow: string;
};

export type Scene = {
  prompt: string;
  seed: number;
  model: string;
  character: {
    present: boolean;
    hairColor: string;
    hairStyle: HairStyle;
    eyeColor: string;
    skin: string;
    outfit: Outfit;
    outfitColor: string;
    catEars: boolean;
    smile: number;
  };
  place: Place;
  time: TimeOfDay;
  weather: Weather;
  mood: Mood;
  camera: CameraMove;
  palette: Palette;
  /** Was erkannt wurde - wird in der Oberfläche als Chips gezeigt. */
  tags: string[];
};

/* ----------------------------- Zufallsgeber ----------------------------- */

/** mulberry32: klein, schnell, deterministisch. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* -------------------------------- Lexikon ------------------------------- */

const HAIR_COLORS: Record<string, string> = {
  rosa: "#ff9ec4", pink: "#ff9ec4",
  blau: "#6aa8ff", blue: "#6aa8ff",
  schwarz: "#2b2f42", black: "#2b2f42",
  weiss: "#eef2ff", weiß: "#eef2ff", white: "#eef2ff",
  silber: "#cdd6ee", silver: "#cdd6ee",
  blond: "#ffd97a", blonde: "#ffd97a", gelb: "#ffd97a",
  rot: "#ff6b5e", red: "#ff6b5e",
  lila: "#b98bff", violett: "#b98bff", purple: "#b98bff",
  gruen: "#6fe0a8", grün: "#6fe0a8", green: "#6fe0a8",
  braun: "#8a5a3c", brown: "#8a5a3c",
  orange: "#ff9f5a",
  tuerkis: "#5fe3d6", türkis: "#5fe3d6", cyan: "#5fe3d6",
};

const EYE_COLORS: Record<string, string> = {
  ...HAIR_COLORS,
  gold: "#ffcc55",
  bernstein: "#ffb347",
};

const HAIR_STYLES: Record<string, HairStyle> = {
  lang: "lang", lange: "lang", langen: "lang", langem: "lang", langer: "lang", long: "lang",
  kurz: "kurz", kurze: "kurz", kurzen: "kurz", kurzem: "kurz", kurzer: "kurz", short: "kurz", bob: "kurz",
  twintails: "twintails", zwillingszoepfe: "twintails", zöpfe: "twintails", zwillingszöpfe: "twintails",
  pferdeschwanz: "pferdeschwanz", ponytail: "pferdeschwanz", zopf: "pferdeschwanz",
};

const PLACES: Record<string, Place> = {
  schule: "schule", klassenzimmer: "schule", school: "schule", classroom: "schule",
  stadt: "stadt", city: "stadt", tokyo: "stadt", tokio: "stadt", neon: "stadt", strasse: "stadt", straße: "stadt",
  wald: "wald", forest: "wald", baum: "wald", bäume: "wald", baeume: "wald",
  strand: "strand", meer: "strand", beach: "strand", ozean: "strand", see: "strand",
  berge: "berge", berg: "berge", mountain: "berge", mountains: "berge", fuji: "berge",
  weltraum: "weltraum", space: "weltraum", sterne: "weltraum", galaxie: "weltraum", planet: "weltraum",
  dach: "dach", rooftop: "dach", dachterrasse: "dach",
};

const TIMES: Record<string, TimeOfDay> = {
  morgen: "morgen", morning: "morgen", sonnenaufgang: "morgen", dawn: "morgen", sunrise: "morgen",
  tag: "tag", mittag: "tag", day: "tag", noon: "tag",
  abend: "abend", sonnenuntergang: "abend", sunset: "abend", dusk: "abend", golden: "abend",
  nacht: "nacht", night: "nacht", mond: "nacht", moon: "nacht", mitternacht: "nacht",
};

const WEATHERS: Record<string, Weather> = {
  regen: "regen", rain: "regen", regnet: "regen", sturm: "regen",
  schnee: "schnee", snow: "schnee", winter: "schnee",
  sakura: "sakura", kirschbluete: "sakura", kirschblüten: "sakura", kirschblueten: "sakura", bluetenblaetter: "sakura", blüten: "sakura", cherry: "sakura", blossom: "sakura",
  nebel: "nebel", fog: "nebel", mist: "nebel", dunst: "nebel",
  sterne: "sterne", stars: "sterne", sternenhimmel: "sterne",
};

const MOODS: Record<string, Mood> = {
  ruhig: "ruhig", calm: "ruhig", friedlich: "ruhig", peaceful: "ruhig",
  froehlich: "froehlich", fröhlich: "froehlich", happy: "froehlich", lachen: "froehlich", suess: "froehlich", süß: "froehlich", cute: "froehlich",
  traurig: "traurig", sad: "traurig", melancholisch: "traurig", einsam: "traurig", lonely: "traurig",
  episch: "episch", epic: "episch", kampf: "episch", battle: "episch", held: "episch",
  dramatisch: "dramatisch", dramatic: "dramatisch", intensiv: "dramatisch", dunkel: "dramatisch",
};

const CAMERAS: Record<string, CameraMove> = {
  zoom: "zoom", heran: "zoom", closeup: "zoom", nah: "zoom",
  raus: "raus", weg: "raus", weitwinkel: "raus", wide: "raus",
  schwenk: "pan", pan: "pan", fahrt: "pan",
  wackeln: "shake", shake: "shake", beben: "shake", handkamera: "shake",
  ruhig: "ruhig", statisch: "ruhig", static: "ruhig",
};

const OUTFITS: Record<string, Outfit> = {
  schuluniform: "schuluniform", uniform: "schuluniform", seifuku: "schuluniform", matrosenanzug: "schuluniform",
  kimono: "kimono", yukata: "kimono",
  hoodie: "hoodie", kapuzenpulli: "hoodie", pulli: "hoodie", jacke: "hoodie",
  kleid: "kleid", dress: "kleid", rock: "kleid",
  ruestung: "ruestung", rüstung: "ruestung", armor: "ruestung", ritter: "ruestung", krieger: "ruestung",
};

const OUTFIT_COLORS = ["#3b4b7a", "#7a3b52", "#2f5f52", "#5a3b7a", "#7a5a3b", "#2f3b5f"];

const NO_CHARACTER = ["landschaft", "landscape", "kein charakter", "no character", "nur szene", "hintergrund"];

/* ------------------------------- Auswertung ------------------------------ */

function normalize(prompt: string): string[] {
  return prompt
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
}

/** Sucht das erste Wort, das in der Tabelle steht. */
function pick<T>(words: string[], table: Record<string, T>): { value: T; word: string } | null {
  for (const w of words) {
    const hit = table[w];
    if (hit !== undefined) return { value: hit, word: w };
  }
  return null;
}

/**
 * Farbe finden, die vor einem Bezugswort steht ("blaue haare", "grüne augen").
 * Ohne Bezug wird die erste gefundene Farbe genommen.
 */
function pickColorFor(words: string[], anchors: string[], table: Record<string, string>): string | null {
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!w || !anchors.some((a) => w.startsWith(a))) continue;
    for (let back = 1; back <= 3; back++) {
      const cand = words[i - back];
      if (!cand) break;
      const hit = table[cand] ?? table[cand.replace(/(e|es|er|en)$/, "")];
      if (hit) return hit;
    }
  }
  return null;
}

function paletteFor(time: TimeOfDay, mood: Mood, place: Place): Palette {
  const base: Record<TimeOfDay, Palette> = {
    morgen: {
      skyTop: "#7fb2e8", skyBottom: "#ffd9b8", sun: "#fff3c4", sunGlow: "#ffd08a",
      far: "#9db6d8", mid: "#6d86ad", near: "#41527a", ground: "#8fa2c0",
      light: "#fff0d8", shadow: "#3a4468",
    },
    tag: {
      skyTop: "#4d9ee8", skyBottom: "#bfe4ff", sun: "#ffffff", sunGlow: "#ffe9a8",
      far: "#8fb6dd", mid: "#5b82b0", near: "#39527d", ground: "#7fa06f",
      light: "#ffffff", shadow: "#33456b",
    },
    abend: {
      skyTop: "#4a3b76", skyBottom: "#ff9a6b", sun: "#fff0b0", sunGlow: "#ff8a5c",
      far: "#8a6a94", mid: "#5c4470", near: "#332748", ground: "#5a4160",
      light: "#ffd9a8", shadow: "#241b38",
    },
    nacht: {
      skyTop: "#0b1030", skyBottom: "#26325e", sun: "#e8f0ff", sunGlow: "#8fa8ff",
      far: "#2c3a66", mid: "#1d2748", near: "#121830", ground: "#161d38",
      light: "#cfe0ff", shadow: "#070a1c",
    },
  };

  const p = { ...base[time] };

  if (mood === "episch" || mood === "dramatisch") {
    p.skyTop = time === "nacht" ? "#180b22" : "#5a1f3a";
    p.sunGlow = "#ff5a4a";
    p.light = "#ffd0b0";
  }
  if (mood === "traurig") {
    p.skyTop = shade(p.skyTop, -0.12);
    p.skyBottom = desaturate(p.skyBottom, 0.35);
    p.light = desaturate(p.light, 0.3);
  }
  if (mood === "froehlich") {
    p.skyBottom = shade(p.skyBottom, 0.1);
    p.sunGlow = shade(p.sunGlow, 0.1);
  }
  if (place === "weltraum") {
    p.skyTop = "#05030f";
    p.skyBottom = "#1a1040";
    p.far = "#2a1b55";
    p.mid = "#1a1038";
    p.near = "#0d0820";
    p.ground = "#0d0820";
  }
  if (place === "strand") p.ground = time === "nacht" ? "#16224a" : "#2f7fa8";
  if (place === "wald") p.ground = time === "nacht" ? "#101c18" : "#3f6a45";
  return p;
}

/* ------------------------------ Farbhelfer ------------------------------ */

function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace("#", "");
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** amount > 0 hellt auf, < 0 dunkelt ab. */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const t = amount > 0 ? 255 : 0;
  const p = Math.abs(amount);
  return rgbToHex(r + (t - r) * p, g + (t - g) * p, b + (t - b) * p);
}

export function desaturate(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const l = 0.299 * r + 0.587 * g + 0.114 * b;
  return rgbToHex(r + (l - r) * amount, g + (l - g) * amount, b + (l - b) * amount);
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ------------------------------ Hauptfunktion ---------------------------- */

export function buildScene(prompt: string, seed?: number): Scene {
  const words = normalize(prompt);
  const text = words.join(" ");
  const effSeed = seed ?? hashString(prompt);
  const rand = rng(effSeed);
  const tags: string[] = [];

  const note = (label: string): void => {
    if (!tags.includes(label)) tags.push(label);
  };

  const place = pick(words, PLACES);
  const time = pick(words, TIMES);
  const weather = pick(words, WEATHERS);
  const mood = pick(words, MOODS);
  const camera = pick(words, CAMERAS);
  const outfit = pick(words, OUTFITS);
  const hairStyle = pick(words, HAIR_STYLES);

  const hairColor =
    pickColorFor(words, ["haar", "hair"], HAIR_COLORS) ??
    (hairStyle ? pick(words, HAIR_COLORS)?.value : undefined) ??
    null;
  const eyeColor = pickColorFor(words, ["auge", "eye"], EYE_COLORS);

  const present = !NO_CHARACTER.some((k) => text.includes(k));
  const catEars = /neko|katzenohr|cat ?girl|katzenmaedchen|katzenmädchen/.test(text);

  const chosenPlace: Place = place?.value ?? (["schule", "stadt", "wald", "strand", "berge", "dach"][Math.floor(rand() * 6)] as Place);
  const chosenTime: TimeOfDay = time?.value ?? (["morgen", "tag", "abend", "nacht"][Math.floor(rand() * 4)] as TimeOfDay);
  const chosenMood: Mood = mood?.value ?? "ruhig";
  let chosenWeather: Weather = weather?.value ?? "klar";
  // Nachts ohne eigene Angabe ergibt ein Sternenhimmel mehr Sinn als "klar".
  if (!weather && chosenTime === "nacht" && chosenPlace !== "weltraum") chosenWeather = "sterne";

  if (place) note(`Ort: ${place.value}`);
  else note(`Ort: ${chosenPlace} (geraten)`);
  if (time) note(`Zeit: ${time.value}`);
  else note(`Zeit: ${chosenTime} (geraten)`);
  if (weather) note(`Wetter: ${weather.value}`);
  else if (chosenWeather !== "klar") note(`Wetter: ${chosenWeather} (geraten)`);
  if (mood) note(`Stimmung: ${mood.value}`);
  if (camera) note(`Kamera: ${camera.value}`);
  if (outfit) note(`Kleidung: ${outfit.word}`);
  if (hairStyle) note(`Frisur: ${hairStyle.value}`);
  if (hairColor) note("Haarfarbe erkannt");
  if (eyeColor) note("Augenfarbe erkannt");
  if (catEars) note("Katzenohren");
  if (!present) note("ohne Figur");

  const hairPool = Object.values(HAIR_COLORS);
  const eyePool = Object.values(EYE_COLORS);

  return {
    prompt,
    seed: effSeed,
    model: "ani0.0.1",
    character: {
      present,
      hairColor: hairColor ?? hairPool[Math.floor(rand() * hairPool.length)]!,
      hairStyle: hairStyle?.value ?? (["lang", "kurz", "twintails", "pferdeschwanz"][Math.floor(rand() * 4)] as HairStyle),
      eyeColor: eyeColor ?? eyePool[Math.floor(rand() * eyePool.length)]!,
      skin: "#ffe0cd",
      outfit: outfit?.value ?? "schuluniform",
      outfitColor: OUTFIT_COLORS[Math.floor(rand() * OUTFIT_COLORS.length)]!,
      catEars,
      smile: chosenMood === "froehlich" ? 1 : chosenMood === "traurig" ? -0.6 : 0.25,
    },
    place: chosenPlace,
    time: chosenTime,
    weather: chosenWeather,
    mood: chosenMood,
    camera: camera?.value ?? (chosenMood === "episch" ? "zoom" : "ruhig"),
    palette: paletteFor(chosenTime, chosenMood, chosenPlace),
    tags,
  };
}
