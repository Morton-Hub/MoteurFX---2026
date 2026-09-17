/**
 * Réseaux de foudre.
 *
 * Zigzags, nœuds, fourches, branches interrompues. Le chemin est construit
 * dans le monde mais **déplacé dans le plan face caméra** : une décharge qui
 * zigzague dans la profondeur se lit comme un trait droit à l'écran.
 *
 * Le piège de l'élément est le trait tremblant redessiné à chaque frame. Ici
 * la seed d'une décharge appartient à la décharge, pas à la frame : une pose
 * peut être tenue plusieurs images, et c'est la **coupure** qui anime.
 */

import { add3, lerp3, scale3, sub3, type Vec2, type Vec3 } from '../core/math.js';
import { randN } from '../core/rng.js';
import { ShapeMask } from '../pixels/mask.js';
import { cameraPlane } from '../projection/projection.js';
import type { FrameContext } from '../renderer/context.js';

function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type BoltOptions = {
  readonly id: string;
  readonly from: Vec3;
  readonly to: Vec3;
  readonly seed: number;
  /** Nombre de segments. 5 à 9 : au-delà le zigzag devient du bruit. */
  readonly segments?: number;
  /** Amplitude du déplacement, en fraction de la longueur. */
  readonly jitter?: number;
  /** Fraction du trajet réellement parcourue : une décharge en cours. */
  readonly progress?: number;
};

/** Trajet d'une décharge, en points monde. */
export function boltPath(ctx: FrameContext, o: BoltOptions): Vec3[] {
  const segments = Math.max(2, Math.round(o.segments ?? 7));
  const jitter = o.jitter ?? 0.13;
  const progress = Math.max(0.05, Math.min(1, o.progress ?? 1));
  const seed = o.seed ^ hashId(o.id);
  const plane = cameraPlane(ctx.projection);
  const span = Math.hypot(o.to.x - o.from.x, o.to.y - o.from.y, o.to.z - o.from.z);
  const out: Vec3[] = [];
  const used = Math.max(2, Math.round(segments * progress));
  for (let i = 0; i <= used; i++) {
    // Espacement irrégulier : une décharge n'a pas de pas constant. Un zigzag
    // régulier se lit comme une onde dessinée à la règle.
    const jitterAlong = i === 0 || i === segments ? 0 : (randN(seed, i, 5) - 0.5) * 0.55;
    const k = Math.min(1, Math.max(0, (i + jitterAlong) / segments));
    const base = lerp3(o.from, o.to, k);
    if (i === 0 || (i === segments && progress >= 1)) {
      out.push(base);
      continue;
    }
    // Déplacement alterné : une couture brisée, pas une vague.
    const sign = i % 2 === 0 ? 1 : -1;
    // L'amplitude varie d'un coude à l'autre, et un coude sur quatre est
    // franchement plus marqué : c'est ce qui donne les nœuds.
    const knot = randN(seed, i, 4) > 0.75 ? 1.8 : 1;
    const across = (0.3 + randN(seed, i, 1)) * jitter * span * sign * knot;
    const along = (randN(seed, i, 2) - 0.5) * jitter * span * 0.4;
    out.push(add3(base, add3(scale3(plane.right, across), scale3(plane.up, along))));
  }
  return out;
}

/** Branches courtes greffées sur un trajet. Elles s'interrompent net. */
export function boltForks(
  ctx: FrameContext,
  path: readonly Vec3[],
  o: { id: string; seed: number; count?: number; lengthRatio?: number },
): Vec3[][] {
  const count = Math.max(0, Math.round(o.count ?? 2));
  const ratio = o.lengthRatio ?? 0.3;
  const seed = o.seed ^ hashId(`${o.id}/fork`);
  const plane = cameraPlane(ctx.projection);
  const out: Vec3[][] = [];
  if (path.length < 3) return out;
  for (let i = 0; i < count; i++) {
    const at = 1 + Math.floor(randN(seed, i, 1) * (path.length - 2));
    const start = path[at] as Vec3;
    const next = path[at + 1] ?? (path[at] as Vec3);
    const dir = sub3(next, start);
    const sign = randN(seed, i, 2) > 0.5 ? 1 : -1;
    const len = ratio * (0.6 + randN(seed, i, 3));
    const mid = add3(
      start,
      add3(scale3(dir, len * 0.6), scale3(plane.right, sign * len * 0.9)),
    );
    const end = add3(
      mid,
      add3(scale3(dir, len * 0.5), scale3(plane.right, sign * len * 0.35)),
    );
    out.push([start, mid, end]);
  }
  return out;
}

/**
 * Masque d'un réseau. L'épaisseur décroît le long du trajet : la racine d'une
 * décharge est plus large que son bout.
 */
export function boltMask(
  ctx: FrameContext,
  paths: readonly (readonly Vec3[])[],
  width: number,
  taper = 0.5,
): ShapeMask {
  const screen: Vec2[][] = paths.map((p) => p.map((w) => ctx.p(w)));
  const all: Vec2[] = [];
  for (const s of screen) all.push(...s);
  const mask = ctx.mask(all, Math.ceil(width) + 2);
  for (const s of screen) {
    for (let i = 0; i + 1 < s.length; i++) {
      const k = s.length <= 1 ? 0 : i / (s.length - 1);
      const w = Math.max(1, width * (1 - taper * k));
      mask.addSegment(s[i] as Vec2, s[i + 1] as Vec2, w);
    }
  }
  return mask;
}

/** Fantôme d'ionisation : le chemin, plus large et plus sombre, tenu une frame. */
export function ionMask(ctx: FrameContext, paths: readonly (readonly Vec3[])[], width: number): ShapeMask {
  return boltMask(ctx, paths, width, 0.2);
}

/** Nœuds du réseau : points où deux branches se rejoignent. */
export function boltNodes(paths: readonly (readonly Vec3[])[]): Vec3[] {
  const out: Vec3[] = [];
  for (const p of paths) {
    for (let i = 1; i + 1 < p.length; i += 2) out.push(p[i] as Vec3);
  }
  return out;
}

/** Nouveau réseau issu d'une pose tenue : mêmes nœuds, branches redistribuées. */
export function ShapeMaskUnion(masks: readonly ShapeMask[]): ShapeMask | null {
  const first = masks[0];
  if (!first) return null;
  const out = new ShapeMask(first.x0, first.y0, first.w, first.h);
  for (const m of masks) out.add(m);
  return out;
}
