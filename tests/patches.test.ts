import { describe, expect, it } from 'vitest';
import { applyPatches, makePatch, patchesFor, revalidate } from '../src/patches/patch.js';
import { IndexedCanvas } from '../src/pixels/canvas.js';
import { compiled, stageOf } from './helpers.js';
import { renderFrame } from '../src/renderer/render.js';

function canvasWithBase(): IndexedCanvas {
  const c = new IndexedCanvas(16, 16);
  c.set(4, 4, c.ink('ice.crystal', 'body'));
  return c;
}

describe('retouches non destructives', () => {
  it('applique une correction sur la base attendue', () => {
    const canvas = canvasWithBase();
    const patch = makePatch({
      id: 'p1',
      recipeId: 'test',
      frame: 3,
      direction: null,
      baseSignature: canvas.signature(),
      pixels: [
        { x: 6, y: 6, ink: 'ice.crystal:accent' },
        { x: 4, y: 4, ink: null },
      ],
    });
    const result = applyPatches(canvas, [patch]);
    expect(result.applied).toHaveLength(1);
    expect(result.stale).toHaveLength(0);
    expect(canvas.get(4, 4)).toBe(0);
    expect(canvas.get(6, 6)).not.toBe(0);
  });

  it('signale une retouche obsolète au lieu de l’appliquer au mauvais endroit', () => {
    const canvas = canvasWithBase();
    const patch = makePatch({
      id: 'p2',
      recipeId: 'test',
      frame: 3,
      direction: null,
      baseSignature: 'ffffffff',
      pixels: [{ x: 6, y: 6, ink: 'ice.crystal:accent' }],
    });
    const result = applyPatches(canvas, [patch]);
    expect(result.applied).toHaveLength(0);
    expect(result.stale).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('patch-stale');
    expect(canvas.get(6, 6)).toBe(0);
    // La revalidation est un geste explicite de l'utilisateur.
    const again = applyPatches(canvas, [revalidate(patch, canvas.signature())]);
    expect(again.applied).toHaveLength(1);
    expect(canvas.get(6, 6)).not.toBe(0);
  });

  it('sélectionne les retouches par recette, frame et direction', () => {
    const base = { recipeId: 'r', baseSignature: 'x', pixels: [] };
    const all = [
      makePatch({ ...base, id: 'a', frame: 2, direction: null }),
      makePatch({ ...base, id: 'b', frame: 2, direction: 3 }),
      makePatch({ ...base, id: 'c', frame: 5, direction: 3 }),
      makePatch({ ...base, id: 'd', frame: 2, direction: 1 }),
    ];
    expect(patchesFor(all, 'r', 2, 3).map((p) => p.id)).toEqual(['a', 'b']);
    expect(patchesFor(all, 'r', 2, 0).map((p) => p.id)).toEqual(['a']);
    expect(patchesFor(all, 'autre', 2, 3)).toEqual([]);
  });

  it('une retouche s’applique au rendu d’une recette réelle', () => {
    const recipe = compiled('ice-aurora-needle-s');
    const stage = stageOf('ice-aurora-needle-s');
    const base = renderFrame(recipe, stage, 4);
    const patch = makePatch({
      id: 'p3',
      recipeId: 'ice-aurora-needle-s',
      frame: 4,
      direction: 0,
      baseSignature: base.signature,
      pixels: [{ x: 2, y: 2, ink: 'ice.crystal:accent' }],
    });
    const patched = renderFrame(recipe, stage, 4, { patches: [patch], direction: 0 });
    expect(patched.body.get(2, 2)).not.toBe(0);
    expect(base.body.get(2, 2)).toBe(0);
    // La génération elle-même n'a pas bougé : seule la couche de correction change.
    const again = renderFrame(recipe, stage, 4);
    expect(again.signature).toBe(base.signature);
  });

  it('une retouche devient obsolète quand la base change', () => {
    const recipe = compiled('ice-aurora-needle-s');
    const stage = stageOf('ice-aurora-needle-s');
    const base = renderFrame(recipe, stage, 4);
    const patch = makePatch({
      id: 'p4',
      recipeId: 'ice-aurora-needle-s',
      frame: 4,
      direction: null,
      baseSignature: base.signature,
      pixels: [{ x: 2, y: 2, ink: 'ice.crystal:accent' }],
    });
    const other = renderFrame(recipe, { ...stage, seed: stage.seed + 1 }, 4, {
      patches: [patch],
      direction: 0,
    });
    expect(other.diagnostics.some((d) => d.code === 'patch-stale')).toBe(true);
  });
});
