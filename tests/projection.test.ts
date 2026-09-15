/**
 * Projection, caps et conversions. Les axes, les diagonales et les angles
 * intermédiaires sont couverts : c'est la base sur laquelle reposent toutes
 * les recettes directionnelles.
 */

import { describe, expect, it } from 'vitest';
import {
  ISO_2_1,
  cameraDir,
  depthOf,
  headingFromTo,
  localToWorld,
  makeFrame,
  project,
  screenAngleOfHeading,
  unprojectGround,
  withOrigin,
  withScale,
} from '../src/space/projection.js';
import { labelFor, pickDirection, sampleDirections } from '../src/space/directions.js';
import { TAU, normAngle } from '../src/core/math.js';

const P = withOrigin(withScale(ISO_2_1, 22, 22), 100, 60);

describe('projection isométrique', () => {
  it("place l'origine du monde sur l'origine image", () => {
    expect(project(P, { x: 0, y: 0, z: 0 })).toEqual({ x: 100, y: 60 });
  });

  it('projette +x vers la droite-bas et +y vers la gauche-bas', () => {
    const px = project(P, { x: 1, y: 0, z: 0 });
    const py = project(P, { x: 0, y: 1, z: 0 });
    expect(px.x).toBeGreaterThan(100);
    expect(px.y).toBeGreaterThan(60);
    expect(py.x).toBeLessThan(100);
    expect(py.y).toBeGreaterThan(60);
  });

  it('respecte le ratio de sol 2:1', () => {
    const p = project(P, { x: 1, y: -1, z: 0 });
    expect(p.x - 100).toBeCloseTo(44, 6);
    expect(p.y - 60).toBeCloseTo(0, 6);
  });

  it("n'écrase pas la hauteur avec le ratio de sol", () => {
    // Une unité de hauteur vaut heightScale pixels, indépendamment du sol.
    const p = project(P, { x: 0, y: 0, z: 1 });
    expect(60 - p.y).toBeCloseTo(22, 6);
  });

  it('inverse exactement la projection au sol', () => {
    for (const w of [
      { x: 0, y: 0, z: 0 },
      { x: 3.4, y: -1.2, z: 0 },
      { x: -2.7, y: 4.9, z: 0 },
    ]) {
      const back = unprojectGround(P, project(P, w));
      expect(back.x).toBeCloseTo(w.x, 6);
      expect(back.y).toBeCloseTo(w.y, 6);
    }
  });

  it('déduit un axe de vue cohérent avec le profil', () => {
    const d = cameraDir(P);
    // Un point translaté le long de l'axe de vue se projette au même endroit.
    const a = project(P, { x: 1, y: 2, z: 0.5 });
    const b = project(P, { x: 1 + d.x * 3, y: 2 + d.y * 3, z: 0.5 + d.z * 3 });
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.y).toBeCloseTo(a.y, 6);
  });
});

describe('caps monde', () => {
  it('mesure le cap dans le plan du sol', () => {
    expect(headingFromTo({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 5 })).toBeCloseTo(0, 9);
    expect(headingFromTo({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toBeCloseTo(Math.PI / 2, 9);
    expect(headingFromTo({ x: 0, y: 0, z: 0 }, { x: -1, y: 0, z: 0 })).toBeCloseTo(Math.PI, 9);
  });

  it('retombe sur le cap fourni quand source et cible sont confondues', () => {
    const h = headingFromTo({ x: 2, y: 2, z: 0 }, { x: 2, y: 2, z: 3 }, 1.234);
    expect(h).toBeCloseTo(1.234, 9);
    expect(Number.isNaN(h)).toBe(false);
  });

  it('oriente le repère local autour de la verticale', () => {
    const f = makeFrame({ x: 0, y: 0, z: 0 }, Math.PI / 2);
    const ahead = localToWorld(f, 2, 0, 0);
    expect(ahead.x).toBeCloseTo(0, 9);
    expect(ahead.y).toBeCloseTo(2, 9);
    // Le côté reste perpendiculaire à l'avant, dans le plan du sol.
    const side = localToWorld(f, 0, 1, 0);
    expect(side.x).toBeCloseTo(-1, 9);
    expect(side.z).toBeCloseTo(0, 9);
  });

  it("l'angle écran n'est pas l'angle monde", () => {
    // 45 degrés monde se projette à la verticale de l'écran : c'est
    // exactement pour cela que l'échantillonnage se fait en monde.
    const screen = screenAngleOfHeading(P, Math.PI / 4);
    expect(screen).toBeCloseTo(Math.PI / 2, 6);
    expect(screen).not.toBeCloseTo(Math.PI / 4, 2);
  });
});

describe('échantillonnage des directions', () => {
  it('produit N caps régulièrement espacés dans le repère monde', () => {
    const d8 = sampleDirections(8, 0, P);
    expect(d8).toHaveLength(8);
    d8.forEach((d, i) => {
      expect(d.heading).toBeCloseTo(normAngle((i * TAU) / 8), 9);
      expect(Math.hypot(d.vector.x, d.vector.y)).toBeCloseTo(1, 9);
    });
  });

  it('accepte un angle initial explicite', () => {
    const d = sampleDirections(4, Math.PI / 4);
    expect(d[0]?.heading).toBeCloseTo(Math.PI / 4, 9);
  });

  it('laisse des angles écran inégalement espacés', () => {
    const d = sampleDirections(8, 0, P);
    const gaps: number[] = [];
    for (let i = 0; i < 8; i++) {
      const a = d[i]!.screenAngle;
      const b = d[(i + 1) % 8]!.screenAngle;
      gaps.push(Math.abs(normAngle(b - a)));
    }
    const min = Math.min(...gaps);
    const max = Math.max(...gaps);
    expect(max - min).toBeGreaterThan(0.1);
  });

  it('refuse un compte invalide', () => {
    expect(() => sampleDirections(0)).toThrow();
    expect(() => sampleDirections(2.5)).toThrow();
  });

  it('nomme les caps cardinaux', () => {
    expect(labelFor(0)).toBe('E');
    expect(labelFor(Math.PI / 2)).toBe('N');
    expect(labelFor(Math.PI)).toBe('O');
  });

  it('choisit le cap exporté le plus proche', () => {
    const d = sampleDirections(8, 0);
    expect(pickDirection(d, 0.05)).toBe(0);
    expect(pickDirection(d, Math.PI / 2 + 0.05)).toBe(2);
  });

  it("l'hystérésis empêche l'oscillation entre deux caps voisins", () => {
    const d = sampleDirections(8, 0);
    const boundary = TAU / 16; // exactement entre le cap 0 et le cap 1
    // Sans marge, un cap juste au-delà de la frontière bascule.
    expect(pickDirection(d, boundary + 0.01, 0, 0)).toBe(1);
    // Avec marge, le cap courant est conservé.
    expect(pickDirection(d, boundary + 0.01, 0, 0.2)).toBe(0);
  });
});

describe('ordre de profondeur', () => {
  it('croît vers la caméra le long du sol', () => {
    expect(depthOf({ x: 2, y: 2, z: 0 })).toBeGreaterThan(depthOf({ x: 0, y: 0, z: 0 }));
  });

  it('place le bas d une colonne devant son sommet', () => {
    expect(depthOf({ x: 0, y: 0, z: 0 })).toBeGreaterThan(depthOf({ x: 0, y: 0, z: 2 }));
  });
});
