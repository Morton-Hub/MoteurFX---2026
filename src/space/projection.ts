/**
 * Reperes.
 *
 *  1. Monde        : sol (x, y) en tuiles, hauteur z en tuiles. Main droite,
 *                    z vers le haut.
 *  2. Repere local : (avant, côté, haut) d'un sort, obtenu par rotation du
 *                    repère monde autour de l'axe z (cap horizontal).
 *  3. Camera       : projection isometrique, ratio de sol configurable.
 *  4. Pixels       : origine en haut a gauche, y vers le bas.
 *
 * Convention angulaire : le cap 0 rad pointe vers le +x monde, et croit vers
 * le +y monde. En projection par défaut, +x part vers la droite-bas de
 * l'écran et +y vers la gauche-bas.
 */

import { type Vec2, type Vec3, TAU, normAngle } from '../core/math.js';

export type ProjectionProfile = {
  readonly id: string;
  /** Pixels par unité monde sur l'axe horizontal de l'écran. */
  readonly groundScale: number;
  /** Ecrasement vertical du sol. 0.5 = ratio 2:1 classique. */
  readonly groundRatio: number;
  /** Pixels par unité de hauteur z. Independant du sol : un objet haut ne
   *  doit pas s'ecraser sous pretexte que le sol est projeté en 2:1. */
  readonly heightScale: number;
  /** Position en pixels de l'origine monde (0,0,0) dans l'image. */
  readonly originX: number;
  readonly originY: number;
};

export const ISO_2_1: ProjectionProfile = {
  id: 'iso-2:1',
  groundScale: 16,
  groundRatio: 0.5,
  heightScale: 16,
  originX: 0,
  originY: 0,
};

export function withOrigin(p: ProjectionProfile, originX: number, originY: number): ProjectionProfile {
  return { ...p, originX, originY };
}

export function withScale(p: ProjectionProfile, groundScale: number, heightScale?: number): ProjectionProfile {
  return { ...p, groundScale, heightScale: heightScale ?? groundScale };
}

/** Monde -> pixels. */
export function project(p: ProjectionProfile, w: Vec3): Vec2 {
  return {
    x: p.originX + p.groundScale * (w.x - w.y),
    y: p.originY + p.groundScale * p.groundRatio * (w.x + w.y) - p.heightScale * w.z,
  };
}

/** Pixels -> sol (z = 0). Utilise pour viser à la souris. */
export function unprojectGround(p: ProjectionProfile, s: Vec2): Vec3 {
  const dx = s.x - p.originX;
  const dy = s.y - p.originY;
  const diff = dx / p.groundScale;                       // x - y
  const sum = dy / (p.groundScale * p.groundRatio);      // x + y
  return { x: (sum + diff) / 2, y: (sum - diff) / 2, z: 0 };
}

/**
 * Cle de tri 2.5D. Croissante vers l'observateur : un objet de clé plus
 * grande est peint après. La profondeur au sol domine, la hauteur ne sert
 * que de departage pour une même cellule (le bas d'une colonne est devant).
 *
 * Limite assumee : un tri global ne resout pas les intersections reelles.
 * Les recettes qui doivent entourer un personnage exportent des passes
 * avant/arrière séparées (voir `depthSplit` dans le renderer).
 */
export function depthOf(w: Vec3): number {
  return (w.x + w.y) * 64 - w.z;
}

/** Vecteur unitaire du cap, dans le plan du sol. */
export function headingVector(heading: number): Vec3 {
  return { x: Math.cos(heading), y: Math.sin(heading), z: 0 };
}

/**
 * Cap monde de source vers cible, mesure dans le plan du sol.
 * Si source et cible sont confondues (sous `epsilon`), on renvoie le cap
 * de repli fourni : le comportement est defini, jamais NaN.
 */
export function headingFromTo(from: Vec3, to: Vec3, fallback = 0, epsilon = 1e-6): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx * dx + dy * dy < epsilon * epsilon) return normAngle(fallback);
  return normAngle(Math.atan2(dy, dx));
}

/** Repere local d'un sort : avant, côté, haut. */
export type LocalFrame = {
  readonly origin: Vec3;
  readonly heading: number;
  readonly forward: Vec3;
  readonly side: Vec3;
  readonly up: Vec3;
};

export function makeFrame(origin: Vec3, heading: number): LocalFrame {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  return {
    origin,
    heading: normAngle(heading),
    forward: { x: c, y: s, z: 0 },
    side: { x: -s, y: c, z: 0 },
    up: { x: 0, y: 0, z: 1 },
  };
}

/** Coordonnees locales (avant, côté, haut) -> monde. */
export function localToWorld(f: LocalFrame, fwd: number, side: number, up: number): Vec3 {
  return {
    x: f.origin.x + f.forward.x * fwd + f.side.x * side,
    y: f.origin.y + f.forward.y * fwd + f.side.y * side,
    z: f.origin.z + up,
  };
}

/** Rotation d'un vecteur autour de l'axe vertical. */
export function rotateZ(v: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c, z: v.z };
}

/**
 * Angle apparent a l'écran d'une direction monde. Il ne vaut pas l'angle
 * monde : c'est exactement pour cela que les caps exportes sont échantillonnés
 * dans le repère monde et non a l'écran.
 */
export function screenAngleOfHeading(p: ProjectionProfile, heading: number): number {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  return Math.atan2(p.groundRatio * (c + s), c - s);
}

/** Pas angulaire monde d'un échantillonnage a N directions. */
export function directionStep(count: number): number {
  return TAU / count;
}

/**
 * Direction monde qui pointe vers la camera. Deduite du profil : c'est le
 * vecteur dont la projection est nulle, donc l'axe de vue de la projection
 * orthographique. Sert a éliminer les faces arrière sans coder en dur le
 * ratio 2:1.
 */
export function cameraDir(p: ProjectionProfile): Vec3 {
  const dz = (2 * p.groundRatio * p.groundScale) / p.heightScale;
  const len = Math.sqrt(2 + dz * dz);
  return { x: 1 / len, y: 1 / len, z: dz / len };
}

/**
 * Plan monde face camera. `right` se projette exactement a l'horizontale de
 * l'écran, `up` exactement à la verticale. Construire une langue de feu ou
 * une volute de fumée dans ce plan garde la forme lisible tout en laissant
 * l'objet vivre en coordonnees monde : sa profondeur, son ombre au sol et sa
 * position suivent la cible comme n'importe quel autre objet.
 */
export function cameraPlane(_p: ProjectionProfile): { right: Vec3; up: Vec3 } {
  const k = Math.SQRT1_2;
  return { right: { x: k, y: -k, z: 0 }, up: { x: 0, y: 0, z: 1 } };
}
