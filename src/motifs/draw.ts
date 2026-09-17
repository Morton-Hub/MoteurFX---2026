/**
 * Pose d'un motif dessiné dans un canevas indexé.
 *
 * Trois règles garantissent que les pixels dessinés restent intacts :
 * placement à coordonnées **entières**, agrandissement **entier**, miroir
 * autorisé mais **rotation jamais** (§5.B, §6).
 */

import { getMaterial, type MaterialId, type RoleId } from '../pixels/palette.js';
import type { IndexedCanvas } from '../pixels/canvas.js';
import { ShapeMask } from '../pixels/mask.js';
import {
  forEachMotifPixel,
  motifBounds,
  type MotifPlacement,
  type PixelMotif,
} from './motif.js';

export type MotifPaint = {
  /** Remplace la matière du motif (même dessin, autre élément). */
  readonly material?: MaterialId;
  /** Décale tous les rôles sur la rampe : refroidissement, extinction. */
  readonly roleShift?: number;
  /** Ne peint que les pixels encore vides. */
  readonly behind?: boolean;
};

const ORDER: readonly RoleId[] = ['deep', 'shadow', 'body', 'light', 'accent'];

function shiftRole(role: RoleId, shift: number): RoleId {
  if (shift === 0 || role === 'outline') return role;
  const i = ORDER.indexOf(role);
  if (i < 0) return role;
  const j = Math.max(0, Math.min(ORDER.length - 1, i + Math.round(shift)));
  return ORDER[j] as RoleId;
}

export function drawMotif(
  canvas: IndexedCanvas,
  m: PixelMotif,
  place: MotifPlacement,
  paint: MotifPaint = {},
): void {
  const shift = paint.roleShift ?? 0;
  forEachMotifPixel(m, place, (x, y, ink) => {
    const materialId = paint.material ?? ink.material ?? m.material;
    const material = getMaterial(materialId);
    const role = shiftRole(ink.role, shift);
    const value = canvas.ink(material, material.roles[role] ? role : (material.ramp[material.ramp.length - 1] as RoleId));
    if (paint.behind) canvas.setBehind(x, y, value);
    else canvas.set(x, y, value);
  });
}

/** Masque de la silhouette d'un motif placé : ombre, émission, diagnostics. */
export function motifMask(m: PixelMotif, place: MotifPlacement, clipW: number, clipH: number): ShapeMask {
  const b = motifBounds(m, place);
  const mask = ShapeMask.forRect(b.x0, b.y0, b.x1, b.y1, clipW, clipH);
  forEachMotifPixel(m, place, (x, y) => mask.set(x, y));
  return mask;
}
