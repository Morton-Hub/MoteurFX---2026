/**
 * Planches de contrôle.
 *
 * Une planche n'est pas un livrable de jeu : c'est l'outil d'inspection
 * visuelle exigé à chaque jalon (§17). Elle montre les douze cellules d'une
 * recette, en couleur, en monochrome, en silhouette ou en émission seule.
 *
 *   npx tsx src/cli/board.ts --all --mode color --scale 2 --out docs/planches/catalogue.png
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { deflateSync } from 'node:zlib';
import { compileRecipe } from '../compiler/compile.js';
import { getRecipe, listRecipes } from '../recipes/registry.js';
import { Framebuffer, upscale } from '../pixels/rgba.js';
import { encodePng, setDeflate } from '../exporter/png.js';
import { encodeGif } from '../exporter/gif.js';
import { renderClip } from '../renderer/render.js';
import { makeStage } from '../renderer/stage.js';
import { sampleDirections } from '../projection/directions.js';
import type { RecipeDefinition } from '../recipes/types.js';

setDeflate((data) => new Uint8Array(deflateSync(data, { level: 9 })));

export type BoardMode = 'color' | 'mono' | 'silhouette' | 'emission';

export type BoardOptions = {
  readonly recipes: readonly RecipeDefinition[];
  readonly mode: BoardMode;
  readonly heading: number;
  readonly scale: number;
  readonly background: readonly [number, number, number, number];
  /** Une ligne par cap au lieu d'une ligne par recette. */
  readonly directions?: number;
  /** Cellules par ligne. 12 = une recette par ligne ; 4 = grille 4x3. */
  readonly columns?: number;
  /** Sous-ensemble d'images, pour inspecter une phase de près. */
  readonly frames?: readonly number[];
};

const BACKGROUNDS: Record<string, [number, number, number, number]> = {
  dark: [24, 22, 32, 255],
  light: [214, 212, 208, 255],
  busy: [58, 72, 58, 255],
};

function frameImage(frame: ReturnType<typeof renderClip>[number], mode: BoardMode): Framebuffer {
  switch (mode) {
    case 'mono':
      return frame.body.toMono();
    case 'silhouette':
      return frame.body.toSilhouette([240, 238, 246, 255]);
    case 'emission':
      return frame.emission.toRgba();
    default: {
      const fb = frame.body.toRgba();
      // La passe lumineuse est ajoutée par-dessus, comme dans le jeu.
      fb.composite(frame.emission.toRgba(), 'add');
      return fb;
    }
  }
}

export function buildBoard(o: BoardOptions): Framebuffer {
  const rows: { label: string; images: Framebuffer[]; w: number; h: number }[] = [];
  for (const def of o.recipes) {
    const compiled = compileRecipe(def, { probeParams: false });
    const headings =
      o.directions && o.directions > 1
        ? sampleDirections(o.directions, o.heading).map((d) => d.heading)
        : [o.heading];
    for (const heading of headings) {
      const stage = makeStage({
        width: def.stage.width,
        height: def.stage.height,
        distance: def.stage.distance,
        ...(def.stage.casterHeight !== undefined ? { casterHeight: def.stage.casterHeight } : {}),
        ...(def.stage.targetAt ? { targetAt: def.stage.targetAt } : {}),
        heading,
        seed: def.seed,
      });
      const all = renderClip(compiled, stage);
      const frames = o.frames && o.frames.length > 0 ? o.frames.map((i) => all[i]!).filter(Boolean) : all;
      rows.push({
        label: def.id,
        images: frames.map((f) => frameImage(f, o.mode)),
        w: def.stage.width,
        h: def.stage.height,
      });
    }
  }
  const cellW = Math.max(...rows.map((r) => r.w));
  const cellH = Math.max(...rows.map((r) => r.h));
  const cells = rows[0]?.images.length ?? 12;
  const columns = Math.max(1, Math.min(cells, o.columns ?? cells));
  const linesPerRow = Math.ceil(cells / columns);
  const sheet = new Framebuffer(cellW * columns, cellH * rows.length * linesPerRow);
  sheet.fill(o.background as [number, number, number, number]);
  rows.forEach((row, ri) => {
    row.images.forEach((img, fi) => {
      const col = fi % columns;
      const line = ri * linesPerRow + Math.floor(fi / columns);
      sheet.blit(
        img,
        col * cellW + Math.floor((cellW - img.width) / 2),
        line * cellH + Math.floor((cellH - img.height) / 2),
      );
    });
  });
  return o.scale > 1 ? upscale(sheet, o.scale) : sheet;
}

/**
 * Animation de contrôle : les douze images, à leurs vraies expositions, dans
 * un agrandissement entier. Ce n'est pas un asset livrable — c'est l'outil qui
 * permet de juger le rythme à vitesse normale.
 */
export function buildAnimation(
  def: RecipeDefinition,
  o: {
    mode: BoardMode;
    heading: number;
    scale: number;
    background: readonly [number, number, number, number];
    /** Recadre sur l'union des silhouettes des douze images, avec marge. */
    crop?: number;
  },
): Uint8Array {
  const compiled = compileRecipe(def, { probeParams: false });
  const stage = makeStage({
    width: def.stage.width,
    height: def.stage.height,
    distance: def.stage.distance,
    ...(def.stage.casterHeight !== undefined ? { casterHeight: def.stage.casterHeight } : {}),
    ...(def.stage.targetAt ? { targetAt: def.stage.targetAt } : {}),
    heading: o.heading,
    seed: def.seed,
  });
  const rendered = renderClip(compiled, stage);
  // Le recadrage se fait sur **l'union** des douze silhouettes : recadrer
  // image par image donnerait un sprite qui saute d'une frame à l'autre.
  let crop: { x0: number; y0: number; x1: number; y1: number } | null = null;
  if (o.crop !== undefined) {
    for (const f of rendered) {
      if (!f.bounds) continue;
      crop = crop
        ? {
            x0: Math.min(crop.x0, f.bounds.x0),
            y0: Math.min(crop.y0, f.bounds.y0),
            x1: Math.max(crop.x1, f.bounds.x1),
            y1: Math.max(crop.y1, f.bounds.y1),
          }
        : { ...f.bounds };
    }
    if (crop) {
      const m = o.crop;
      crop = {
        x0: Math.max(0, crop.x0 - m),
        y0: Math.max(0, crop.y0 - m),
        x1: Math.min(def.stage.width - 1, crop.x1 + m),
        y1: Math.min(def.stage.height - 1, crop.y1 + m),
      };
    }
  }
  const frames = rendered.map((f) => {
    const full = frameImage(f, o.mode);
    const image = crop ? cropFramebuffer(full, crop) : full;
    return o.scale > 1 ? upscale(image, o.scale) : image;
  });
  return encodeGif(frames, {
    delayCs: compiled.budget.frameDurationsMs.map((d) => Math.max(2, Math.round(d / 10))),
    background: [o.background[0], o.background[1], o.background[2]],
  });
}

function cropFramebuffer(
  fb: Framebuffer,
  rect: { x0: number; y0: number; x1: number; y1: number },
): Framebuffer {
  const out = new Framebuffer(rect.x1 - rect.x0 + 1, rect.y1 - rect.y0 + 1);
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      out.plot(x, y, fb.get(rect.x0 + x, rect.y0 + y));
    }
  }
  return out;
}

function parseArgs(argv: readonly string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const recipes = args['all']
    ? listRecipes()
    : String(args['recipe'] ?? 'fire-ember-fist-s')
        .split(',')
        .map((id) => getRecipe(id.trim()));
  const out = String(args['out'] ?? 'docs/planches/planche.png');
  const background = BACKGROUNDS[String(args['bg'] ?? 'dark')] ?? BACKGROUNDS['dark']!;

  if (args['gif']) {
    for (const def of recipes) {
      const gif = buildAnimation(def, {
        mode: (args['mode'] as BoardMode) ?? 'color',
        heading: Number(args['heading'] ?? 0),
        scale: Number(args['scale'] ?? 3),
        background,
        ...(args['crop'] !== undefined ? { crop: Number(args['crop']) || 4 } : {}),
      });
      const path = recipes.length === 1 ? out : out.replace(/\.gif$/, `-${def.id}.gif`);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, gif);
      console.log(`${path} — ${gif.length} octets`);
    }
    return;
  }

  const board = buildBoard({
    recipes,
    mode: (args['mode'] as BoardMode) ?? 'color',
    heading: Number(args['heading'] ?? 0),
    scale: Number(args['scale'] ?? 1),
    background,
    ...(args['directions'] ? { directions: Number(args['directions']) } : {}),
    ...(args['columns'] ? { columns: Number(args['columns']) } : {}),
    ...(args['frames']
      ? { frames: String(args['frames']).split(',').map((v) => Number(v.trim()) - 1) }
      : {}),
  });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, encodePng(board));
  console.log(`${out} — ${board.width}x${board.height}, ${recipes.length} recette(s)`);
}

const invoked = process.argv[1] ?? '';
if (invoked.includes('board')) main();
