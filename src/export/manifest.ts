/**
 * Manifeste versionne. Il doit suffire a utiliser un pack sans reconstituer
 * les pivots à la main : unités, projection, caps monde, pivots, événements,
 * rectangles de capture et roles de clip y figurent explicitement.
 */

import { frameCount, frameTime, DEFAULT_GROUND_SCALE } from '../render/renderer.js';
import { ISO_2_1 } from '../space/projection.js';
import type { DirectionSample } from '../space/directions.js';
import type { SpellRecipe } from '../sim/types.js';

export const SCHEMA_VERSION = '2.0.0';
export const ENGINE_VERSION = '2.0.0-j3';

export type Manifest = ReturnType<typeof buildManifest>;

export function buildManifest(
  recipe: SpellRecipe,
  directions: readonly DirectionSample[],
  bounds: { x0: number; y0: number; x1: number; y1: number },
  seed = 0x5eed,
) {
  const n = frameCount(recipe);
  return {
    schemaVersion: SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    recipeId: recipe.id,
    element: recipe.element,
    title: recipe.title,
    concept: recipe.concept,
    signature: recipe.signature,
    role: recipe.role,
    seed,
    units: {
      world: 'tuile de sol',
      height: 'tuile de sol (echelle de hauteur independante du sol)',
      angle: 'radians, 0 = +x monde, croissant vers +y monde',
    },
    projection: {
      id: ISO_2_1.id,
      groundRatio: ISO_2_1.groundRatio,
      groundScale: DEFAULT_GROUND_SCALE,
      heightScale: DEFAULT_GROUND_SCALE,
      formula: {
        screenX: 'originX + groundScale * (x - y)',
        screenY: 'originY + groundScale * groundRatio * (x + y) - heightScale * z',
      },
    },
    pixelScale: 1,
    canvas: recipe.canvas,
    pivot: recipe.pivot,
    /** Rectangle commun a toutes les images et tous les caps, marge comprise. */
    captureBounds: bounds,
    timing: {
      duration: recipe.duration,
      fps: recipe.fps,
      frames: n,
      loop: recipe.loop,
      frameTimes: Array.from({ length: n }, (_, i) => Number(frameTime(recipe, i).toFixed(6))),
    },
    radial: recipe.radial,
    defaultRange: recipe.defaultRange,
    defaultPower: recipe.defaultPower,
    directions: directions.map((d) => ({
      index: d.index,
      label: d.label,
      headingRad: Number(d.heading.toFixed(6)),
      headingDeg: Number(((d.heading * 180) / Math.PI).toFixed(3)),
      worldVector: { x: Number(d.vector.x.toFixed(6)), y: Number(d.vector.y.toFixed(6)) },
      screenAngleRad: Number.isFinite(d.screenAngle) ? Number(d.screenAngle.toFixed(6)) : null,
    })),
    events: recipe.events.map((e) => ({
      id: e.id,
      at: e.at,
      timeSeconds: Number((e.at * recipe.duration).toFixed(4)),
      frame: Math.round(e.at * (n - 1)),
      note: e.note ?? null,
    })),
    notes: [
      "Une spritesheet a N directions est une approximation discrete d'un moteur a angle libre.",
      'Les angles projetes a l ecran ne sont pas uniformement espaces : utiliser headingRad.',
    ],
  };
}
