/**
 * Planche de controle du catalogue : une ligne par sort, cinq instants cles.
 * Chaque cellule est recadree sur les limites de capture calculees en prepasse
 * pour le cap 0, puis centree dans une cellule commune. C'est la planche a
 * regarder pour juger les identites, pas les instantanes isoles.
 *
 *   npx tsx src/cli/board.ts [--out out/planche.png] [--scale 2] [--raw]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { SPELLS } from '../spells/index.js';
import { captureBounds, renderFrame } from '../render/renderer.js';
import { DEFAULT_STYLE, RAW_STYLE } from '../style/styleProfile.js';
import { encodePng, upscale } from '../export/png.js';
import { blit, center, crop, filled, onBackground } from '../export/sheet.js';
import type { RGBA } from '../raster/framebuffer.js';

const MOMENTS = [0.16, 0.34, 0.5, 0.66, 0.84];
const DARK: RGBA = [24, 27, 35, 255];
const GRID: RGBA = [52, 58, 72, 255];
const PAD = 4;

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : fallback;
};
const raw = argv.includes('--raw');
const silhouette = argv.includes('--silhouette');
const scale = Number(arg('scale', '2'));
const outPath = arg('out', raw ? 'out/planche-brute.png' : 'out/planche.png');

const style = raw ? RAW_STYLE : DEFAULT_STYLE;

const rows = SPELLS.map((recipe) => {
  const rect = captureBounds(recipe, [0], {}, 2);
  const clipped = {
    x0: Math.max(0, rect.x0),
    y0: Math.max(0, rect.y0),
    x1: Math.min(recipe.canvas.width - 1, rect.x1),
    y1: Math.min(recipe.canvas.height - 1, rect.y1),
  };
  return MOMENTS.map((t) =>
    crop(renderFrame(recipe, t, { heading: 0, style, silhouetteOnly: silhouette }).color, clipped),
  );
});

const cellW = Math.max(...rows.flat().map((f) => f.width));
const cellH = Math.max(...rows.flat().map((f) => f.height));
const sheet = filled(
  MOMENTS.length * (cellW + PAD) + PAD,
  rows.length * (cellH + PAD) + PAD,
  [14, 16, 22, 255],
);

rows.forEach((row, r) => {
  row.forEach((fb, c) => {
    const x = PAD + c * (cellW + PAD);
    const y = PAD + r * (cellH + PAD);
    for (let i = -1; i <= cellW; i++) {
      sheet.plot(x + i, y - 1, GRID);
      sheet.plot(x + i, y + cellH, GRID);
    }
    for (let i = -1; i <= cellH; i++) {
      sheet.plot(x - 1, y + i, GRID);
      sheet.plot(x + cellW, y + i, GRID);
    }
    blit(sheet, center(onBackground(fb, DARK), cellW, cellH, DARK), x, y);
  });
});

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, encodePng(upscale(sheet, scale)));
process.stdout.write(
  `planche ecrite: ${outPath} (${sheet.width * scale}x${sheet.height * scale}, ` +
    `${SPELLS.length} sorts x ${MOMENTS.length} instants)\n`,
);
