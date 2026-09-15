/**
 * Contrat artistique commun. C'est lui, et non un empilement automatique
 * d'anneau + flash + particules, qui donne la cohérence entre les sorts.
 */

import { type Vec3, clamp01, dot3, norm3 } from '../core/math.js';
import type { RGBA } from '../raster/framebuffer.js';
import { type Palette, rampAt } from './palette.js';

export type StyleProfile = {
  readonly id: string;
  /** Agrandissement entier conseille pour l'affichage. N'affecte pas le rendu. */
  readonly pixelScale: number;
  /**
   * Direction de la lumière, exprimee dans le repère monde. Elle ne tourne
   * pas avec le sprite : c'est ce qui rend les 8 caps cohérents entre eux.
   */
  readonly lightDir: Vec3;
  /** Etalement des valeurs sur la rampe. 1 = rampe complète. */
  readonly contrast: number;
  /** Liseré sombre sur la silhouette. */
  readonly outline: 'none' | 'rim';
  readonly outlineAlpha: number;
  /** Passe lumière additive. Le sujet doit rester lisible sans elle. */
  readonly glow: boolean;
  readonly glowAlpha: number;
  /** Densite de tramage globale, modulee localement par la matière. */
  readonly ditherDensity: number;
  /** Ombre portee au sol, projetée depuis la position au sol et non la hauteur. */
  readonly groundShadow: boolean;
};

export const DEFAULT_STYLE: StyleProfile = {
  id: 'fx16-v2',
  pixelScale: 4,
  lightDir: norm3({ x: -0.45, y: -0.6, z: 0.66 }),
  contrast: 1,
  outline: 'rim',
  outlineAlpha: 0.85,
  glow: true,
  glowAlpha: 0.55,
  ditherDensity: 1,
  groundShadow: true,
};

/** Variante sans lumière ni liseré : contrôle de lisibilité de la silhouette. */
export const RAW_STYLE: StyleProfile = { ...DEFAULT_STYLE, glow: false, outline: 'none' };

/**
 * Couleur d'une facette selon sa normale monde.
 * `bias` décalé la facette sur la rampe (arête vive, face interne...).
 */
export function shadeFacet(style: StyleProfile, palette: Palette, normal: Vec3, bias = 0): RGBA {
  const n = norm3(normal);
  const lambert = clamp01(dot3(n, style.lightDir) * 0.5 + 0.5);
  const t = clamp01((1 - lambert) * style.contrast + bias);
  return rampAt(palette, t);
}

/** Position sur la rampe d'une facette, utile pour comparer deux faces. */
export function facetLevel(style: StyleProfile, normal: Vec3): number {
  const lambert = clamp01(dot3(norm3(normal), style.lightDir) * 0.5 + 0.5);
  return clamp01((1 - lambert) * style.contrast);
}
