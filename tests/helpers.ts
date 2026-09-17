/**
 * Outils de mesure partagés par les tests.
 *
 * Ils servent à vérifier des propriétés **visuelles** — une silhouette change
 * avec le rang, deux éléments restent distincts sans couleur — et pas
 * seulement que le code ne plante pas.
 */

import { compileRecipe } from '../src/compiler/compile.js';
import { getRecipe } from '../src/recipes/registry.js';
import { makeStage, withHeading } from '../src/renderer/stage.js';
import { renderClip, renderFrame, type RenderedFrame } from '../src/renderer/render.js';
import type { CompiledRecipe } from '../src/recipes/types.js';
import type { IndexedCanvas } from '../src/pixels/canvas.js';

export function compiled(id: string): CompiledRecipe {
  return compileRecipe(getRecipe(id));
}

export function stageOf(id: string, heading = 0) {
  const def = getRecipe(id);
  return makeStage({
    width: def.stage.width,
    height: def.stage.height,
    distance: def.stage.distance,
    ...(def.stage.casterHeight !== undefined ? { casterHeight: def.stage.casterHeight } : {}),
    ...(def.stage.targetAt ? { targetAt: def.stage.targetAt } : {}),
    heading,
    seed: def.seed,
  });
}

export function clipOf(id: string, heading = 0): RenderedFrame[] {
  const c = compiled(id);
  return renderClip(c, withHeading(stageOf(id), heading));
}

export function frameOf(id: string, index: number, heading = 0): RenderedFrame {
  const c = compiled(id);
  return renderFrame(c, withHeading(stageOf(id), heading), index);
}

/**
 * Empreinte de silhouette : la forme est recadrée sur elle-même puis
 * ramenée à une grille 16x16 d'occupation. Sans ce recadrage on ne
 * mesurerait que la translation, pas la forme.
 */
export function silhouetteGrid(canvas: IndexedCanvas, size = 16): Uint8Array {
  const grid = new Uint8Array(size * size);
  const b = canvas.bounds();
  if (!b) return grid;
  const w = b.x1 - b.x0 + 1;
  const h = b.y1 - b.y0 + 1;
  const counts = new Float32Array(size * size);
  const totals = new Float32Array(size * size);
  for (let y = b.y0; y <= b.y1; y++) {
    for (let x = b.x0; x <= b.x1; x++) {
      const gx = Math.min(size - 1, Math.floor(((x - b.x0) / w) * size));
      const gy = Math.min(size - 1, Math.floor(((y - b.y0) / h) * size));
      totals[gy * size + gx] = (totals[gy * size + gx] ?? 0) + 1;
      if (canvas.get(x, y) !== 0) counts[gy * size + gx] = (counts[gy * size + gx] ?? 0) + 1;
    }
  }
  for (let i = 0; i < grid.length; i++) {
    const total = totals[i] ?? 0;
    grid[i] = total > 0 && (counts[i] ?? 0) / total > 0.35 ? 1 : 0;
  }
  return grid;
}

/** Part de cellules qui diffèrent entre deux empreintes, sur [0,1]. */
export function gridDistance(a: Uint8Array, b: Uint8Array): number {
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  return diff / a.length;
}

/** Empreinte moyenne d'un clip : la différence porte sur toute l'animation. */
export function clipGrids(frames: readonly RenderedFrame[]): Uint8Array[] {
  return frames.map((f) => silhouetteGrid(f.body));
}

export function averageDistance(a: readonly Uint8Array[], b: readonly Uint8Array[]): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += gridDistance(a[i] as Uint8Array, b[i] as Uint8Array);
  return n === 0 ? 0 : sum / n;
}
