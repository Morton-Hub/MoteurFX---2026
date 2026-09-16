/**
 * Bibliotheque de tampons du feu.
 *
 * Neuf dessins, et rien d'autre. Les tailles intermediaires ne sont pas
 * dessinees : le moteur compose. Une explosion n'est pas un tampon
 * « explosion » — c'est une boule, des bouffees posees autour, des langues et
 * des braises, exactement comme les feuilles de sprites 16 bits etaient
 * montees. Cela evite d'avoir a dessiner une forme differente par instant.
 *
 * Contraintes de dessin respectees ici, et verifiees par les tests :
 *
 *  - toutes les rangees d'un tampon ont la meme largeur ;
 *  - chaque tampon est d'un seul tenant (un ilot detache se lirait comme du
 *    bruit, et casserait la normalisation par composante de la passe emissive) ;
 *  - les longueurs de marche du contour progressent regulierement, ce qui est
 *    precisement ce que la projection ne savait pas produire.
 */

import { stamp } from './stamp.js';

/** Braise isolee. */
export const SPARK = stamp('fire.spark', ['#']);

/** Braise un peu plus lisible, pour les projections rapides. */
export const EMBER = stamp('fire.ember', [
  '.#.',
  '###',
  '.#.',
]);

/** Langue montante, ancree sur sa base. Penche legerement a gauche. */
export const FLAME_S = stamp(
  'fire.flame.s',
  [
    '...#...',
    '..##...',
    '..###..',
    '..###..',
    '.####..',
    '.#####.',
    '.#####.',
    '.#####.',
    '..###..',
  ],
  { x: 3, y: 8 },
);

/** Meme langue, taille de rassemblement. Ancree sur sa base. */
export const FLAME_L = stamp(
  'fire.flame.l',
  [
    '.....#.....',
    '....##.....',
    '....##.....',
    '...###.....',
    '...####....',
    '..#####....',
    '..#####....',
    '..######...',
    '.#######...',
    '.########..',
    '.#########.',
    '.#########.',
    '.#########.',
    '..#######..',
    '...#####...',
  ],
  { x: 5, y: 14 },
);

/** Tete du projectile, trois stades de croissance. */
export const BALL_7 = stamp('fire.ball.7', [
  '..###..',
  '.#####.',
  '#######',
  '#######',
  '#######',
  '.#####.',
  '..###..',
]);

export const BALL_11 = stamp('fire.ball.11', [
  '...#####...',
  '..#######..',
  '.#########.',
  '###########',
  '###########',
  '###########',
  '###########',
  '###########',
  '.#########.',
  '..#######..',
  '...#####...',
]);

export const BALL_15 = stamp('fire.ball.15', [
  '....#######....',
  '...#########...',
  '..###########..',
  '.#############.',
  '.#############.',
  '###############',
  '###############',
  '###############',
  '###############',
  '###############',
  '.#############.',
  '.#############.',
  '..###########..',
  '...#########...',
  '....#######....',
]);

/** Bouffee ronde : reliquat de sillage, et masse d'explosion. */
export const PUFF_7 = stamp('fire.puff.7', [
  '..###..',
  '.#####.',
  '#######',
  '#######',
  '.######',
  '..####.',
  '...##..',
]);

/** Bouffee en goutte, large en haut : fumee qui monte. */
export const PUFF_11 = stamp('fire.puff.11', [
  '...###.....',
  '..######...',
  '.########..',
  '.##########',
  '###########',
  '###########',
  '.#########.',
  '..#######..',
  '...#####...',
  '....###....',
  '.....#.....',
]);

/**
 * Masses d'explosion.
 *
 * Un cercle parfait convient a une tete de projectile — c'est un corps qui
 * file, l'oeil veut le lire rond. Il ne convient pas a une explosion : posees
 * cote a cote, des rondeurs egales se lisent comme des bulles de savon, pas
 * comme une masse qui se dechire. Ces deux dessins gardent un contour propre
 * mais cassent la regularite en haut.
 */
export const LUMP_9 = stamp('fire.lump.9', [
  '..##.##..',
  '.#######.',
  '#########',
  '#########',
  '#########',
  '.#######.',
  '..#####..',
]);

export const LUMP_13 = stamp('fire.lump.13', [
  '...##..###...',
  '..####.####..',
  '.###########.',
  '#############',
  '#############',
  '#############',
  '#############',
  '.###########.',
  '..#########..',
  '...#######...',
  '.....###.....',
]);

export const FIRE_STAMPS = [
  SPARK,
  EMBER,
  FLAME_S,
  FLAME_L,
  BALL_7,
  BALL_11,
  BALL_15,
  PUFF_7,
  PUFF_11,
  LUMP_9,
  LUMP_13,
] as const;
