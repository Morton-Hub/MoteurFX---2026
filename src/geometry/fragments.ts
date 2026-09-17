/**
 * Fragmentation.
 *
 * Les fragments **dérivent** de l'objet cassé : leurs positions viennent des
 * facettes du solide d'origine, leurs directions de leurs normales. Un
 * cristal qui éclate ne produit pas des cailloux génériques (§12).
 */

import { add3, norm3, scale3, type Vec3 } from '../core/math.js';
import { randN } from '../core/rng.js';
import { solidCenter, type Solid } from './solid.js';

function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type Fragment = {
  readonly id: string;
  /** Position d'origine : le centre de la facette dont il vient. */
  readonly origin: Vec3;
  /** Direction de fuite, dérivée de la normale de la facette. */
  readonly direction: Vec3;
  readonly speed: number;
  /** Taille relative. Les gros morceaux sont rares. */
  readonly scale: number;
  readonly roll: number;
  /** Retard d'apparition, en fraction de la plage d'impact. */
  readonly delay: number;
};

export function shatter(
  solid: Solid,
  o: { id: string; seed: number; count?: number; lift?: number; speed?: number },
): Fragment[] {
  const seed = o.seed ^ hashId(o.id);
  const centre = solid.center;
  const faces = solid.facets;
  const count = Math.max(1, Math.round(o.count ?? Math.min(8, faces.length)));
  const lift = o.lift ?? 0.4;
  const speed = o.speed ?? 1;
  const out: Fragment[] = [];
  for (let i = 0; i < count; i++) {
    const face = faces[i % faces.length];
    if (!face) continue;
    const origin = solidCenter([face]);
    const away = norm3({
      x: origin.x - centre.x + face.normal.x * 0.4,
      y: origin.y - centre.y + face.normal.y * 0.4,
      z: origin.z - centre.z + face.normal.z * 0.4,
    });
    const dir = norm3(add3(away, { x: 0, y: 0, z: lift }));
    out.push({
      id: `${o.id}#${i}`,
      origin,
      direction: dir,
      speed: speed * (0.6 + 0.8 * randN(seed, i, 1)),
      // Beaucoup de petits, quelques gros : une explosion n'est pas une grille.
      scale: 0.35 + 0.65 * randN(seed, i, 2) ** 2,
      roll: randN(seed, i, 3) * Math.PI,
      delay: randN(seed, i, 4) * 0.4,
    });
  }
  return out;
}

/** Position d'un fragment après une durée normalisée, avec gravité. */
export function fragmentAt(f: Fragment, t: number, gravity = 3.2): Vec3 {
  const k = Math.max(0, t - f.delay);
  const p = add3(f.origin, scale3(f.direction, f.speed * k));
  return { x: p.x, y: p.y, z: Math.max(0, p.z - 0.5 * gravity * k * k) };
}
