/**
 * Renderer. La preview et l'export passent tous les deux par ici : il n'y a
 * qu'un seul chemin de rendu.
 *
 * Ordre : sol -> corps principal (trié en 2.5D) -> liseré de silhouette ->
 * passe lumière additive optionnelle.
 */

import { clamp01 } from '../core/math.js';
import { Framebuffer, type RGBA, ditherPasses } from '../raster/framebuffer.js';
import { ShapeMask } from '../raster/mask.js';
import { type DrawCmd, type Layer, cmdBounds, maskForCmd, paintColorAt } from './draw.js';
import { makeFrame, headingFromTo, localToWorld, project } from '../space/projection.js';
import type { SpellContext, SpellRecipe } from '../sim/types.js';
import { PALETTES, type Palette } from '../style/palette.js';
import { DEFAULT_STYLE, type StyleProfile } from '../style/styleProfile.js';
import { applyEmissive, applyMaterial, lightOnScreen } from './material.js';
import { ISO_2_1, type ProjectionProfile, withOrigin, withScale } from '../space/projection.js';
import type { Vec3 } from '../core/math.js';

export type RenderOptions = {
  readonly style?: StyleProfile;
  readonly projection?: ProjectionProfile;
  readonly heading?: number;
  readonly range?: number;
  readonly power?: number;
  readonly seed?: number;
  /** Echelle monde -> pixels. Independante de la taille du canevas. */
  readonly groundScale?: number;
  /** Rend uniquement une tranche de profondeur : passes avant / arrière. */
  readonly depthRange?: readonly [number, number];
  /** Categories a masquer (tags de commande), pour l'affichage isole. */
  readonly hideTags?: readonly string[];
  /** Ne garder que ces categories. */
  readonly onlyTags?: readonly string[];
  /** Rendu de la seule silhouette, en blanc. Controle de lisibilité. */
  readonly silhouetteOnly?: boolean;
  /**
   * Instant du clip, en secondes. Sert aux textures qui doivent avancer dans
   * le temps, comme la moucheture d'un corps émissif.
   */
  readonly phase?: number;
};

export type RenderResult = {
  readonly color: Framebuffer;
  /** Passe lumière seule, pour une composition adaptee dans le jeu. */
  readonly light: Framebuffer;
  readonly commandCount: number;
};

export const DEFAULT_GROUND_SCALE = 22;

/** Construit le contexte d'une recette pour un cap et une portee donnes. */
export function makeContext(recipe: SpellRecipe, opts: RenderOptions = {}): SpellContext {
  const style = opts.style ?? DEFAULT_STYLE;
  const palette = PALETTES[recipe.element];
  const groundScale = opts.groundScale ?? DEFAULT_GROUND_SCALE;
  const base = opts.projection ?? ISO_2_1;
  const projection = withOrigin(
    withScale(base, groundScale, groundScale),
    recipe.pivot.x,
    recipe.pivot.y,
  );
  const heading = opts.heading ?? 0;
  const range = opts.range ?? recipe.defaultRange;
  const source: Vec3 = { x: 0, y: 0, z: 0 };
  const target: Vec3 = {
    x: Math.cos(heading) * range,
    y: Math.sin(heading) * range,
    z: 0,
  };
  // Le cap effectif est recalcule depuis les positions : si source et cible
  // sont confondues, `headingFromTo` retombe sur le cap demande.
  const effective = headingFromTo(source, target, heading);
  const frame = makeFrame(source, effective);
  const p = (w: Vec3) => project(projection, w);
  return {
    projection,
    style,
    palette,
    seed: opts.seed ?? 0x5eed,
    source,
    target,
    heading: effective,
    frame,
    distance: range,
    power: clamp01(opts.power ?? recipe.defaultPower),
    p,
    pl: (fwd, side, up) => p(localToWorld(frame, fwd, side, up)),
    wl: (fwd, side, up) => localToWorld(frame, fwd, side, up),
  };
}

function filterCmds(cmds: readonly DrawCmd[], opts: RenderOptions): DrawCmd[] {
  let out = cmds.filter((c) => Number.isFinite(c.depth));
  if (opts.depthRange) {
    const [lo, hi] = opts.depthRange;
    out = out.filter((c) => c.depth >= lo && c.depth < hi);
  }
  if (opts.onlyTags && opts.onlyTags.length > 0) {
    const keep = new Set(opts.onlyTags);
    out = out.filter((c) => (c.tag ? keep.has(c.tag) : false));
  }
  if (opts.hideTags && opts.hideTags.length > 0) {
    const drop = new Set(opts.hideTags);
    out = out.filter((c) => !(c.tag && drop.has(c.tag)));
  }
  return out;
}

/** Tri stable par profondeur croissante (peinture du fond vers l'avant). */
function sortedLayer(cmds: readonly DrawCmd[], layer: Layer): DrawCmd[] {
  return cmds
    .map((cmd, i) => ({ cmd, i }))
    .filter((e) => e.cmd.layer === layer)
    .sort((a, b) => (a.cmd.depth === b.cmd.depth ? a.i - b.i : a.cmd.depth - b.cmd.depth))
    .map((e) => e.cmd);
}

function paintCmd(
  fb: Framebuffer,
  cmd: DrawCmd,
  style: StyleProfile,
  silhouette: boolean,
  softMask?: Uint8Array,
  emissiveMask?: Uint8Array,
): void {
  const mask = maskForCmd(cmd, fb.width, fb.height);
  if (mask.isEmpty) return;
  const mode = cmd.paint.mode ?? 'over';
  const dither = cmd.paint.dither
    ? { ...cmd.paint.dither, level: cmd.paint.dither.level * style.ditherDensity }
    : undefined;
  const white: RGBA = [255, 255, 255, 255];
  for (let y = mask.y0; y < mask.y0 + mask.h; y++) {
    const rowColor = silhouette ? white : paintColorAt(cmd.paint, y);
    for (let x = mask.x0; x < mask.x0 + mask.w; x++) {
      if (!mask.get(x, y)) continue;
      if (!ditherPasses(dither, x, y)) continue;
      fb.plot(x, y, rowColor, silhouette ? 'over' : mode);
      // Un solide peint par dessus une matière diffuse reprend ses droits à
      // la passe de volume ; l'inverse la lui retire.
      if (softMask) softMask[y * fb.width + x] = cmd.material === 'soft' ? 1 : 0;
      if (emissiveMask) emissiveMask[y * fb.width + x] = cmd.material === 'emissive' ? 1 : 0;
    }
  }
  if (cmd.outline && !silhouette) {
    const edge = mask.edge();
    for (let y = edge.y0; y < edge.y0 + edge.h; y++) {
      for (let x = edge.x0; x < edge.x0 + edge.w; x++) {
        if (!edge.get(x, y)) continue;
        if (!ditherPasses(cmd.outline.dither, x, y)) continue;
        fb.plot(x, y, cmd.outline.color, 'over');
      }
    }
  }
}

export function renderCommands(
  cmds: readonly DrawCmd[],
  width: number,
  height: number,
  style: StyleProfile,
  opts: RenderOptions = {},
  palette: Palette = PALETTES.ice,
): RenderResult {
  const visible = filterCmds(cmds, opts);
  const color = new Framebuffer(width, height);
  const light = new Framebuffer(width, height);
  const silhouette = opts.silhouetteOnly === true;

  for (const cmd of sortedLayer(visible, 'ground')) paintCmd(color, cmd, style, silhouette);

  const body = new Framebuffer(width, height);
  const softMask = new Uint8Array(width * height);
  const emissiveMask = new Uint8Array(width * height);
  for (const cmd of sortedLayer(visible, 'main')) {
    paintCmd(body, cmd, style, silhouette, softMask, emissiveMask);
  }
  if (!silhouette) {
    // Les corps rayonnants sont recolorés par leur épaisseur, avant la passe
    // de volume, qui les ignore ensuite.
    let hasEmissive = false;
    for (let i = 0; i < emissiveMask.length; i++) {
      if (emissiveMask[i] === 1) {
        hasEmissive = true;
        break;
      }
    }
    if (hasEmissive) {
      applyEmissive(body, emissiveMask, palette, {
        coreDistance: style.emissiveCore,
        rimAlpha: style.emissiveOutline,
        edgeBias: style.emissiveEdgeBias,
        turbulence: style.emissiveTurbulence,
        turbulenceBias: style.emissiveTurbulenceBias,
        // La moucheture monte avec le temps : une flamme grésille vers le
        // haut, elle ne clignote pas sur place.
        phase: (opts.phase ?? 0) * 26,
        seed: opts.seed ?? 0x5eed,
      });
      for (let i = 0; i < emissiveMask.length; i++) {
        if (emissiveMask[i] === 1) softMask[i] = 1;
      }
    }
  }
  if (!silhouette) {
    // Structure lumineuse : liseré clair, ombre de contact, contour sélectif.
    // Sans elle, les faces projetées restent des aplats et l'on voit le
    // maillage au lieu d'un volume.
    applyMaterial(body, {
      palette,
      style,
      light: lightOnScreen(opts.projection ?? ISO_2_1, style.lightDir),
      soft: softMask,
    });
  }
  color.composite(body, 'over');

  if (style.glow && !silhouette) {
    for (const cmd of sortedLayer(visible, 'light')) paintCmd(light, cmd, style, false);
    const scaled = light.clone();
    for (let i = 3; i < scaled.data.length; i += 4) {
      scaled.data[i] = (scaled.data[i] ?? 0) * clamp01(style.glowAlpha);
    }
    color.composite(scaled, 'add');
  }

  return { color, light, commandCount: visible.length };
}

export function renderFrame(
  recipe: SpellRecipe,
  t: number,
  opts: RenderOptions = {},
): RenderResult {
  const style = opts.style ?? DEFAULT_STYLE;
  const ctx = makeContext(recipe, opts);
  const clipTime = clamp01(t);
  const cmds = recipe.sample(clipTime, ctx);
  return renderCommands(
    cmds,
    recipe.canvas.width,
    recipe.canvas.height,
    style,
    { ...opts, phase: clipTime * recipe.duration },
    ctx.palette,
  );
}

/** Nombre d'images d'un clip, dérive de la durée et de la cadence. */
export function frameCount(recipe: SpellRecipe, fps?: number): number {
  const rate = fps ?? recipe.fps;
  return Math.max(1, Math.round(recipe.duration * rate));
}

/** Instant normalise de l'image `i`. La dernière image n'est pas t=1 pour un
 *  clip bouclable : sinon la première et la dernière seraient identiques. */
export function frameTime(recipe: SpellRecipe, i: number, fps?: number): number {
  const n = frameCount(recipe, fps);
  if (n <= 1) return 0;
  return recipe.loop === 'seamless' ? i / n : i / (n - 1);
}

/**
 * Limites de capture : prepasse sur toutes les images et tous les caps.
 * Elles ne sont jamais recalculees image par image, ce qui eliminerait le
 * pivot stable et ferait trembler le clip.
 */
export function captureBounds(
  recipe: SpellRecipe,
  headings: readonly number[],
  opts: RenderOptions = {},
  margin = 2,
): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const n = frameCount(recipe);
  for (const heading of headings) {
    const ctx = makeContext(recipe, { ...opts, heading });
    for (let i = 0; i < n; i++) {
      const cmds = recipe.sample(frameTime(recipe, i), ctx);
      for (const cmd of cmds) {
        const b = cmdBounds(cmd);
        if (!b) continue;
        if (b.x0 < x0) x0 = b.x0;
        if (b.y0 < y0) y0 = b.y0;
        if (b.x1 > x1) x1 = b.x1;
        if (b.y1 > y1) y1 = b.y1;
      }
    }
  }
  if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  return { x0: x0 - margin, y0: y0 - margin, x1: x1 + margin, y1: y1 + margin };
}

export { ShapeMask };
