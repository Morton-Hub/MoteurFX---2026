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

export type Piece = {
  readonly id: string;
  /** Clé de tri, croissante vers l'observateur. */
  readonly depth: number;
  readonly layer?: PieceLayer;
  /** Peinture du corps indexé. */
  readonly paint: (canvas: IndexedCanvas, ctx: FrameContext) => void;
  /** Peinture explicite dans la passe lumineuse, en plus de celle déduite. */
  readonly emit?: (canvas: IndexedCanvas, ctx: FrameContext) => void;
};

export function sortPieces(pieces: readonly Piece[]): Piece[] {
  // Tri stable sur (profondeur, identifiant) : deux objets à la même
  // profondeur gardent un ordre reproductible d'une exécution à l'autre.
  return [...pieces].sort((a, b) => (a.depth === b.depth ? (a.id < b.id ? -1 : 1) : a.depth - b.depth));
}
