/**
 * Atlas et pages.
 *
 * Une cellule par (direction, frame). La grille est **uniforme** : le pivot
 * garde alors la même place dans chaque cellule, ce qui est la condition pour
 * qu'un changement de cap ne fasse pas sauter le sprite en jeu (§15).
 *
 * Les passes multiples et les répétitions runtime ne comptent jamais comme de
 * nouvelles frames uniques : l'atlas d'émission a exactement la même grille
 * que l'atlas du corps.
 */

import { Framebuffer, type RGBA } from '../pixels/rgba.js';
import type { RenderedFrame } from '../renderer/render.js';
import type { DirectionSample } from '../projection/directions.js';

export type AtlasCell = {
  readonly direction: number;
  readonly frame: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Pivot, en pixels depuis le coin haut-gauche de la cellule. */
  readonly pivotX: number;
  readonly pivotY: number;
  readonly durationMs: number;
  readonly role: string | undefined;
  /** Rectangle réellement occupé, en coordonnées de cellule. `null` si vide. */
  readonly content: { x0: number; y0: number; x1: number; y1: number } | null;
};

export type Atlas = {
  readonly image: Framebuffer;
  readonly cells: readonly AtlasCell[];
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly columns: number;
  readonly rows: number;
  readonly padding: number;
  readonly extrude: number;
};

export type AtlasOptions = {
  /** Espace transparent entre cellules. */
  readonly padding?: number;
  /**
   * Duplication des pixels du bord dans le padding. Nécessaire quand la cible
   * filtre en bilinéaire ; inutile — et invisible — en filtrage Point.
   */
  readonly extrude?: number;
  /** Pivot commun, en pixels dans le canevas de capture. */
  readonly pivot: { readonly x: number; readonly y: number };
  /** Passe à extraire. */
  readonly pass?: 'body' | 'emission';
  readonly background?: RGBA;
};

export type DirectionFrames = {
  readonly direction: DirectionSample;
  readonly frames: readonly RenderedFrame[];
};

export function buildAtlas(
  perDirection: readonly DirectionFrames[],
  cellWidth: number,
  cellHeight: number,
  options: AtlasOptions,
): Atlas {
  const padding = options.padding ?? 0;
  const extrude = options.extrude ?? 0;
  const pass = options.pass ?? 'body';
  const columns = perDirection[0]?.frames.length ?? 0;
  const rows = perDirection.length;
  const stepX = cellWidth + padding * 2;
  const stepY = cellHeight + padding * 2;
  const image = new Framebuffer(stepX * columns, stepY * rows);
  if (options.background) image.fill(options.background);

  const cells: AtlasCell[] = [];
  perDirection.forEach((row, ri) => {
    row.frames.forEach((frame, ci) => {
      const source = pass === 'emission' ? frame.emission : frame.body;
      const fb = source.toRgba();
      const x = ci * stepX + padding;
      const y = ri * stepY + padding;
      image.blit(fb, x, y);
      if (extrude > 0) {
        for (let e = 1; e <= extrude; e++) {
          for (let px = 0; px < cellWidth; px++) {
            image.plot(x + px, y - e, fb.get(px, 0));
            image.plot(x + px, y + cellHeight - 1 + e, fb.get(px, cellHeight - 1));
          }
          for (let py = 0; py < cellHeight; py++) {
            image.plot(x - e, y + py, fb.get(0, py));
            image.plot(x + cellWidth - 1 + e, y + py, fb.get(cellWidth - 1, py));
          }
        }
      }
      cells.push({
        direction: row.direction.index,
        frame: frame.index,
        x,
        y,
        w: cellWidth,
        h: cellHeight,
        pivotX: options.pivot.x,
        pivotY: options.pivot.y,
        durationMs: frame.durationMs,
        role: frame.role,
        content: frame.bounds,
      });
    });
  });

  return { image, cells, cellWidth, cellHeight, columns, rows, padding, extrude };
}

/** Rectangle englobant de toutes les frames : sert à réduire la cellule. */
export function contentBounds(
  perDirection: readonly DirectionFrames[],
): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const row of perDirection) {
    for (const frame of row.frames) {
      if (!frame.bounds) continue;
      x0 = Math.min(x0, frame.bounds.x0);
      y0 = Math.min(y0, frame.bounds.y0);
      x1 = Math.max(x1, frame.bounds.x1);
      y1 = Math.max(y1, frame.bounds.y1);
    }
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
}
