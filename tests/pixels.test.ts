import { describe, expect, it } from 'vitest';
import { IndexedCanvas } from '../src/pixels/canvas.js';
import { ShapeMask } from '../src/pixels/mask.js';
import { getMaterial, colorCount, MATERIALS, roleColor } from '../src/pixels/palette.js';
import { paintEmissive, paintFacet, paintOutline } from '../src/pixels/shade.js';
import { ARCANE_MINIATURE, PIXEL_STRICT } from '../src/pixels/style.js';
import { deriveEmission } from '../src/renderer/emission.js';
import { hex, luma } from '../src/pixels/rgba.js';

describe('canevas indexé', () => {
  it('l’index 0 est une transparence franche', () => {
    const c = new IndexedCanvas(8, 8);
    expect(c.isEmpty()).toBe(true);
    const ink = c.ink('ice.crystal', 'body');
    c.set(2, 3, ink);
    expect(c.get(2, 3)).toBe(ink);
    const fb = c.toRgba();
    expect(fb.get(0, 0)[3]).toBe(0);
    expect(fb.get(2, 3)[3]).toBe(255);
  });

  it('une encre est unique par (matière, rôle)', () => {
    const c = new IndexedCanvas(4, 4);
    expect(c.ink('fire.flame', 'body')).toBe(c.ink('fire.flame', 'body'));
    expect(c.ink('fire.flame', 'body')).not.toBe(c.ink('fire.flame', 'light'));
  });

  it('la signature change avec le contenu et pas avec la palette', () => {
    const a = new IndexedCanvas(8, 8);
    const b = new IndexedCanvas(8, 8);
    expect(a.signature()).toBe(b.signature());
    a.set(1, 1, a.ink('fire.flame', 'body'));
    expect(a.signature()).not.toBe(b.signature());
  });
});

describe('palettes par rôles', () => {
  it('chaque matière tient dans 4 à 7 couleurs', () => {
    for (const material of Object.values(MATERIALS)) {
      expect(colorCount(material)).toBeGreaterThanOrEqual(2);
      expect(colorCount(material)).toBeLessThanOrEqual(7);
    }
  });

  it('les valeurs d’une rampe sont ordonnées du sombre au clair', () => {
    for (const material of Object.values(MATERIALS)) {
      const values = material.ramp.map((r) => luma(roleColor(material, r)));
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeGreaterThan(values[i - 1] as number);
      }
    }
  });

  it('la palette du feu ne contient pas de valeur éteinte', () => {
    const fire = getMaterial('fire.flame');
    // Une flamme vit entre le jaune et le rouge : le contraste vient du fond.
    expect(luma(roleColor(fire, 'body'))).toBeGreaterThan(luma(hex('#402020')));
  });
});

describe('ombrage', () => {
  it('une facette tournée vers la lumière est plus claire', () => {
    const c = new IndexedCanvas(16, 16);
    const maskA = ShapeMask.full(16, 16);
    maskA.addPolygon([{ x: 1, y: 1 }, { x: 6, y: 1 }, { x: 6, y: 6 }, { x: 1, y: 6 }]);
    const maskB = ShapeMask.full(16, 16);
    maskB.addPolygon([{ x: 8, y: 8 }, { x: 14, y: 8 }, { x: 14, y: 14 }, { x: 8, y: 14 }]);
    const ice = getMaterial('ice.crystal');
    paintFacet(c, maskA, ice, { style: ARCANE_MINIATURE, normal: ARCANE_MINIATURE.lightDir });
    paintFacet(c, maskB, ice, {
      style: ARCANE_MINIATURE,
      normal: { x: -ARCANE_MINIATURE.lightDir.x, y: -ARCANE_MINIATURE.lightDir.y, z: -ARCANE_MINIATURE.lightDir.z },
    });
    const lit = luma(c.table.colorAt(c.get(3, 3)));
    const dark = luma(c.table.colorAt(c.get(10, 10)));
    expect(lit).toBeGreaterThan(dark);
  });

  it('un corps émissif est plus clair au cœur qu’au bord', () => {
    const c = new IndexedCanvas(32, 32);
    const mask = ShapeMask.full(32, 32);
    mask.addDisc(16, 16, 9);
    paintEmissive(c, mask, getMaterial('fire.flame'), { style: ARCANE_MINIATURE, seed: 7, turbulence: 0 });
    const core = luma(c.table.colorAt(c.get(16, 16)));
    const edge = luma(c.table.colorAt(c.get(16, 8)));
    expect(core).toBeGreaterThan(edge);
  });

  it('une matière sans contour n’en reçoit pas', () => {
    const c = new IndexedCanvas(16, 16);
    const mask = ShapeMask.full(16, 16);
    mask.addDisc(8, 8, 3);
    paintOutline(c, mask, getMaterial('fire.flame'), ARCANE_MINIATURE);
    expect(c.isEmpty()).toBe(true);
    paintOutline(c, mask, getMaterial('ice.crystal'), ARCANE_MINIATURE);
    expect(c.isEmpty()).toBe(false);
  });
});

describe('masques', () => {
  it('la distance interne mesure l’épaisseur', () => {
    const mask = ShapeMask.full(24, 24);
    mask.addDisc(12, 12, 6);
    const d = mask.innerDistance();
    expect(mask.distanceAt(d, 12, 12)).toBeGreaterThan(mask.distanceAt(d, 12, 7));
    expect(mask.distanceAt(d, 0, 0)).toBe(0);
  });

  it('érosion et dilatation sont réversibles à un pixel près', () => {
    const mask = ShapeMask.full(24, 24);
    mask.addPolygon([{ x: 6, y: 6 }, { x: 18, y: 6 }, { x: 18, y: 18 }, { x: 6, y: 18 }]);
    expect(mask.erode(1).count()).toBeLessThan(mask.count());
    expect(mask.dilate(1).count()).toBeGreaterThan(mask.count());
  });
});

describe('passe lumineuse', () => {
  it('le profil strict ne produit aucune émission', () => {
    const c = new IndexedCanvas(16, 16);
    const mask = ShapeMask.full(16, 16);
    mask.addDisc(8, 8, 5);
    paintEmissive(c, mask, getMaterial('fire.flame'), { style: PIXEL_STRICT, seed: 3 });
    expect(deriveEmission(c, PIXEL_STRICT).isEmpty()).toBe(true);
  });

  it('l’émission ne touche pas le corps', () => {
    const c = new IndexedCanvas(24, 24);
    const mask = ShapeMask.full(24, 24);
    mask.addDisc(12, 12, 6);
    paintEmissive(c, mask, getMaterial('fire.flame'), { style: ARCANE_MINIATURE, seed: 3 });
    const before = c.signature();
    const colors = c.usedColorCount();
    const emission = deriveEmission(c, ARCANE_MINIATURE);
    expect(emission.isEmpty()).toBe(false);
    expect(c.signature()).toBe(before);
    expect(c.usedColorCount()).toBe(colors);
  });
});
