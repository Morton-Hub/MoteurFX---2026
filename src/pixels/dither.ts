/**
 * Tramage ordonné.
 *
 * Réservé aux transitions où il améliore réellement la matière (§2). Le
 * profil de référence n'en dépend pas : un rendu sans tramage doit rester
 * lisible.
 */

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const BAYER2 = [0, 2, 3, 1];

export function bayer4(x: number, y: number): number {
  return (BAYER4[(y & 3) * 4 + (x & 3)] ?? 0) / 16;
}

export function bayer2(x: number, y: number): number {
  return (BAYER2[(y & 1) * 2 + (x & 1)] ?? 0) / 4;
}

export type Dither = {
  /** 1 = plein, 0 = rien. Comparé à la matrice choisie. */
  readonly level: number;
  readonly matrix?: 2 | 4;
  /** Décalage de phase : deux surfaces voisines ne trament pas pareil. */
  readonly phaseX?: number;
  readonly phaseY?: number;
};

export function ditherPasses(d: Dither | undefined, x: number, y: number): boolean {
  if (!d) return true;
  if (d.level >= 1) return true;
  if (d.level <= 0) return false;
  const px = x + (d.phaseX ?? 0);
  const py = y + (d.phaseY ?? 0);
  const t = d.matrix === 2 ? bayer2(px, py) : bayer4(px, py);
  return t < d.level;
}
