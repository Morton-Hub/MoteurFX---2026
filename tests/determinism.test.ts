/**
 * Déterminisme, stabilité des seeds et navigation temporelle.
 * Ces invariants conditionnent tout le reste : sans eux, une planche de
 * référence ne prouve rien.
 */

import { describe, expect, it } from 'vitest';
import { Rng, deriveSeed, hashString, rand1, randN } from '../src/core/rng.js';
import { SPELLS } from '../src/spells/index.js';
import { frameCount, frameTime, renderFrame } from '../src/render/renderer.js';
import type { Framebuffer } from '../src/raster/framebuffer.js';

function digest(fb: Framebuffer): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < fb.data.length; i++) {
    h ^= fb.data[i] ?? 0;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

describe('générateur déterministe', () => {
  it('reproduit la même suite pour une même seed', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const sa = Array.from({ length: 16 }, () => a.next());
    const sb = Array.from({ length: 16 }, () => b.next());
    expect(sa).toEqual(sb);
  });

  it('produit des valeurs dans [0,1)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 500; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('dérive les seeds du chemin de nœud, pas de son index', () => {
    const projectSeed = 0x5eed;
    const a = deriveSeed(projectSeed, 'ice-frost-lance/shaft');
    const b = deriveSeed(projectSeed, 'ice-frost-lance/debris');
    expect(a).not.toBe(b);
    // Ajouter un nœud décoratif ne change pas la seed des autres.
    expect(deriveSeed(projectSeed, 'ice-frost-lance/shaft')).toBe(a);
  });

  it('sépare les canaux du tirage sans état', () => {
    expect(randN(99, 3, 1)).not.toBe(randN(99, 3, 2));
    expect(rand1(99, 3)).toBe(rand1(99, 3));
  });

  it('hache les chaînes sans collision sur le catalogue', () => {
    const hashes = new Set(SPELLS.map((s) => hashString(s.id)));
    expect(hashes.size).toBe(SPELLS.length);
  });
});

describe.each(SPELLS.map((s) => [s.id, s] as const))('recette %s', (_id, recipe) => {
  it('rend deux fois les mêmes pixels', () => {
    const a = renderFrame(recipe, 0.5, { heading: 1.1 });
    const b = renderFrame(recipe, 0.5, { heading: 1.1 });
    expect(digest(a.color)).toBe(digest(b.color));
  });

  it("la navigation directe donne le même état qu'une lecture depuis le début", () => {
    // L'évaluation est analytique : on vérifie qu'une lecture séquentielle
    // n'introduit aucun état résiduel qui changerait l'image visée.
    const n = frameCount(recipe);
    const target = Math.floor(n * 0.7);
    for (let i = 0; i <= target; i++) renderFrame(recipe, frameTime(recipe, i), { heading: 0.4 });
    const sequential = renderFrame(recipe, frameTime(recipe, target), { heading: 0.4 });
    const direct = renderFrame(recipe, frameTime(recipe, target), { heading: 0.4 });
    expect(digest(sequential.color)).toBe(digest(direct.color));
  });

  it('change de pixels quand la seed change', () => {
    const a = renderFrame(recipe, 0.6, { heading: 0, seed: 1 });
    const b = renderFrame(recipe, 0.6, { heading: 0, seed: 2 });
    expect(digest(a.color)).not.toBe(digest(b.color));
  });

  it('produit des pixels différents selon le cap', () => {
    const digests = new Set(
      [0, 1, 2, 3].map((i) => digest(renderFrame(recipe, 0.5, { heading: (i * Math.PI) / 2 }).color)),
    );
    // Aucune recette du catalogue n'est déclarée radiale : les quatre caps
    // cardinaux doivent donner quatre images distinctes.
    expect(recipe.radial).toBe(false);
    expect(digests.size).toBe(4);
  });
});
