import { describe, expect, it } from 'vitest';
import { MOTIF_LIBRARY, drawMotif, getMotif, hasMotif, mirrorPairs, motif, motifBounds } from '../src/motifs/index.js';
import { IndexedCanvas } from '../src/pixels/canvas.js';

describe('format des motifs', () => {
  it('refuse une rangée de largeur incohérente', () => {
    expect(() =>
      motif('test-bad', { label: 'x', material: 'fire.ember', frames: [['..', '...']] }),
    ).toThrow(/rangée/);
  });

  it('refuse un caractère inconnu', () => {
    expect(() =>
      motif('test-char', { label: 'x', material: 'fire.ember', frames: [['?']] }),
    ).toThrow(/caractère/);
  });

  it('tous les motifs livrés déclarent leur provenance et leurs caps', () => {
    for (const m of MOTIF_LIBRARY) {
      expect(m.provenance.length).toBeGreaterThan(0);
      expect(['procedural', 'drawn-8', 'drawn-16', 'billboard', 'radial']).toContain(m.directional);
      expect(m.frames.length).toBeGreaterThan(0);
    }
  });

  it('la bibliothèque est adressable par identifiant', () => {
    expect(hasMotif('fire-ember-v1')).toBe(true);
    expect(hasMotif('inexistant')).toBe(false);
    expect(() => getMotif('inexistant')).toThrow();
  });
});

describe('placement', () => {
  it('le placement est entier et respecte le pivot', () => {
    const m = getMotif('fire-ember-v1');
    const b = motifBounds(m, { x: 10.4, y: 20.6 });
    expect(b.x0).toBe(10 - m.pivot.x);
    expect(b.y0).toBe(21 - m.pivot.y);
  });

  it('refuse une transformation non déclarée', () => {
    const m = motif('test-noflip', {
      label: 'x',
      material: 'fire.ember',
      frames: [['b']],
      transforms: { flipX: false },
    });
    const canvas = new IndexedCanvas(8, 8);
    expect(() => drawMotif(canvas, m, { x: 4, y: 4, flipX: true })).toThrow(/miroir/);
  });

  it('un agrandissement entier ne casse pas les pixels', () => {
    const canvas = new IndexedCanvas(16, 16);
    const m = getMotif('fire-ember-v1');
    drawMotif(canvas, m, { x: 8, y: 8, scale: 3 });
    const b = canvas.bounds();
    expect(b).not.toBeNull();
    // Un pixel du dessin devient un carré de 3x3 identiques.
    const ink = canvas.get(b!.x0 + 1, b!.y0 + 1);
    expect(canvas.get(b!.x0 + 1, b!.y0 + 2)).toBe(ink);
    expect(canvas.get(b!.x0 + 2, b!.y0 + 1)).toBe(ink);
  });

  it('les huit caps se ramènent à cinq dessins par symétrie', () => {
    const pairs = mirrorPairs(8);
    expect(pairs).toHaveLength(8);
    const sources = new Set(pairs.map((p) => p.source));
    expect(sources.size).toBe(5);
    expect(pairs.filter((p) => p.flip)).toHaveLength(3);
  });
});
