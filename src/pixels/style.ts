/**
 * `StyleProfile` — le contrat artistique commun (§9).
 *
 * Il porte la résolution logique, la lumière, les règles de matière et le
 * choix du profil de sortie. C'est lui, et non un empilement automatique
 * d'anneau et de halo, qui fait la cohérence entre les sorts.
 */

import { norm3, type Vec3 } from '../core/math.js';

export type BodyProfile = 'pixel-strict' | 'pixel-light';

export type StyleProfile = {
  readonly id: string;
  readonly label: string;
  /** Tuile de référence en pixels logiques. Sert à juger l'encombrement. */
  readonly tile: { readonly w: number; readonly h: number };
  /** Hauteur du personnage témoin, en pixels. Sert à juger la lisibilité. */
  readonly characterHeight: number;
  /** Agrandissement entier conseillé pour l'affichage. N'affecte pas le rendu. */
  readonly pixelScale: number;
  /**
   * Direction de la lumière, dans le repère **monde**. Elle ne tourne pas
   * avec le sprite : c'est ce qui rend les huit caps cohérents entre eux.
   * Par défaut elle arrive du haut-gauche de l'écran.
   */
  readonly lightDir: Vec3;
  /** Étalement des valeurs d'un solide sur sa rampe. 1 = neutre. */
  readonly facetContrast: number;
  /**
   * Portion de rampe accessible à une facette. Les extrêmes restent aux
   * arêtes : une face entière qui atteint le noir transforme le corps en trou.
   */
  readonly facetRange: readonly [number, number];
  /** Contour : aucun, ou coloré et sélectif là où la matière le déclare. */
  readonly outline: 'none' | 'selective';
  /** Épaisseur en pixels au-delà de laquelle un corps émissif atteint son cœur. */
  readonly emissiveCore: number;
  /** Part de moucheture dans la valeur d'un corps émissif. */
  readonly emissiveTurbulence: number;
  /** Densité globale de tramage. 0 = aucun tramage. */
  readonly dither: number;
  /** Passe d'émission séparée du corps. */
  readonly bodyProfile: BodyProfile;
  /** Ombre portée au sol, tramée. */
  readonly groundShadow: boolean;
};

/**
 * Le style du document : **Arcane miniature**.
 *
 * Masses pleines, arêtes nettes, vides dessinés, une couleur dominante par
 * matière, pas de halo indispensable.
 */
export const ARCANE_MINIATURE: StyleProfile = {
  id: 'arcane-miniature',
  label: 'Arcane miniature',
  tile: { w: 64, h: 32 },
  characterHeight: 32,
  pixelScale: 3,
  // Haut-gauche de l'écran : sa projection a un x négatif et un y négatif.
  lightDir: norm3({ x: -0.5, y: 0.5, z: 0.72 }),
  facetContrast: 1.7,
  // Le haut de la rampe est réservé au liseré : une face entière qui atteint
  // l'accent efface la matière et le solide devient une tache blanche.
  facetRange: [0.06, 0.78],
  outline: 'selective',
  emissiveCore: 4,
  emissiveTurbulence: 0.3,
  dither: 1,
  bodyProfile: 'pixel-light',
  groundShadow: true,
};

/** Profil de référence : corps indexé seul, sans passe lumineuse. */
export const PIXEL_STRICT: StyleProfile = { ...ARCANE_MINIATURE, bodyProfile: 'pixel-strict' };

/** Contrôle de lisibilité : ni contour, ni tramage, ni émission. */
export const RAW_STYLE: StyleProfile = {
  ...ARCANE_MINIATURE,
  outline: 'none',
  dither: 0,
  bodyProfile: 'pixel-strict',
};

export const STYLE_PROFILES: readonly StyleProfile[] = [ARCANE_MINIATURE, PIXEL_STRICT, RAW_STYLE];

export function styleById(id: string): StyleProfile {
  const hit = STYLE_PROFILES.find((s) => s.id === id && s.bodyProfile === 'pixel-light');
  return hit ?? ARCANE_MINIATURE;
}
