/**
 * Ombrage : passage d'une forme (masque) à des pixels indexés.
 *
 * Deux régimes, et pas un seul comme dans un moteur générique :
 *
 *  - **Solide** : la valeur vient de la normale de la facette et de la
 *    lumière monde. Une roche, un prisme, une plaque.
 *  - **Émissif** : la valeur vient de l'**épaisseur** locale. Une flamme, une
 *    décharge. Un éclair n'a pas besoin du modelé d'une roche (§2).
 *
 * Aucun de ces deux régimes ne produit de halo : la passe lumineuse est
 * séparée, optionnelle, et le sujet doit rester lisible sans elle.
 */

import { clamp01, dot3, norm3, type Vec3 } from '../core/math.js';
import { valueNoise } from '../core/noise.js';
import type { IndexedCanvas } from './canvas.js';
import { ditherPasses, type Dither } from './dither.js';
import type { ShapeMask } from './mask.js';
import { rampRole, type Material, type RoleId } from './palette.js';
import type { StyleProfile } from './style.js';

/** Position d'une facette sur sa rampe, 0 = sombre, 1 = clair. */
export function facetLevel(style: StyleProfile, normal: Vec3): number {
  const lambert = clamp01(dot3(norm3(normal), style.lightDir) * 0.5 + 0.5);
  // L'étalement se fait autour du gris moyen : sur un solide dont les normales
  // restent dans un cône étroit, un simple facteur multiplicatif tasserait
  // toutes les faces sur le même échelon.
  return clamp01(0.5 + (lambert - 0.5) * style.facetContrast);
}

/** Niveau ramené dans la plage autorisée par le style. */
function ranged(style: StyleProfile, t: number): number {
  const [lo, hi] = style.facetRange;
  return lo + clamp01(t) * (hi - lo);
}

export type FacetOptions = {
  readonly style: StyleProfile;
  readonly normal: Vec3;
  /** Décale la facette sur la rampe : arête vive, face interne, fond de faille. */
  readonly bias?: number;
  readonly dither?: Dither;
};

/** Peint un masque comme une facette de solide. */
export function paintFacet(
  canvas: IndexedCanvas,
  mask: ShapeMask,
  material: Material,
  opts: FacetOptions,
): void {
  const t = ranged(opts.style, facetLevel(opts.style, opts.normal) + (opts.bias ?? 0));
  const ink = canvas.ink(material, rampRole(material, t));
  canvas.fillMask(mask, (x, y) => (ditherPasses(opts.dither, x, y) ? ink : 0));
}

/** Peint un masque avec une valeur constante de la rampe. */
export function paintValue(
  canvas: IndexedCanvas,
  mask: ShapeMask,
  material: Material,
  t: number,
  dither?: Dither,
): void {
  const ink = canvas.ink(material, rampRole(material, t));
  canvas.fillMask(mask, (x, y) => (ditherPasses(dither, x, y) ? ink : 0));
}

/**
 * Peint un masque avec un rôle explicite.
 *
 * `behind` ne pose l'encre que sur les pixels encore vides. C'est
 * indispensable pour une matière **tramée** : posée par-dessus, elle laisse
 * apparaître un pixel sur deux de ce qui était dessous, et perfore la matière
 * en damier au lieu de la voiler.
 */
export function paintRole(
  canvas: IndexedCanvas,
  mask: ShapeMask,
  material: Material,
  role: RoleId,
  dither?: Dither,
  behind = false,
): void {
  const ink = canvas.ink(material, role);
  if (behind) {
    mask.forEach((x, y) => {
      if (ditherPasses(dither, x, y)) canvas.setBehind(x, y, ink);
    });
    return;
  }
  canvas.fillMask(mask, (x, y) => (ditherPasses(dither, x, y) ? ink : 0));
}

export type EmissiveOptions = {
  readonly style: StyleProfile;
  /** Seed stable de l'objet : la moucheture ne doit pas bouger sans raison. */
  readonly seed: number;
  /** Épaisseur minimale en pixels pour atteindre le haut de la rampe. */
  readonly core?: number;
  /** Part de l'épaisseur maximale de la masse qui atteint le haut de rampe. */
  readonly coreRatio?: number;
  /** Part de moucheture. 0 = matière lisse (décharge), 0,4 = flamme agitée. */
  readonly turbulence?: number;
  /** Taille de la moucheture, en pixels. */
  readonly grain?: number;
  /** Décalage global sur la rampe : refroidissement, extinction. */
  readonly bias?: number;
  /** Plafond de rampe : une braise mourante n'atteint plus son accent. */
  readonly ceiling?: number;
  /** Plancher de rampe. */
  readonly floor?: number;
};

/**
 * Peint un corps émissif : le cœur est clair, le bord garde la couleur la
 * plus saturée. L'épaisseur porte la couleur, la moucheture ne fait que la
 * casser — l'inverse donne un confetti sans bord ni cœur.
 */
export function paintEmissive(
  canvas: IndexedCanvas,
  mask: ShapeMask,
  material: Material,
  opts: EmissiveOptions,
): void {
  const dist = mask.innerDistance();
  // L'épaisseur pilote la valeur, mais le seuil de cœur doit suivre la masse :
  // avec un seuil fixe, une grande masse atteint partout sa teinte la plus
  // claire et devient le « gros centre blanc » que le document proscrit.
  let maxDist = 0;
  for (let i = 0; i < dist.length; i++) if ((dist[i] as number) > maxDist) maxDist = dist[i] as number;
  const core = Math.max(1, opts.core ?? opts.style.emissiveCore, maxDist * (opts.coreRatio ?? 0.78));
  const turb = opts.turbulence ?? opts.style.emissiveTurbulence;
  const grain = opts.grain ?? 2.5;
  const bias = opts.bias ?? 0;
  const ceiling = opts.ceiling ?? 1;
  const floor = opts.floor ?? 0;
  const inks: number[] = material.ramp.map((r) => canvas.ink(material, r));
  const last = material.ramp.length - 1;
  mask.forEach((x, y) => {
    const d = mask.distanceAt(dist, x, y);
    let t = clamp01(d / core);
    if (turb > 0) {
      const n = valueNoise(opts.seed, x, y, grain);
      t = clamp01(t * (1 - turb) + t * turb * (0.35 + 1.3 * n) + (n - 0.5) * turb * 0.35);
    }
    t = clamp01(Math.min(ceiling, Math.max(floor, t + bias)));
    const idx = Math.round(t * last);
    const ink = inks[Math.max(0, Math.min(last, idx))] ?? 0;
    if (ink !== 0) canvas.set(x, y, ink);
  });
}

/**
 * Contour coloré sélectif, posé **autour** de la silhouette. Il n'existe que
 * si la matière en déclare un : une flamme n'en a pas.
 */
export function paintOutline(
  canvas: IndexedCanvas,
  mask: ShapeMask,
  material: Material,
  style: StyleProfile,
): void {
  if (style.outline === 'none' || material.outline === null) return;
  const ink = canvas.ink(material, material.outline);
  const ring = mask.dilate(1);
  ring.subtract(mask);
  canvas.fillMask(ring, ink);
}

/**
 * Liseré de lumière sur les arêtes tournées vers la lumière. C'est lui qui
 * « sculpte » un cristal sans ajouter de halo.
 *
 * `lightScreen` est la direction d'où vient la lumière, en pixels écran.
 */
export function paintRim(
  canvas: IndexedCanvas,
  mask: ShapeMask,
  material: Material,
  role: RoleId,
  lightScreen: { x: number; y: number },
): void {
  const ink = canvas.ink(material, role);
  const sx = Math.abs(lightScreen.x) > 0.3 ? Math.sign(lightScreen.x) : 0;
  const sy = Math.abs(lightScreen.y) > 0.3 ? Math.sign(lightScreen.y) : 0;
  mask.forEach((x, y) => {
    const open = (!mask.get(x + sx, y) && sx !== 0) || (!mask.get(x, y + sy) && sy !== 0);
    if (open) canvas.set(x, y, ink);
  });
}

/**
 * Ombre de contact : une ligne sombre là où la matière touche une autre
 * surface, du côté opposé à la lumière.
 */
export function paintContactShade(
  canvas: IndexedCanvas,
  mask: ShapeMask,
  material: Material,
  role: RoleId,
  lightScreen: { x: number; y: number },
): void {
  paintRim(canvas, mask, material, role, { x: -lightScreen.x, y: -lightScreen.y });
}

/**
 * Accents isolés : braise, étincelle, goutte. Ils sont **rares** et posés
 * selon la seed, jamais renouvelés d'une frame à l'autre sans raison.
 */
export function paintSpeckle(
  canvas: IndexedCanvas,
  mask: ShapeMask,
  material: Material,
  role: RoleId,
  density: number,
  seed: number,
): void {
  if (density <= 0) return;
  const ink = canvas.ink(material, role);
  mask.forEach((x, y) => {
    if (valueNoise(seed, x, y, 1.6) < density) canvas.set(x, y, ink);
  });
}

/** Direction d'où vient la lumière, exprimée en pixels écran. */
export function screenLight(
  style: StyleProfile,
  groundRatio: number,
): { x: number; y: number } {
  const l = style.lightDir;
  const x = l.x - l.y;
  const y = groundRatio * (l.x + l.y) - l.z;
  const n = Math.hypot(x, y) || 1;
  return { x: x / n, y: y / n };
}
