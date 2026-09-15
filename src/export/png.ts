/** Encodeur PNG RGBA sans perte. Alpha non premultiplie, filtre 0. */

import { deflateSync } from 'node:zlib';
import type { Framebuffer } from '../raster/framebuffer.js';

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (CRC_TABLE[(c ^ buf[i]!) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export function encodePng(fb: Framebuffer): Uint8Array {
  const { width, height, data } = fb;
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const dst = y * (width * 4 + 1);
    raw[dst] = 0;
    raw.set(data.subarray(y * width * 4, (y + 1) * width * 4), dst + 1);
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = new Uint8Array(deflateSync(raw, { level: 9 }));
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Agrandissement entier sans lissage. Le seul autorise sur des pixels. */
export function upscale(fb: Framebuffer, factor: number): Framebuffer {
  const f = Math.max(1, Math.round(factor));
  const out = new (fb.constructor as new (w: number, h: number) => Framebuffer)(
    fb.width * f,
    fb.height * f,
  );
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
