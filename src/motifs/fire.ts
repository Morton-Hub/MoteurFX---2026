/**
 * Motifs dessinés du feu.
 *
 * Langues crochues, lobes, pétales ouverts, trous internes : la flamme est
 * construite par masses, pas par points. Les braises et les étincelles sont
 * les seuls pixels isolés autorisés (§2, §3).
 */

import { motif, type PixelMotif } from './motif.js';

/** Braise : trois états, du vif à la cendre. Un accent, jamais une particule. */
export const EMBER = motif('fire-ember-v1', {
  label: 'Braise',
  material: 'fire.ember',
  directional: 'radial',
  pivot: { x: 1, y: 1 },
  frames: [
    ['.l.', 'lal', '.l.'],
    ['.b.', 'bls', '.s.'],
    ['...', '.s.', '...'],
  ],
  durationsMs: [70, 70, 70],
});

/** Étincelle : plus dure et plus brève que la braise. */
export const FIRE_SPARK = motif('fire-spark-v1', {
  label: 'Étincelle',
  material: 'fire.ember',
  directional: 'radial',
  pivot: { x: 1, y: 1 },
  frames: [['.a.', 'a.a', '.a.'], ['...', 'l.l', '...']],
});

/**
 * Fumée : la seule matière froide du feu. Elle s'ouvre puis se troue —
 * l'extinction est dessinée, pas obtenue par une rampe d'alpha.
 */
export const SMOKE_PUFF = motif('fire-smoke-v1', {
  label: 'Amas de fumée',
  material: 'fire.smoke',
  directional: 'billboard',
  pivot: { x: 4, y: 3 },
  frames: [
    ['..s..', '.sbs.', '.sbs.', '..s..'],
    ['.ssss..', 'sbbbbs.', 'sbblbs.', '.sbbbs.', '..sss..'],
    ['..ssss...', '.sbbbbs..', 'sbblllbs.', 'sbbbllbs.', '.sbbbbs..', '..ssss...'],
    ['..s.s....', '.s.bs.s..', 's.bl.lb..', '.sb.ll.s.', '..s.bs...', '....s....'],
  ],
  durationsMs: [60, 80, 110, 140],
});

/** Langue de feu : le mot de base de la matière. Crochue, à cœur clair. */
export const FLAME_TONGUE = motif('fire-tongue-v1', {
  label: 'Langue de feu',
  material: 'fire.flame',
  directional: 'billboard',
  pivot: { x: 4, y: 13 },
  attach: { tip: { x: 5, y: 0 }, base: { x: 4, y: 13 } },
  frames: [
    [
      '.....s...',
      '....sbs..',
      '....sbs..',
      '...sbbs..',
      '...sbls..',
      '..sbbls..',
      '..sblls..',
      '.sbblals.',
      '.sblaals.',
      '.sblaabs.',
      '..sblabs.',
      '..sbbbs..',
      '...sbs...',
      '....s....',
    ],
    [
      '...s.....',
      '..sbs....',
      '..sls....',
      '.sbls....',
      '.sbas....',
      '.sbls.s..',
      '..sbs.bs.',
      '..sblsals',
      '.sblaaals',
      '.sblaabs.',
      '.sbbabs..',
      '..sbbs...',
      '..sbs....',
      '...s.....',
    ],
    [
      '.........',
      '....s....',
      '....s....',
      '...sbs...',
      '...sbs...',
      '...sls...',
      '..sblbs..',
      '..sblbs..',
      '..sbabs..',
      '.sbbabs..',
      '.sbbbbs..',
      '..sbbs...',
      '...ss....',
      '.........',
    ],
  ],
  durationsMs: [55, 55, 70],
});

/**
 * Pétale ouvert : la conséquence d'un contact. Trois lobes plutôt qu'un
 * disque — c'est la différence entre un feu et une boule orange.
 */
export const FIRE_LOBE = motif('fire-lobe-v1', {
  label: 'Pétale de feu',
  material: 'fire.flame',
  directional: 'billboard',
  pivot: { x: 6, y: 8 },
  frames: [
    [
      '..s.....s..',
      '.sbs...sbs.',
      '.sls...sls.',
      'sblsssslbs.',
      'sblaaaalbs.',
      '.sbaaaabs..',
      '..sbaaabs..',
      '..sbbabs...',
      '...ssss....',
    ],
    [
      's..s...s..s',
      'bs.bs.sb.sb',
      'lb.ls.sl.bl',
      '.lbs.sbl.l.',
      '.slaaaals..',
      '..sbaaabs..',
      '...sbabs...',
      '...s.b.s...',
      '.....s.....',
    ],
  ],
  durationsMs: [55, 75],
});

/**
 * Éclat rocheux : débris du météore. Croûte sombre, veine chaude sur la
 * cassure — un fragment de comète n'est pas une braise agrandie.
 */
export const ROCK_CHIP = motif('fire-chip-v1', {
  label: 'Éclat de croûte',
  material: 'fire.crust',
  directional: 'billboard',
  pivot: { x: 3, y: 2 },
  ink: { v: { material: 'fire.vein', role: 'body' }, V: { material: 'fire.vein', role: 'light' } },
  frames: [
    ['-ss--..', '-sblv-.', '-ssbVs-', '..--ss-', '.......'],
    ['-s--.', '-sbv-', '--ss-', '.....'],
    ['-s-', '-v-', '...'],
  ],
});

/**
 * Brûlure au sol. Bord irrégulier dessiné : un cercle parfait trahirait la
 * primitive géométrique dessous.
 */
export const SCORCH_MARK = motif('fire-scorch-v1', {
  label: 'Brûlure au sol',
  material: 'fire.scorch',
  directional: 'radial',
  pivot: { x: 10, y: 4 },
  frames: [
    [
      '....sssss......',
      '..ssdddddss....',
      '.sdddbbddddss..',
      'ssdddbbbdddds..',
      '.sddddbddddss..',
      '..ssdddddss....',
      '....sssss......',
    ],
    [
      '.....sssssss.......',
      '...sssdddddsss.....',
      '..ssdddbbbdddss....',
      '.sdddbbbbbbddddss..',
      '.sdddbbbbbbbdddss..',
      '..ssdddbbbdddss....',
      '...sssdddddsss.....',
      '.....sssssss.......',
    ],
  ],
});

export const FIRE_MOTIFS: readonly PixelMotif[] = [
  EMBER,
  FIRE_SPARK,
  SMOKE_PUFF,
  FLAME_TONGUE,
  FIRE_LOBE,
  ROCK_CHIP,
  SCORCH_MARK,
];
