/**
 * Encodeur PNG RGBA sans perte, alpha **droit** (non prémultiplié).
 *
 * Il doit fonctionner dans le navigateur comme en ligne de commande : la
 * compression par défaut est un flux zlib en blocs « stored », pur JavaScript
 * et sans dépendance. Le CLI installe `deflateSync` de Node par
 * `setDeflate()` pour des fichiers plus petits — le PNG produit est le même,
 * seule sa taille change.
 */

import type { Framebuffer } from '../pixels/rgba.js';

export type Deflater = (data: Uint8Array) => Uint8Array;

/** Flux zlib en blocs non compressés. Valide partout, simplement plus gros. */
function storedDeflate(data: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [];
  const MAX = 65535;
  for (let offset = 0; offset < data.length || offset === 0; offset += MAX) {
    const len = Math.min(MAX, data.length - offset);
    const last = offset + len >= data.length ? 1 : 0;
    const head = new Uint8Array(5);
    head[0] = last;
    head[1] = len & 0xff;
    head[2] = (len >> 8) & 0xff;
    head[3] = ~len & 0xff;
    head[4] = (~len >> 8) & 0xff;
    blocks.push(head, data.subarray(offset, offset + len));
    if (len === 0) break;
  }
  let adler = 1;
  let s1 = 1;
  let s2 = 0;
  for (let i = 0; i < data.length; i++) {
    s1 = (s1 + (data[i] as number)) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  adler = ((s2 << 16) | s1) >>> 0;
  const total = blocks.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(2 + total + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let p = 2;
  for (const b of blocks) {
    out.set(b, p);
    p += b.length;
  }
  out[p] = (adler >>> 24) & 0xff;
  out[p + 1] = (adler >>> 16) & 0xff;
  out[p + 2] = (adler >>> 8) & 0xff;
  out[p + 3] = adler & 0xff;
  return out;
}

let deflate: Deflater = storedDeflate;

/** Installe un compresseur (par exemple `deflateSync` de Node). */
export function setDeflate(fn: Deflater): void {
  deflate = fn;
}

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
    c = (CRC_TABLE[(c ^ (buf[i] as number)) & 0xff] ?? 0) ^ (c >>> 8);
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
    raw[dst] = 0; // filtre 0 : aucun. Les pixels restent lisibles tels quels.
    raw.set(data.subarray(y * width * 4, (y + 1) * width * 4), dst + 1);
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = deflate(raw);
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
