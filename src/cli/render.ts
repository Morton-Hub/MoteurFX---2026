/**
 * Rendu en ligne de commande.
 *
 * Même compilateur et même renderer que l'éditeur (§8) : c'est ce qui rend
 * vérifiable la parité navigateur/CLI.
 *
 *   npx tsx src/cli/render.ts --all --dirs 8 --out out
 *   npx tsx src/cli/render.ts --recipe ice-aurora-needle-s --frames --preview
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { hasErrors } from '../core/diagnostics.js';
import { compileRecipe } from '../compiler/compile.js';
import { getRecipe, listRecipes } from '../recipes/registry.js';
import { exportSpell } from '../exporter/pack.js';
import { setDeflate } from '../exporter/png.js';

setDeflate((data) => new Uint8Array(deflateSync(data, { level: 9 })));

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
    } else {
      out[key] = true;
    }
  }
  return out;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const outDir = String(args['out'] ?? 'out');
  const recipes = args['all']
    ? listRecipes()
    : String(args['recipe'] ?? 'fire-ember-fist-s')
        .split(',')
        .map((id) => getRecipe(id.trim()));

  let failed = false;
  for (const def of recipes) {
    const compiled = compileRecipe(def);
    for (const d of compiled.diagnostics) {
      console.log(`[${d.level}] ${d.code} ${d.path ?? ''} — ${d.message}`);
    }
    if (hasErrors(compiled.diagnostics)) {
      failed = true;
      console.error(`${def.id} : compilation en erreur, aucun fichier écrit.`);
      continue;
    }
    const result = exportSpell({
      recipe: compiled,
      directions: Number(args['dirs'] ?? def.export.directions),
      includeFrames: Boolean(args['frames']),
      includePreview: Boolean(args['preview']),
      padding: Number(args['padding'] ?? 0),
      extrude: Number(args['extrude'] ?? 0),
    });
    for (const d of result.diagnostics) {
      console.log(`[${d.level}] ${d.code} ${d.path ?? ''} — ${d.message}`);
    }
    for (const file of result.files) {
      const path = join(outDir, file.path);
      mkdirSync(dirname(path), { recursive: true });
      if (file.bytes) writeFileSync(path, file.bytes);
      else if (file.text !== undefined) writeFileSync(path, file.text, 'utf8');
    }
    const cells = result.manifest.atlas.cells.length;
    console.log(
      `${def.id} — ${result.manifest.directions.length} caps x ${result.manifest.animation.frameCount} frames = ${cells} cellules, ${result.manifest.animation.totalDurationMs} ms, ${result.files.length} fichier(s)`,
    );
  }
  if (failed) process.exitCode = 1;
}

const invoked = process.argv[1] ?? '';
if (invoked.includes('render')) main();
