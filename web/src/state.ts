/**
 * État de l'atelier.
 *
 * Le document — recettes et retouches — est **annulable** ; les réglages
 * d'affichage ne le sont pas : annuler ne doit pas remettre le zoom à sa
 * valeur précédente. Un glisser-déposer continu forme une seule action
 * d'historique (§13).
 */

import type { FramePatch, PixelPatch } from '../../src/patches/patch.js';
import type { RecipeDefinition } from '../../src/recipes/types.js';
import type { ViewMode } from '../../src/workers/generate.js';

export type EditorDocument = {
  readonly recipes: readonly RecipeDefinition[];
  readonly patches: readonly FramePatch[];
};

export type Tool = 'none' | 'pencil' | 'eraser' | 'picker';

export type EditorState = {
  readonly doc: EditorDocument;
  readonly past: readonly EditorDocument[];
  readonly future: readonly EditorDocument[];
  readonly selectedId: string;
  readonly frame: number;
  readonly playing: boolean;
  readonly speed: number;
  readonly view: ViewMode;
  readonly background: 'dark' | 'light' | 'busy';
  readonly zoom: number;
  readonly onion: number;
  readonly directions: number;
  readonly compare: boolean;
  readonly heading: number;
  readonly showGuides: boolean;
  readonly showCharacter: boolean;
  readonly tool: Tool;
  readonly ink: string;
  readonly locks: { readonly silhouette: boolean; readonly timing: boolean };
  readonly variantSeeds: readonly number[];
  readonly stroke: boolean;
  readonly dirty: boolean;
};

export type Action =
  | { type: 'select'; id: string }
  | { type: 'frame'; index: number }
  | { type: 'step'; delta: number }
  | { type: 'play'; playing: boolean }
  | { type: 'speed'; value: number }
  | { type: 'view'; value: ViewMode }
  | { type: 'background'; value: EditorState['background'] }
  | { type: 'zoom'; value: number }
  | { type: 'onion'; value: number }
  | { type: 'directions'; value: number }
  | { type: 'compare'; value: boolean }
  | { type: 'heading'; value: number }
  | { type: 'guides'; value: boolean }
  | { type: 'character'; value: boolean }
  | { type: 'tool'; value: Tool }
  | { type: 'ink'; value: string }
  | { type: 'lock'; key: 'silhouette' | 'timing'; value: boolean }
  | { type: 'variants'; seeds: readonly number[] }
  | { type: 'param'; key: string; value: number | boolean | string }
  | { type: 'duration'; frame: number; value: number }
  | { type: 'seed'; value: number }
  | { type: 'addRecipe'; recipe: RecipeDefinition }
  | { type: 'strokeStart' }
  | { type: 'strokeEnd' }
  | { type: 'paint'; pixels: readonly PixelPatch[]; direction: number | null; baseSignature: string }
  | { type: 'dropPatches'; recipeId: string; frame?: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'loadDoc'; doc: EditorDocument }
  | { type: 'saved' };

const HISTORY_LIMIT = 80;

export function initialState(recipes: readonly RecipeDefinition[]): EditorState {
  return {
    doc: { recipes, patches: [] },
    past: [],
    future: [],
    selectedId: recipes[0]?.id ?? '',
    frame: 0,
    playing: false,
    speed: 1,
    view: 'color',
    background: 'dark',
    zoom: 3,
    onion: 0,
    directions: 8,
    compare: false,
    heading: 0,
    showGuides: false,
    showCharacter: true,
    tool: 'none',
    ink: 'fire.flame:light',
    locks: { silhouette: false, timing: false },
    variantSeeds: [],
    stroke: false,
    dirty: false,
  };
}

export function selectedRecipe(state: EditorState): RecipeDefinition {
  const hit = state.doc.recipes.find((r) => r.id === state.selectedId);
  if (!hit) throw new Error(`Recette absente : ${state.selectedId}`);
  return hit;
}

function pushHistory(state: EditorState, doc: EditorDocument): EditorState {
  return {
    ...state,
    past: [...state.past.slice(-HISTORY_LIMIT), state.doc],
    future: [],
    doc,
    dirty: true,
  };
}

function mapSelected(
  state: EditorState,
  fn: (recipe: RecipeDefinition) => RecipeDefinition,
): EditorDocument {
  return {
    ...state.doc,
    recipes: state.doc.recipes.map((r) => (r.id === state.selectedId ? fn(r) : r)),
  };
}

export function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'select':
      return { ...state, selectedId: action.id, frame: 0, playing: false };
    case 'frame':
      return { ...state, frame: Math.max(0, Math.min(11, action.index)) };
    case 'step':
      return { ...state, frame: (state.frame + action.delta + 12) % 12, playing: false };
    case 'play':
      return { ...state, playing: action.playing };
    case 'speed':
      return { ...state, speed: action.value };
    case 'view':
      return { ...state, view: action.value };
    case 'background':
      return { ...state, background: action.value };
    case 'zoom':
      return { ...state, zoom: action.value };
    case 'onion':
      return { ...state, onion: action.value };
    case 'directions':
      return { ...state, directions: action.value };
    case 'compare':
      return { ...state, compare: action.value };
    case 'heading':
      return { ...state, heading: action.value };
    case 'guides':
      return { ...state, showGuides: action.value };
    case 'character':
      return { ...state, showCharacter: action.value };
    case 'tool':
      return { ...state, tool: action.value };
    case 'ink':
      return { ...state, ink: action.value };
    case 'lock':
      return { ...state, locks: { ...state.locks, [action.key]: action.value } };
    case 'variants':
      return { ...state, variantSeeds: action.seeds };

    case 'param': {
      if (state.locks.silhouette) return state;
      return pushHistory(
        state,
        mapSelected(state, (r) => ({
          ...r,
          parameters: { ...r.parameters, [action.key]: action.value },
        })),
      );
    }
    case 'duration': {
      if (state.locks.timing) return state;
      return pushHistory(
        state,
        mapSelected(state, (r) => {
          const durations = [...r.animation.frameDurationsMs];
          durations[action.frame] = Math.max(1, Math.round(action.value));
          return { ...r, animation: { ...r.animation, frameDurationsMs: durations } };
        }),
      );
    }
    case 'seed':
      return pushHistory(state, mapSelected(state, (r) => ({ ...r, seed: action.value })));
    case 'addRecipe':
      return {
        ...pushHistory(state, { ...state.doc, recipes: [...state.doc.recipes, action.recipe] }),
        selectedId: action.recipe.id,
        frame: 0,
      };

    case 'strokeStart':
      return { ...state, stroke: true, past: [...state.past.slice(-HISTORY_LIMIT), state.doc], future: [] };
    case 'strokeEnd':
      return { ...state, stroke: false };
    case 'paint': {
      // Pendant un tracé, les pixels s'accumulent dans la **même** retouche :
      // un glisser-déposer continu ne produit pas cinquante entrées d'historique.
      const id = `${state.selectedId}#f${state.frame}#d${action.direction ?? 'all'}`;
      const existing = state.doc.patches.find((p) => p.id === id);
      const merged: FramePatch = existing
        ? { ...existing, pixels: mergePixels(existing.pixels, action.pixels) }
        : {
            id,
            recipeId: state.selectedId,
            frame: state.frame,
            direction: action.direction,
            baseSignature: action.baseSignature,
            pixels: [...action.pixels],
          };
      const patches = existing
        ? state.doc.patches.map((p) => (p.id === id ? merged : p))
        : [...state.doc.patches, merged];
      const doc = { ...state.doc, patches };
      return state.stroke ? { ...state, doc, dirty: true } : pushHistory(state, doc);
    }
    case 'dropPatches': {
      const patches = state.doc.patches.filter(
        (p) =>
          p.recipeId !== action.recipeId || (action.frame !== undefined && p.frame !== action.frame),
      );
      return pushHistory(state, { ...state.doc, patches });
    }

    case 'undo': {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        ...state,
        doc: previous,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future],
        dirty: true,
      };
    }
    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        doc: next,
        past: [...state.past, state.doc],
        future: state.future.slice(1),
        dirty: true,
      };
    }
    case 'loadDoc':
      return {
        ...state,
        doc: action.doc,
        past: [],
        future: [],
        selectedId: action.doc.recipes[0]?.id ?? state.selectedId,
        frame: 0,
        dirty: false,
      };
    case 'saved':
      return { ...state, dirty: false };
    default:
      return state;
  }
}

function mergePixels(a: readonly PixelPatch[], b: readonly PixelPatch[]): PixelPatch[] {
  const map = new Map<string, PixelPatch>();
  for (const px of [...a, ...b]) map.set(`${px.x},${px.y}`, px);
  return [...map.values()];
}
