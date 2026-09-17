/**
 * Sol : ombres portées, marques et failles.
 *
 * L'ombre se place sur le sol, jamais sous l'objet en hauteur : c'est elle
 * qui dit à quelle hauteur vole un projectile (§7). Elle est **tramée**, car
 * un sprite indexé n'a pas d'alpha partiel et une tache pleine trouerait le
 * décor.
 */

import { type Vec2, type Vec3 } from '../core/math.js';
import { randN } from '../core/rng.js';
import type { IndexedCanvas } from '../pixels/canvas.js';
import type { ShapeMask } from '../pixels/mask.js';
import { getMaterial, type MaterialId, type RoleId } from '../pixels/palette.js';
import { paintRole } from '../pixels/shade.js';
import type { FrameContext } from '../renderer/context.js';

function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Disque posé à plat sur le sol, projeté. Ce n'est pas une ellipse d'écran. */
export function groundDisc(
  ctx: FrameContext,
  center: Vec3,
  radius: number,
  o: { steps?: number; wobble?: number; id?: string; seed?: number } = {},
): ShapeMask {
  const steps = Math.max(8, Math.round(o.steps ?? 16));
  const wobble = o.wobble ?? 0;
  const seed = (o.seed ?? 0) ^ hashId(o.id ?? 'ground-disc');
  const poly: Vec2[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const r = radius * (1 + (wobble > 0 ? (randN(seed, i, 1) - 0.5) * 2 * wobble : 0));
    poly.push(ctx.p({ x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r, z: center.z }));
  }
  const mask = ctx.mask(poly, 2);
  mask.addPolygon(poly);
  return mask;
}

/**
 * Ombre portée. Son rayon dépend de la hauteur : plus l'objet est haut, plus
 * l'ombre est large et diluée. Le tramage 2x2 tient lieu de demi-opacité.
 */
export function paintGroundShadow(
  canvas: IndexedCanvas,
  ctx: FrameContext,
  at: Vec3,
  radius: number,
  o: { id?: string; density?: number } = {},
): ShapeMask | null {
  if (!ctx.style.groundShadow) return null;
  const heightFade = Math.max(0.35, 1 - at.z * 0.22);
  const r = radius * (1 + at.z * 0.12);
  const mask = groundDisc(ctx, { x: at.x, y: at.y, z: 0 }, r, {
    wobble: 0.08,
    ...(o.id ? { id: o.id } : {}),
    seed: ctx.seed,
  });
  const material = getMaterial('shared.shadow');
  const level = (o.density ?? 0.5) * heightFade;
  paintRole(canvas, mask, material, 'deep', { level, matrix: 2 });
  return mask;
}

/** Marque au sol : brûlure, givre, arc. Tramée en deux valeurs. */
export function paintGroundMark(
  canvas: IndexedCanvas,
  ctx: FrameContext,
  at: Vec3,
  radius: number,
  materialId: MaterialId,
  o: { id?: string; core?: RoleId; edge?: RoleId; coreRatio?: number; density?: number } = {},
): ShapeMask {
  const material = getMaterial(materialId);
  const outer = groundDisc(ctx, { x: at.x, y: at.y, z: 0 }, radius, {
    wobble: 0.16,
    id: o.id ?? 'mark',
    seed: ctx.seed,
  });
  paintRole(canvas, outer, material, o.edge ?? 'deep', { level: o.density ?? 0.75, matrix: 4 });
  const inner = groundDisc(ctx, { x: at.x, y: at.y, z: 0 }, radius * (o.coreRatio ?? 0.55), {
    wobble: 0.2,
    id: `${o.id ?? 'mark'}/core`,
    seed: ctx.seed,
  });
  paintRole(canvas, inner, material, o.core ?? 'shadow');
  return outer;
}

/**
 * Faille : ligne brisée posée au sol, qui s'ouvre depuis un point. Les
 * branches ne sont pas régulières — une fissure n'a pas de pas constant.
 */
export function groundCracks(
  ctx: FrameContext,
  center: Vec3,
  o: {
    id: string;
    seed: number;
    count?: number;
    length: number;
    width?: number;
    spread?: number;
    /** Orientation générale, en radians monde. Passer le cap rend la marque
     *  différente d'une direction à l'autre, ce qui est le but. */
    angleOffset?: number;
  },
): ShapeMask {
  const count = Math.max(1, Math.round(o.count ?? 3));
  const seed = o.seed ^ hashId(o.id);
  const width = o.width ?? 1;
  const pts: Vec2[] = [];
  const lines: Vec2[][] = [];
  for (let i = 0; i < count; i++) {
    const a = (o.angleOffset ?? 0) + (i / count) * Math.PI * 2 + randN(seed, i, 1) * (o.spread ?? 0.7);
    const len = o.length * (0.55 + 0.8 * randN(seed, i, 2));
    const steps = 3;
    const line: Vec2[] = [];
    let cx = center.x;
    let cy = center.y;
    for (let s = 0; s <= steps; s++) {
      const k = s / steps;
      const wobble = (randN(seed, i * 8 + s, 3) - 0.5) * 0.5;
      cx = center.x + Math.cos(a + wobble) * len * k;
      cy = center.y + Math.sin(a + wobble) * len * k;
      line.push(ctx.p({ x: cx, y: cy, z: center.z }));
    }
    lines.push(line);
    pts.push(...line);
  }
  const mask = ctx.mask(pts, width + 2);
  for (const line of lines) mask.addPolyline(line, width);
  return mask;
}
