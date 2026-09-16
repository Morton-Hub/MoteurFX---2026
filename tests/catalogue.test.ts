/**
 * Contrat du catalogue : cadrage, pivot, fenêtres temporelles, fin de clip.
 * Ce sont les défauts que l'audit V1 avait relevés ; ils sont vérifiés ici
 * recette par recette plutôt que corrigés au cas par cas.
 */

import { describe, expect, it } from 'vitest';
import { SPELLS } from '../src/spells/index.js';
import { captureBounds, frameCount, frameTime, makeContext, renderFrame } from '../src/render/renderer.js';
import { sampleDirections } from '../src/space/directions.js';
import { cmdBounds } from '../src/render/draw.js';
import { ELEMENT_GRAMMAR } from '../src/sim/types.js';
import { PALETTES } from '../src/style/palette.js';

const HEADINGS_16 = sampleDirections(16, 0).map((d) => d.heading);

describe('catalogue', () => {
  it('couvre exactement un sort par élément de base', () => {
    const elements = SPELLS.map((s) => s.element);
    expect(new Set(elements).size).toBe(elements.length);
    expect(new Set(elements)).toEqual(new Set(Object.keys(ELEMENT_GRAMMAR)));
  });

  it('donne à chaque recette un identifiant unique', () => {
    expect(new Set(SPELLS.map((s) => s.id)).size).toBe(SPELLS.length);
  });

  it('documente une intention et une signature de forme', () => {
    for (const s of SPELLS) {
      expect(s.concept.length).toBeGreaterThan(40);
      expect(s.signature.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe.each(SPELLS.map((s) => [s.id, s] as const))('recette %s', (_id, recipe) => {
  it('tient dans son canevas sur toutes les images et tous les caps', () => {
    const b = captureBounds(recipe, HEADINGS_16, {}, 2);
    expect(b.x0).toBeGreaterThanOrEqual(0);
    expect(b.y0).toBeGreaterThanOrEqual(0);
    expect(b.x1).toBeLessThan(recipe.canvas.width);
    expect(b.y1).toBeLessThan(recipe.canvas.height);
  });

  it('garde un pivot identique quel que soit le cap', () => {
    // Le pivot est la position image de la source : il ne dépend pas du cap.
    for (const heading of HEADINGS_16) {
      const ctx = makeContext(recipe, { heading });
      const origin = ctx.p(ctx.source);
      expect(origin.x).toBeCloseTo(recipe.pivot.x, 9);
      expect(origin.y).toBeCloseTo(recipe.pivot.y, 9);
    }
  });

  it('place le point de contact sur la cible, indépendamment du cap', () => {
    for (const heading of HEADINGS_16) {
      const ctx = makeContext(recipe, { heading });
      const contact = ctx.wl(ctx.distance, 0, 0);
      expect(Math.hypot(contact.x, contact.y)).toBeCloseTo(ctx.distance, 6);
      expect(Math.atan2(contact.y, contact.x)).toBeCloseTo(Math.atan2(Math.sin(heading), Math.cos(heading)), 6);
    }
  });

  it('termine sur une image vide', () => {
    for (const heading of [0, 1.9, 3.8, 5.4]) {
      const last = renderFrame(recipe, 1, { heading });
      expect(last.color.isEmpty(), `cap ${heading.toFixed(2)} laisse des pixels`).toBe(true);
    }
  });

  it('commence sur une image vide ou quasi vide', () => {
    // Un clip ne démarre jamais sur un objet déjà installé : la première
    // image doit rester sous quelques pour cent de la surface.
    const first = renderFrame(recipe, 0, { heading: 0 });
    let opaque = 0;
    for (let i = 3; i < first.color.data.length; i += 4) {
      if ((first.color.data[i] ?? 0) > 0) opaque++;
    }
    const total = recipe.canvas.width * recipe.canvas.height;
    expect(opaque / total).toBeLessThan(0.02);
  });

  it("ne laisse aucun trou au milieu du clip", () => {
    // Une image vide en tête ou en queue est normale : le clip commence et
    // finit propre. Une image vide suivie d'une image pleine, en revanche,
    // signale une fenêtre temporelle mal calée.
    const n = frameCount(recipe);
    const ctx = makeContext(recipe, { heading: 0.7 });
    const filled = Array.from({ length: n }, (_, i) => recipe.sample(frameTime(recipe, i), ctx).length > 0);
    const last = filled.lastIndexOf(true);
    const first = filled.indexOf(true);
    expect(first).toBeGreaterThanOrEqual(0);
    for (let i = first; i <= last; i++) {
      expect(filled[i], `image ${i} vide entre ${first} et ${last}`).toBe(true);
    }
  });

  it('ne produit aucune coordonnée non finie', () => {
    const ctx = makeContext(recipe, { heading: 2.2 });
    const n = frameCount(recipe);
    for (let i = 0; i < n; i++) {
      for (const cmd of recipe.sample(frameTime(recipe, i), ctx)) {
        expect(Number.isFinite(cmd.depth)).toBe(true);
        const b = cmdBounds(cmd);
        if (b) {
          expect(Number.isFinite(b.x0) && Number.isFinite(b.y1)).toBe(true);
        }
      }
    }
  });

  it('déclare des événements ordonnés et dans le clip', () => {
    let previous = -1;
    for (const e of recipe.events) {
      expect(e.at).toBeGreaterThanOrEqual(0);
      expect(e.at).toBeLessThanOrEqual(1);
      expect(e.at).toBeGreaterThanOrEqual(previous);
      previous = e.at;
    }
  });

  it('utilise la palette de son élément', () => {
    const ctx = makeContext(recipe, {});
    expect(ctx.palette).toBe(PALETTES[recipe.element]);
  });

  it('consomme réellement le rang', () => {
    // Un paramètre présent dans le contrat mais ignoré par la recette est un
    // faux réglage. On compare les pixels et non le nombre de commandes : un
    // rang peut légitimement changer la forme sans changer le décompte.
    const low = renderFrame(recipe, 0.55, { heading: 0.3, power: 0 }).color;
    const high = renderFrame(recipe, 0.55, { heading: 0.3, power: 1 }).color;
    let differing = 0;
    for (let i = 0; i < low.data.length; i += 4) {
      if (low.data[i + 3] !== high.data[i + 3] || low.data[i] !== high.data[i]) differing++;
    }
    expect(differing).toBeGreaterThan(0);
  });

  it('consomme réellement la portée', () => {
    const near = renderFrame(recipe, 0.5, { heading: 0.3, range: 1.4 });
    const far = renderFrame(recipe, 0.5, { heading: 0.3, range: 4.2 });
    const a = near.color.opaqueBounds();
    const b = far.color.opaqueBounds();
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).not.toEqual(b);
  });
});
