/**
 * Un objet peint dans une frame.
 *
 * Le tri se fait **par objet** et non face par face : une dalle inclinée
 * couvre beaucoup plus de profondeur que l'écart entre deux dalles voisines,
 * et un tri global les ferait s'interpénétrer.
 */

import type { IndexedCanvas } from '../pixels/canvas.js';
import type { FrameContext } from './context.js';

/** Couche d'occlusion vis-à-vis d'un personnage debout sur la cible. */
export type PieceLayer = 'back' | 'front';

/**
 * Plan de peinture.
 *
 * Les décalques au sol — ombres, brûlures, givre, ondes de choc — se peignent
 * **tous avant** ce qui se tient dessus. Un simple décalage de profondeur ne
 * suffit pas : la clé de tri dépend de la position monde, donc un objet placé
 * derrière la cible passe sous le décalque de la cible et se fait découper par
 * son tramage. Deux plans règlent le problème une fois pour toutes.
 */
export type PiecePlane = 'ground' | 'scene';

export type Piece = {
  readonly id: string;
  /** Clé de tri, croissante vers l'observateur. */
  readonly depth: number;
  readonly layer?: PieceLayer;
  readonly plane?: PiecePlane;
  /** Peinture du corps indexé. */
  readonly paint: (canvas: IndexedCanvas, ctx: FrameContext) => void;
  /** Peinture explicite dans la passe lumineuse, en plus de celle déduite. */
  readonly emit?: (canvas: IndexedCanvas, ctx: FrameContext) => void;
};

export function sortPieces(pieces: readonly Piece[]): Piece[] {
  // Tri stable sur (plan, profondeur, identifiant) : deux objets à la même
  // profondeur gardent un ordre reproductible d'une exécution à l'autre.
  const rank = (p: Piece): number => (p.plane === 'ground' ? 0 : 1);
  return [...pieces].sort((a, b) => {
    const plane = rank(a) - rank(b);
    if (plane !== 0) return plane;
    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.id < b.id ? -1 : 1;
  });
}
