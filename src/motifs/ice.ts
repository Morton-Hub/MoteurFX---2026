/**
 * Motifs dessinés de la glace.
 *
 * Prismes obliques, facettes, étoiles cassées, plaques. La glace est
 * **rigide** : elle ne se déforme pas, elle se rompt. Aucun de ces dessins
 * n'est un pic de terre repeint en bleu (§3).
 */

import { motif, type PixelMotif } from './motif.js';

/**
 * Éclat facetté, trois tailles. Le liseré clair court sur l'arête tournée
 * vers la lumière : c'est ce qui donne l'épaisseur sans halo.
 */
export const ICE_SHARD = motif('ice-shard-v1', {
  label: 'Éclat de cristal',
  material: 'ice.crystal',
  directional: 'billboard',
  pivot: { x: 3, y: 5 },
  frames: [
    [
      '..-a-..',
      '.-albs-',
      '-albbs-',
      '-albbs-',
      '-slbbs-',
      '.-sbs-.',
      '..-s-..',
    ],
    ['.-a-.', '-alb-', '-slb-', '.-ss-', '..-..'],
    ['-a-', '-b-', '.-.'],
  ],
});

/** Facette isolée : débris plat, tourné de face, sans épaisseur lisible. */
export const ICE_FLAKE = motif('ice-flake-v1', {
  label: 'Facette brisée',
  material: 'ice.crystal',
  directional: 'billboard',
  pivot: { x: 2, y: 1 },
  frames: [['-al-', '-sb-', '.--.'], ['-a-', '-s-', '...']],
});

/**
 * Poudrin : la seule matière « molle » de la glace. Trois pixels au plus,
 * utilisés comme accents rares.
 */
export const ICE_MOTE = motif('ice-mote-v1', {
  label: 'Poudrin',
  material: 'ice.mist',
  directional: 'radial',
  pivot: { x: 1, y: 1 },
  frames: [['.a.', 'a.a', '.a.'], ['...', '.l.', '...']],
});

/**
 * Plaque de givre au sol. Étoile cassée plutôt que disque : le givre pousse
 * par branches, il ne s'étale pas en rond.
 */
export const FROST_PATCH = motif('ice-frost-patch-v1', {
  label: 'Plaque de givre',
  material: 'ice.frost',
  directional: 'radial',
  pivot: { x: 9, y: 4 },
  frames: [
    [
      '.....s.s.......',
      '...s.sbs.s.....',
      '..ssbblbbs.s...',
      '.sbblllllbbss..',
      '..ssbblbbs.s...',
      '...s.sbs.s.....',
      '.....s.s.......',
    ],
    [
      '......s...s......',
      '...s..sbs.s..s...',
      '..s.sbbblbbs.s...',
      '.ssbblllllllbbss.',
      'sbblllldlllllbbs.',
      '.ssbblllllllbbss.',
      '..s.sbbblbbs.s...',
      '...s..sbs.s..s...',
      '......s...s......',
    ],
  ],
});

/**
 * Éventail de fracture : dessin d'impact posé au moment exact de la rupture.
 * Il remplace un flash blanc, qui ferait disparaître la matière.
 */
export const ICE_FRACTURE = motif('ice-fracture-v1', {
  label: 'Éventail de fracture',
  material: 'ice.crystal',
  directional: 'billboard',
  pivot: { x: 5, y: 5 },
  frames: [
    [
      'a...a...a',
      '.l.al.l..',
      '..lal..a.',
      '.alaala..',
      'aalaaalaa',
      '.alaala..',
      '..lal..a.',
      '.l.al.l..',
      'a...a...a',
    ],
    [
      's...l...s',
      '.s.ls.s..',
      '..sls..l.',
      '.lsssl...',
      'sls...sls',
      '.lsssl...',
      '..sls..l.',
      '.s.ls.s..',
      's...l...s',
    ],
  ],
  durationsMs: [35, 55],
});

export const ICE_MOTIFS: readonly PixelMotif[] = [
  ICE_SHARD,
  ICE_FLAKE,
  ICE_MOTE,
  FROST_PATCH,
  ICE_FRACTURE,
];
