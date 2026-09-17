/**
 * Solides à facettes.
 *
 * Une facette est un polygone monde avec sa normale. C'est la structure qui
 * donne à la glace, à la roche et au métal leur rigidité : la valeur d'une
 * face vient de son orientation, pas d'un dégradé vertical posé sur la
 * silhouette.
 *
 * Le tri se fait **par objet** : toutes les facettes d'un même solide sont
 * peintes ensemble, à la profondeur de son centre, puis contournées une seule
 * fois. Peindre facette par facette dans un tri global fait s'interpénétrer
 * deux solides voisins.
 */

import { add3, cross3, norm3, scale3, sub3, type Vec2, type Vec3 } from '../core/math.js';
import type { IndexedCanvas } from '../pixels/canvas.js';
import { ShapeMask } from '../pixels/mask.js';
import type { Material, RoleId } from '../pixels/palette.js';
import { paintContactShade, paintFacet, paintOutline, paintRim } from '../pixels/shade.js';
import { cameraDir, depthOf } from '../projection/projection.js';
import type { FrameContext } from '../renderer/context.js';

export type Facet = {
  /** Sommets monde, dans l'ordre. */
  readonly points: readonly Vec3[];
  /** Normale monde. Non normalisée acceptée. */
  readonly normal: Vec3;
  /** Décalage de valeur : arête vive, face interne, fond de faille. */
  readonly bias?: number;
  /** Matière propre à la facette, si elle diffère du solide. */
  readonly material?: Material;
};

export type Solid = {
  readonly id: string;
  readonly facets: readonly Facet[];
  /** Centre géométrique : c'est lui qui porte la profondeur de l'objet. */
  readonly center: Vec3;
};

export function facetFromPoints(points: readonly Vec3[], bias?: number): Facet {
  const a = points[0] as Vec3;
  const b = points[1] as Vec3;
  const c = points[2] as Vec3;
  const normal = norm3(cross3(sub3(b, a), sub3(c, a)));
  return bias === undefined ? { points, normal } : { points, normal, bias };
}

export function solidCenter(facets: readonly Facet[]): Vec3 {
  let sum: Vec3 = { x: 0, y: 0, z: 0 };
  let n = 0;
  for (const f of facets) {
    for (const p of f.points) {
      sum = add3(sum, p);
      n++;
    }
  }
  return n === 0 ? sum : scale3(sum, 1 / n);
}

export function makeSolid(id: string, facets: readonly Facet[]): Solid {
  return { id, facets, center: solidCenter(facets) };
}

/** Transforme tous les points d'un solide. */
export function mapSolid(s: Solid, fn: (p: Vec3) => Vec3, rotateNormal?: (n: Vec3) => Vec3): Solid {
  const facets = s.facets.map((f) => ({
    ...f,
    points: f.points.map(fn),
    normal: rotateNormal ? rotateNormal(f.normal) : f.normal,
  }));
  return makeSolid(s.id, facets);
}

export function solidDepth(s: Solid): number {
  return depthOf(s.center);
}

export type SolidPaint = {
  readonly material: Material;
  /** Liseré de lumière sur les arêtes tournées vers la lumière. */
  readonly rim?: RoleId | null;
  /** Ombre de contact du côté opposé. */
  readonly contact?: RoleId | null;
  /** Décalage global de valeur : refroidissement, mise à l'ombre. */
  readonly bias?: number;
  /** Ne peint que les faces tournées vers la caméra. */
  readonly cull?: boolean;
};

/** Silhouette écran d'un solide, faces visibles seulement. */
export function solidMask(ctx: FrameContext, s: Solid, cull = true): ShapeMask {
  const cam = cameraDir(ctx.projection);
  const pts: Vec2[] = [];
  const visible: Vec2[][] = [];
  for (const f of s.facets) {
    if (cull && f.normal.x * cam.x + f.normal.y * cam.y + f.normal.z * cam.z <= 0) continue;
    const poly = f.points.map((p) => ctx.p(p));
    visible.push(poly);
    pts.push(...poly);
  }
  const mask = ctx.mask(pts, 2);
  for (const poly of visible) mask.addPolygon(poly);
  return mask;
}

/**
 * Peint un solide : facettes triées entre elles, puis contour, liseré et
 * ombre de contact posés une seule fois sur la silhouette complète.
 */
export function paintSolidObject(
  canvas: IndexedCanvas,
  ctx: FrameContext,
  s: Solid,
  paint: SolidPaint,
): ShapeMask {
  const cam = cameraDir(ctx.projection);
  const cull = paint.cull ?? true;
  const faces = s.facets
    .filter((f) => !cull || f.normal.x * cam.x + f.normal.y * cam.y + f.normal.z * cam.z > 0)
    .map((f) => ({ f, depth: depthOf(solidCenter([f])) }))
    .sort((a, b) => a.depth - b.depth);

  const all: Vec2[] = [];
  for (const { f } of faces) for (const p of f.points) all.push(ctx.p(p));
  const silhouette = ctx.mask(all, 2);

  for (const { f } of faces) {
    const poly = f.points.map((p) => ctx.p(p));
    const mask = ctx.mask(poly, 1);
    mask.addPolygon(poly);
    silhouette.add(mask);
    paintFacet(canvas, mask, f.material ?? paint.material, {
      style: ctx.style,
      normal: f.normal,
      bias: (f.bias ?? 0) + (paint.bias ?? 0),
    });
  }
  if (paint.contact) paintContactShade(canvas, silhouette, paint.material, paint.contact, ctx.lightScreen);
  if (paint.rim) paintRim(canvas, silhouette, paint.material, paint.rim, ctx.lightScreen);
  paintOutline(canvas, silhouette, paint.material, ctx.style);
  return silhouette;
}
