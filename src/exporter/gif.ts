/**
 * Encodeur GIF89a anime. Sert aux planches de contrôle : une animation
 * inspectable sans outil externe. Ce n'est pas le format de livraison du
 * jeu — celui-ci reste PNG + atlas + manifeste.
 *
 * Quantification par coupe médiane sur 255 couleurs, plus un index
 * transparent. Les palettes du projet sont courtes, la perte est donc
 * négligeable ; elle est mesurée par le nombre de couleurs d'origine.
 */

import type { Framebuffer } from '../pixels/rgba.js';

type Box = { pixels: number[]; rMin: number; rMax: number; gMin: number; gMax: number; bMin: number; bMax: number };

function boxOf(pixels: number[], colors: number[][]): Box {
  let rMin = 255;
  let rMax = 0;
  let gMin = 255;
  let gMax = 0;
  let bMin = 255;
  let bMax = 0;
  for (const i of pixels) {
    const c = colors[i]!;
    if (c[0]! < rMin) rMin = c[0]!;
    if (c[0]! > rMax) rMax = c[0]!;
    if (c[1]! < gMin) gMin = c[1]!;
    if (c[1]! > gMax) gMax = c[1]!;
    if (c[2]! < bMin) bMin = c[2]!;
    if (c[2]! > bMax) bMax = c[2]!;
  }
  return { pixels, rMin, rMax, gMin, gMax, bMin, bMax };
}

/** Coupe médiane. Renvoie au plus `max` couleurs representatives. */
function medianCut(colors: number[][], counts: number[], max: number): number[][] {
  let boxes: Box[] = [boxOf(colors.map((_, i) => i), colors)];
  while (boxes.length < max) {
    let bestIdx = -1;
    let bestSpan = 0;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]!;
      if (b.pixels.length < 2) continue;
      const span = Math.max(b.rMax - b.rMin, b.gMax - b.gMin, b.bMax - b.bMin);
      if (span > bestSpan) {
        bestSpan = span;
        bestIdx = i;
      }
    }
    if (bestIdx < 0 || bestSpan === 0) break;
    const b = boxes[bestIdx]!;
    const rs = b.rMax - b.rMin;
    const gs = b.gMax - b.gMin;
    const bs = b.bMax - b.bMin;
    const ch = rs >= gs && rs >= bs ? 0 : gs >= bs ? 1 : 2;
    const sorted = [...b.pixels].sort((p, q) => colors[p]![ch]! - colors[q]![ch]!);
    const half = Math.floor(sorted.length / 2);
    boxes = [
      ...boxes.slice(0, bestIdx),
      boxOf(sorted.slice(0, half), colors),
      boxOf(sorted.slice(half), colors),
      ...boxes.slice(bestIdx + 1),
    ];
  }
  return boxes.map((b) => {
    let r = 0;
    let g = 0;
    let bl = 0;
    let n = 0;
    for (const i of b.pixels) {
      const w = counts[i] ?? 1;
      r += colors[i]![0]! * w;
      g += colors[i]![1]! * w;
      bl += colors[i]![2]! * w;
      n += w;
    }
    return n === 0 ? [0, 0, 0] : [Math.round(r / n), Math.round(g / n), Math.round(bl / n)];
  });
}

class ByteStream {
  private bytes: number[] = [];
  byte(b: number): void {
    this.bytes.push(b & 0xff);
  }
  word(w: number): void {
    this.bytes.push(w & 0xff, (w >> 8) & 0xff);
  }
  raw(arr: readonly number[]): void {
    for (const b of arr) this.bytes.push(b & 0xff);
  }
  str(s: string): void {
    for (let i = 0; i < s.length; i++) this.bytes.push(s.charCodeAt(i));
  }
  toUint8(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/**
 * Compression LZW du corps d'image GIF.
 * Dictionnaire indexe par (prefixe << 8 | symbole) : la taille de code est
 * augmentee avant d'attribuer un code qui ne tiendrait plus.
 */
function lzwEncode(indices: Uint8Array, minCodeSize: number): number[] {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let nextCode = eoiCode + 1;
  let codeSize = minCodeSize + 1;
  let table = new Map<number, number>();

  const out: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  const emit = (code: number): void => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      out.push(bitBuffer & 0xff);
      bitBuffer >>>= 8;
      bitCount -= 8;
    }
  };

  emit(clearCode);
  if (indices.length === 0) {
    emit(eoiCode);
    if (bitCount > 0) out.push(bitBuffer & 0xff);
    return out;
  }

  let prefix = indices[0]!;
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i]!;
    const key = (prefix << 8) | k;
    const found = table.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    if (nextCode === 4096) {
      emit(clearCode);
      nextCode = eoiCode + 1;
      codeSize = minCodeSize + 1;
      table = new Map();
    } else {
      if (nextCode >= 1 << codeSize && codeSize < 12) codeSize++;
      table.set(key, nextCode++);
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoiCode);
  if (bitCount > 0) out.push(bitBuffer & 0xff);
  return out;
}

export type GifOptions = {
  /** Centièmes de seconde par image. Un nombre = cadence uniforme. */
  readonly delayCs: number | readonly number[];
  /** Fond applique sous les pixels transparents. null = transparence GIF. */
  readonly background?: readonly [number, number, number] | null;
  readonly loop?: boolean;
};

export function encodeGif(frames: readonly Framebuffer[], o: GifOptions): Uint8Array {
  const first = frames[0];
  if (!first) throw new Error('encodeGif: aucune image');
  const width = first.width;
  const height = first.height;
  const bg = o.background ?? null;

  // Histogramme global : une seule palette pour tout le clip evite le
  // scintillement de couleurs d'une image a l'autre.
  const hist = new Map<number, number>();
  for (const f of frames) {
    for (let i = 0; i < f.data.length; i += 4) {
      const a = f.data[i + 3] ?? 0;
      let r = f.data[i] ?? 0;
      let g = f.data[i + 1] ?? 0;
      let b = f.data[i + 2] ?? 0;
      if (a < 250) {
        if (!bg) {
          if (a < 8) continue;
        }
        const src = bg ?? [0, 0, 0];
        const k = a / 255;
        r = Math.round(r * k + src[0]! * (1 - k));
        g = Math.round(g * k + src[1]! * (1 - k));
        b = Math.round(b * k + src[2]! * (1 - k));
      }
      const key = (r << 16) | (g << 8) | b;
      hist.set(key, (hist.get(key) ?? 0) + 1);
    }
  }
  const uniq = [...hist.keys()].map((k) => [(k >> 16) & 255, (k >> 8) & 255, k & 255]);
  const counts = [...hist.values()];
  const reserve = bg ? 0 : 1;
  const palette = uniq.length <= 256 - reserve ? uniq : medianCut(uniq, counts, 256 - reserve);
  if (bg) {
    // Le fond doit exister exactement dans la palette pour rester net.
    palette.unshift([bg[0]!, bg[1]!, bg[2]!]);
    while (palette.length > 256) palette.pop();
  }
  const transparentIndex = bg ? -1 : palette.length;
  const tableSize = 1 << Math.ceil(Math.log2(Math.max(4, palette.length + reserve)));
  const minCodeSize = Math.round(Math.log2(tableSize));

  const nearest = new Map<number, number>();
  const lookup = (r: number, g: number, b: number): number => {
    const key = (r << 16) | (g << 8) | b;
    const hit = nearest.get(key);
    if (hit !== undefined) return hit;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const c = palette[i]!;
      const d = (c[0]! - r) ** 2 + (c[1]! - g) ** 2 + (c[2]! - b) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    nearest.set(key, best);
    return best;
  };

  const s = new ByteStream();
  s.str('GIF89a');
  s.word(width);
  s.word(height);
  s.byte(0xf0 | (Math.log2(tableSize) - 1));
  s.byte(0);
  s.byte(0);
  for (let i = 0; i < tableSize; i++) {
    const c = palette[i] ?? [0, 0, 0];
    s.raw([c[0]!, c[1]!, c[2]!]);
  }
  if (o.loop !== false) {
    s.byte(0x21);
    s.byte(0xff);
    s.byte(11);
    s.str('NETSCAPE2.0');
    s.byte(3);
    s.byte(1);
    s.word(0);
    s.byte(0);
  }

  frames.forEach((f, fi) => {
    s.byte(0x21);
    s.byte(0xf9);
    s.byte(4);
    s.byte(transparentIndex >= 0 ? 0x09 : 0x04);
    // Les douze expositions sont conservées telles quelles : l'aperçu ne
    // convertit pas des durées variables en cadence fixe.
    s.word(typeof o.delayCs === 'number' ? o.delayCs : Math.max(2, Math.round(o.delayCs[fi] ?? 5)));
    s.byte(transparentIndex >= 0 ? transparentIndex : 0);
    s.byte(0);

    const idx = new Uint8Array(width * height);
    for (let i = 0, p = 0; i < f.data.length; i += 4, p++) {
      const a = f.data[i + 3] ?? 0;
      if (a < 8 && transparentIndex >= 0) {
        idx[p] = transparentIndex;
        continue;
      }
      let r = f.data[i] ?? 0;
      let g = f.data[i + 1] ?? 0;
      let b = f.data[i + 2] ?? 0;
      if (a < 250) {
        const src = bg ?? [0, 0, 0];
        const k = a / 255;
        r = Math.round(r * k + src[0]! * (1 - k));
        g = Math.round(g * k + src[1]! * (1 - k));
        b = Math.round(b * k + src[2]! * (1 - k));
      }
      idx[p] = lookup(r, g, b);
    }

    s.byte(0x2c);
    s.word(0);
    s.word(0);
    s.word(width);
    s.word(height);
    s.byte(0);
    s.byte(minCodeSize);
    const body = lzwEncode(idx, minCodeSize);
    for (let i = 0; i < body.length; i += 255) {
      const block = body.slice(i, i + 255);
      s.byte(block.length);
      s.raw(block);
    }
    s.byte(0);
  });
  s.byte(0x3b);
  return s.toUint8();
}
