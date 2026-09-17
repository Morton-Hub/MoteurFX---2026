/**
 * Schémas stricts (§8, §9).
 *
 * `strict()` partout : une propriété inconnue est une **erreur**, pas un
 * champ ignoré en silence. C'est la seule façon d'éviter qu'une recette
 * décrive un comportement que le moteur ne lit pas.
 */

import { z } from 'zod';
import { FRAME_COUNT } from '../animation/budget.js';

export const elementSchema = z.enum([
  'fire', 'ice', 'lightning', 'water', 'earth', 'wind',
  'poison', 'magma', 'light', 'dark', 'metal', 'nature',
]);

export const rankSchema = z.enum(['S', 'M', 'L']);

export const actionSchema = z.enum([
  'projectile', 'eruption', 'wave', 'connection', 'skystrike', 'summon',
]);

export const anchorSchema = z.enum([
  'source', 'projectile', 'target', 'ground-source', 'ground-target', 'sky',
]);

export const clipRoleSchema = z.enum(['cast', 'fly', 'hit', 'residue']);

export const eventSchema = z
  .object({
    id: z.enum(['cast', 'release', 'contact', 'peak', 'fracture', 'settle', 'clear']),
    frame: z.number().int().min(0).max(FRAME_COUNT - 1),
    note: z.string().optional(),
  })
  .strict();

export const clipSchema = z
  .object({
    range: z.tuple([z.number().int().min(0).max(FRAME_COUNT - 1), z.number().int().min(0).max(FRAME_COUNT - 1)]),
    anchor: anchorSchema,
    playback: z.enum(['once', 'loop']).optional(),
    trigger: z.enum(['start', 'contact', 'chain']).optional(),
    motif: z.string().optional(),
    operator: z.string().optional(),
  })
  .strict();

export const animationSchema = z
  .object({
    frameCount: z.literal(FRAME_COUNT),
    frameDurationsMs: z.array(z.number().positive()).length(FRAME_COUNT),
    endBehavior: z.enum(['clear', 'handoff']),
    frameIndexBase: z.literal(0),
    events: z.array(eventSchema).optional(),
  })
  .strict();

export const exportSchema = z
  .object({
    directions: z.number().int().min(1).max(64),
    directionSpace: z.literal('world'),
    framesPerDirection: z.literal(FRAME_COUNT),
    bodyProfile: z.enum(['pixel-strict', 'pixel-light']),
    separateEmission: z.boolean(),
  })
  .strict();

export const stageSchema = z
  .object({
    width: z.number().int().min(16).max(1024),
    height: z.number().int().min(16).max(1024),
    distance: z.number().min(0),
    casterHeight: z.number().min(0).optional(),
    targetAt: z.object({ x: z.number(), y: z.number() }).strict().optional(),
  })
  .strict();

export const recipeSchema = z
  .object({
    schemaVersion: z.number().int().min(1),
    id: z.string().min(1),
    familyId: z.string().min(1),
    rank: rankSchema,
    name: z.string().min(1),
    builder: z.string().min(1),
    seed: z.number().int(),
    style: z.string().min(1),
    element: elementSchema,
    action: actionSchema,
    projection: z.string().min(1),
    parameters: z.record(z.union([z.number(), z.boolean(), z.string()])),
    animation: animationSchema,
    clips: z.record(clipRoleSchema, clipSchema),
    export: exportSchema,
    stage: stageSchema,
    silhouette: z.string().min(1),
  })
  .strict();

export const patchSchema = z
  .object({
    id: z.string(),
    recipeId: z.string(),
    frame: z.number().int().min(0).max(FRAME_COUNT - 1),
    /** Cap concerné, ou `null` pour toutes les directions. */
    direction: z.number().int().min(0).nullable(),
    /** Signature du rendu de base sur lequel la retouche a été faite. */
    baseSignature: z.string(),
    pixels: z.array(
      z
        .object({
          x: z.number().int().min(0),
          y: z.number().int().min(0),
          /** `null` = effacement. Sinon `matiere:role`. */
          ink: z.string().nullable(),
        })
        .strict(),
    ),
    note: z.string().optional(),
  })
  .strict();

export const projectSchema = z
  .object({
    formatVersion: z.number().int().min(1),
    engineVersion: z.string(),
    savedAt: z.string(),
    styleProfile: z.string(),
    recipes: z.array(recipeSchema),
    patches: z.array(patchSchema),
    /** Motifs importés, avec provenance. Les motifs internes ne sont pas copiés. */
    importedMotifs: z.array(z.record(z.unknown())).optional(),
    notes: z.string().optional(),
  })
  .strict();

export type RecipeInput = z.infer<typeof recipeSchema>;
export type PatchInput = z.infer<typeof patchSchema>;
export type ProjectInput = z.infer<typeof projectSchema>;
