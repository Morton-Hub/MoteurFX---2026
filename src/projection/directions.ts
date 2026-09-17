/**
 * Echantillonnage des caps exportes. Les directions sont prises dans le
 * repère monde ; leurs angles projetés ne sont donc pas régulièrement
 * espacés a l'écran. Le manifeste stocke le vecteur et l'angle monde :
 * le label seul ne definit aucun contrat.
 */

import { TAU, normAngle } from '../core/math.js';
import { type ProjectionProfile, screenAngleOfHeading } from './projection.js';

export type DirectionSample = {
  readonly index: number;
  /** Angle monde en radians, dans [0, TAU). */
  readonly heading: number;
  /** Vecteur unitaire monde dans le plan du sol. */
  readonly vector: { x: number; y: number };
  /** Angle apparent a l'écran, pour information seulement. */
  readonly screenAngle: number;
  /** Label lisible. Informatif : ce n'est pas le contrat. */
  readonly label: string;
};

const LABELS_8 = ['E', 'NE', 'N', 'NO', 'O', 'SO', 'S', 'SE'] as const;

/** Label compas monde le plus proche, suffixe si l'angle tombe entre deux. */
export function labelFor(heading: number): string {
  const h = normAngle(heading);
  const step = TAU / 8;
  const nearest = Math.round(h / step) % 8;
  const base = LABELS_8[nearest] ?? 'E';
  const drift = h - nearest * step;
  if (Math.abs(drift) < 1e-6) return base;
  const deg = Math.round((h * 180) / Math.PI);
  return `${base}${drift > 0 ? '+' : '-'}(${deg}deg)`;
}

/**
 * N directions a partir d'un angle initial explicite.
 * `count` 8 et 16 sont les standards ; toute valeur >= 1 est acceptee.
 */
export function sampleDirections(
  count: number,
  startHeading = 0,
  projection?: ProjectionProfile,
): DirectionSample[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`sampleDirections: count doit etre un entier >= 1, recu ${count}`);
  }
  const step = TAU / count;
  const out: DirectionSample[] = [];
  for (let i = 0; i < count; i++) {
    const heading = normAngle(startHeading + i * step);
    out.push({
      index: i,
      heading,
      vector: { x: Math.cos(heading), y: Math.sin(heading) },
      screenAngle: projection ? screenAngleOfHeading(projection, heading) : Number.NaN,
      label: labelFor(heading),
    });
  }
  return out;
}

/**
 * Cap exporte le plus proche d'un cap libre. `hysteresis` (en radians) evite
 * l'oscillation entre deux caps voisins : on ne quitte le cap courant que si
 * un autre est meilleur d'au moins cette marge.
 */
export function pickDirection(
  dirs: readonly DirectionSample[],
  heading: number,
  current?: number,
  hysteresis = 0,
): number {
  let best = 0;
  let bestDist = Infinity;
  for (const d of dirs) {
    const dist = Math.abs(shortest(d.heading, heading));
    if (dist < bestDist) {
      bestDist = dist;
      best = d.index;
    }
  }
  if (current === undefined || current === best) return best;
  const cur = dirs[current];
  if (!cur) return best;
  const curDist = Math.abs(shortest(cur.heading, heading));
  return curDist - bestDist > hysteresis ? best : current;
}

function shortest(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
