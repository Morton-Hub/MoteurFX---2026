/**
 * Scène de capture.
 *
 * La taille de la silhouette, la taille de la tuile et celle du canevas sont
 * trois notions différentes (§2). Un canevas de 128×128 peut contenir un
 * petit sort sans que celui-ci soit agrandi ; le canevas peut devenir
 * rectangulaire pour une traînée ou un impact étendu.
 */

import type { Vec3 } from '../core/math.js';
import { ARCANE_MINIATURE, type StyleProfile } from '../pixels/style.js';
import { ISO_2_1, withOrigin, type ProjectionProfile } from '../projection/projection.js';
import type { StageSetup } from './context.js';

export type StageOptions = {
  readonly width: number;
  readonly height: number;
  /** Position de la cible dans l'image, en fraction du canevas. */
  readonly targetAt?: { readonly x: number; readonly y: number };
  /** Distance au sol source -> cible, en tuiles. */
  readonly distance: number;
  /** Hauteur de la main du lanceur, en tuiles. */
  readonly casterHeight?: number;
  readonly heading: number;
  readonly seed: number;
  readonly style?: StyleProfile;
  readonly projection?: ProjectionProfile;
  /** Décalage de la scène, en pixels : recadrage manuel. */
  readonly offset?: { readonly x: number; readonly y: number };
};

export function makeStage(o: StageOptions): StageSetup {
  const style = o.style ?? ARCANE_MINIATURE;
  const base = o.projection ?? ISO_2_1;
  const at = o.targetAt ?? { x: 0.5, y: 0.62 };
  const projection = withOrigin(
    base,
    Math.round(o.width * at.x) + (o.offset?.x ?? 0),
    Math.round(o.height * at.y) + (o.offset?.y ?? 0),
  );
  const target: Vec3 = { x: 0, y: 0, z: 0 };
  const source: Vec3 = {
    x: -Math.cos(o.heading) * o.distance,
    y: -Math.sin(o.heading) * o.distance,
    z: o.casterHeight ?? 0.55,
  };
  return {
    width: o.width,
    height: o.height,
    projection,
    style,
    seed: o.seed,
    source,
    target,
    heading: o.heading,
  };
}

/** Même scène, autre cap. Tout le reste — seed, cadrage, style — est conservé. */
export function withHeading(stage: StageSetup, heading: number): StageSetup {
  const distance = Math.hypot(stage.source.x - stage.target.x, stage.source.y - stage.target.y);
  return {
    ...stage,
    heading,
    source: {
      x: stage.target.x - Math.cos(heading) * distance,
      y: stage.target.y - Math.sin(heading) * distance,
      z: stage.source.z,
    },
  };
}
