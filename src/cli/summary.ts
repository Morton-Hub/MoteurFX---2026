/**
 * Résumé JSON du catalogue : durées, plages, événements, coûts.
 *
 *   npx tsx src/cli/summary.ts > docs/catalogue.json
 */

import { listRecipes } from '../recipes/registry.js';
import { compileRecipe } from '../compiler/compile.js';
import { totalDurationMs } from '../animation/budget.js';
import { renderClip } from '../renderer/render.js';
import { makeStage } from '../renderer/stage.js';

function main(): void {
  const out = listRecipes().map((def) => {
    const compiled = compileRecipe(def, { probeParams: false });
    const stage = makeStage({
      width: def.stage.width,
      height: def.stage.height,
      distance: def.stage.distance,
      ...(def.stage.casterHeight !== undefined ? { casterHeight: def.stage.casterHeight } : {}),
      ...(def.stage.targetAt ? { targetAt: def.stage.targetAt } : {}),
      heading: 0,
      seed: def.seed,
    });
    const started = Date.now();
    const frames = renderClip(compiled, stage);
    const elapsed = Date.now() - started;
    const widths = frames.map((f) => (f.bounds ? f.bounds.x1 - f.bounds.x0 + 1 : 0));
    const heights = frames.map((f) => (f.bounds ? f.bounds.y1 - f.bounds.y0 + 1 : 0));
    return {
      id: def.id,
      name: def.name,
      family: def.familyId,
      element: def.element,
      rank: def.rank,
      action: def.action,
      silhouette: def.silhouette,
      durations: def.animation.frameDurationsMs,
      totalMs: totalDurationMs(compiled.budget),
      clips: Object.entries(def.clips).map(([role, clip]) => ({ role, range: clip!.range, anchor: clip!.anchor })),
      events: (def.animation.events ?? []).map((e) => ({ id: e.id, frame: e.frame })),
      canvas: [def.stage.width, def.stage.height],
      silhouettePx: [Math.max(...widths), Math.max(...heights)],
      colors: Math.max(...frames.map((f) => f.body.usedColorCount())),
      msPerFrame: Math.round((elapsed / frames.length) * 10) / 10,
    };
  });
  console.log(JSON.stringify(out, null, 2));
}

const invoked = process.argv[1] ?? '';
if (invoked.includes('summary')) main();
