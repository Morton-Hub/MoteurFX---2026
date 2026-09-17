/**
 * Génération hors du fil principal.
 *
 * Messages **versionnés**, annulation et protection contre les résultats
 * périmés : un résultat ancien ne doit jamais remplacer un résultat plus
 * récent (§13). Le module est pur — il ne connaît ni `self` ni le DOM —
 * pour être testable et utilisable aussi depuis le CLI.
 */

import type { Diagnostic } from '../core/diagnostics.js';
import { compileRecipe } from '../compiler/compile.js';
import { styleById, RAW_STYLE, PIXEL_STRICT, type StyleProfile } from '../pixels/style.js';
import { sampleDirections } from '../projection/directions.js';
import { renderFrame } from '../renderer/render.js';
import { makeStage, withHeading } from '../renderer/stage.js';
import type { FramePatch } from '../patches/patch.js';
import type { RecipeDefinition } from '../recipes/types.js';

export const PROTOCOL_VERSION = 2;

export type ViewMode = 'color' | 'mono' | 'silhouette' | 'body' | 'emission' | 'mask';

export type GenerateRequest = {
  readonly protocol: number;
  /** Numéro croissant : un résultat de numéro inférieur est périmé. */
  readonly requestId: number;
  readonly recipe: RecipeDefinition;
  readonly patches: readonly FramePatch[];
  /** Caps à produire. Un seul pour la scène, huit ou seize pour la comparaison. */
  readonly directions: number;
  readonly startHeading: number;
  /** Frames demandées. Vide = les douze. */
  readonly frames: readonly number[];
  readonly view: ViewMode;
  readonly styleId: string;
  readonly overrides?: Readonly<Record<string, number | boolean | string>>;
  readonly seedOverride?: number;
  /**
   * Joint le buffer d'index et la table d'encres. Nécessaire à la pipette et
   * au crayon : une retouche désigne une **encre** (matière + rôle), pas un
   * RGB pioché à l'écran.
   */
  readonly includeInks?: boolean;
  /**
   * Index logique du premier cap produit. La scène ne génère qu'une
   * direction, mais les retouches sont rangées par index de cap exporté :
   * sans ce décalage, une correction faite sur le cap 5 serait relue comme
   * une correction du cap 0.
   */
  readonly directionIndexBase?: number;
};

export type GeneratedFrame = {
  readonly direction: number;
  readonly heading: number;
  readonly frame: number;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly durationMs: number;
  readonly role: string | null;
  readonly signature: string;
  readonly bounds: { x0: number; y0: number; x1: number; y1: number } | null;
  readonly colors: number;
  readonly indices?: Uint8Array;
  readonly palette?: readonly { readonly index: number; readonly key: string; readonly hex: string }[];
};

export type GenerateResponse = {
  readonly protocol: number;
  readonly requestId: number;
  readonly recipeId: string;
  readonly frames: readonly GeneratedFrame[];
  readonly diagnostics: readonly Diagnostic[];
  readonly durations: readonly number[];
  readonly elapsedMs: number;
};

function styleFor(id: string, view: ViewMode): StyleProfile {
  if (view === 'silhouette' || view === 'mask') return RAW_STYLE;
  if (view === 'body') return PIXEL_STRICT;
  return styleById(id);
}

export function generate(request: GenerateRequest): GenerateResponse {
  const started = Date.now();
  const definition: RecipeDefinition = request.overrides || request.seedOverride !== undefined
    ? {
        ...request.recipe,
        ...(request.seedOverride !== undefined ? { seed: request.seedOverride } : {}),
        parameters: { ...request.recipe.parameters, ...(request.overrides ?? {}) },
      }
    : request.recipe;

  const compiled = compileRecipe(definition, { probeParams: false });
  const style = styleFor(request.styleId, request.view);
  const base = makeStage({
    width: definition.stage.width,
    height: definition.stage.height,
    distance: definition.stage.distance,
    ...(definition.stage.casterHeight !== undefined ? { casterHeight: definition.stage.casterHeight } : {}),
    ...(definition.stage.targetAt ? { targetAt: definition.stage.targetAt } : {}),
    heading: request.startHeading,
    seed: definition.seed,
    style,
  });
  const dirs = sampleDirections(Math.max(1, request.directions), request.startHeading, base.projection);
  const wanted = request.frames.length > 0 ? request.frames : compiled.budget.frameDurationsMs.map((_, i) => i);

  const frames: GeneratedFrame[] = [];
  const diagnostics: Diagnostic[] = [...compiled.diagnostics];
  const indexBase = request.directionIndexBase ?? 0;
  for (const dir of dirs) {
    const stage = withHeading(base, dir.heading);
    for (const index of wanted) {
      const rendered = renderFrame(compiled, stage, index, {
        style,
        patches: request.patches,
        direction: dir.index + indexBase,
      });
      diagnostics.push(...rendered.diagnostics);
      const image =
        request.view === 'mono'
          ? rendered.body.toMono()
          : request.view === 'silhouette' || request.view === 'mask'
            ? rendered.body.toSilhouette(request.view === 'mask' ? [255, 90, 160, 255] : [236, 236, 244, 255])
            : request.view === 'emission'
              ? rendered.emission.toRgba()
              : rendered.body.toRgba();
      if (request.view === 'color') image.composite(rendered.emission.toRgba(), 'add');
      const extra = request.includeInks
        ? {
            indices: new Uint8Array(rendered.body.data),
            palette: rendered.body.table.entries().map((e) => ({
              index: e.index,
              key: e.key,
              hex: `#${e.rgba
                .slice(0, 3)
                .map((v) => v.toString(16).padStart(2, '0'))
                .join('')}`,
            })),
          }
        : {};
      frames.push({
        ...extra,
        direction: dir.index + indexBase,
        heading: dir.heading,
        frame: index,
        width: image.width,
        height: image.height,
        rgba: image.data,
        durationMs: rendered.durationMs,
        role: rendered.role ?? null,
        signature: rendered.signature,
        bounds: rendered.bounds,
        colors: rendered.body.usedColorCount(),
      });
    }
  }

  return {
    protocol: PROTOCOL_VERSION,
    requestId: request.requestId,
    recipeId: definition.id,
    frames,
    diagnostics,
    durations: compiled.budget.frameDurationsMs,
    elapsedMs: Date.now() - started,
  };
}
