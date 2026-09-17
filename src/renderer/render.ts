/**
 * Rendu d'une frame et d'un clip.
 *
 * La preview et l'export passent **par ce chemin unique** : c'est la seule
 * façon de tenir la promesse « export/preview comparés sur les pixels de
 * référence » (§17).
 */

import type { Diagnostic } from '../core/diagnostics.js';
import { diag } from '../core/diagnostics.js';
import { IndexedCanvas, type Rect } from '../pixels/canvas.js';
import type { StyleProfile } from '../pixels/style.js';
import type { ClipRole } from '../animation/budget.js';
import type { CompiledRecipe } from '../recipes/types.js';
import { makeFrameContext, type StageSetup } from './context.js';
import { deriveEmission } from './emission.js';
import { sortPieces, type Piece } from './piece.js';
import { applyPatches, patchesFor, type FramePatch } from '../patches/patch.js';

export type RenderedFrame = {
  readonly index: number;
  readonly durationMs: number;
  readonly role: ClipRole | undefined;
  readonly body: IndexedCanvas;
  /** Passe lumineuse. Vide en profil strict. */
  readonly emission: IndexedCanvas;
  /** Couches d'occlusion, si un plan de séparation a été demandé. */
  readonly back?: IndexedCanvas;
  readonly front?: IndexedCanvas;
  readonly bounds: Rect | null;
  readonly pieceCount: number;
  readonly signature: string;
  readonly diagnostics: readonly Diagnostic[];
};

export type RenderOptions = {
  /** Style de rendu. Par défaut celui de la scène. */
  readonly style?: StyleProfile;
  /**
   * Profondeur de séparation avant/arrière, en clé de tri monde. Les clips
   * qui entourent un personnage se peignent en deux couches synchronisées.
   */
  readonly depthSplit?: number;
  /** Retouches à appliquer après la génération. */
  readonly patches?: readonly FramePatch[];
  /** Index du cap rendu : sert à choisir les retouches propres à une direction. */
  readonly direction?: number;
};

function stageWithStyle(stage: StageSetup, style?: StyleProfile): StageSetup {
  return style ? { ...stage, style } : stage;
}

export function renderFrame(
  recipe: CompiledRecipe,
  stage: StageSetup,
  index: number,
  options: RenderOptions = {},
): RenderedFrame {
  const s = stageWithStyle(stage, options.style);
  const ctx = makeFrameContext(s, recipe.budget, index);
  const body = new IndexedCanvas(s.width, s.height);
  const diagnostics: Diagnostic[] = [];

  let pieces: Piece[] = [];
  try {
    pieces = sortPieces(recipe.builder.build(ctx, recipe.params));
  } catch (err) {
    diagnostics.push(
      diag('error', 'build-failed', `La frame ${index} n'a pas pu être construite : ${(err as Error).message}`, recipe.definition.id),
    );
  }

  for (const piece of pieces) piece.paint(body, ctx);

  // Les retouches viennent après la génération, jamais pendant : la base
  // reste reproductible et la correction reste inspectable.
  if (options.patches && options.patches.length > 0) {
    const mine = patchesFor(options.patches, recipe.definition.id, index, options.direction ?? 0);
    if (mine.length > 0) {
      const result = applyPatches(body, mine);
      diagnostics.push(...result.diagnostics);
    }
  }

  const emission = deriveEmission(body, s.style);
  for (const piece of pieces) piece.emit?.(emission, ctx);

  let back: IndexedCanvas | undefined;
  let front: IndexedCanvas | undefined;
  if (options.depthSplit !== undefined) {
    back = new IndexedCanvas(s.width, s.height, body.table);
    front = new IndexedCanvas(s.width, s.height, body.table);
    for (const piece of pieces) {
      const layer = piece.layer ?? (piece.depth < options.depthSplit ? 'back' : 'front');
      piece.paint(layer === 'back' ? back : front, ctx);
    }
  }

  const bounds = body.bounds();
  if (bounds) {
    const margin = 0;
    if (
      bounds.x0 <= margin ||
      bounds.y0 <= margin ||
      bounds.x1 >= s.width - 1 - margin ||
      bounds.y1 >= s.height - 1 - margin
    ) {
      diagnostics.push(
        diag('warning', 'frame-clipped', `La frame ${index} touche le bord du canevas : la capture est peut-être recadrée`, `${recipe.definition.id}.frame[${index}]`),
      );
    }
  }

  return {
    index,
    durationMs: recipe.budget.frameDurationsMs[index] ?? 0,
    role: ctx.role,
    body,
    emission,
    ...(back ? { back } : {}),
    ...(front ? { front } : {}),
    bounds,
    pieceCount: pieces.length,
    signature: body.signature(),
    diagnostics,
  };
}

/** Les douze images d'une direction. */
export function renderClip(
  recipe: CompiledRecipe,
  stage: StageSetup,
  options: RenderOptions = {},
): RenderedFrame[] {
  const out: RenderedFrame[] = [];
  for (let i = 0; i < recipe.budget.frameCount; i++) {
    out.push(renderFrame(recipe, stage, i, options));
  }
  return out;
}
