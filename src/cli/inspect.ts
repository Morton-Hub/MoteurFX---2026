/**
 * Inspection d'un rendu : bornes, couleurs, objets, signature.
 *
 *   npx tsx src/cli/inspect.ts --recipe fire-dragon-pillar-m --dirs 8
 */

import { compileRecipe } from '../compiler/compile.js';
import { getRecipe, listRecipes } from '../recipes/registry.js';
import { renderDirections } from '../exporter/pack.js';

function parseArgs(argv: readonly string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else out[key] = true;
  }
  return out;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const defs = args['all']
    ? listRecipes()
    : String(args['recipe'] ?? 'fire-ember-petal-s').split(',').map((id) => getRecipe(id.trim()));
  for (const def of defs) {
    const compiled = compileRecipe(def, { probeParams: false });
    const { frames } = renderDirections(compiled, { directions: Number(args['dirs'] ?? 8) });
    console.log(`\n${def.id}  canevas ${def.stage.width}x${def.stage.height}`);
    for (const row of frames) {
      const parts = row.frames.map((f) => {
        const b = f.bounds;
        return b ? `${String(f.index).padStart(2)}:${b.x0},${b.y0}-${b.x1},${b.y1}` : `${String(f.index).padStart(2)}:vide`;
      });
      console.log(` cap ${row.direction.label.padEnd(4)} ${parts.join(' ')}`);
    }
  }
}

const invoked = process.argv[1] ?? '';
if (invoked.includes('inspect')) main();
