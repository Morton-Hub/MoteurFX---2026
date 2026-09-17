/**
 * Planche des motifs dessinés.
 *
 *   npx tsx src/cli/motifs.ts --out docs/planches/motifs.png --scale 4
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { deflateSync } from 'node:zlib';
import { IndexedCanvas } from '../pixels/canvas.js';
import { upscale } from '../pixels/rgba.js';
import { drawMotif, MOTIF_LIBRARY, motifBounds } from '../motifs/index.js';
import { encodePng, setDeflate } from '../exporter/png.js';

setDeflate((data) => new Uint8Array(deflateSync(data, { level: 9 })));

function main(): void {
  const args = process.argv.slice(2);
  const out = args[args.indexOf('--out') + 1] ?? 'docs/planches/motifs.png';
  const scale = Number(args[args.indexOf('--scale') + 1] ?? 4);
  const cell = 26;
  const columns = 10;

  const cells: { motif: (typeof MOTIF_LIBRARY)[number]; frame: number }[] = [];
  for (const m of MOTIF_LIBRARY) for (let f = 0; f < m.frames.length; f++) cells.push({ motif: m, frame: f });
  const rows = Math.ceil(cells.length / columns);
  const canvas = new IndexedCanvas(columns * cell, rows * cell);
  cells.forEach((entry, i) => {
    const x = (i % columns) * cell + cell / 2;
    const y = Math.floor(i / columns) * cell + cell / 2;
    const bounds = motifBounds(entry.motif, { x, y, frame: entry.frame });
    const tooWide = bounds.x1 - bounds.x0 > cell - 2;
    drawMotif(canvas, entry.motif, { x, y, frame: entry.frame, scale: tooWide ? 1 : 1 });
  });
  const image = upscale(canvas.toRgba([26, 24, 34, 255]), Math.max(1, Math.round(scale)));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, encodePng(image));
  console.log(`${out} — ${cells.length} dessins, ${image.width}x${image.height}`);
}

const invoked = process.argv[1] ?? '';
if (invoked.includes('motifs')) main();
