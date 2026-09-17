/**
 * Contrats de recette (§9).
 *
 * Une recette est une **donnée** : elle se sérialise, se relit, se compare et
 * se versionne. Le code qui la dessine est un opérateur nommé, choisi par
 * `builder`. Deux rangs d'une même famille sont deux recettes distinctes,
 * liées par `familyId` — pas une interpolation de paramètres (§11).
 */

import type { ElementId } from '../pixels/palette.js';
import type { BodyProfile } from '../pixels/style.js';
import type { AnchorId, AnimationBudget, ClipRole, EndBehavior, EventSpec } from '../animation/budget.js';
import type { Diagnostic } from '../core/diagnostics.js';
import type { FrameContext } from '../renderer/context.js';
import type { Piece } from '../renderer/piece.js';
import type { ParamBag, ParamSpec, ParamValues } from './params.js';

export const SCHEMA_VERSION = 3;

export type Rank = 'S' | 'M' | 'L';

/** Formes d'action proposées par l'assistant de composition (§11). */
export type ActionShape =
  | 'projectile'
  | 'eruption'
  | 'wave'
  | 'connection'
  | 'skystrike'
  | 'summon';

export type ClipDefinition = {
  readonly range: readonly [number, number];
  readonly anchor: AnchorId;
  readonly playback?: 'once' | 'loop';
  readonly trigger?: 'start' | 'contact' | 'chain';
  /** Motif dessiné consommé par cette plage, s'il y en a un. */
  readonly motif?: string;
  /** Opérateur procédural consommé par cette plage. */
  readonly operator?: string;
};

export type StageDefinition = {
  readonly width: number;
  readonly height: number;
  readonly distance: number;
  readonly casterHeight?: number;
  readonly targetAt?: { readonly x: number; readonly y: number };
};

export type RecipeDefinition = {
  readonly schemaVersion: number;
  readonly id: string;
  readonly familyId: string;
  readonly rank: Rank;
  readonly name: string;
  /** Opérateur principal : le code qui sait dessiner ce sort. */
  readonly builder: string;
  readonly seed: number;
  readonly style: string;
  readonly element: ElementId;
  readonly action: ActionShape;
  readonly projection: string;
  readonly parameters: ParamValues;
  readonly animation: {
    readonly frameCount: number;
    readonly frameDurationsMs: readonly number[];
    readonly endBehavior: EndBehavior;
    readonly frameIndexBase: 0;
    readonly events?: readonly EventSpec[];
  };
  readonly clips: Readonly<Partial<Record<ClipRole, ClipDefinition>>>;
  readonly export: {
    readonly directions: number;
    readonly directionSpace: 'world';
    readonly framesPerDirection: number;
    readonly bodyProfile: BodyProfile;
    readonly separateEmission: boolean;
  };
  readonly stage: StageDefinition;
  /** Intention artistique, en une phrase. Sert aussi de contrôle de lecture. */
  readonly silhouette: string;
};

export type SpellBuilder = {
  readonly id: string;
  readonly label: string;
  readonly element: ElementId;
  readonly rank: Rank;
  readonly action: ActionShape;
  readonly params: readonly ParamSpec[];
  /** Ressources réellement consommées. Le compilateur vérifie la cohérence. */
  readonly uses: { readonly motifs: readonly string[]; readonly operators: readonly string[] };
  /**
   * Construit les objets d'**une** frame. Le builder ne peint pas : il décrit.
   * Le renderer trie et compose.
   */
  readonly build: (ctx: FrameContext, p: ParamBag) => Piece[];
};

export type CompiledRecipe = {
  readonly definition: RecipeDefinition;
  readonly builder: SpellBuilder;
  readonly budget: AnimationBudget;
  readonly params: ParamBag;
  readonly diagnostics: readonly Diagnostic[];
};

export type EvolutionFamily = {
  readonly id: string;
  readonly label: string;
  readonly element: ElementId;
  /** Ce qui distingue les trois rangs : silhouette, comportement, conséquence. */
  readonly signature: { readonly S: string; readonly M: string; readonly L: string };
  readonly recipes: Readonly<Record<Rank, string>>;
};
