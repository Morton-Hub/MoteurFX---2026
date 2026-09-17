/**
 * Sortie RGBA.
 *
 * Le corps d'un sprite MOTORFX2 vit en pixels **indexés** (voir `canvas.ts`).
 * Ce module ne sert qu'au moment de montrer ou d'exporter : conversion en
 * RGBA, agrandissement entier, composition de passes. Aucun anti-crénelage,
 * aucun filtrage : un pixel dessiné reste un pixel.
 */

export type RGBA = readonly [number, number, number, number];

export const rgba = (r: number, g: number, b: number, a = 255): RGBA => [r, g, b, a];

/** Lit `#RRGGBB` ou `RRGGBB`. Les palettes du document sont écrites ainsi. */
export function hex(value: string, alpha = 255): RGBA {
  const s = value.startsWith('#') ? value.slice(1) : value;
  if (!/^[0-9a-fA-F]{6}$/.test(s)) throw new Error(`Couleur invalide: "${value}"`);
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
    alpha,
  ];
}

export function toHex(c: RGBA): string {
  const h = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}

export function fade(c: RGBA, k: number): RGBA {
  return [c[0], c[1], c[2], Math.round(c[3] * Math.max(0, Math.min(1, k)))];
}

export function mixColor(a: RGBA, b: RGBA, t: number): RGBA {
  const k = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
    Math.round(a[3] + (b[3] - a[3]) * k),
  ];
}

/** Luminance perceptuelle. Sert au contrôle « lisible en monochrome ». */
export function luma(c: RGBA): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
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

  fill(c: RGBA): void {
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = c[0];
      this.data[i + 1] = c[1];
      this.data[i + 2] = c[2];
      this.data[i + 3] = c[3];
    }
  }

  isEmpty(): boolean {
    const d = this.data;
    for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return false;
    return true;
  }

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

  get(x: number, y: number): RGBA {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return [0, 0, 0, 0];
    const i = (y * this.width + x) * 4;
    return [this.data[i] ?? 0, this.data[i + 1] ?? 0, this.data[i + 2] ?? 0, this.data[i + 3] ?? 0];
  }

  clone(): Framebuffer {
    return new Framebuffer(this.width, this.height, new Uint8ClampedArray(this.data));
  }

  /** Copie `src` à la position donnée, sans redimensionnement. */
  blit(src: Framebuffer, dx: number, dy: number, mode: BlendMode = 'over'): void {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const i = (y * src.width + x) * 4;
        const a = src.data[i + 3] ?? 0;
        if (a === 0) continue;
        this.plot(dx + x, dy + y, [src.data[i] ?? 0, src.data[i + 1] ?? 0, src.data[i + 2] ?? 0, a], mode);
      }
    }
  }

  composite(src: Framebuffer, mode: BlendMode = 'over'): void {
    if (src.width !== this.width || src.height !== this.height) {
      throw new Error('composite: dimensions incompatibles');
    }
    this.blit(src, 0, 0, mode);
  }
}

/** Agrandissement entier sans lissage. Le seul autorisé sur des pixels. */
export function upscale(fb: Framebuffer, factor: number): Framebuffer {
  const f = Math.max(1, Math.round(factor));
  if (f === 1) return fb.clone();
  const out = new Framebuffer(fb.width * f, fb.height * f);
  for (let y = 0; y < fb.height; y++) {
    for (let x = 0; x < fb.width; x++) {
      const si = (y * fb.width + x) * 4;
      const r = fb.data[si] ?? 0;
      const g = fb.data[si + 1] ?? 0;
      const b = fb.data[si + 2] ?? 0;
      const a = fb.data[si + 3] ?? 0;
      for (let dy = 0; dy < f; dy++) {
        const row = ((y * f + dy) * out.width + x * f) * 4;
        for (let dx = 0; dx < f; dx++) {
          const di = row + dx * 4;
          out.data[di] = r;
          out.data[di + 1] = g;
          out.data[di + 2] = b;
          out.data[di + 3] = a;
        }
      }
    }
  }
  return out;
}
