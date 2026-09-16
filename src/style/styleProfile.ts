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
  /**
   * Portion de la rampe où peuvent tomber les facettes d'un solide.
   *
   * Les extrêmes sont réservés aux arêtes : c'est la passe de matière qui
   * pose le liseré clair et l'ombre de contact. Laisser une face entière
   * atteindre le noir de la rampe transforme le corps en silhouette — un
   * bloc vu sous son mauvais angle devient un trou.
   */
  readonly facetRange: readonly [number, number];
  /** Liseré sombre sur la silhouette. */
  readonly outline: 'none' | 'rim';
  readonly outlineAlpha: number;
  /**
   * Épaisseur minimale, en pixels, qu'un corps émissif doit atteindre pour
   * parcourir toute sa rampe. La rampe s'étale sinon sur l'épaisseur propre
   * du corps : ce seuil empêche seulement une poussière de deux pixels de se
   * retrouver avec un cœur blanc.
   */
  readonly emissiveCore: number;
  /** Opacite du contour d'un corps emissif. 0 = aucun, cas d'une flamme. */
  readonly emissiveOutline: number;
  /** Poids de l'epaisseur dans la valeur d'un corps emissif. */
  readonly emissiveEdgeBias: number;
  /** Poids de la moucheture dans la valeur d'un corps emissif. */
  readonly emissiveTurbulence: number;
  /** Exposant de la moucheture : regle la part de la valeur la plus claire. */
  readonly emissiveTurbulenceBias: number;
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
  contrast: 1.6,
  facetRange: [0.06, 0.74],
  emissiveCore: 3,
  emissiveOutline: 0,
  // L'épaisseur porte la couleur, la moucheture ne fait que la casser.
  //
  // Ces deux poids étaient réglés à 0 et 0,92 — autrement dit la valeur d'un
  // pixel de flamme était tirée **entièrement** au bruit, et la transformée
  // de distance calculée juste au-dessus ne servait à rien. Le résultat était
  // un confetti orange et jaune sans bord ni cœur. Mesuré en regardant : avec
  // l'épaisseur en tête, la flamme retrouve un liseré sombre et un cœur
  // clair, ce qui est exactement la structure d'un feu dessiné.
  emissiveEdgeBias: 1.5,
  emissiveTurbulence: 0.34,
  emissiveTurbulenceBias: 1.7,
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
  // L'étalement se fait autour du gris moyen. Sur un solide dont les normales
  // restent dans un cône étroit — une roche, un bloc —, un simple facteur
  // multiplicatif tasserait toutes les faces sur le même échelon de rampe.
  const t = clamp01(0.5 + ((1 - lambert) - 0.5) * style.contrast + bias);
  const [lo, hi] = style.facetRange;
  return rampAt(palette, lo + t * (hi - lo));
}

/** Position sur la rampe d'une facette, utile pour comparer deux faces. */
export function facetLevel(style: StyleProfile, normal: Vec3): number {
  const lambert = clamp01(dot3(norm3(normal), style.lightDir) * 0.5 + 0.5);
  return clamp01(0.5 + ((1 - lambert) - 0.5) * style.contrast);
}
