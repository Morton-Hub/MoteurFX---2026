/**
 * Contexte d'une frame.
 *
 * Tout ce qu'une recette peut lire pour construire **une** des douze images,
 * dans **une** direction. Aucune recette ne touche au canevas directement :
 * elle renvoie des objets à peindre, le renderer décide de l'ordre.
 */

import { type Vec2, type Vec3 } from '../core/math.js';
import { randN } from '../core/rng.js';
import { ShapeMask } from '../pixels/mask.js';
import { screenLight } from '../pixels/shade.js';
import type { StyleProfile } from '../pixels/style.js';
import {
  depthOf,
  localToWorld,
  makeFrame,
  project,
  type LocalFrame,
  type ProjectionProfile,
} from '../projection/projection.js';
import type { AnimationBudget, ClipRole } from '../animation/budget.js';
import { frameStartMs, roleOfFrame } from '../animation/budget.js';

export type StageSetup = {
  readonly width: number;
  readonly height: number;
  readonly projection: ProjectionProfile;
  readonly style: StyleProfile;
  readonly seed: number;
  readonly source: Vec3;
  readonly target: Vec3;
  readonly heading: number;
};

export type FrameContext = {
  readonly style: StyleProfile;
  readonly projection: ProjectionProfile;
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly source: Vec3;
  readonly target: Vec3;
  readonly heading: number;
  readonly local: LocalFrame;
  /** Distance au sol source -> cible, en unités monde. */
  readonly distance: number;
  /** Index de la frame courante, de 0 à 11. */
  readonly index: number;
  /** Progression nominale de la frame dans le clip, sur [0,1]. */
  readonly phase: number;
  readonly budget: AnimationBudget;
  readonly role: ClipRole | undefined;
  /** Instant de début de la frame, en ms depuis le début du clip. */
  readonly timeMs: number;
  readonly durationMs: number;
  /** Projection monde -> pixels. */
  readonly p: (w: Vec3) => Vec2;
  /** Projection depuis le repère local (avant, côté, haut). */
  readonly pl: (fwd: number, side: number, up: number) => Vec2;
  /** Point monde depuis le repère local. */
  readonly wl: (fwd: number, side: number, up: number) => Vec3;
  readonly depth: (w: Vec3) => number;
  /** Direction d'où vient la lumière, en pixels écran. */
  readonly lightScreen: { x: number; y: number };
  /** Tirage stable : ne dépend que de (seed projet, identifiant, canal). */
  readonly rnd: (id: string, channel: number) => number;
  readonly rndRange: (id: string, channel: number, lo: number, hi: number) => number;
  /** Masque borné aux points fournis, coupé au cadre. */
  readonly mask: (points: readonly Vec2[], pad?: number) => ShapeMask;
  readonly fullMask: () => ShapeMask;
};

function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function makeFrameContext(
  stage: StageSetup,
  budget: AnimationBudget,
  index: number,
): FrameContext {
  const local = makeFrame(stage.source, stage.heading);
  const dx = stage.target.x - stage.source.x;
  const dy = stage.target.y - stage.source.y;
  const distance = Math.hypot(dx, dy);
  const p = (w: Vec3): Vec2 => project(stage.projection, w);
  const wl = (f: number, s: number, u: number): Vec3 => localToWorld(local, f, s, u);
  return {
    style: stage.style,
    projection: stage.projection,
    width: stage.width,
    height: stage.height,
    seed: stage.seed,
    source: stage.source,
    target: stage.target,
    heading: stage.heading,
    local,
    distance,
    index,
    phase: budget.frameCount <= 1 ? 0 : index / (budget.frameCount - 1),
    budget,
    role: roleOfFrame(budget, index),
    timeMs: frameStartMs(budget, index),
    durationMs: budget.frameDurationsMs[index] ?? 0,
    p,
    pl: (f, s, u) => p(wl(f, s, u)),
    wl,
    depth: depthOf,
    lightScreen: screenLight(stage.style, stage.projection.groundRatio),
    rnd: (id, channel) => randN(stage.seed, hashId(id), channel),
    rndRange: (id, channel, lo, hi) => lo + (hi - lo) * randN(stage.seed, hashId(id), channel),
    mask: (points, pad = 2) => ShapeMask.forPoints(points, pad, stage.width, stage.height),
    fullMask: () => ShapeMask.full(stage.width, stage.height),
  };
}
