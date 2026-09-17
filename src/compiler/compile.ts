/**
 * Compilation d'une recette.
 *
 * Elle transforme une donnée en plan exécutable **et** produit les
 * diagnostics : références manquantes, propriétés inconnues, plages qui ne
 * couvrent pas les douze frames, paramètres jamais consommés, motifs cités
 * mais non utilisés (§9).
 */

import { diag, hasErrors, type Diagnostic } from '../core/diagnostics.js';
import { makeBudget, validateBudget, type ClipRole, type ClipSpec } from '../animation/budget.js';
import { hasMotif } from '../motifs/index.js';
import { styleById } from '../pixels/style.js';
import { makeStage } from '../renderer/stage.js';
import { makeFrameContext } from '../renderer/context.js';
import { getBuilder, hasBuilder } from '../recipes/registry.js';
import { ParamBag } from '../recipes/params.js';
import type { CompiledRecipe, RecipeDefinition } from '../recipes/types.js';
import { SCHEMA_VERSION } from '../recipes/types.js';
import { recipeSchema } from './schema.js';

export type CompileOptions = {
  /**
   * Construit les douze frames à vide pour savoir quels paramètres sont
   * réellement lus. Sans cela, un curseur inactif passerait inaperçu.
   */
  readonly probeParams?: boolean;
};

export function compileRecipe(
  definition: RecipeDefinition,
  options: CompileOptions = {},
): CompiledRecipe {
  const diagnostics: Diagnostic[] = [];
  const parsed = recipeSchema.safeParse(definition);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      diagnostics.push(
        diag('error', 'schema', issue.message, `${definition.id}.${issue.path.join('.')}`),
      );
    }
  }
  if (definition.schemaVersion !== SCHEMA_VERSION) {
    diagnostics.push(
      diag('warning', 'schema-version', `La recette est en version ${definition.schemaVersion}, le moteur lit la version ${SCHEMA_VERSION}`, definition.id),
    );
  }

  const builderId = definition.builder;
  if (!hasBuilder(builderId)) {
    diagnostics.push(
      diag('error', 'builder-missing', `Opérateur "${builderId}" introuvable : la recette ne peut pas être dessinée`, `${definition.id}.builder`),
    );
    throw new Error(`Recette "${definition.id}" : opérateur "${builderId}" introuvable`);
  }
  const builder = getBuilder(builderId);

  if (builder.element !== definition.element) {
    diagnostics.push(
      diag('error', 'builder-element', `L'opérateur ${builderId} dessine l'élément ${builder.element}, la recette annonce ${definition.element}`, `${definition.id}.element`),
    );
  }
  if (builder.rank !== definition.rank) {
    diagnostics.push(
      diag('error', 'builder-rank', `L'opérateur ${builderId} est de rang ${builder.rank}, la recette annonce ${definition.rank}`, `${definition.id}.rank`),
    );
  }
  if (builder.action !== definition.action) {
    diagnostics.push(
      diag('warning', 'builder-action', `L'opérateur ${builderId} est une forme « ${builder.action} », la recette annonce « ${definition.action} »`, `${definition.id}.action`),
    );
  }

  const clips: ClipSpec[] = [];
  for (const [role, clip] of Object.entries(definition.clips) as [ClipRole, RecipeDefinition['clips'][ClipRole]][]) {
    if (!clip) continue;
    clips.push({
      role,
      range: [clip.range[0], clip.range[1]],
      anchor: clip.anchor,
      ...(clip.playback ? { playback: clip.playback } : {}),
      ...(clip.trigger ? { trigger: clip.trigger } : {}),
    });
    if (clip.motif !== undefined) {
      if (!hasMotif(clip.motif)) {
        diagnostics.push(
          diag('error', 'motif-missing', `Le motif "${clip.motif}" n'existe pas dans la bibliothèque`, `${definition.id}.clips.${role}.motif`),
        );
      } else if (!builder.uses.motifs.includes(clip.motif)) {
        diagnostics.push(
          diag('warning', 'motif-unused', `Le motif "${clip.motif}" est cité par la plage ${role} mais l'opérateur ne le consomme pas`, `${definition.id}.clips.${role}.motif`),
        );
      }
    }
    if (clip.operator !== undefined && !builder.uses.operators.includes(clip.operator)) {
      diagnostics.push(
        diag('warning', 'operator-unused', `L'opérateur "${clip.operator}" est cité par la plage ${role} mais ne figure pas dans ceux utilisés par ${builderId}`, `${definition.id}.clips.${role}.operator`),
      );
    }
  }

  const budget = makeBudget({
    frameDurationsMs: definition.animation.frameDurationsMs,
    clips,
    events: definition.animation.events ?? [],
    endBehavior: definition.animation.endBehavior,
  });
  diagnostics.push(...validateBudget(budget, `${definition.id}.animation`));

  if (definition.export.framesPerDirection !== budget.frameCount) {
    diagnostics.push(
      diag('error', 'export-frames', `L'export annonce ${definition.export.framesPerDirection} images par direction, le budget en contient ${budget.frameCount}`, `${definition.id}.export.framesPerDirection`),
    );
  }

  const params = new ParamBag(builder.params, definition.parameters);

  if (options.probeParams !== false) {
    // Construction à blanc des douze frames : elle ne peint rien, elle sert à
    // savoir quels paramètres sont lus et si une frame plante.
    const stage = makeStage({
      width: definition.stage.width,
      height: definition.stage.height,
      distance: definition.stage.distance,
      ...(definition.stage.casterHeight !== undefined ? { casterHeight: definition.stage.casterHeight } : {}),
      ...(definition.stage.targetAt ? { targetAt: definition.stage.targetAt } : {}),
      heading: 0,
      seed: definition.seed,
      style: styleById(definition.style),
    });
    for (let i = 0; i < budget.frameCount; i++) {
      try {
        builder.build(makeFrameContext(stage, budget, i), params);
      } catch (err) {
        diagnostics.push(
          diag('error', 'build-probe', `La frame ${i} ne se construit pas : ${(err as Error).message}`, `${definition.id}.frame[${i}]`),
        );
      }
    }
    diagnostics.push(...params.audit(`${definition.id}.parameters`));
  }

  return { definition, builder, budget, params, diagnostics };
}

/** Compile tout le catalogue et regroupe les diagnostics. */
export function compileAll(
  definitions: readonly RecipeDefinition[],
  options: CompileOptions = {},
): { recipes: CompiledRecipe[]; diagnostics: Diagnostic[]; ok: boolean } {
  const recipes: CompiledRecipe[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const def of definitions) {
    const compiled = compileRecipe(def, options);
    recipes.push(compiled);
    diagnostics.push(...compiled.diagnostics);
  }
  return { recipes, diagnostics, ok: !hasErrors(diagnostics) };
}
