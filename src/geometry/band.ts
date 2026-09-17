/**
 * Rubans construits dans le plan face caméra.
 *
 * Une arche, une crête, une traînée épaisse : des formes dont la lecture doit
 * rester franche sous tous les caps, alors que leur position vit dans le
 * monde. La largeur est posée **perpendiculairement à l'axe** du ruban, sinon
 * toute courbure se lit comme une planche.
 */

import { add3, scale3, type Vec2, type Vec3 } from '../core/math.js';
import type { ShapeMask } from '../pixels/mask.js';
import { cameraPlane } from '../projection/projection.js';
import type { FrameContext } from '../renderer/context.js';

export type PlanePoint = { readonly u: number; readonly v: number };

export function planePoint(ctx: FrameContext, anchor: Vec3, p: PlanePoint): Vec3 {
  const plane = cameraPlane(ctx.projection);
  return add3(anchor, add3(scale3(plane.right, p.u), scale3(plane.up, p.v)));
}

/** Masque d'un ruban à largeur variable, tracé dans le plan face caméra. */
export function planeRibbon(
  ctx: FrameContext,
  anchor: Vec3,
  center: readonly PlanePoint[],
  widths: readonly number[],
): ShapeMask {
  const n = center.length;
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = center[Math.max(0, i - 1)] as PlanePoint;
    const b = center[Math.min(n - 1, i + 1)] as PlanePoint;
    const du = b.u - a.u;
    const dv = b.v - a.v;
    const len = Math.hypot(du, dv) || 1;
    const nu = dv / len;
    const nv = -du / len;
    const w = (widths[i] ?? widths[widths.length - 1] ?? 0) * 0.5;
    const c = center[i] as PlanePoint;
    left.push(ctx.p(planePoint(ctx, anchor, { u: c.u + nu * w, v: c.v + nv * w })));
    right.push(ctx.p(planePoint(ctx, anchor, { u: c.u - nu * w, v: c.v - nv * w })));
  }
  const poly = [...left, ...right.reverse()];
  const mask = ctx.mask(poly, 2);
  mask.addPolygon(poly);
  return mask;
}

/**
 * Arc surbaissé, de `-halfWidth` à `+halfWidth`, culminant à `height`.
 * `from` et `to` sur [0,1] découpent une portion : c'est ainsi qu'une arche
 * se referme, puis se rompt en son milieu.
 */
export function archPoints(
  halfWidth: number,
  height: number,
  steps = 10,
  from = 0,
  to = 1,
): PlanePoint[] {
  const out: PlanePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = from + ((to - from) * i) / steps;
    const angle = Math.PI * t;
    out.push({ u: -Math.cos(angle) * halfWidth, v: Math.sin(angle) * height });
  }
  return out;
}
