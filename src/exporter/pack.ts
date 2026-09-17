/**
 * Fabrication d'un pack exportable.
 *
 * Un seul chemin : recette compilée → douze frames par direction → atlas →
 * manifeste. Ni la preview ni l'export n'ont de rendu propre ; c'est la
 * condition pour que « export/preview comparés sur les pixels de référence »
 * veuille dire quelque chose (§17).
 */

import type { Diagnostic } from '../core/diagnostics.js';
import { totalDurationMs } from '../animation/budget.js';
import { styleById, type StyleProfile } from '../pixels/style.js';
import { sampleDirections } from '../projection/directions.js';
import { renderClip, type RenderedFrame } from '../renderer/render.js';
import { makeStage, withHeading } from '../renderer/stage.js';
import type { FramePatch } from '../patches/patch.js';
import type { CompiledRecipe } from '../recipes/types.js';
import { buildAtlas, type DirectionFrames } from './atlas.js';
import { buildManifest, type Manifest, type PassDescriptor } from './manifest.js';
import { encodePng } from './png.js';
import { encodeGif } from './gif.js';

export type ExportRequest = {
  readonly recipe: CompiledRecipe;
  /** Nombre de caps. 8 et 16 sont les standards ; N quelconque est accepté. */
  readonly directions?: number;
  readonly startHeading?: number;
  readonly style?: StyleProfile;
  readonly patches?: readonly FramePatch[];
  /** PNG individuels en plus de l'atlas. */
  readonly includeFrames?: boolean;
  /** Aperçu GIF animé, à ne pas confondre avec les assets finaux. */
  readonly includePreview?: boolean;
  readonly padding?: number;
  readonly extrude?: number;
};

export type ExportedFile = {
  readonly path: string;
  readonly bytes?: Uint8Array;
  readonly text?: string;
};

export type ExportResult = {
  readonly files: readonly ExportedFile[];
  readonly manifest: Manifest;
  readonly frames: readonly DirectionFrames[];
  readonly diagnostics: readonly Diagnostic[];
};

export function renderDirections(
  recipe: CompiledRecipe,
  o: { directions?: number; startHeading?: number; style?: StyleProfile; patches?: readonly FramePatch[] } = {},
): { frames: DirectionFrames[]; diagnostics: Diagnostic[]; style: StyleProfile } {
  const def = recipe.definition;
  const count = o.directions ?? def.export.directions;
  const style = o.style ?? styleById(def.style);
  const base = makeStage({
    width: def.stage.width,
    height: def.stage.height,
    distance: def.stage.distance,
    ...(def.stage.casterHeight !== undefined ? { casterHeight: def.stage.casterHeight } : {}),
    ...(def.stage.targetAt ? { targetAt: def.stage.targetAt } : {}),
    heading: o.startHeading ?? 0,
    seed: def.seed,
    style,
  });
  const dirs = sampleDirections(count, o.startHeading ?? 0, base.projection);
  const frames: DirectionFrames[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const direction of dirs) {
    const clip = renderClip(recipe, withHeading(base, direction.heading), {
      style,
      ...(o.patches ? { patches: o.patches } : {}),
      direction: direction.index,
    });
    for (const f of clip) diagnostics.push(...f.diagnostics);
    frames.push({ direction, frames: clip });
  }
  return { frames, diagnostics, style };
}

export function exportSpell(request: ExportRequest): ExportResult {
  const recipe = request.recipe;
  const def = recipe.definition;
  const { frames, diagnostics, style } = renderDirections(recipe, {
    ...(request.directions !== undefined ? { directions: request.directions } : {}),
    ...(request.startHeading !== undefined ? { startHeading: request.startHeading } : {}),
    ...(request.style ? { style: request.style } : {}),
    ...(request.patches ? { patches: request.patches } : {}),
  });

  const stage = makeStage({
    width: def.stage.width,
    height: def.stage.height,
    distance: def.stage.distance,
    ...(def.stage.casterHeight !== undefined ? { casterHeight: def.stage.casterHeight } : {}),
    ...(def.stage.targetAt ? { targetAt: def.stage.targetAt } : {}),
    heading: 0,
    seed: def.seed,
    style,
  });
  // Le pivot est la projection de la cible au sol : il ne bouge pas d'un cap
  // à l'autre, ce qui est la condition d'un changement de direction sans saut.
  const pivot = { x: stage.projection.originX, y: stage.projection.originY };

  const atlasOptions = {
    pivot,
    ...(request.padding !== undefined ? { padding: request.padding } : {}),
    ...(request.extrude !== undefined ? { extrude: request.extrude } : {}),
  };
  const body = buildAtlas(frames, def.stage.width, def.stage.height, { ...atlasOptions, pass: 'body' });
  const wantsEmission = def.export.separateEmission && style.bodyProfile !== 'pixel-strict';
  const emission = wantsEmission
    ? buildAtlas(frames, def.stage.width, def.stage.height, { ...atlasOptions, pass: 'emission' })
    : null;

  const dir = def.id;
  const files: ExportedFile[] = [];
  files.push({ path: `${dir}/${def.id}-body.png`, bytes: encodePng(body.image) });
  const passes: PassDescriptor[] = [
    {
      name: 'body',
      file: `${def.id}-body.png`,
      blend: 'normal',
      alpha: 'straight',
      colors: frames[0]?.frames[0]?.body.table.size ?? 0,
    },
  ];
  if (emission) {
    files.push({ path: `${dir}/${def.id}-emission.png`, bytes: encodePng(emission.image) });
    passes.push({
      name: 'emission',
      file: `${def.id}-emission.png`,
      blend: 'add',
      alpha: 'straight',
      colors: frames[0]?.frames[0]?.emission.table.size ?? 0,
    });
  }

  if (request.includeFrames) {
    for (const row of frames) {
      for (const frame of row.frames) {
        const index = String(frame.index).padStart(2, '0');
        files.push({
          path: `${dir}/frames/d${String(row.direction.index).padStart(2, '0')}-f${index}.png`,
          bytes: encodePng(frame.body.toRgba()),
        });
      }
    }
  }

  if (request.includePreview) {
    const first = frames[0];
    if (first) {
      const images = first.frames.map((f) => {
        const fb = f.body.toRgba();
        fb.composite(f.emission.toRgba(), 'add');
        return fb;
      });
      files.push({
        path: `${dir}/${def.id}-apercu.gif`,
        bytes: encodeGif(images, {
          delayCs: recipe.budget.frameDurationsMs.map((d) => Math.max(2, Math.round(d / 10))),
          background: [24, 22, 32],
        }),
      });
    }
  }

  const palette = frames[0]?.frames.reduce<ReturnType<typeof paletteOf>>(
    (acc, f) => (f.body.table.size > acc.length ? paletteOf(f) : acc),
    [],
  ) ?? [];

  const manifest = buildManifest({
    recipe,
    budget: recipe.budget,
    style,
    projection: stage.projection,
    directions: frames.map((f) => f.direction),
    atlas: body,
    passes,
    palette,
    capturePivot: pivot,
    extraLimits: [
      `Durée totale du clip : ${totalDurationMs(recipe.budget)} ms, somme des douze expositions.`,
    ],
  });
  files.push({ path: `${dir}/${def.id}.manifest.json`, text: JSON.stringify(manifest, null, 2) });

  return { files, manifest, frames, diagnostics };
}

function paletteOf(frame: RenderedFrame): ReturnType<typeof entries> {
  return entries(frame);
}

function entries(frame: RenderedFrame) {
  return [...frame.body.table.entries()];
}
