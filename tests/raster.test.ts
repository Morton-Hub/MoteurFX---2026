/**
 * Rastérisation et export. Le rendu de référence doit rester en pixels francs :
 * aucune couleur intermédiaire ne doit apparaître sur les bords.
 */

import { describe, expect, it } from 'vitest';
import { Framebuffer, bayer4, ditherPasses, fade, mixColor } from '../src/raster/framebuffer.js';
import { ShapeMask } from '../src/raster/mask.js';
import { encodePng, upscale } from '../src/export/png.js';
import { encodeGif } from '../src/export/gif.js';
import { buildManifest, SCHEMA_VERSION } from '../src/export/manifest.js';
import { makeSheet, onBackground } from '../src/export/sheet.js';
import { sampleDirections } from '../src/space/directions.js';
import { SPELLS } from '../src/spells/index.js';
import { captureBounds, frameCount, frameTime, renderFrame } from '../src/render/renderer.js';

describe('masque de couverture', () => {
  it('remplit un rectangle exactement', () => {
    const m = new ShapeMask(0, 0, 16, 16);
    m.addPolygon([
      { x: 2, y: 2 },
      { x: 10, y: 2 },
      { x: 10, y: 8 },
      { x: 2, y: 8 },
    ]);
    let count = 0;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (m.get(x, y)) count++;
    expect(count).toBe(8 * 6);
    expect(m.get(2, 2)).toBe(true);
    expect(m.get(9, 7)).toBe(true);
    expect(m.get(10, 8)).toBe(false);
  });

  it('retire les vides internes', () => {
    const outer = new ShapeMask(0, 0, 20, 20);
    outer.addPolygon([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ]);
    const hole = new ShapeMask(0, 0, 20, 20);
    hole.addDisc(10, 10, 4);
    outer.subtract(hole);
    expect(outer.get(10, 10)).toBe(false);
    expect(outer.get(1, 1)).toBe(true);
  });

  it('produit un contour intérieur fermé', () => {
    const m = new ShapeMask(0, 0, 20, 20);
    m.addDisc(10, 10, 6);
    const e = m.edge();
    expect(e.get(10, 10)).toBe(false);
    expect(e.isEmpty).toBe(false);
  });

  it('ne double pas le mélange sur un ruban qui se recouvre', () => {
    // Deux segments partagent leur jonction : le masque est binaire, donc le
    // pixel commun n'est peint qu'une fois.
    const fb = new Framebuffer(20, 20);
    const m = new ShapeMask(0, 0, 20, 20);
    m.addRibbon(
      [
        { x: 2, y: 10 },
        { x: 10, y: 10 },
        { x: 18, y: 10 },
      ],
      [4, 4, 4],
    );
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) if (m.get(x, y)) fb.plot(x, y, [255, 0, 0, 128]);
    }
    const alphas = new Set<number>();
    for (let i = 3; i < fb.data.length; i += 4) {
      const a = fb.data[i] ?? 0;
      if (a > 0) alphas.add(a);
    }
    expect(alphas.size).toBe(1);
  });
});

describe('tramage', () => {
  it('laisse tout passer à densité pleine et rien à zéro', () => {
    expect(ditherPasses({ level: 1 }, 3, 5)).toBe(true);
    expect(ditherPasses({ level: 0 }, 3, 5)).toBe(false);
    expect(ditherPasses(undefined, 3, 5)).toBe(true);
  });

  it('couvre environ la moitié des pixels à densité 0,5', () => {
    let on = 0;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (ditherPasses({ level: 0.5 }, x, y)) on++;
    expect(on).toBe(128);
  });

  it('décale la trame avec la phase', () => {
    expect(bayer4(0, 0)).not.toBe(bayer4(1, 0));
    expect(ditherPasses({ level: 0.5, phaseX: 1 }, 0, 0)).not.toBe(
      ditherPasses({ level: 0.5 }, 0, 0),
    );
  });
});

describe('couleurs', () => {
  it('module uniquement le canal alpha', () => {
    expect(fade([10, 20, 30, 200], 0.5)).toEqual([10, 20, 30, 100]);
  });

  it('interpole sans dépasser les bornes', () => {
    expect(mixColor([0, 0, 0, 0], [255, 255, 255, 255], 0)).toEqual([0, 0, 0, 0]);
    expect(mixColor([0, 0, 0, 0], [255, 255, 255, 255], 1)).toEqual([255, 255, 255, 255]);
  });
});

describe('agrandissement entier', () => {
  it('duplique les pixels sans en inventer', () => {
    const fb = new Framebuffer(2, 2);
    fb.plot(0, 0, [255, 0, 0, 255]);
    fb.plot(1, 1, [0, 255, 0, 255]);
    const up = upscale(fb, 3);
    expect(up.width).toBe(6);
    const colors = new Set<string>();
    for (let i = 0; i < up.data.length; i += 4) {
      colors.add([up.data[i], up.data[i + 1], up.data[i + 2], up.data[i + 3]].join(','));
    }
    // Trois couleurs exactement : rouge, vert, transparent. Aucune moyenne.
    expect(colors.size).toBe(3);
  });
});

describe('encodeurs', () => {
  const recipe = SPELLS[0]!;

  it('écrit un PNG avec signature et en-tête corrects', () => {
    const fb = renderFrame(recipe, 0.5, { heading: 0 }).color;
    const png = encodePng(fb);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(png.buffer, png.byteOffset);
    expect(view.getUint32(16)).toBe(fb.width);
    expect(view.getUint32(20)).toBe(fb.height);
    expect(png[24]).toBe(8); // profondeur
    expect(png[25]).toBe(6); // RGBA
  });

  it('écrit un GIF animé lisible et bouclé', () => {
    const frames = [0, 0.3, 0.6].map((t) => renderFrame(recipe, t, { heading: 0 }).color);
    const gif = encodeGif(frames, { delayCs: 4, background: [20, 20, 28] });
    expect(String.fromCharCode(...gif.subarray(0, 6))).toBe('GIF89a');
    const view = new DataView(gif.buffer, gif.byteOffset);
    expect(view.getUint16(6, true)).toBe(frames[0]!.width);
    expect(view.getUint16(8, true)).toBe(frames[0]!.height);
    expect(gif[gif.length - 1]).toBe(0x3b); // terminateur
    // Un descripteur d'image par frame.
    let separators = 0;
    for (let i = 0; i < gif.length; i++) if (gif[i] === 0x2c) separators++;
    expect(separators).toBeGreaterThanOrEqual(frames.length);
  });

  it('aplatit correctement sur fond clair et sur fond sombre', () => {
    const fb = renderFrame(recipe, 0.5, { heading: 0 }).color;
    for (const bg of [[20, 20, 28, 255], [214, 218, 226, 255]] as const) {
      const flat = onBackground(fb, bg);
      expect(flat.isEmpty()).toBe(false);
      for (let i = 3; i < flat.data.length; i += 4) expect(flat.data[i]).toBe(255);
    }
  });

  it('assemble une planche sans rogner les cellules', () => {
    const frames = [0.2, 0.4, 0.6].map((t) => renderFrame(recipe, t, { heading: 0 }).color);
    const sheet = makeSheet(frames, { cols: 2, pad: 2, background: [0, 0, 0, 255] });
    expect(sheet.width).toBe(2 * (recipe.canvas.width + 2) + 2);
    expect(sheet.height).toBe(2 * (recipe.canvas.height + 2) + 2);
  });
});

describe('manifeste', () => {
  it.each(SPELLS.map((s) => [s.id, s] as const))('%s expose un contrat complet', (_id, recipe) => {
    const dirs = sampleDirections(8, 0);
    const bounds = captureBounds(recipe, dirs.map((d) => d.heading));
    const m = buildManifest(recipe, dirs, bounds);

    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.recipeId).toBe(recipe.id);
    expect(m.pivot).toEqual(recipe.pivot);
    expect(m.canvas).toEqual(recipe.canvas);
    expect(m.timing.frames).toBe(frameCount(recipe));
    expect(m.timing.frameTimes).toHaveLength(frameCount(recipe));
    expect(m.timing.frameTimes[0]).toBe(0);
    expect(m.directions).toHaveLength(8);
    // Les vecteurs monde sont stockés : le label seul ne définit rien.
    for (const d of m.directions) {
      expect(Math.hypot(d.worldVector.x, d.worldVector.y)).toBeCloseTo(1, 5);
      expect(typeof d.headingRad).toBe('number');
    }
    expect(m.events.length).toBe(recipe.events.length);
    for (const e of m.events) {
      expect(e.frame).toBeGreaterThanOrEqual(0);
      expect(e.frame).toBeLessThan(m.timing.frames);
    }
    // Le manifeste est sérialisable tel quel.
    expect(() => JSON.parse(JSON.stringify(m))).not.toThrow();
  });

  it('dérive le nombre d images de la durée et de la cadence', () => {
    for (const recipe of SPELLS) {
      expect(frameCount(recipe)).toBe(Math.round(recipe.duration * recipe.fps));
      expect(frameTime(recipe, frameCount(recipe) - 1)).toBe(1);
    }
  });
});
