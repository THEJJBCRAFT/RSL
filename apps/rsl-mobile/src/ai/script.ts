/**
 * ani0.0.2 — Drehbuch-Leser.
 *
 * Erkennt Prompts im Drehbuch-Format ("Szene 1: …", Dialoge in Anführungszeichen,
 * Rollen wie Hauptcharakter/Freund/Gegner) und baut daraus ein Storyboard:
 * eine Folge von Einstellungen (Shots), jede mit eigener Choreografie.
 *
 * Nichts davon ist vorgefertigt — jede Einstellung wird zur Laufzeit aus dem
 * Text bestimmt und Bild für Bild gezeichnet.
 */

import { hashString } from "./scene";

export type Role = "held" | "freund" | "gegner";

export type ShotKind =
  | "establish" //   Ort zeigen, Figuren aufstellen
  | "impale" //      Gegner durchbohrt den Freund
  | "shock" //       Nahaufnahme: stilles, schockiertes Gesicht
  | "dialog" //      Nahaufnahme des Sprechers + Untertitel
  | "fight" //       Kampf-Choreografie Held gegen Gegner
  | "beamhit" //     Energiestrahl schleudert den Helden zu Boden
  | "floatglow" //   Erheben + weißes Leuchten
  | "transform" //   Metamorphose: weißer Mantel, Krone, Schwerter
  | "eyesopen" //    Nahaufnahme: Augen öffnen sich, leuchten grün
  | "sigil" //       Hexagramm + Energiekreis zeichnen
  | "finale"; //     Erde glüht, weißes Licht verschlingt alles

export type Shot = {
  kind: ShotKind;
  dur: number;
  /** Sprecher und Text, nur bei dialog (und sigil mit Spruch). */
  speaker?: Role;
  text?: string;
  /** Beschriftung für die Auswertung/Chips. */
  label: string;
};

export type Storyboard = {
  shots: Shot[];
  total: number;
  /** Startzeit je Shot, vorberechnet. */
  starts: number[];
  seed: number;
  tags: string[];
};

const DUR: Record<ShotKind, number> = {
  establish: 3,
  impale: 4.5,
  shock: 3,
  dialog: 3.5,
  fight: 9,
  beamhit: 4,
  floatglow: 4.5,
  transform: 5.5,
  eyesopen: 3,
  sigil: 5,
  finale: 6.5,
};

const MAX_TOTAL = 75;

/** Sieht der Prompt wie ein Drehbuch aus? */
export function isScreenplay(prompt: string): boolean {
  return /szene\s*\d|drehbuch|video-?prompt/i.test(prompt) || prompt.length > 900;
}

function speakerFor(raw: string): Role {
  const s = raw.toLowerCase();
  if (s.includes("gegner") || s.includes("feind") || s.includes("bösewicht")) return "gegner";
  if (s.includes("freund")) return "freund";
  return "held";
}

/** Dialogzeilen: `Wort: … "Text"` — der Sprecher steht vor dem Doppelpunkt. */
function extractDialog(block: string): { speaker: Role; text: string }[] {
  const out: { speaker: Role; text: string }[] = [];
  const re = /([\p{L}]+)\s*:[^"„]{0,120}["„]([^"“”]{2,160})["“”]/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    out.push({ speaker: speakerFor(m[1] ?? ""), text: (m[2] ?? "").trim() });
  }
  return out;
}

type Rule = { kind: ShotKind; re: RegExp };

/** Reihenfolge = Priorität innerhalb eines Szenenblocks. */
const RULES: Rule[] = [
  { kind: "impale", re: /durchbohrt|niedergemacht|niedergestreckt|ersticht|erstochen/i },
  { kind: "beamhit", re: /energiestrahl|strahl trifft|in den boden (geschossen|geschleudert)|schie(ß|ss)t ihn/i },
  { kind: "floatglow", re: /aufzuschweben|schwebt|erhebt sich|wei(ß|ss) (zu )?leucht/i },
  { kind: "transform", re: /metamorphose|verwandl|wandelt sich|krone|materialisier/i },
  { kind: "eyesopen", re: /augen (ö|oe)ffnet|augen leuchte|close-?up.*augen|augen.*gr(ü|ue)n/i },
  { kind: "sigil", re: /hexagramm|zauberkreis|energiekreis|zeichnet.*(kreis|zeichen)|beschw(ö|oe)rung/i },
  { kind: "finale", re: /finale|verschlingend|l(ö|oe)st sich auf|zerschmelz|ewigen? .*licht|alles .*licht aufgeht/i },
  { kind: "fight", re: /kampf|st(ü|ue)rmt|attackiert|schl(ä|ae)ge|tritte|kombination|choreografie|kung|karate/i },
  { kind: "shock", re: /nahaufnahme.*(schock|still|gesicht)|schockiert/i },
];

export function parseScreenplay(prompt: string, seed?: number): Storyboard {
  const effSeed = seed ?? hashString(prompt);
  const tags: string[] = [];

  // In Szenenblöcke schneiden. Text vor "Szene 1" ist Stil/Rollen-Vorspann.
  const parts = prompt.split(/szene\s*\d+\s*[:.]?/i);
  const blocks = parts.length > 1 ? parts.slice(1) : [prompt];

  const shots: Shot[] = [];
  const push = (shot: Shot): void => {
    // Gleiche Einstellung nicht zweimal direkt hintereinander.
    const last = shots[shots.length - 1];
    if (last && last.kind === shot.kind && shot.kind !== "dialog") return;
    shots.push(shot);
  };

  for (const block of blocks) {
    const matched: ShotKind[] = [];
    for (const rule of RULES) {
      if (rule.re.test(block)) matched.push(rule.kind);
      if (matched.length >= 2) break;
    }

    const dialog = extractDialog(block);

    // Reihenfolge im Block: Aktion vor Dialog, außer der Block ist reiner Dialog.
    // Nach einem Durchbohren folgt automatisch die Schock-Nahaufnahme.
    for (const kind of matched) {
      if (kind === "sigil" && dialog.length) {
        const line = dialog.shift()!;
        push({ kind, dur: DUR[kind], speaker: line.speaker, text: line.text, label: "Zauber + Spruch" });
        continue;
      }
      push({ kind, dur: DUR[kind], label: labelFor(kind) });
      if (kind === "impale") push({ kind: "shock", dur: DUR.shock, label: labelFor("shock") });
    }

    for (const line of dialog) {
      push({
        kind: "dialog",
        dur: Math.min(6, Math.max(2.5, 1.2 + line.text.length * 0.055)),
        speaker: line.speaker,
        text: line.text,
        label: `Dialog (${line.speaker})`,
      });
    }
  }

  // Fallbacks: ein Drehbuch ohne Treffer bekommt wenigstens Aufbau + Kampf.
  if (!shots.length) {
    push({ kind: "establish", dur: DUR.establish, label: labelFor("establish") });
    push({ kind: "fight", dur: DUR.fight, label: labelFor("fight") });
  }
  if (shots[0]!.kind !== "establish" && shots[0]!.kind !== "beamhit") {
    shots.unshift({ kind: "establish", dur: DUR.establish, label: labelFor("establish") });
  }

  // Gesamtlänge deckeln: hinten kürzen ist falsch, also anteilig stauchen.
  let total = shots.reduce((a, s) => a + s.dur, 0);
  if (total > MAX_TOTAL) {
    const f = MAX_TOTAL / total;
    for (const s of shots) s.dur = Math.max(1.6, s.dur * f);
    total = shots.reduce((a, s) => a + s.dur, 0);
  }

  const starts: number[] = [];
  let acc = 0;
  for (const s of shots) {
    starts.push(acc);
    acc += s.dur;
  }

  tags.push(`Drehbuch: ${shots.length} Einstellungen`);
  tags.push(`Länge: ${Math.round(total)} s`);
  for (const s of shots) tags.push(s.label);

  return { shots, total, starts, seed: effSeed, tags };
}

function labelFor(kind: ShotKind): string {
  switch (kind) {
    case "establish":
      return "Aufbau";
    case "impale":
      return "Der Verlust";
    case "shock":
      return "Schock-Nahaufnahme";
    case "dialog":
      return "Dialog";
    case "fight":
      return "Kampf";
    case "beamhit":
      return "Strahl-Treffer";
    case "floatglow":
      return "Erhebung + Leuchten";
    case "transform":
      return "Verwandlung";
    case "eyesopen":
      return "Augen öffnen sich";
    case "sigil":
      return "Zauberkreis";
    case "finale":
      return "Finale";
  }
}

/* --------------------------- Drehbuch-Erzeuger --------------------------- */

/**
 * Baut aus einer kurzen Idee ein vollständiges Drehbuch im Format, das
 * ani0.0.2 versteht. Für den Knopf "Drehbuch erzeugen" im Modul.
 */
export function makeScreenplay(idea: string): string {
  const clean = idea.trim().replace(/\s+/g, " ") || "Ein Held stellt sich einem übermächtigen Gegner";
  return [
    `Video-Prompt & Drehbuch`,
    `Stil: Epischer Anime-Stil, flüssige Animation, cel-shaded, dramatische Licht- und Partikeleffekte.`,
    `Idee: ${clean}.`,
    ``,
    `Szene 1: Der Verlust`,
    `Aktion: Der Hauptcharakter muss mit ansehen, wie sein Freund vom Gegner mit einem Schwert durchbohrt wird.`,
    `Kamera: Nahaufnahme auf das schockierte, stille Gesicht des Hauptcharakters.`,
    ``,
    `Szene 2: Der Dialog`,
    `Gegner: Er blickt herab und sagt eiskalt: "Er war doch nur ein weiteres wertloses Leben."`,
    `Hauptcharakter: Er antwortet mit entschlossener Stimme: "Er war mein Freund! Das wirst du nie verstehen!"`,
    ``,
    `Szene 3: Der Kampf`,
    `Aktion: Der Hauptcharakter stürmt mit Kung-Fu- und Karate-Kombinationen auf den Gegner ein, grüne Energie verstärkt jeden Schlag, der Gegner hält mit Magie dagegen.`,
    ``,
    `Szene 4: Der Zauber`,
    `Aktion: Er zeichnet mit grüner Energie ein Hexagramm in die Luft, gefolgt von einem Energiekreis.`,
    `Spruch: Mit hallender Stimme spricht er: "Magnum Opus, Fiat Unum!"`,
    ``,
    `Szene 5: Das Finale`,
    `Aktion: Die Erde beginnt zu beben und zu glühen, bis alles in einem weißen Licht aufgeht und der Gegner sich darin auflöst.`,
  ].join("\n");
}
