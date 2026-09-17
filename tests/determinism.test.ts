import { describe, expect, it } from 'vitest';
import { RECIPES } from '../src/recipes/catalogue.js';
import { compileRecipe } from '../src/compiler/compile.js';
import { renderClip, renderFrame } from '../src/renderer/render.js';
import { makeStage, withHeading } from '../src/renderer/stage.js';
import { clipOf, compiled, stageOf } from './helpers.js';
import { deriveSeed, randN } from '../src/core/rng.js';

describe('déterminisme', () => {
  it('deux rendus de la même recette donnent exactement les mêmes pixels', () => {
    for (const def of RECIPES) {
      const a = clipOf(def.id).map((f) => f.signature);
      const b = clipOf(def.id).map((f) => f.signature);
      expect(b).toEqual(a);
    }
  });

  it('le scrubbing donne le même résultat qu’une lecture depuis le début', () => {
    const def = RECIPES[0]!;
    const c = compiled(def.id);
    const stage = stageOf(def.id);
    const sequential = renderClip(c, stage).map((f) => f.signature);
    // Accès direct, dans le désordre : aucune frame ne dépend d'un état
    // accumulé par les précédentes.
    const order = [7, 0, 11, 3, 5, 9, 1, 2, 10, 4, 8, 6];
    const direct = new Array<string>(12);
    for (const i of order) direct[i] = renderFrame(c, stage, i).signature;
    expect(direct).toEqual(sequential);
  });

  it('changer de seed change le rendu, changer de cap aussi', () => {
    const def = RECIPES[0]!;
    const c = compiled(def.id);
    const base = stageOf(def.id);
    const other = makeStage({
      width: def.stage.width,
      height: def.stage.height,
      distance: def.stage.distance,
      heading: 0,
      seed: def.seed + 1,
    });
    expect(renderFrame(c, other, 8).signature).not.toBe(renderFrame(c, base, 8).signature);
    expect(renderFrame(c, withHeading(base, Math.PI / 2), 8).signature).not.toBe(
      renderFrame(c, base, 8).signature,
    );
  });

  it('un tirage dépend de l’identifiant, pas de la place dans un tableau', () => {
    const seed = 1234;
    const before = [0, 1, 2].map((i) => randN(seed, i, 1));
    // Insérer un grain revient à tirer sur d'autres index : les anciens
    // gardent exactement leur valeur.
    const after = [0, 1, 2, 3].map((i) => randN(seed, i, 1));
    expect(after.slice(0, 3)).toEqual(before);
    expect(deriveSeed(seed, 'objet/braise')).toBe(deriveSeed(seed, 'objet/braise'));
    expect(deriveSeed(seed, 'objet/braise')).not.toBe(deriveSeed(seed, 'objet/fumee'));
  });

  it('la compilation est stable : mêmes diagnostics à chaque passage', () => {
    for (const def of RECIPES) {
      const a = compileRecipe(def).diagnostics.map((d) => `${d.code}:${d.path ?? ''}`);
      const b = compileRecipe(def).diagnostics.map((d) => `${d.code}:${d.path ?? ''}`);
      expect(b).toEqual(a);
    }
  });
});
