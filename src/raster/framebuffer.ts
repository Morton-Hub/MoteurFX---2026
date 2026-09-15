/**
 * Rasteriseur logiciel de référence sur Uint8ClampedArray.
 * Aucun anti-crenelage : les silhouettes doivent rester lisibles à la
 * résolution native. Le Canvas 2D ne sert qu'a présenter ces pixels.
 */

export type RGBA = readonly [number, number, number, number];

export const rgba = (r: number, g: number, b: number, a = 255): RGBA => [r, g, b, a];

/** Applique un facteur d'opacité a une couleur. */
export function fade(c: RGBA, k: number): RGBA {
  return [c[0], c[1], c[2], Math.round(c[3] * Math.max(0, Math.min(1, k)))];
}

/** Melange deux couleurs dans l'espace RGB (alpha interpole aussi). */
export function mixColor(a: RGBA, b: RGBA, t: number): RGBA {
  const k = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
    Math.round(a[3] + (b[3] - a[3]) * k),
  ];
}

export type BlendMode = 'over' | 'add';

export class Framebuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;

  constructor(width: number, height: number, data?: Uint8ClampedArray) {
    this.width = width;
    this.height = height;
    this.data = data ?? new Uint8ClampedArray(width * height * 4);
  }

  clear(): void {
    this.data.fill(0);
  }

  /** Vrai si aucun pixel n'a d'alpha non nul. */
  isEmpty(): boolean {
    const d = this.data;
    for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return false;
    return true;
  }

  /** Rectangle des pixels non transparents, ou null si l'image est vide. */
  opaqueBounds(alphaThreshold = 0): { x0: number; y0: number; x1: number; y1: number } | null {
    let x0 = this.width;
    let y0 = this.height;
    let x1 = -1;
    let y1 = -1;
    const d = this.data;
    for (let y = 0; y < this.height; y++) {
      const row = y * this.width * 4;
      for (let x = 0; x < this.width; x++) {
        if ((d[row + x * 4 + 3] ?? 0) > alphaThreshold) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    return x1 < 0 ? null : { x0, y0, x1, y1 };
  }

  plot(x: number, y: number, c: RGBA, mode: BlendMode = 'over'): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const a = c[3];
    if (a <= 0) return;
    const i = (y * this.width + x) * 4;
    const d = this.data;
    if (mode === 'add') {
      const k = a / 255;
      d[i] = (d[i] ?? 0) + c[0] * k;
      d[i + 1] = (d[i + 1] ?? 0) + c[1] * k;
      d[i + 2] = (d[i + 2] ?? 0) + c[2] * k;
      d[i + 3] = Math.max(d[i + 3] ?? 0, a);
      return;
    }
    if (a >= 255) {
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
      return;
    }
    const sa = a / 255;
    const da = (d[i + 3] ?? 0) / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    d[i] = (c[0] * sa + (d[i] ?? 0) * da * (1 - sa)) / oa;
    d[i + 1] = (c[1] * sa + (d[i + 1] ?? 0) * da * (1 - sa)) / oa;
    d[i + 2] = (c[2] * sa + (d[i + 2] ?? 0) * da * (1 - sa)) / oa;
    d[i + 3] = oa * 255;
  }

  /** Copie du buffer, pour les passes séparées couleur / lumière. */
  clone(): Framebuffer {
    return new Framebuffer(this.width, this.height, new Uint8ClampedArray(this.data));
  }

  /** Compose `src` par dessus ce buffer. */
  composite(src: Framebuffer, mode: BlendMode = 'over'): void {
    if (src.width !== this.width || src.height !== this.height) {
      throw new Error('composite: dimensions incompatibles');
    }
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = (y * this.width + x) * 4;
        const a = src.data[i + 3] ?? 0;
        if (a === 0) continue;
        this.plot(x, y, [src.data[i] ?? 0, src.data[i + 1] ?? 0, src.data[i + 2] ?? 0, a], mode);
      }
    }
  }
}

/** Matrice de Bayer 4x4, normalisee dans [0,1). Tramage ordonne, local. */
const BAYER4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

export function bayer4(x: number, y: number): number {
  const v = BAYER4[(y & 3) * 4 + (x & 3)] ?? 0;
  return v / 16;
}

/** Matrice 2x2 pour un grain plus grossier (gravats, ecume). */
const BAYER2 = [0, 2, 3, 1];

export function bayer2(x: number, y: number): number {
  const v = BAYER2[(y & 1) * 2 + (x & 1)] ?? 0;
  return v / 4;
}

export type Dither = {
  /** 1 = plein, 0 = rien. Compare à la matrice choisie. */
  readonly level: number;
  readonly matrix?: 2 | 4;
  /** Decalage de phase, pour que deux surfaces voisines ne trament pas pareil. */
  readonly phaseX?: number;
  readonly phaseY?: number;
};

export function ditherPasses(d: Dither | undefined, x: number, y: number): boolean {
  if (!d) return true;
  if (d.level >= 1) return true;
  if (d.level <= 0) return false;
  const px = x + (d.phaseX ?? 0);
  const py = y + (d.phaseY ?? 0);
  const t = d.matrix === 2 ? bayer2(px, py) : bayer4(px, py);
  return t < d.level;
}
