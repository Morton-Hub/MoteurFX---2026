/**
 * Corps mous : langues de feu, ecume, fumée, poussière.
 *
 * Le contour est construit dans le plan monde face camera, jamais directement
 * en pixels : l'objet garde une position monde, donc une profondeur et une
 * ombre au sol cohérentes, tandis que sa silhouette reste lisible.
 *
 * Le bruit de contour est harmonique et pilote par une phase continue. Une
 * langue ondule donc au lieu de se renouveler entierement a chaque image.
 */

import { type Vec3, TAU, add3, scale3 } from '../core/math.js';
import { randN } from '../core/rng.js';
import { cameraPlane } from '../space/projection.js';
import type { ProjectionProfile } from '../space/projection.js';

export type BlobSpec = {
  readonly center: Vec3;
  readonly radius: number;
  /** > 1 : plus haut que large. */
  readonly aspect: number;
  /** Decalage horizontal proportionnel à la hauteur : la langue penche. */
  readonly lean: number;
  /** Amplitude du bruit de contour, en fraction du rayon. */
  readonly wobble: number;
  /** Phase continue du bruit. Avance avec le temps. */
  readonly phase: number;
  readonly sides: number;
  readonly seed: number;
  /** Pointe le sommet : 0 = ovale, 1 = langue effilee. */
  readonly taper?: number;
};

/** Contour ferme d'un corps mou, en coordonnees monde. */
export function blobPolygon(p: ProjectionProfile, s: BlobSpec): Vec3[] {
  const { right, up } = cameraPlane(p);
  const out: Vec3[] = [];
  const taper = s.taper ?? 0;
  const h1 = randN(s.seed, 1, 21) * TAU;
  const h2 = randN(s.seed, 2, 22) * TAU;
  const h3 = randN(s.seed, 3, 23) * TAU;
  for (let i = 0; i < s.sides; i++) {
    const a = (i / s.sides) * TAU;
    // Trois harmoniques impaires : contour asymétrique sans etre bruiteux.
    const n =
      Math.sin(a * 3 + h1 + s.phase) * 0.55 +
      Math.sin(a * 5 - h2 + s.phase * 1.7) * 0.3 +
      Math.sin(a * 2 + h3 - s.phase * 0.6) * 0.15;
    let r = s.radius * (1 + n * s.wobble);
    const vy = Math.sin(a);
    // Effilement : le haut se resserre, le bas reste large.
    if (taper > 0 && vy > 0) r *= 1 - taper * vy * vy;
    const hx = Math.cos(a) * r;
    const hy = vy * r * s.aspect;
    const leanX = hx + s.lean * Math.max(0, hy);
    out.push(add3(s.center, add3(scale3(right, leanX), scale3(up, hy))));
  }
  return out;
}

/**
 * Vide interne. Une langue de feu se lit a ses trous autant qu'a sa
 * silhouette : ils sont plus petits, décalés vers le haut, et se creusent
 * quand la langue s'étire.
 */
export function voidPolygon(p: ProjectionProfile, s: BlobSpec, index: number, scale: number): Vec3[] {
  const { right, up } = cameraPlane(p);
  const ox = (randN(s.seed, index, 31) - 0.5) * s.radius * 0.7;
  const oy = (0.15 + randN(s.seed, index, 32) * 0.55) * s.radius * s.aspect;
  const center = add3(s.center, add3(scale3(right, ox + s.lean * oy), scale3(up, oy)));
  return blobPolygon(p, {
    ...s,
    center,
    radius: s.radius * scale,
    aspect: s.aspect * 0.85,
    wobble: s.wobble * 1.2,
    phase: s.phase * 1.4 + index,
    sides: Math.max(6, Math.round(s.sides * 0.6)),
    seed: s.seed + index * 977,
    taper: 0,
  });
}
