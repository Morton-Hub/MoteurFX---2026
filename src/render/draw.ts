/**
 * Commandes de dessin en espace écran. Une recette produit des commandes ;
 * le renderer les trié et les rasterise. Aucune commande ne connait le
 * framebuffer, ce qui permet de calculer les limites de capture en prepasse
 * sans rasteriser.
 */

import type { Vec2 } from '../core/math.js';
import type { BlendMode, Dither, RGBA } from '../raster/framebuffer.js';
import { ShapeMask } from '../raster/mask.js';
import type { Stamp, StampPlacement } from '../art/stamp.js';
import { forEachStampPixel, placementBounds } from '../art/stamp.js';

export type Shape =
  | { readonly t: 'poly'; readonly pts: readonly Vec2[] }
  | { readonly t: 'polys'; readonly list: readonly (readonly Vec2[])[] }
  | { readonly t: 'ribbon'; readonly pts: readonly Vec2[]; readonly widths: readonly number[] }
  | { readonly t: 'line'; readonly pts: readonly Vec2[]; readonly width: number }
  | { readonly t: 'disc'; readonly c: Vec2; readonly r: number }
  | { readonly t: 'ellipse'; readonly c: Vec2; readonly rx: number; readonly ry: number }
  | { readonly t: 'ring'; readonly c: Vec2; readonly rx: number; readonly ry: number; readonly thickness: number }
  /**
   * Silhouette dessinee, posee telle quelle. `minValue` selectionne un niveau
   * de la grille : 1 prend toute la matiere, 2 ou 3 ne prennent que les
   * accents chauds, ce qui permet d'en faire une commande separee au lieu
   * d'inventer un modele de peinture par pixel.
   */
  | {
      readonly t: 'stamp';
      readonly stamp: Stamp;
      readonly at: Vec2;
      readonly scale?: number;
      readonly flipX?: boolean;
      readonly minValue?: number;
    };

/** Degrade postérisé le long de l'axe vertical écran. Bandes franches. */
export type Ramp = {
  readonly y0: number;
  readonly y1: number;
  readonly stops: readonly RGBA[];
};

export type Paint = {
  readonly color: RGBA;
  readonly ramp?: Ramp;
  readonly dither?: Dither;
  readonly mode?: BlendMode;
};

export type Layer = 'ground' | 'main' | 'light';

export type DrawCmd = {
  readonly layer: Layer;
  /** Cle de tri croissante vers l'observateur. */
  readonly depth: number;
  readonly shape: Shape;
  readonly paint: Paint;
  /** Vides internes retires du masque (langues de feu, arcs ouverts). */
  readonly holes?: readonly Shape[];
  /** Liseré intérieur de la silhouette. */
  readonly outline?: { readonly color: RGBA; readonly dither?: Dither };
  /**
   * Matière du corps.
   *
   * `solid` reçoit la passe de volume : liseré clair, ombre de contact,
   * contour. `soft` ne la reçoit pas — appliquer une structure de volume à de
   * la poussière, de la fumée ou une nappe de flamme les transforme en objets
   * solides, avec un contour net et une arête éclairée qu'un gaz n'a pas.
   *
   * `emissive` est réservé aux corps qui rayonnent — flammes, plasma. Leur
   * couleur ne vient pas de la lumière extérieure mais de l'épaisseur de
   * matière : la silhouette réunie est recolorée par sa distance au bord, et
   * la couleur portée par la commande est ignorée.
   *
   * Par défaut `solid`, parce que c'est le cas des corps qui portent la
   * lecture ; les matières diffuses et lumineuses le déclarent.
   */
  readonly material?: 'solid' | 'soft' | 'emissive';
  /** Etiquette de debogage : affichage isole par categorie dans l'editeur. */
  readonly tag?: string;
};

/** Points caracteristiques d'une forme, pour borner un masque. */
function shapePoints(s: Shape): Vec2[] {
  switch (s.t) {
    case 'poly':
      return [...s.pts];
    case 'polys':
      return s.list.flatMap((p) => [...p]);
    case 'ribbon': {
      const pad = Math.max(1, ...s.widths);
      return s.pts.flatMap((p) => [
        { x: p.x - pad, y: p.y - pad },
        { x: p.x + pad, y: p.y + pad },
      ]);
    }
    case 'line': {
      const pad = Math.max(1, s.width);
      return s.pts.flatMap((p) => [
        { x: p.x - pad, y: p.y - pad },
        { x: p.x + pad, y: p.y + pad },
      ]);
    }
    case 'disc':
      return [
        { x: s.c.x - s.r, y: s.c.y - s.r },
        { x: s.c.x + s.r, y: s.c.y + s.r },
      ];
    case 'ellipse':
    case 'ring':
      return [
        { x: s.c.x - s.rx, y: s.c.y - s.ry },
        { x: s.c.x + s.rx, y: s.c.y + s.ry },
      ];
    case 'stamp': {
      const b = placementBounds(toPlacement(s));
      return [
        { x: b.x0, y: b.y0 },
        { x: b.x1, y: b.y1 },
      ];
    }
  }
}

function toPlacement(s: Extract<Shape, { t: 'stamp' }>): StampPlacement {
  return { stamp: s.stamp, x: s.at.x, y: s.at.y, scale: s.scale, flipX: s.flipX };
}

/** Rectangle écran d'une commande, sans rasterisation. */
export function cmdBounds(cmd: DrawCmd): { x0: number; y0: number; x1: number; y1: number } | null {
  const pts = shapePoints(cmd.shape);
  if (pts.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  if (!Number.isFinite(x0)) return null;
  return { x0: Math.floor(x0) - 1, y0: Math.floor(y0) - 1, x1: Math.ceil(x1) + 1, y1: Math.ceil(y1) + 1 };
}

export function addShape(mask: ShapeMask, s: Shape): void {
  switch (s.t) {
    case 'poly':
      mask.addPolygon(s.pts);
      break;
    case 'polys':
      for (const p of s.list) mask.addPolygon(p);
      break;
    case 'ribbon':
      mask.addRibbon(s.pts, s.widths);
      break;
    case 'line':
      mask.addPolyline(s.pts, s.width);
      break;
    case 'disc':
      mask.addDisc(s.c.x, s.c.y, s.r);
      break;
    case 'ellipse':
      mask.addEllipse(s.c.x, s.c.y, s.rx, s.ry);
      break;
    case 'ring':
      mask.addEllipseRing(s.c.x, s.c.y, s.rx, s.ry, s.thickness);
      break;
    case 'stamp': {
      const min = s.minValue ?? 1;
      forEachStampPixel(toPlacement(s), (x, y, v) => {
        if (v >= min) mask.set(x, y);
      });
      break;
    }
  }
}

export function maskForCmd(cmd: DrawCmd, clipW: number, clipH: number): ShapeMask {
  const pts = shapePoints(cmd.shape);
  const mask = ShapeMask.forPoints(pts, 2, clipW, clipH);
  addShape(mask, cmd.shape);
  if (cmd.holes && cmd.holes.length > 0) {
    const holeMask = new ShapeMask(mask.x0, mask.y0, mask.w, mask.h);
    for (const h of cmd.holes) addShape(holeMask, h);
    mask.subtract(holeMask);
  }
  return mask;
}

/** Couleur effective d'un pixel : rampe postérisée si présente, sinon couleur plate. */
export function paintColorAt(paint: Paint, y: number): RGBA {
  const ramp = paint.ramp;
  if (!ramp || ramp.stops.length === 0) return paint.color;
  const span = ramp.y1 - ramp.y0;
  const t = span === 0 ? 0 : (y + 0.5 - ramp.y0) / span;
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const idx = Math.min(ramp.stops.length - 1, Math.floor(clamped * ramp.stops.length));
  return ramp.stops[idx] ?? paint.color;
}

// --- Constructeurs courts, pour garder les recettes lisibles. ---

export function poly(pts: readonly Vec2[]): Shape {
  return { t: 'poly', pts };
}
export function polys(list: readonly (readonly Vec2[])[]): Shape {
  return { t: 'polys', list };
}
export function ribbon(pts: readonly Vec2[], widths: readonly number[]): Shape {
  return { t: 'ribbon', pts, widths };
}
export function line(pts: readonly Vec2[], width: number): Shape {
  return { t: 'line', pts, width };
}
export function disc(c: Vec2, r: number): Shape {
  return { t: 'disc', c, r };
}
export function ellipse(c: Vec2, rx: number, ry: number): Shape {
  return { t: 'ellipse', c, rx, ry };
}
export function ring(c: Vec2, rx: number, ry: number, thickness: number): Shape {
  return { t: 'ring', c, rx, ry, thickness };
}
export function stampAt(
  s: Stamp,
  at: Vec2,
  opts?: { scale?: number; flipX?: boolean; minValue?: number },
): Shape {
  return { t: 'stamp', stamp: s, at, scale: opts?.scale, flipX: opts?.flipX, minValue: opts?.minValue };
}
