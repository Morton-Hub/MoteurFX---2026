/**
 * Geometrie de sol : plaques, fractures, décalques. Tout est construit dans
 * le plan z = 0 puis projeté, donc un décalque suit toujours la projection
 * au sol et non la hauteur visuelle de l'objet qui l'a produit.
 */

import { type Vec2, type Vec3, TAU, add3, clamp01, norm3, ramp, scale3, sub3 } from '../core/math.js';
import { randN, randRange, randSigned } from '../core/rng.js';
import { depthOf } from '../space/projection.js';
import type { DrawCmd } from '../render/draw.js';
import { poly } from '../render/draw.js';
import { fade, type RGBA } from '../raster/framebuffer.js';
import type { SpellContext } from '../sim/types.js';

/** Contour irrégulier au sol, en monde. */
export function platePoints(
  center: Vec3,
  radius: number,
  sides: number,
  seed: number,
  irregularity = 0.3,
  roll = 0,
): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < sides; i++) {
    const a = roll + (i / sides) * TAU;
    const r = radius * (1 - irregularity * randN(seed, i, 11));
    out.push({ x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r, z: center.z });
  }
  return out;
}

/**
 * Trace brise entre deux points du sol. Le bruit dépend de l'index du
 * sommet, pas de l'horloge : la fracture garde la même forme d'une image a
 * l'autre, elle ne fremit pas.
 */
export function crackPath(
  from: Vec3,
  to: Vec3,
  segments: number,
  seed: number,
  amplitude: number,
): Vec3[] {
  const dir = sub3(to, from);
  const side = norm3({ x: -dir.y, y: dir.x, z: 0 });
  const out: Vec3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // L'amplitude s'annule aux extremites : la fracture reste ancree.
    const taper = Math.sin(t * Math.PI);
    const off = randSigned(seed, i, 12, amplitude) * taper;
    out.push(add3(add3(from, scale3(dir, t)), scale3(side, off)));
  }
  return out;
}

/** Branches latérales partant d'un trace principal. */
export function crackBranches(
  path: readonly Vec3[],
  seed: number,
  count: number,
  length: number,
): Vec3[][] {
  const out: Vec3[][] = [];
  for (let i = 0; i < count; i++) {
    const at = Math.floor(randRange(seed, i, 13, 1, path.length - 1));
    const a = path[at];
    const prev = path[at - 1];
    if (!a || !prev) continue;
    const dir = norm3(sub3(a, prev));
    const sideSign = randN(seed, i, 14) < 0.5 ? -1 : 1;
    const angle = randRange(seed, i, 15, 0.5, 1.2) * sideSign;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const bdir: Vec3 = { x: dir.x * c - dir.y * s, y: dir.x * s + dir.y * c, z: 0 };
    const len = length * randRange(seed, i, 16, 0.4, 1);
    out.push(crackPath(a, add3(a, scale3(bdir, len)), 3, seed + i * 7919, len * 0.12));
  }
  return out;
}

/** Ruban de fracture au sol : largeur decroissante vers la pointe. */
export function emitCrack(
  ctx: SpellContext,
  path: readonly Vec3[],
  width: number,
  color: RGBA,
  alpha: number,
  progress: number,
  tag = 'crack',
): DrawCmd[] {
  if (path.length < 2 || alpha <= 0) return [];
  const visible = Math.max(2, Math.ceil(path.length * clamp01(progress)));
  const pts: Vec2[] = [];
  const widths: number[] = [];
  for (let i = 0; i < visible; i++) {
    const p = path[i]!;
    pts.push(ctx.p(p));
    widths.push(width * (1 - (i / Math.max(1, path.length - 1)) * 0.75));
  }
  const mid = path[Math.floor(visible / 2)] ?? path[0]!;
  return [
    {
      layer: 'ground',
      depth: depthOf(mid) - 3,
      shape: { t: 'ribbon', pts, widths },
      paint: { color: fade(color, alpha) },
      tag,
    },
  ];
}

/** Decalque de plaque au sol, avec tramage possible sur les bords. */
export function emitPlate(
  ctx: SpellContext,
  center: Vec3,
  radius: number,
  sides: number,
  seed: number,
  color: RGBA,
  alpha: number,
  tag = 'decal',
  irregularity = 0.3,
): DrawCmd[] {
  if (radius <= 0 || alpha <= 0) return [];
  const pts = platePoints(center, radius, sides, seed, irregularity).map((p) => ctx.p(p));
  return [
    {
      layer: 'ground',
      depth: depthOf(center) - 4,
      shape: poly(pts),
      paint: { color: fade(color, alpha) },
      tag,
    },
  ];
}

/**
 * Onde annulaire au sol. Utilisee avec parcimonie : le prompt interdit de
 * superposer automatiquement un anneau a chaque sort, donc seules les
 * recettes ou l'anneau à un sens l'appellent.
 */
export function emitGroundRing(
  ctx: SpellContext,
  center: Vec3,
  radius: number,
  thickness: number,
  color: RGBA,
  alpha: number,
  tag = 'ring',
): DrawCmd[] {
  if (radius <= 0 || alpha <= 0) return [];
  const c = ctx.p(center);
  const rx = radius * ctx.projection.groundScale;
  return [
    {
      layer: 'ground',
      depth: depthOf(center) - 3,
      shape: { t: 'ring', c, rx, ry: rx * ctx.projection.groundRatio, thickness },
      paint: { color: fade(color, alpha) },
      tag,
    },
  ];
}

/** Attenuation douce d'un résidu : evite qu'un clip finisse avec un objet visible. */
export function residueAlpha(t: number, start: number, end: number, peak = 1): number {
  return peak * (1 - ramp(t, start, end));
}
