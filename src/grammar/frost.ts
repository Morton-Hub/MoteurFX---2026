/**
 * Matiere de givre au sol. Une plaque de glace n'est pas un disque : c'est
 * une étoile a branches inégales qui gagne du terrain par pointes, avec un
 * bord trame plutot qu'un contour net.
 */

import { type Vec3, TAU, clamp01 } from '../core/math.js';
import { randN, randRange } from '../core/rng.js';
import { depthOf } from '../space/projection.js';
import type { DrawCmd } from '../render/draw.js';
import { poly } from '../render/draw.js';
import { fade, type RGBA } from '../raster/framebuffer.js';
import type { SpellContext } from '../sim/types.js';

/** Contour étoile : rayons longs et courts alternes, tous irreguliers. */
export function frostOutline(
  center: Vec3,
  radius: number,
  arms: number,
  seed: number,
  spread = 0.45,
): Vec3[] {
  const pts: Vec3[] = [];
  const n = arms * 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + randRange(seed, i, 91, -0.09, 0.09);
    const long = i % 2 === 0;
    const r = radius * (long ? 1 - randN(seed, i, 92) * 0.22 : spread + randN(seed, i, 93) * 0.2);
    pts.push({ x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r, z: center.z });
  }
  return pts;
}

/**
 * Plaque de givre : un corps plein trame, un liseré clair sur les pointes,
 * et quelques aiguilles fines rayonnantes qui donnent la direction de
 * croissance du cristal.
 */
export function emitFrostPlate(
  ctx: SpellContext,
  center: Vec3,
  radius: number,
  arms: number,
  seed: number,
  alpha: number,
  tag = 'decal',
): DrawCmd[] {
  if (radius <= 0.02 || alpha <= 0) return [];
  const pal = ctx.palette;
  const depth = depthOf(center) - 4;
  const body = frostOutline(center, radius, arms, seed).map((p) => ctx.p(p));
  const inner = frostOutline(center, radius * 0.62, arms, seed + 17, 0.55).map((p) => ctx.p(p));
  const out: DrawCmd[] = [
    {
      layer: 'ground',
      depth,
      shape: poly(body),
      paint: { color: fade(pal.ground, alpha * 0.55), dither: { level: 0.72, matrix: 4 } },
      tag,
    },
    {
      layer: 'ground',
      depth: depth + 0.1,
      shape: poly(inner),
      paint: { color: fade(pal.accent, alpha * 0.5), dither: { level: 0.55, matrix: 4, phaseX: 2 } },
      tag,
    },
  ];
  // Aiguilles de croissance : elles pointent vers l'extérieur de la plaque.
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * TAU + randRange(seed, i, 94, -0.2, 0.2);
    const r0 = radius * 0.25;
    const r1 = radius * randRange(seed, i, 95, 0.85, 1.25);
    const p0 = ctx.p({ x: center.x + Math.cos(a) * r0, y: center.y + Math.sin(a) * r0, z: center.z });
    const p1 = ctx.p({ x: center.x + Math.cos(a) * r1, y: center.y + Math.sin(a) * r1, z: center.z });
    out.push({
      layer: 'ground',
      depth: depth + 0.2,
      shape: { t: 'ribbon', pts: [p0, p1], widths: [2.2, 0.6] },
      paint: { color: fade(pal.ramp[1] ?? pal.ground, alpha * 0.8) },
      tag,
    });
  }
  return out;
}

/** Eclat de gel bref sur une surface : lecture de la prise en glace. */
export function frostFlashColor(pal: { core: RGBA }, k: number): RGBA {
  return fade(pal.core, clamp01(k));
}
