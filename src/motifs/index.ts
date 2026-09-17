/**
 * Bibliothèque de motifs.
 *
 * Tous les motifs livrés sont **originaux**, dessinés pour ce dépôt : aucune
 * ressource extraite d'un jeu commercial (§14). Un motif importé devra porter
 * sa provenance et ses droits.
 */

import type { PixelMotif } from './motif.js';
import { FIRE_MOTIFS } from './fire.js';
import { ICE_MOTIFS } from './ice.js';
import { LIGHTNING_MOTIFS } from './lightning.js';

export * from './motif.js';
export * from './draw.js';
export * from './fire.js';
export * from './ice.js';
export * from './lightning.js';

export const MOTIF_LIBRARY: readonly PixelMotif[] = [
  ...FIRE_MOTIFS,
  ...ICE_MOTIFS,
  ...LIGHTNING_MOTIFS,
];

const BY_ID = new Map(MOTIF_LIBRARY.map((m) => [m.id, m]));

export function getMotif(id: string): PixelMotif {
  const hit = BY_ID.get(id);
  if (!hit) throw new Error(`Motif inconnu : "${id}"`);
  return hit;
}

export function hasMotif(id: string): boolean {
  return BY_ID.has(id);
}
