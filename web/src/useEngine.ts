/**
 * Pont entre le moteur et le DOM. Le moteur ne connait pas le navigateur :
 * il produit un Framebuffer, et cette couche le présente sur un Canvas 2D par
 * agrandissement entier, sans lissage.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { Framebuffer } from '../../src/raster/framebuffer.js';
import { renderFrame, type RenderOptions } from '../../src/render/renderer.js';
import type { SpellRecipe } from '../../src/sim/types.js';

export type Presentation = {
  readonly scale: number;
  readonly background: string | null;
};

export function paint(
  canvas: HTMLCanvasElement,
  fb: Framebuffer,
  pres: Presentation,
): void {
  const scale = Math.max(1, Math.round(pres.scale));
  if (canvas.width !== fb.width * scale || canvas.height !== fb.height * scale) {
    canvas.width = fb.width * scale;
    canvas.height = fb.height * scale;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (pres.background) {
    ctx.fillStyle = pres.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const src = new ImageData(new Uint8ClampedArray(fb.data), fb.width, fb.height);
  const buffer = document.createElement('canvas');
  buffer.width = fb.width;
  buffer.height = fb.height;
  const bctx = buffer.getContext('2d');
  if (!bctx) return;
  bctx.putImageData(src, 0, 0);
  ctx.drawImage(buffer, 0, 0, canvas.width, canvas.height);
}

export type RenderReport = {
  ms: number;
  commands: number;
};

/** Rend une image de recette sur un canvas et renvoie la mesure. */
export function useRenderer(): (
  canvas: HTMLCanvasElement | null,
  recipe: SpellRecipe,
  t: number,
  opts: RenderOptions,
  pres: Presentation,
) => RenderReport | null {
  return useCallback((canvas, recipe, t, opts, pres) => {
    if (!canvas) return null;
    const started = performance.now();
    const result = renderFrame(recipe, t, opts);
    paint(canvas, result.color, pres);
    return { ms: performance.now() - started, commands: result.commandCount };
  }, []);
}

/** Boucle d'animation a pas de temps reel, mise en pause proprement. */
export function useAnimationLoop(active: boolean, step: (dt: number) => void): void {
  const cb = useRef(step);
  cb.current = step;
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number): void => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      cb.current(dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);
}
