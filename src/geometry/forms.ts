/**
 * Formes procédurales de base : prismes, blocs, plaques.
 *
 * Elles donnent les relations spatiales et la cohérence entre caps — ce que
 * le procédural sait faire. Le caractère, lui, vient du dessin et des
 * réglages de chaque recette (§5).
 */

import { add3, cross3, norm3, scale3, type Vec3 } from '../core/math.js';
import { randN } from '../core/rng.js';
import { facetFromPoints, makeSolid, type Facet, type Solid } from './solid.js';

function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deux vecteurs orthogonaux à l'axe. Stable : pas de bascule au pôle. */
export function perpBasis(axis: Vec3): { u: Vec3; v: Vec3 } {
  const a = norm3(axis);
  const ref = Math.abs(a.z) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
  const u = norm3(cross3(a, ref));
  const v = norm3(cross3(a, u));
  return { u, v };
}

export type PrismOptions = {
  readonly id: string;
  readonly seed: number;
  readonly base: Vec3;
  readonly axis: Vec3;
  readonly length: number;
  readonly radius: number;
  /** 5 à 7 pans : au-delà, les facettes deviennent trop fines pour se lire. */
  readonly sides?: number;
  /** Rayon au sommet, en fraction du rayon de base. */
  readonly taper?: number;
  /** Part de la longueur occupée par la pointe. 0 = prisme coupé net. */
  readonly tip?: number;
  /** Irrégularité des rayons, en fraction. Un cristal n'est pas un tube. */
  readonly irregular?: number;
  /** Rotation du profil autour de l'axe, en radians. */
  readonly roll?: number;
};

/**
 * Prisme cristallin : un fût à pans et une pointe. C'est la brique de la
 * glace — et ce n'est pas un cône, dont la silhouette n'aurait pas d'arêtes.
 */
export function prism(o: PrismOptions): Solid {
  const sides = Math.max(3, Math.round(o.sides ?? 6));
  const taper = o.taper ?? 0.72;
  const tip = o.tip ?? 0.32;
  const irregular = o.irregular ?? 0.16;
  const roll = o.roll ?? 0;
  const axis = norm3(o.axis);
  const { u, v } = perpBasis(axis);
  const shaft = o.length * (1 - tip);
  const seed = o.seed ^ hashId(o.id);

  const ring = (radius: number, along: number, jitterChannel: number): Vec3[] =>
    Array.from({ length: sides }, (_, i) => {
      const a = roll + (i / sides) * Math.PI * 2;
      const j = 1 + (randN(seed, i, jitterChannel) - 0.5) * 2 * irregular;
      const r = radius * j;
      return add3(
        add3(o.base, scale3(axis, along)),
        add3(scale3(u, Math.cos(a) * r), scale3(v, Math.sin(a) * r)),
      );
    });

  const low = ring(o.radius, 0, 1);
  const high = ring(o.radius * taper, shaft, 2);
  const apex = add3(o.base, scale3(axis, o.length));
  const facets: Facet[] = [];

  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    facets.push(
      facetFromPoints([low[i] as Vec3, low[j] as Vec3, high[j] as Vec3, high[i] as Vec3]),
    );
    if (tip > 0.001) {
      facets.push(facetFromPoints([high[i] as Vec3, high[j] as Vec3, apex], 0.06));
    }
  }
  // Base fermée : sans elle, un cristal vu par le dessous laisse un trou.
  facets.push(facetFromPoints([...low].reverse(), -0.12));
  return makeSolid(o.id, facets);
}

export type ChunkOptions = {
  readonly id: string;
  readonly seed: number;
  readonly center: Vec3;
  /** Demi-dimensions avant irrégularité. */
  readonly size: Vec3;
  /** Déplacement de chaque sommet, en fraction de la taille. */
  readonly rough?: number;
  readonly roll?: number;
};

/**
 * Bloc irrégulier : masse rocheuse trapue. Ses sommets sont déplacés par une
 * seed stable, donc deux fragments d'une même explosion ne sont pas deux
 * copies du même caillou.
 */
export function chunk(o: ChunkOptions): Solid {
  const rough = o.rough ?? 0.3;
  const seed = o.seed ^ hashId(o.id);
  const roll = o.roll ?? 0;
  const c = Math.cos(roll);
  const s = Math.sin(roll);
  const corners: Vec3[] = [];
  for (let i = 0; i < 8; i++) {
    const sx = i & 1 ? 1 : -1;
    const sy = i & 2 ? 1 : -1;
    const sz = i & 4 ? 1 : -1;
    const jx = 1 + (randN(seed, i, 1) - 0.5) * 2 * rough;
    const jy = 1 + (randN(seed, i, 2) - 0.5) * 2 * rough;
    const jz = 1 + (randN(seed, i, 3) - 0.5) * 2 * rough;
    const lx = sx * o.size.x * jx;
    const ly = sy * o.size.y * jy;
    corners.push({
      x: o.center.x + lx * c - ly * s,
      y: o.center.y + lx * s + ly * c,
      z: o.center.z + sz * o.size.z * jz,
    });
  }
  const q = (a: number, b: number, cc: number, d: number): Facet =>
    facetFromPoints([corners[a] as Vec3, corners[b] as Vec3, corners[cc] as Vec3, corners[d] as Vec3]);
  const facets: Facet[] = [
    q(0, 1, 3, 2), // bas
    q(4, 6, 7, 5), // haut
    q(0, 4, 5, 1), // -y
    q(2, 3, 7, 6), // +y
    q(0, 2, 6, 4), // -x
    q(1, 5, 7, 3), // +x
  ];
  return makeSolid(o.id, facets);
}

export type SlabOptions = {
  readonly id: string;
  /** Centre de la face supérieure. */
  readonly center: Vec3;
  readonly forward: Vec3;
  readonly halfLength: number;
  readonly halfWidth: number;
  readonly thickness: number;
  /** Inclinaison autour de l'axe latéral, en radians. */
  readonly tilt?: number;
};

/** Plaque épaisse : dalle soulevée, éclat plat, marche de glace. */
export function slab(o: SlabOptions): Solid {
  const fwd = norm3(o.forward);
  const side = norm3(cross3({ x: 0, y: 0, z: 1 }, fwd));
  const tilt = o.tilt ?? 0;
  const up = norm3(
    add3(scale3({ x: 0, y: 0, z: 1 }, Math.cos(tilt)), scale3(fwd, -Math.sin(tilt))),
  );
  const along = norm3(cross3(side, up));
  const corner = (a: number, b: number, c: number): Vec3 =>
    add3(
      o.center,
      add3(
        add3(scale3(along, a * o.halfLength), scale3(side, b * o.halfWidth)),
        scale3(up, c * o.thickness),
      ),
    );
  const top = [corner(-1, -1, 0), corner(1, -1, 0), corner(1, 1, 0), corner(-1, 1, 0)];
  const bottom = [corner(-1, -1, -1), corner(1, -1, -1), corner(1, 1, -1), corner(-1, 1, -1)];
  const facets: Facet[] = [
    facetFromPoints(top),
    facetFromPoints([...bottom].reverse(), -0.1),
    facetFromPoints([top[0] as Vec3, bottom[0] as Vec3, bottom[1] as Vec3, top[1] as Vec3], 0.04),
    facetFromPoints([top[1] as Vec3, bottom[1] as Vec3, bottom[2] as Vec3, top[2] as Vec3], 0.04),
    facetFromPoints([top[2] as Vec3, bottom[2] as Vec3, bottom[3] as Vec3, top[3] as Vec3], 0.04),
    facetFromPoints([top[3] as Vec3, bottom[3] as Vec3, bottom[0] as Vec3, top[0] as Vec3], 0.04),
  ];
  return makeSolid(o.id, facets);
}
