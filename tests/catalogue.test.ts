import { describe, expect, it } from 'vitest';
import { compileAll, compileRecipe } from '../src/compiler/compile.js';
import { FAMILIES, RECIPES } from '../src/recipes/catalogue.js';
import { auditFamily, getRecipe, siblingRank } from '../src/recipes/registry.js';
import { FRAME_COUNT, roleOfFrame, totalDurationMs } from '../src/animation/budget.js';
import { averageDistance, clipGrids, clipOf, compiled, silhouetteGrid, stageOf } from './helpers.js';
import { renderClip } from '../src/renderer/render.js';
import { withHeading } from '../src/renderer/stage.js';

const ELEMENTS = ['fire', 'ice', 'lightning'] as const;

describe('catalogue livré', () => {
  it('contient les neuf recettes du premier lot', () => {
    expect(RECIPES).toHaveLength(9);
    for (const element of ELEMENTS) {
      const family = RECIPES.filter((r) => r.element === element);
      expect(family.map((r) => r.rank).sort()).toEqual(['L', 'M', 'S']);
    }
  });

  it('compile sans erreur', () => {
    const result = compileAll(RECIPES);
    const errors = result.diagnostics.filter((d) => d.level === 'error');
    expect(errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('ne laisse aucun paramètre déclaré mais inutilisé', () => {
    for (const def of RECIPES) {
      const unused = compileRecipe(def).diagnostics.filter((d) => d.code === 'param-unused');
      expect(unused.map((d) => d.path)).toEqual([]);
    }
  });

  it('chaque famille lie trois recettes à trois opérateurs distincts', () => {
    for (const family of FAMILIES) {
      expect(auditFamily(family)).toEqual([]);
      const s = getRecipe(family.recipes.S);
      expect(siblingRank(s, 'L')?.id).toBe(family.recipes.L);
    }
  });

  it('chaque recette expose exactement douze frames et douze durées', () => {
    for (const def of RECIPES) {
      const c = compileRecipe(def, { probeParams: false });
      expect(c.budget.frameCount).toBe(FRAME_COUNT);
      expect(c.budget.frameDurationsMs).toHaveLength(FRAME_COUNT);
      expect(c.budget.frameDurationsMs.every((d) => d > 0)).toBe(true);
      expect(def.export.framesPerDirection).toBe(FRAME_COUNT);
      // Aucun rang ne reçoit d'images supplémentaires.
      expect(totalDurationMs(c.budget)).toBeGreaterThan(0);
      for (let f = 0; f < FRAME_COUNT; f++) expect(roleOfFrame(c.budget, f)).toBeDefined();
    }
  });
});

describe('rendu du catalogue', () => {
  it('aucune frame ne déborde de son canevas', () => {
    for (const def of RECIPES) {
      const c = compiled(def.id);
      for (const heading of [0, Math.PI / 4, Math.PI, -Math.PI / 3]) {
        const frames = renderClip(c, withHeading(stageOf(def.id), heading));
        for (const frame of frames) {
          const clipped = frame.diagnostics.filter((d) => d.code === 'frame-clipped');
          expect(clipped, `${def.id} frame ${frame.index} cap ${heading}`).toEqual([]);
        }
      }
    }
  });

  it('aucune frame du milieu n’est vide, et la fin est déclarée', () => {
    for (const def of RECIPES) {
      const frames = clipOf(def.id);
      for (const frame of frames) {
        expect(frame.body.isEmpty(), `${def.id} frame ${frame.index}`).toBe(false);
      }
      // La dernière image reste visible pendant toute son exposition ; c'est
      // `endBehavior` qui déclare l'effacement, pas une cellule transparente.
      expect(def.animation.endBehavior).toBe('clear');
    }
  });

  it('le corps respecte la palette indexée', () => {
    for (const def of RECIPES) {
      for (const frame of clipOf(def.id)) {
        expect(frame.body.usedColorCount()).toBeLessThanOrEqual(frame.body.table.size);
        expect(frame.body.table.size).toBeLessThanOrEqual(24);
      }
    }
  });
});

describe('lisibilité', () => {
  it('les trois rangs d’une famille ont des silhouettes différentes', () => {
    for (const family of FAMILIES) {
      const s = clipGrids(clipOf(family.recipes.S));
      const m = clipGrids(clipOf(family.recipes.M));
      const l = clipGrids(clipOf(family.recipes.L));
      // Les empreintes sont normalisées en taille : la différence mesurée
      // n'est donc pas un simple agrandissement.
      expect(averageDistance(s, m), `${family.id} S vs M`).toBeGreaterThan(0.15);
      expect(averageDistance(m, l), `${family.id} M vs L`).toBeGreaterThan(0.15);
      expect(averageDistance(s, l), `${family.id} S vs L`).toBeGreaterThan(0.15);
    }
  });

  it('les trois éléments restent distincts à rang égal', () => {
    for (const rank of ['S', 'M', 'L'] as const) {
      const grids = FAMILIES.map((f) => clipGrids(clipOf(f.recipes[rank])));
      for (let i = 0; i < grids.length; i++) {
        for (let j = i + 1; j < grids.length; j++) {
          expect(
            averageDistance(grids[i] as Uint8Array[], grids[j] as Uint8Array[]),
            `${FAMILIES[i]!.id} vs ${FAMILIES[j]!.id} au rang ${rank}`,
          ).toBeGreaterThan(0.15);
        }
      }
    }
  });

  it('la silhouette change avec le cap', () => {
    for (const def of RECIPES) {
      const a = clipOf(def.id, 0);
      const b = clipOf(def.id, Math.PI / 2);
      const changed = a.filter((frame, i) => {
        const other = b[i];
        return other ? silhouetteGrid(frame.body).join() !== silhouetteGrid(other.body).join() : false;
      });
      // Un sprite identique dans toutes les directions serait un billboard
      // déguisé : au moins un tiers des frames doit changer de forme.
      expect(changed.length / a.length, def.id).toBeGreaterThan(0.33);
    }
  });
});
