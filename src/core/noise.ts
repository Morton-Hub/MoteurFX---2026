/**
 * Bruit déterministe.
 *
 * Utilisé pour **casser** une valeur, jamais pour fabriquer une forme : le
 * document interdit explicitement le bruit aléatoire renouvelé à chaque frame
 * (§1). Toutes les fonctions ici ne dépendent que de (seed, coordonnées) : à
 * seed égale, la même frame redonne exactement les mêmes pixels.
 */

import { mix32 } from './rng.js';

/** Valeur dans [0,1) pour une cellule entière. */
export function hash2(seed: number, x: number, y: number): number {
  const h = mix32(mix32(seed ^ Math.imul(x | 0, 0x27d4eb2d)) ^ Math.imul(y | 0, 0x165667b1));
  return h / 4294967296;
}

/** Valeur dans [0,1) pour trois entiers : utile pour (x, y, frame). */
export function hash3(seed: number, x: number, y: number, z: number): number {
  const h = mix32(
    mix32(mix32(seed ^ Math.imul(x | 0, 0x27d4eb2d)) ^ Math.imul(y | 0, 0x165667b1)) ^
      Math.imul(z | 0, 0x9e3779b1),
  );
  return h / 4294967296;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * Bruit de valeur interpolé, de période `scale` pixels. À `scale` ≈ 3 il donne
 * une moucheture de la taille d'un petit cluster, ce qui est la granularité
 * lisible en pixel art ; plus fin, il redevient du poivre et sel.
 */
export function valueNoise(seed: number, x: number, y: number, scale: number): number {
  const s = Math.max(1e-6, scale);
  const fx = x / s;
  const fy = y / s;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = smooth(fx - x0);
  const ty = smooth(fy - y0);
  const a = hash2(seed, x0, y0);
  const b = hash2(seed, x0 + 1, y0);
  const c = hash2(seed, x0, y0 + 1);
  const d = hash2(seed, x0 + 1, y0 + 1);
  const top = a + (b - a) * tx;
  const bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

/** Bruit fibreux orienté : la matière suit une direction (veines, flux). */
export function fiberNoise(
  seed: number,
  x: number,
  y: number,
  scaleAcross: number,
  scaleAlong: number,
  angle: number,
): number {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const u = x * c + y * s;
  const v = -x * s + y * c;
  return valueNoise(seed, u / Math.max(1e-6, scaleAlong) * scaleAcross, v, scaleAcross);
}
