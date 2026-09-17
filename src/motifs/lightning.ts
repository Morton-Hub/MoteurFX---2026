/**
 * Motifs dessinés de la foudre.
 *
 * Zigzags, nœuds, fourches, branches interrompues. Le piège de l'élément est
 * le trait tremblant redessiné à chaque frame : ici les dessins sont **tenus**
 * plusieurs images, et c'est la coupure — pas le tremblement — qui anime (§3).
 */

import { motif, type PixelMotif } from './motif.js';

/** Nœud de décharge : là où deux branches se rejoignent, la matière s'épaissit. */
export const BOLT_NODE = motif('bolt-node-v1', {
  label: 'Nœud de décharge',
  material: 'lightning.bolt',
  directional: 'radial',
  pivot: { x: 3, y: 3 },
  frames: [
    ['..s.s..', '.sblbs.', 'sblabls', '.sbabs.', 's.blb.s', '..sbs..', '...s...'],
    ['...s...', '..sbs..', '.sblbs.', 'sblabls', '.sblbs.', '..sbs..', '...s...'],
  ],
});

/** Étincelle d'arc : deux pixels qui sautent, rien de plus. */
export const ARC_SPARK = motif('arc-spark-v1', {
  label: 'Étincelle d’arc',
  material: 'lightning.bolt',
  directional: 'radial',
  pivot: { x: 1, y: 1 },
  frames: [['.a.', 'a.a', '.a.'], ['...', '.b.', '...']],
});

/**
 * Fourche courte : branche interrompue qui reste après la décharge
 * principale. Elle tient deux images puis disparaît d'un coup.
 */
export const BOLT_FORK = motif('bolt-fork-v1', {
  label: 'Fourche',
  material: 'lightning.bolt',
  directional: 'billboard',
  pivot: { x: 2, y: 0 },
  frames: [
    ['..a..', '..l..', '.la..', '.b.a.', 'b..l.', '....b'],
    ['..s..', '..b..', '.bs..', '.s.b.', 's..s.', '.....'],
  ],
});

/**
 * Marque au sol d'une frappe : branches rayonnantes, jamais un anneau.
 */
export const GROUND_ARC = motif('lightning-scorch-v1', {
  label: 'Marque de frappe',
  material: 'lightning.scorch',
  directional: 'radial',
  pivot: { x: 8, y: 3 },
  frames: [
    [
      '...s...s.......',
      '.s..sbs..s.....',
      '..sbbbbbbs.s...',
      'ssbbbbbbbbbss..',
      '..sbbbbbbs.s...',
      '.s..sbs..s.....',
      '...s...s.......',
    ],
  ],
});

export const LIGHTNING_MOTIFS: readonly PixelMotif[] = [BOLT_NODE, ARC_SPARK, BOLT_FORK, GROUND_ARC];
