/**
 * Diagnostic de cadrage. Calcule les limites de capture sur toutes les images
 * et tous les caps, puis propose un canevas et un pivot qui les contiennent.
 * Sert a dimensionner une recette une fois, et non a recadrer image par image.
 */

import { SPELLS } from '../spells/index.js';
import { captureBounds } from '../render/renderer.js';
import { sampleDirections } from '../space/directions.js';

const MARGIN = 4;
const dirs = sampleDirections(16, 0).map((d) => d.heading);

for (const recipe of SPELLS) {
  const b = captureBounds(recipe, dirs, {}, 2);
  const left = recipe.pivot.x - b.x0;
  const right = b.x1 - recipe.pivot.x;
  const up = recipe.pivot.y - b.y0;
  const down = b.y1 - recipe.pivot.y;
  const width = Math.ceil((left + right + MARGIN * 2) / 8) * 8;
  const height = Math.ceil((up + down + MARGIN * 2) / 8) * 8;
  const pivotX = Math.round(left + MARGIN);
  const pivotY = Math.round(up + MARGIN);
  const fits =
    b.x0 >= 0 && b.y0 >= 0 && b.x1 < recipe.canvas.width && b.y1 < recipe.canvas.height;
  process.stdout.write(
    `${recipe.id.padEnd(24)} bounds [${b.x0},${b.y0} -> ${b.x1},${b.y1}] ` +
      `canvas ${recipe.canvas.width}x${recipe.canvas.height} pivot ${recipe.pivot.x},${recipe.pivot.y} ` +
      `${fits ? 'OK  ' : 'HORS'} propose canvas ${width}x${height} pivot ${pivotX},${pivotY}\n`,
  );
}
