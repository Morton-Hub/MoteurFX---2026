/**
 * Catalogue livré et matrice des douze éléments.
 *
 * Le premier lot est **neuf recettes** : feu, glace et foudre, chacun en
 * S/M/L (§11). Les autres familles sont des concepts de catalogue, marqués
 * comme tels — un nom dans un tableau n'est pas une recette livrée (§19).
 */

import type { ElementId } from '../pixels/palette.js';
import type { EvolutionFamily, Rank, RecipeDefinition } from './types.js';
import { SCHEMA_VERSION } from './types.js';

const ISO = 'iso-2:1';
const STYLE = 'arcane-miniature';

// ---------------------------------------------------------------------------
// Feu
// ---------------------------------------------------------------------------

export const FIRE_S: RecipeDefinition = {
  schemaVersion: SCHEMA_VERSION,
  id: 'fire-ember-petal-s',
  familyId: 'fire-ember',
  rank: 'S',
  name: 'Pétale de braise',
  builder: 'fire-ember-petal-s',
  seed: 1471,
  style: STYLE,
  element: 'fire',
  action: 'projectile',
  projection: ISO,
  parameters: {
    emberSize: 0.5,
    tongues: 3,
    curl: 0.55,
    trail: 3,
    flightArc: 0.3,
    lobes: 3,
    emberCount: 7,
    smoke: 0.8,
  },
  animation: {
    frameCount: 12,
    frameDurationsMs: [65, 65, 70, 75, 60, 45, 35, 45, 70, 85, 100, 120],
    endBehavior: 'clear',
    frameIndexBase: 0,
    events: [
      { id: 'cast', frame: 0, note: 'la main rassemble la braise' },
      { id: 'release', frame: 2 },
      { id: 'contact', frame: 6 },
      { id: 'peak', frame: 7, note: 'ouverture maximale des pétales' },
      { id: 'settle', frame: 9 },
      { id: 'clear', frame: 11 },
    ],
  },
  clips: {
    cast: { range: [0, 2], anchor: 'source', motif: 'fire-ember-v1' },
    fly: { range: [3, 5], anchor: 'projectile', operator: 'flame-body', playback: 'loop' },
    hit: { range: [6, 8], anchor: 'target', operator: 'open-lobes', trigger: 'contact' },
    residue: { range: [9, 11], anchor: 'ground-target', motif: 'fire-smoke-v1' },
  },
  export: {
    directions: 8,
    directionSpace: 'world',
    framesPerDirection: 12,
    bodyProfile: 'pixel-light',
    separateEmission: true,
  },
  stage: { width: 184, height: 144, distance: 2.6, casterHeight: 0.55, targetAt: { x: 0.52, y: 0.6 } },
  silhouette:
    'Une petite masse crochue, lancée à hauteur de main, qui s’ouvre en trois pétales au contact et laisse des braises.',
};

export const FIRE_M: RecipeDefinition = {
  schemaVersion: SCHEMA_VERSION,
  id: 'fire-dragon-pillar-m',
  familyId: 'fire-ember',
  rank: 'M',
  name: 'Pilier du dragon',
  builder: 'fire-dragon-pillar-m',
  seed: 2207,
  style: STYLE,
  element: 'fire',
  action: 'eruption',
  projection: ISO,
  parameters: { height: 3.1, girth: 1.05, tongues: 5, tear: 0.7, crackCount: 4, holes: 1, smoke: 1 },
  animation: {
    frameCount: 12,
    frameDurationsMs: [70, 60, 50, 45, 45, 50, 70, 80, 60, 60, 90, 120],
    endBehavior: 'clear',
    frameIndexBase: 0,
    events: [
      { id: 'cast', frame: 0, note: 'ignition au sol' },
      { id: 'peak', frame: 6, note: 'colonne ouverte, pose tenue' },
      { id: 'fracture', frame: 8, note: 'le débit est coupé, le vide s’ouvre' },
      { id: 'settle', frame: 10 },
      { id: 'clear', frame: 11 },
    ],
  },
  clips: {
    cast: { range: [0, 2], anchor: 'ground-target', operator: 'ground-cracks' },
    hit: { range: [3, 9], anchor: 'target', operator: 'flame-body', trigger: 'start' },
    residue: { range: [10, 11], anchor: 'ground-target', motif: 'fire-smoke-v1' },
  },
  export: {
    directions: 8,
    directionSpace: 'world',
    framesPerDirection: 12,
    bodyProfile: 'pixel-light',
    separateEmission: true,
  },
  stage: { width: 168, height: 192, distance: 2.2, casterHeight: 0.55, targetAt: { x: 0.5, y: 0.78 } },
  silhouette:
    'Une colonne verticale qui jaillit du sol, tient sa pose ouverte, puis se déchire en deux quand le débit est coupé.',
};

export const FIRE_L: RecipeDefinition = {
  schemaVersion: SCHEMA_VERSION,
  id: 'fire-comet-heart-l',
  familyId: 'fire-ember',
  rank: 'L',
  name: 'Cœur de comète',
  builder: 'fire-comet-heart-l',
  seed: 3301,
  style: STYLE,
  element: 'fire',
  action: 'skystrike',
  projection: ISO,
  parameters: {
    coreSize: 0.62,
    rough: 0.44,
    fallHeight: 5.2,
    lean: 1.5,
    trailLength: 1.5,
    fragments: 8,
    lobes: 3,
    craterRadius: 1.5,
  },
  animation: {
    // La table du storyboard de référence du document (§4).
    frameCount: 12,
    frameDurationsMs: [70, 70, 80, 90, 60, 40, 35, 35, 55, 75, 95, 115],
    endBehavior: 'clear',
    frameIndexBase: 0,
    events: [
      { id: 'cast', frame: 0, note: 'présage : une ombre courte' },
      { id: 'release', frame: 2, note: 'la masse devient visible en hauteur' },
      { id: 'contact', frame: 6 },
      { id: 'fracture', frame: 7, note: 'écrasement et premiers fragments' },
      { id: 'peak', frame: 8, note: 'trois lobes s’ouvrent' },
      { id: 'settle', frame: 10 },
      { id: 'clear', frame: 11 },
    ],
  },
  clips: {
    cast: { range: [0, 2], anchor: 'sky', operator: 'ground-mark' },
    fly: { range: [3, 5], anchor: 'projectile', operator: 'chunk', playback: 'loop' },
    hit: { range: [6, 9], anchor: 'target', operator: 'shatter', trigger: 'contact' },
    residue: { range: [10, 11], anchor: 'ground-target', motif: 'fire-chip-v1' },
  },
  export: {
    directions: 8,
    directionSpace: 'world',
    framesPerDirection: 12,
    bodyProfile: 'pixel-light',
    separateEmission: true,
  },
  stage: { width: 216, height: 224, distance: 1.2, casterHeight: 0.55, targetAt: { x: 0.46, y: 0.74 } },
  silhouette:
    'Une masse rocheuse à croûte sombre et veines chaudes, annoncée par son ombre, qui tombe du ciel et se disloque en fragments lourds.',
};

// ---------------------------------------------------------------------------
// Glace
// ---------------------------------------------------------------------------

export const ICE_S: RecipeDefinition = {
  schemaVersion: SCHEMA_VERSION,
  id: 'ice-aurora-needle-s',
  familyId: 'ice-aurora',
  rank: 'S',
  name: 'Aiguille d’aurore',
  builder: 'ice-aurora-needle-s',
  seed: 42,
  style: STYLE,
  element: 'ice',
  action: 'projectile',
  projection: ISO,
  parameters: {
    crystalLength: 1.05,
    crystalRadius: 0.27,
    facets: 6,
    facetContrast: 0.8,
    fragmentCount: 5,
    frostRadius: 0.9,
  },
  animation: {
    frameCount: 12,
    frameDurationsMs: [70, 60, 70, 80, 55, 40, 35, 50, 70, 80, 95, 110],
    endBehavior: 'clear',
    frameIndexBase: 0,
    events: [
      { id: 'cast', frame: 0 },
      { id: 'release', frame: 2 },
      { id: 'contact', frame: 6 },
      { id: 'fracture', frame: 7 },
      { id: 'settle', frame: 9 },
      { id: 'clear', frame: 11 },
    ],
  },
  clips: {
    cast: { range: [0, 2], anchor: 'source', operator: 'prism' },
    fly: { range: [3, 5], anchor: 'projectile', operator: 'oriented-crystal', playback: 'loop' },
    hit: { range: [6, 8], anchor: 'target', operator: 'fracture-source-crystal', trigger: 'contact' },
    residue: { range: [9, 11], anchor: 'ground-target', motif: 'ice-frost-patch-v1' },
  },
  export: {
    directions: 8,
    directionSpace: 'world',
    framesPerDirection: 12,
    bodyProfile: 'pixel-light',
    separateEmission: true,
  },
  stage: { width: 184, height: 144, distance: 2.6, casterHeight: 0.55, targetAt: { x: 0.52, y: 0.6 } },
  silhouette:
    'Un prisme rigide construit par paliers, projeté dans l’axe du cap, qui casse net en facettes plates.',
};

export const ICE_M: RecipeDefinition = {
  schemaVersion: SCHEMA_VERSION,
  id: 'ice-frost-garden-m',
  familyId: 'ice-aurora',
  rank: 'M',
  name: 'Jardin de givre',
  builder: 'ice-frost-garden-m',
  seed: 911,
  style: STYLE,
  element: 'ice',
  action: 'summon',
  projection: ISO,
  parameters: {
    prismCount: 6,
    prismHeight: 1.35,
    prismRadius: 0.22,
    spread: 1.05,
    growthSteps: 3,
    shatterCount: 5,
  },
  animation: {
    frameCount: 12,
    frameDurationsMs: [80, 70, 60, 55, 50, 50, 90, 90, 45, 45, 90, 120],
    endBehavior: 'clear',
    frameIndexBase: 0,
    events: [
      { id: 'cast', frame: 0, note: 'le givre gagne le sol' },
      { id: 'peak', frame: 6, note: 'couronne complète, maintien rigide' },
      { id: 'fracture', frame: 8 },
      { id: 'settle', frame: 10 },
      { id: 'clear', frame: 11 },
    ],
  },
  clips: {
    cast: { range: [0, 2], anchor: 'ground-target', motif: 'ice-frost-patch-v1' },
    hit: { range: [3, 9], anchor: 'target', operator: 'prism', trigger: 'start' },
    residue: { range: [10, 11], anchor: 'ground-target', motif: 'ice-flake-v1' },
  },
  export: {
    directions: 8,
    directionSpace: 'world',
    framesPerDirection: 12,
    bodyProfile: 'pixel-light',
    separateEmission: true,
  },
  stage: { width: 176, height: 152, distance: 2.2, casterHeight: 0.55, targetAt: { x: 0.5, y: 0.74 } },
  silhouette:
    'Une couronne de prismes obliques qui pousse par paliers autour de la cible, tient, puis se rompt vers l’extérieur.',
};

export const ICE_L: RecipeDefinition = {
  schemaVersion: SCHEMA_VERSION,
  id: 'ice-boreal-cathedral-l',
  familyId: 'ice-aurora',
  rank: 'L',
  name: 'Cathédrale boréale',
  builder: 'ice-boreal-cathedral-l',
  seed: 1777,
  style: STYLE,
  element: 'ice',
  action: 'wave',
  projection: ISO,
  parameters: {
    frontWidth: 2.6,
    archHeight: 2.5,
    ribs: 5,
    ribRadius: 0.26,
    closure: 0.85,
    shatterCount: 6,
  },
  animation: {
    frameCount: 12,
    frameDurationsMs: [85, 75, 70, 65, 60, 60, 95, 95, 50, 55, 95, 125],
    endBehavior: 'clear',
    frameIndexBase: 0,
    events: [
      { id: 'cast', frame: 0, note: 'front de gel' },
      { id: 'peak', frame: 6, note: 'arche fermée' },
      { id: 'fracture', frame: 8 },
      { id: 'settle', frame: 10 },
      { id: 'clear', frame: 11 },
    ],
  },
  clips: {
    cast: { range: [0, 2], anchor: 'ground-source', motif: 'ice-frost-patch-v1' },
    hit: { range: [3, 9], anchor: 'target', operator: 'prism', trigger: 'start' },
    residue: { range: [10, 11], anchor: 'ground-target', motif: 'ice-shard-v1' },
  },
  export: {
    directions: 8,
    directionSpace: 'world',
    framesPerDirection: 12,
    bodyProfile: 'pixel-light',
    separateEmission: true,
  },
  stage: { width: 216, height: 184, distance: 2.6, casterHeight: 0.55, targetAt: { x: 0.5, y: 0.74 } },
  silhouette:
    'Un front de gel qui avance au sol, lève deux rangées de nervures et referme une arche au-dessus de la cible avant de la briser.',
};

// ---------------------------------------------------------------------------
// Foudre
// ---------------------------------------------------------------------------

export const LIGHTNING_S: RecipeDefinition = {
  schemaVersion: SCHEMA_VERSION,
  id: 'lightning-storm-thread-s',
  familyId: 'lightning-storm',
  rank: 'S',
  name: 'Fil d’orage',
  builder: 'lightning-storm-thread-s',
  seed: 520,
  style: STYLE,
  element: 'lightning',
  action: 'connection',
  projection: ISO,
  parameters: { segments: 7, jitter: 0.14, width: 2, forks: 2, restrikes: 2, scorchRadius: 0.55 },
  animation: {
    frameCount: 12,
    frameDurationsMs: [60, 45, 35, 30, 45, 30, 35, 45, 60, 70, 90, 110],
    endBehavior: 'clear',
    frameIndexBase: 0,
    events: [
      { id: 'cast', frame: 0, note: 'ionisation entre les deux attaches' },
      { id: 'contact', frame: 3, note: 'connexion brusque' },
      { id: 'peak', frame: 4, note: 'pose tenue' },
      { id: 'fracture', frame: 5, note: 'coupure' },
      { id: 'settle', frame: 9 },
      { id: 'clear', frame: 11 },
    ],
  },
  clips: {
    cast: { range: [0, 2], anchor: 'source', operator: 'ion-ghost' },
    hit: { range: [3, 9], anchor: 'target', operator: 'bolt-network', trigger: 'contact' },
    residue: { range: [10, 11], anchor: 'ground-target', motif: 'lightning-scorch-v1' },
  },
  export: {
    directions: 8,
    directionSpace: 'world',
    framesPerDirection: 12,
    bodyProfile: 'pixel-light',
    separateEmission: true,
  },
  stage: { width: 192, height: 144, distance: 2.8, casterHeight: 0.6, targetAt: { x: 0.52, y: 0.6 } },
  silhouette:
    'Une couture lumineuse brisée entre deux attaches : connexion brusque, pose tenue, coupure, reprise.',
};

export const LIGHTNING_M: RecipeDefinition = {
  schemaVersion: SCHEMA_VERSION,
  id: 'lightning-ionic-ricochet-m',
  familyId: 'lightning-storm',
  rank: 'M',
  name: 'Ricochet ionique',
  builder: 'lightning-ionic-ricochet-m',
  seed: 733,
  style: STYLE,
  element: 'lightning',
  action: 'connection',
  projection: ISO,
  parameters: { hops: 3, hopSpread: 1.5, segments: 6, jitter: 0.16, width: 2, nodeScale: 1 },
  animation: {
    frameCount: 12,
    frameDurationsMs: [55, 45, 35, 40, 35, 45, 35, 45, 55, 70, 90, 110],
    endBehavior: 'clear',
    frameIndexBase: 0,
    events: [
      { id: 'cast', frame: 0 },
      { id: 'contact', frame: 2, note: 'premier saut' },
      { id: 'peak', frame: 6, note: 'troisième cible atteinte' },
      { id: 'settle', frame: 9 },
      { id: 'clear', frame: 11 },
    ],
  },
  clips: {
    cast: { range: [0, 1], anchor: 'source', operator: 'ion-ghost' },
    hit: { range: [2, 9], anchor: 'target', operator: 'bolt-network', trigger: 'chain' },
    residue: { range: [10, 11], anchor: 'ground-target', motif: 'arc-spark-v1' },
  },
  export: {
    directions: 8,
    directionSpace: 'world',
    framesPerDirection: 12,
    bodyProfile: 'pixel-light',
    separateEmission: true,
  },
  stage: { width: 232, height: 160, distance: 2.4, casterHeight: 0.6, targetAt: { x: 0.5, y: 0.6 } },
  silhouette:
    'Un arc qui saute entre trois cibles : chaque saut a son nœud, sa pose tenue et sa coupure.',
};

export const LIGHTNING_L: RecipeDefinition = {
  schemaVersion: SCHEMA_VERSION,
  id: 'lightning-thunder-crown-l',
  familyId: 'lightning-storm',
  rank: 'L',
  name: 'Couronne du tonnerre',
  builder: 'lightning-thunder-crown-l',
  seed: 1290,
  style: STYLE,
  element: 'lightning',
  action: 'skystrike',
  projection: ISO,
  parameters: { columnHeight: 5, branches: 5, branchLength: 1.9, segments: 8, jitter: 0.12, width: 3, scorchRadius: 1.6 },
  animation: {
    frameCount: 12,
    frameDurationsMs: [80, 70, 50, 30, 35, 45, 35, 50, 65, 80, 95, 120],
    endBehavior: 'clear',
    frameIndexBase: 0,
    events: [
      { id: 'cast', frame: 0, note: 'l’air se charge au-dessus de la cible' },
      { id: 'contact', frame: 3, note: 'frappe céleste' },
      { id: 'peak', frame: 4 },
      { id: 'fracture', frame: 6, note: 'les branches courent au sol' },
      { id: 'settle', frame: 9 },
      { id: 'clear', frame: 11 },
    ],
  },
  clips: {
    cast: { range: [0, 2], anchor: 'sky', operator: 'ion-ghost' },
    hit: { range: [3, 9], anchor: 'ground-target', operator: 'bolt-network', trigger: 'contact' },
    residue: { range: [10, 11], anchor: 'ground-target', motif: 'lightning-scorch-v1' },
  },
  export: {
    directions: 8,
    directionSpace: 'world',
    framesPerDirection: 12,
    bodyProfile: 'pixel-light',
    separateEmission: true,
  },
  stage: { width: 208, height: 208, distance: 1.4, casterHeight: 0.6, targetAt: { x: 0.5, y: 0.76 } },
  silhouette:
    'Une colonne céleste qui frappe la cible puis distribue des branches interrompues sur le sol.',
};

export const RECIPES: readonly RecipeDefinition[] = [
  FIRE_S, FIRE_M, FIRE_L,
  ICE_S, ICE_M, ICE_L,
  LIGHTNING_S, LIGHTNING_M, LIGHTNING_L,
];

export const FAMILIES: readonly EvolutionFamily[] = [
  {
    id: 'fire-ember',
    label: 'Braise',
    element: 'fire',
    signature: {
      S: 'Masse lancée, ouverture en pétales, braises',
      M: 'Colonne ancrée au sol, pose tenue, déchirement',
      L: 'Masse rocheuse venue du ciel, impact lourd, fragments',
    },
    recipes: { S: FIRE_S.id, M: FIRE_M.id, L: FIRE_L.id },
  },
  {
    id: 'ice-aurora',
    label: 'Aurore',
    element: 'ice',
    signature: {
      S: 'Prisme unique projeté, rupture nette',
      M: 'Couronne de prismes qui pousse autour de la cible',
      L: 'Front de gel et arche refermée, puis fracture générale',
    },
    recipes: { S: ICE_S.id, M: ICE_M.id, L: ICE_L.id },
  },
  {
    id: 'lightning-storm',
    label: 'Orage',
    element: 'lightning',
    signature: {
      S: 'Une couture entre deux attaches, avec reprise',
      M: 'Trois sauts, trois nœuds, trois coupures',
      L: 'Frappe verticale et branches distribuées au sol',
    },
    recipes: { S: LIGHTNING_S.id, M: LIGHTNING_M.id, L: LIGHTNING_L.id },
  },
];

/** État d'un élément dans le catalogue. */
export type CatalogueStatus = 'delivered' | 'concept';

export type CatalogueEntry = {
  readonly element: ElementId;
  readonly label: string;
  readonly status: CatalogueStatus;
  readonly ranks: Readonly<Record<Rank, { readonly name: string; readonly pitch: string }>>;
};

/**
 * La matrice créative des douze éléments (§11). Elle distingue explicitement
 * ce qui est livré de ce qui reste un concept : une ligne de tableau ne
 * prouve pas qu'un sort existe.
 */
export const ELEMENT_MATRIX: readonly CatalogueEntry[] = [
  {
    element: 'fire', label: 'Feu', status: 'delivered',
    ranks: {
      S: { name: 'Pétale de braise', pitch: 'petite masse lancée, contact en pétales' },
      M: { name: 'Pilier du dragon', pitch: 'colonne qui jaillit du sol et se déchire' },
      L: { name: 'Cœur de comète', pitch: 'météore rocheux enflammé, chute et fragmentation' },
    },
  },
  {
    element: 'ice', label: 'Glace', status: 'delivered',
    ranks: {
      S: { name: 'Aiguille d’aurore', pitch: 'éclat rigide projeté puis cassé' },
      M: { name: 'Jardin de givre', pitch: 'couronne de prismes poussant autour de la cible' },
      L: { name: 'Cathédrale boréale', pitch: 'front de gel, arche qui se ferme puis se fracture' },
    },
  },
  {
    element: 'lightning', label: 'Foudre', status: 'delivered',
    ranks: {
      S: { name: 'Fil d’orage', pitch: 'décharge courte entre deux attaches' },
      M: { name: 'Ricochet ionique', pitch: 'arc qui saute entre trois cibles' },
      L: { name: 'Couronne du tonnerre', pitch: 'frappe céleste et branches au sol' },
    },
  },
  {
    element: 'water', label: 'Eau', status: 'concept',
    ranks: {
      S: { name: 'Perle vive', pitch: 'goutte compacte qui éclabousse' },
      M: { name: 'Crête d’écume', pitch: 'vague directionnelle qui se replie' },
      L: { name: 'Marée souveraine', pitch: 'front d’eau large qui se dresse puis déferle' },
    },
  },
  {
    element: 'earth', label: 'Terre', status: 'concept',
    ranks: {
      S: { name: 'Éclat de schiste', pitch: 'projectile rocheux et débris lourds' },
      M: { name: 'Dents de faille', pitch: 'plaques qui se soulèvent en ligne' },
      L: { name: 'Poing tectonique', pitch: 'une masse du sol se dresse et retombe en blocs' },
    },
  },
  {
    element: 'wind', label: 'Vent', status: 'concept',
    ranks: {
      S: { name: 'Lame d’air', pitch: 'croissant rapide et bref' },
      M: { name: 'Vrille sylphe', pitch: 'vortex étroit qui entraîne des débris' },
      L: { name: 'Œil du cyclone', pitch: 'grande spirale creuse, compression puis expulsion' },
    },
  },
  {
    element: 'poison', label: 'Poison', status: 'concept',
    ranks: {
      S: { name: 'Goutte caustique', pitch: 'goutte visqueuse et dépôt' },
      M: { name: 'Floraison toxique', pitch: 'bulle gonflée qui libère une nappe basse' },
      L: { name: 'Chaudron pestilentiel', pitch: 'boursouflures qui se rejoignent et éclatent' },
    },
  },
  {
    element: 'magma', label: 'Magma', status: 'concept',
    ranks: {
      S: { name: 'Scorie vive', pitch: 'fragment à croûte sombre et cœur chaud' },
      M: { name: 'Veine ardente', pitch: 'fissure qui se remplit puis projette de la lave' },
      L: { name: 'Bouche du volcan', pitch: 'cône brisé, éruption et chute de scories' },
    },
  },
  {
    element: 'light', label: 'Lumière', status: 'concept',
    ranks: {
      S: { name: 'Éclat votif', pitch: 'losange qui frappe puis s’éteint' },
      M: { name: 'Prisme solaire', pitch: 'faisceaux qui convergent sur un foyer' },
      L: { name: 'Porte de l’aube', pitch: 'sceau qui s’ouvre en plans lumineux puis se referme' },
    },
  },
  {
    element: 'dark', label: 'Ténèbres', status: 'concept',
    ranks: {
      S: { name: 'Griffe d’ombre', pitch: 'croissant coupant et rétraction' },
      M: { name: 'Nœud du vide', pitch: 'rubans aspirés dans une cavité' },
      L: { name: 'Éclipse dévorante', pitch: 'couronne sombre, effondrement du centre' },
    },
  },
  {
    element: 'metal', label: 'Métal', status: 'concept',
    ranks: {
      S: { name: 'Épine d’acier', pitch: 'lame projetée et ricochet' },
      M: { name: 'Éventail des lames', pitch: 'gerbe de lames rigides' },
      L: { name: 'Enclume céleste', pitch: 'masse forgée qui tombe, se fend et disperse des plaques' },
    },
  },
  {
    element: 'nature', label: 'Nature', status: 'concept',
    ranks: {
      S: { name: 'Épine vive', pitch: 'dard végétal et deux feuilles' },
      M: { name: 'Étreinte des ronces', pitch: 'vrilles qui entourent la cible' },
      L: { name: 'Arbre éveillé', pitch: 'racines, tronc stylisé, ouverture d’une couronne' },
    },
  },
];
