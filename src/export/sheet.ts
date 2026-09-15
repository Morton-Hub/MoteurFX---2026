/** Planches de contrôle : grilles d'images et comparaisons de directions. */

import { Framebuffer, type RGBA } from '../raster/framebuffer.js';

export function blit(dst: Framebuffer, src: Framebuffer, ox: number, oy: number): void {
  for (let y = 0; y < src.height; y++) {
    const ty = oy + y;
    if (ty < 0 || ty >= dst.height) continue;
    for (let x = 0; x < src.width; x++) {
      const tx = ox + x;
      if (tx < 0 || tx >= dst.width) continue;
      const si = (y * src.width + x) * 4;
      const a = src.data[si + 3] ?? 0;
      if (a === 0) continue;
      dst.plot(tx, ty, [src.data[si] ?? 0, src.data[si + 1] ?? 0, src.data[si + 2] ?? 0, a]);
    }
  }
}

export function filled(width: number, height: number, color: RGBA): Framebuffer {
  const fb = new Framebuffer(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) fb.plot(x, y, color);
  return fb;
}

export type SheetOptions = {
  readonly cols: number;
  readonly pad: number;
  readonly background: RGBA;
  /** Couleur des separations de cellule. Alpha 0 pour aucune. */
  readonly gridColor?: RGBA;
};

export function makeSheet(frames: readonly Framebuffer[], o: SheetOptions): Framebuffer {
  const first = frames[0];
  if (!first) throw new Error('makeSheet: aucune image');
  const cols = Math.max(1, o.cols);
  const rows = Math.ceil(frames.length / cols);
  const cw = first.width + o.pad;
  const ch = first.height + o.pad;
  const sheet = filled(cols * cw + o.pad, rows * ch + o.pad, o.background);
  frames.forEach((f, i) => {
    const cx = (i % cols) * cw + o.pad;
    const cy = Math.floor(i / cols) * ch + o.pad;
    if (o.gridColor && o.gridColor[3] > 0) {
      for (let x = -1; x <= f.width; x++) {
        sheet.plot(cx + x, cy - 1, o.gridColor);
        sheet.plot(cx + x, cy + f.height, o.gridColor);
      }
      for (let y = -1; y <= f.height; y++) {
        sheet.plot(cx - 1, cy + y, o.gridColor);
        sheet.plot(cx + f.width, cy + y, o.gridColor);
      }
    }
    blit(sheet, f, cx, cy);
  });
  return sheet;
}

/** Aplatit un rendu a alpha sur un fond opaque : contrôle clair / sombre. */
export function onBackground(fb: Framebuffer, bg: RGBA): Framebuffer {
  const out = filled(fb.width, fb.height, bg);
  blit(out, fb, 0, 0);
  return out;
}

/**
 * Recadre un framebuffer sur un rectangle donne. Le rectangle vient toujours
 * d'une prepasse sur toutes les images et tous les caps : recadrer image par
 * image ferait trembler le clip et casserait le pivot.
 */
export function crop(
  fb: Framebuffer,
  rect: { x0: number; y0: number; x1: number; y1: number },
): Framebuffer {
  const w = Math.max(1, rect.x1 - rect.x0 + 1);
  const h = Math.max(1, rect.y1 - rect.y0 + 1);
  const out = new Framebuffer(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = rect.x0 + x;
      const sy = rect.y0 + y;
      if (sx < 0 || sy < 0 || sx >= fb.width || sy >= fb.height) continue;
      const si = (sy * fb.width + sx) * 4;
      const di = (y * w + x) * 4;
      out.data[di] = fb.data[si] ?? 0;
      out.data[di + 1] = fb.data[si + 1] ?? 0;
      out.data[di + 2] = fb.data[si + 2] ?? 0;
      out.data[di + 3] = fb.data[si + 3] ?? 0;
    }
  }
  return out;
}

/** Centre un framebuffer dans une toile de taille fixe. */
export function center(fb: Framebuffer, width: number, height: number, bg: RGBA): Framebuffer {
  const out = filled(width, height, bg);
  blit(out, fb, Math.round((width - fb.width) / 2), Math.round((height - fb.height) / 2));
  return out;
}
