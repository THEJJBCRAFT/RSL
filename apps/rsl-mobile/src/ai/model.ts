/**
 * ani — Modell-Fabrik.
 *
 * Entscheidet pro Prompt, welcher Weg gerendert wird:
 *  - Drehbuch (Szenen, Dialoge)  -> Kino-Renderer mit Schnitten (ani0.0.2)
 *  - einfacher Prompt            -> Porträt-Renderer (Weg aus ani0.0.1)
 */

import { buildScene, hashString, type Scene } from "./scene";
import { createRenderer, type Renderer } from "./render";
import { createCinemaRenderer } from "./cinema";
import { isScreenplay, parseScreenplay, type Storyboard } from "./script";

export type Built = {
  renderer: Renderer;
  scene: Scene;
  /** Feste Filmlänge; null heißt: Wunschlänge aus der Anfrage verwenden. */
  seconds: number | null;
  storyboard: Storyboard | null;
  tags: string[];
};

export function buildRenderer(prompt: string, seed: number | undefined, width: number, height: number): Built {
  if (isScreenplay(prompt)) {
    const board = parseScreenplay(prompt, seed);
    const renderer = createCinemaRenderer(board, prompt, width, height);
    return {
      renderer,
      scene: renderer.scene,
      seconds: board.total,
      storyboard: board,
      tags: board.tags,
    };
  }

  const scene = buildScene(prompt, seed ?? hashString(prompt));
  return {
    renderer: createRenderer(scene, width, height),
    scene,
    seconds: null,
    storyboard: null,
    tags: scene.tags,
  };
}
