import { describe, expect, it } from 'vitest';
import {
  cameraDir,
  cameraPlane,
  depthOf,
  headingFromTo,
  ISO_2_1,
  project,
  screenAngleOfHeading,
  unprojectGround,
  withOrigin,
} from '../src/projection/projection.js';
import { pickDirection, sampleDirections } from '../src/projection/directions.js';
import { TAU } from '../src/core/math.js';

const P = withOrigin(ISO_2_1, 100, 60);

describe('projection isométrique', () => {
  it('projette et inverse le sol sur les axes et les diagonales', () => {
    for (const p of [
      { x: 0, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
      { x: 0, y: -2.5, z: 0 },
      { x: 1.25, y: 1.25, z: 0 },
      { x: -4, y: 2, z: 0 },
    ]) {
      const back = unprojectGround(P, project(P, p));
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
  });

  it('sépare la hauteur du sol : un objet haut ne s’écrase pas', () => {
    const ground = project(P, { x: 1, y: 1, z: 0 });
    const high = project(P, { x: 1, y: 1, z: 1 });
    expect(ground.x).toBe(high.x);
    expect(ground.y - high.y).toBe(ISO_2_1.heightScale);
  });

  it('traite source et cible confondues sans division invalide', () => {
    const h = headingFromTo({ x: 2, y: 2, z: 0 }, { x: 2, y: 2, z: 0 }, 1.25);
    expect(Number.isNaN(h)).toBe(false);
    expect(h).toBeCloseTo(1.25, 9);
  });

  it('échantillonne les caps dans le repère monde, pas à l’écran', () => {
    const dirs = sampleDirections(8, 0, P);
    expect(dirs).toHaveLength(8);
    dirs.forEach((d, i) => {
      expect(d.heading).toBeCloseTo((i * TAU) / 8, 9);
      expect(Math.hypot(d.vector.x, d.vector.y)).toBeCloseTo(1, 9);
    });
    // Les angles écran ne sont pas régulièrement espacés : c'est exactement
    // pourquoi l'échantillonnage est fait dans le monde.
    const gaps = dirs.map((d, i) => {
      const next = dirs[(i + 1) % dirs.length];
      return Math.abs(((next!.screenAngle - d.screenAngle + TAU * 1.5) % TAU) - Math.PI / 2);
    });
    expect(Math.max(...gaps)).toBeGreaterThan(0.05);
  });

  it('l’angle écran suit la projection', () => {
    const a = screenAngleOfHeading(P, 0);
    const b = screenAngleOfHeading(P, Math.PI);
    expect(Math.abs(Math.abs(a - b) - Math.PI)).toBeLessThan(1e-9);
  });

  it('choisit le cap le plus proche, avec hystérésis', () => {
    const dirs = sampleDirections(8, 0);
    expect(pickDirection(dirs, 0.01)).toBe(0);
    expect(pickDirection(dirs, TAU / 8 - 0.01)).toBe(1);
    // Une marge empêche l'oscillation entre deux caps voisins : à mi-chemin,
    // on garde le cap courant tant que l'autre n'est pas franchement meilleur.
    expect(pickDirection(dirs, 0.45)).toBe(1);
    expect(pickDirection(dirs, 0.45, 0, 0.5)).toBe(0);
    expect(pickDirection(dirs, 0.75, 0, 0.2)).toBe(1);
  });

  it('la clé de profondeur croît vers l’observateur', () => {
    expect(depthOf({ x: 0, y: 0, z: 0 })).toBeLessThan(depthOf({ x: 1, y: 1, z: 0 }));
    // À position au sol égale, le bas d'une colonne est devant son sommet.
    expect(depthOf({ x: 1, y: 1, z: 2 })).toBeLessThan(depthOf({ x: 1, y: 1, z: 0 }));
  });

  it('le plan face caméra est isotrope en pixels', () => {
    const plane = cameraPlane(P);
    const o = project(P, { x: 0, y: 0, z: 0 });
    const right = project(P, plane.right);
    const up = project(P, plane.up);
    const dxRight = Math.hypot(right.x - o.x, right.y - o.y);
    const dxUp = Math.hypot(up.x - o.x, up.y - o.y);
    expect(dxRight).toBeCloseTo(dxUp, 6);
  });

  it('la direction caméra se déduit du profil, sans constante recopiée', () => {
    const cam = cameraDir(ISO_2_1);
    expect(Math.hypot(cam.x, cam.y, cam.z)).toBeCloseTo(1, 9);
    const flat = cameraDir({ ...ISO_2_1, groundRatio: 0.75 });
    expect(flat.z).toBeGreaterThan(cam.z);
  });
});
