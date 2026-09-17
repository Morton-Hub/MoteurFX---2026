/**
 * Registres : opérateurs, recettes, familles d'évolution.
 *
 * Un bouton de rang sélectionne une **recette sœur**, il ne lance pas une
 * interpolation de paramètres (§11).
 */

import { diag, type Diagnostic } from '../core/diagnostics.js';
import type { ElementId } from '../pixels/palette.js';
import { FIRE_BUILDERS } from './fire.js';
import { ICE_BUILDERS } from './ice.js';
import { LIGHTNING_BUILDERS } from './lightning.js';
import { RECIPES } from './catalogue.js';
import type { EvolutionFamily, Rank, RecipeDefinition, SpellBuilder } from './types.js';

export const BUILDERS: readonly SpellBuilder[] = [
  ...FIRE_BUILDERS,
  ...ICE_BUILDERS,
  ...LIGHTNING_BUILDERS,
];

const BUILDER_BY_ID = new Map(BUILDERS.map((b) => [b.id, b]));

export function getBuilder(id: string): SpellBuilder {
  const hit = BUILDER_BY_ID.get(id);
  if (!hit) throw new Error(`Opérateur de sort inconnu : "${id}"`);
  return hit;
}

export function hasBuilder(id: string): boolean {
  return BUILDER_BY_ID.has(id);
}

const RECIPE_BY_ID = new Map(RECIPES.map((r) => [r.id, r]));

export function getRecipe(id: string): RecipeDefinition {
  const hit = RECIPE_BY_ID.get(id);
  if (!hit) throw new Error(`Recette inconnue : "${id}"`);
  return hit;
}

export function listRecipes(): readonly RecipeDefinition[] {
  return RECIPES;
}

export function recipesOfElement(element: ElementId): readonly RecipeDefinition[] {
  return RECIPES.filter((r) => r.element === element);
}

export function siblingRank(recipe: RecipeDefinition, rank: Rank): RecipeDefinition | undefined {
  return RECIPES.find((r) => r.familyId === recipe.familyId && r.rank === rank);
}

/** Vérifie qu'une famille possède bien ses trois rangs distincts. */
export function auditFamily(family: EvolutionFamily): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const rank of ['S', 'M', 'L'] as const) {
    const id = family.recipes[rank];
    const recipe = RECIPE_BY_ID.get(id);
    if (!recipe) {
      out.push(diag('error', 'family-missing-rank', `La famille ${family.id} annonce ${id} pour le rang ${rank}, qui n'existe pas`, family.id));
      continue;
    }
    if (recipe.rank !== rank) {
      out.push(diag('error', 'family-rank-mismatch', `${id} est déclarée ${recipe.rank} mais occupe le rang ${rank}`, family.id));
    }
  }
  const builders = new Set(
    (['S', 'M', 'L'] as const).map((r) => RECIPE_BY_ID.get(family.recipes[r])?.builder).filter(Boolean),
  );
  if (builders.size < 3) {
    out.push(
      diag('error', 'family-shared-builder', `La famille ${family.id} réutilise le même opérateur pour plusieurs rangs : changer taille et couleur ne fait pas une évolution`, family.id),
    );
  }
  return out;
}
