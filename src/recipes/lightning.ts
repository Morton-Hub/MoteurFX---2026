/**
 * Famille de la foudre — trois rangs, trois constructions.
 *
 *  S  Fil d’orage         : une couture entre deux attaches, avec reprise.
 *  M  Ricochet ionique    : trois sauts, trois nœuds, trois coupures.
 *  L  Couronne du tonnerre: une frappe verticale et des branches au sol.
 *
 * L'élément vit de **poses intermittentes** : une décharge est dessinée, tenue,
 * coupée, puis reprise ailleurs. Un trait qui tremble à chaque image n'est pas
 * de la foudre, c'est du bruit (§3).
 */

import type { Vec3 } from '../core/math.js';
import { getMaterial } from '../pixels/palette.js';
import { paintEmissive, paintRole } from '../pixels/shade.js';
import { ARC_SPARK, BOLT_FORK, BOLT_NODE, GROUND_ARC } from '../motifs/index.js';
import { boltForks, boltMask, boltNodes, boltPath, ionMask } from '../geometry/bolt.js';
import { paintGroundMark } from '../geometry/ground.js';
import type { FrameContext } from '../renderer/context.js';
import type { Piece } from '../renderer/piece.js';
import { motifPiece, piece, scatterMotifs } from './common.js';
import type { ParamBag, ParamSpec } from './params.js';
import type { SpellBuilder } from './types.js';

/** Décharge peinte : masse émissive à cœur clair, sans halo. */
function boltPiece(
  ctx: FrameContext,
  o: {
    id: string;
    paths: readonly (readonly Vec3[])[];
    at: Vec3;
    width: number;
    material?: 'lightning.bolt' | 'lightning.ion';
    bias?: number;
    ceiling?: number;
    depthBias?: number;
  },
): Piece {
  const mask = boltMask(ctx, o.paths, o.width, 0.45);
  const material = getMaterial(o.material ?? 'lightning.bolt');
  return {
    id: o.id,
    depth: ctx.depth(o.at) + (o.depthBias ?? 0),
    paint: (canvas, c) => {
      paintEmissive(canvas, mask, material, {
        style: c.style,
        seed: c.seed,
        // Une décharge est **lisse** : sa valeur vient de l'épaisseur seule.
        core: Math.max(1.4, o.width * 0.75),
        turbulence: 0.08,
        grain: 2,
        ...(o.bias !== undefined ? { bias: o.bias } : {}),
        ...(o.ceiling !== undefined ? { ceiling: o.ceiling } : {}),
      });
    },
  };
}

// ---------------------------------------------------------------------------
// S — Fil d’orage
// ---------------------------------------------------------------------------

const THREAD_PARAMS: ParamSpec[] = [
  { key: 'segments', label: 'Segments', kind: 'integer', default: 7, min: 3, max: 12, step: 1, group: 'Silhouette' },
  { key: 'jitter', label: 'Brisure', kind: 'number', default: 0.14, min: 0.02, max: 0.4, step: 0.01, group: 'Silhouette' },
  { key: 'width', label: 'Épaisseur', kind: 'number', default: 2, min: 1, max: 5, step: 0.5, unit: 'px', group: 'Silhouette' },
  { key: 'forks', label: 'Fourches', kind: 'integer', default: 2, min: 0, max: 6, step: 1, group: 'Silhouette' },
  { key: 'restrikes', label: 'Reprises', kind: 'integer', default: 2, min: 0, max: 3, step: 1, group: 'Geste', help: 'Nombre de décharges distinctes après la coupure' },
  { key: 'scorchRadius', label: 'Marque au sol', kind: 'number', default: 0.55, min: 0, max: 2, step: 0.05, unit: 'tuile', group: 'Conséquence' },
];

function threadBuild(ctx: FrameContext, p: ParamBag): Piece[] {
  const segments = p.int('segments');
  const jitter = p.num('jitter');
  const width = p.num('width');
  const forks = p.int('forks');
  const restrikes = p.int('restrikes');
  const scorchRadius = p.num('scorchRadius');
  const i = ctx.index;
  const out: Piece[] = [];
  const hand = ctx.wl(0.3, 0.18, 0);
  const hit: Vec3 = { x: ctx.target.x, y: ctx.target.y, z: 0.65 };
  const middle: Vec3 = { x: (hand.x + hit.x) / 2, y: (hand.y + hit.y) / 2, z: (hand.z + hit.z) / 2 };

  /**
   * Une décharge porte l'identifiant de **sa** frappe, pas celui de la frame :
   * la même frappe garde exactement le même dessin tant qu'elle est tenue.
   */
  const strike = (strikeId: string, progress = 1) => {
    const path = boltPath(ctx, { id: strikeId, from: hand, to: hit, seed: ctx.seed, segments, jitter, progress });
    const branches = boltForks(ctx, path, { id: strikeId, seed: ctx.seed, count: forks, lengthRatio: 0.28 });
    return { path, branches };
  };

  if (i <= 2) {
    // Ionisation : le chemin existe avant la lumière. Large, sombre, tenu.
    const { path } = strike('main', i === 2 ? 1 : 0.55 + 0.2 * i);
    const mask = ionMask(ctx, [path], width + 1.5);
    out.push(
      piece('ion', ctx.depth(middle) - 0.2, (canvas, c) => {
        paintEmissive(canvas, mask, getMaterial('lightning.ion'), {
          style: c.style,
          seed: c.seed,
          core: 2.6,
          turbulence: 0.12,
          ceiling: 0.55 + 0.15 * i,
          bias: -0.25 + 0.12 * i,
        });
      }),
    );
    out.push(
      motifPiece(ctx, { id: 'hand-node', motif: BOLT_NODE, at: hand, frame: i % 2, scale: 1 }),
    );
    return out;
  }

  if (i <= 5) {
    // Connexion brusque (3), pose tenue (4), coupure (5).
    if (i === 5) {
      // La coupure est un vrai vide : seuls quelques arcs résiduels restent.
      const { path } = strike('main');
      const nodes = boltNodes([path]);
      for (let n = 0; n < nodes.length; n += 2) {
        out.push(
          motifPiece(ctx, { id: `residual#${n}`, motif: ARC_SPARK, at: nodes[n] as Vec3, frame: 0 }),
        );
      }
      return out;
    }
    const { path, branches } = strike('main');
    out.push(boltPiece(ctx, { id: 'main', paths: [path], at: middle, width: width + (i === 3 ? 0.5 : 0) }));
    out.push(boltPiece(ctx, { id: 'branches', paths: branches, at: middle, width: Math.max(1, width - 1), bias: -0.15 }));
    out.push(motifPiece(ctx, { id: 'hand-node', motif: BOLT_NODE, at: hand, frame: 0 }));
    out.push(motifPiece(ctx, { id: 'hit-node', motif: BOLT_NODE, at: hit, frame: i === 3 ? 0 : 1 }));
    if (i === 4) {
      out.push(motifPiece(ctx, { id: 'fork-a', motif: BOLT_FORK, at: hit, frame: 0, flipX: true }));
    }
    return out;
  }

  if (i <= 9) {
    // Reprises : d'autres frappes, d'autres dessins, sur la même attache.
    const k = i - 6;
    const active = k < restrikes * 2;
    if (active && k % 2 === 0) {
      const { path, branches } = strike(`restrike#${k / 2}`);
      out.push(boltPiece(ctx, { id: 'restrike', paths: [path], at: middle, width, bias: -0.08 }));
      out.push(boltPiece(ctx, { id: 'restrike-branch', paths: branches, at: middle, width: Math.max(1, width - 1), bias: -0.2 }));
      out.push(motifPiece(ctx, { id: 'hit-node', motif: BOLT_NODE, at: hit, frame: 1 }));
    } else {
      out.push(
        ...scatterMotifs(ctx, {
          id: 'arc',
          motif: ARC_SPARK,
          center: hit,
          count: Math.max(1, 3 - k),
          radius: 0.5,
          spread: 0.5 + 0.2 * k,
          lift: 0.2,
          gravity: 0.6,
          frame: () => (k > 1 ? 1 : 0),
        }),
      );
    }
    if (scorchRadius > 0) {
      out.push(
        piece('scorch', ctx.depth(ctx.target) - 2, (canvas, c) => {
          paintGroundMark(canvas, c, ctx.target, scorchRadius, 'lightning.scorch', {
            id: 'scorch',
            density: 0.7,
          });
        }),
      );
    }
    return out;
  }

  // Résidu : la marque au sol se retire, un dernier arc s'éteint.
  const k = i - 10;
  if (scorchRadius > 0) {
    out.push(
      piece('scorch', ctx.depth(ctx.target) - 2, (canvas, c) => {
        paintGroundMark(canvas, c, ctx.target, scorchRadius * (1 - 0.25 * k), 'lightning.scorch', {
          id: 'scorch',
          density: 0.6 - 0.25 * k,
        });
      }),
    );
    out.push(motifPiece(ctx, { id: 'ground-arc', motif: GROUND_ARC, at: ctx.target, frame: 0, roleShift: -k }));
  }
  if (k === 0) {
    out.push(motifPiece(ctx, { id: 'last-arc', motif: ARC_SPARK, at: { ...hit, z: 0.35 }, frame: 1 }));
  }
  return out;
}

export const LIGHTNING_STORM_THREAD: SpellBuilder = {
  id: 'lightning-storm-thread-s',
  label: 'Fil d’orage',
  element: 'lightning',
  rank: 'S',
  action: 'connection',
  params: THREAD_PARAMS,
  uses: {
    motifs: ['bolt-node-v1', 'arc-spark-v1', 'bolt-fork-v1', 'lightning-scorch-v1'],
    operators: ['ion-ghost', 'bolt-network', 'ground-mark'],
  },
  build: threadBuild,
};

// ---------------------------------------------------------------------------
// M — Ricochet ionique
// ---------------------------------------------------------------------------

const RICOCHET_PARAMS: ParamSpec[] = [
  { key: 'hops', label: 'Cibles', kind: 'integer', default: 3, min: 2, max: 5, step: 1, group: 'Geste' },
  { key: 'hopSpread', label: 'Écart entre cibles', kind: 'number', default: 1.5, min: 0.6, max: 3, step: 0.1, unit: 'tuile', group: 'Geste' },
  { key: 'segments', label: 'Segments', kind: 'integer', default: 6, min: 3, max: 12, step: 1, group: 'Silhouette' },
  { key: 'jitter', label: 'Brisure', kind: 'number', default: 0.16, min: 0.02, max: 0.4, step: 0.01, group: 'Silhouette' },
  { key: 'width', label: 'Épaisseur', kind: 'number', default: 2, min: 1, max: 5, step: 0.5, unit: 'px', group: 'Silhouette' },
  { key: 'nodeScale', label: 'Taille des nœuds', kind: 'number', default: 1, min: 1, max: 2, step: 1, group: 'Silhouette' },
];

function ricochetBuild(ctx: FrameContext, p: ParamBag): Piece[] {
  const hops = p.int('hops');
  const hopSpread = p.num('hopSpread');
  const segments = p.int('segments');
  const jitter = p.num('jitter');
  const width = p.num('width');
  const nodeScale = p.int('nodeScale');
  const i = ctx.index;
  const out: Piece[] = [];
  const hand = ctx.wl(0.3, 0.18, 0);

  // Les cibles sont réparties autour de la cible principale, dans le repère
  // du cap : la chaîne tourne avec le sort.
  const targets: Vec3[] = [];
  for (let k = 0; k < hops; k++) {
    const gid = `hop#${k}`;
    const a = ctx.heading + (k - (hops - 1) / 2) * 0.9 + (ctx.rnd(gid, 1) - 0.5) * 0.4;
    const r = k === 0 ? 0 : hopSpread * (0.7 + 0.5 * ctx.rnd(gid, 2)) * k;
    targets.push({
      x: ctx.target.x + Math.cos(a) * r,
      y: ctx.target.y + Math.sin(a) * r,
      z: 0.6 + 0.25 * ctx.rnd(gid, 3),
    });
  }

  const link = (from: Vec3, to: Vec3, id: string) => {
    const path = boltPath(ctx, { id, from, to, seed: ctx.seed, segments, jitter });
    const branches = boltForks(ctx, path, { id, seed: ctx.seed, count: 1, lengthRatio: 0.25 });
    const middle: Vec3 = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, z: (from.z + to.z) / 2 };
    return { path, branches, middle };
  };

  if (i <= 1) {
    const { path, middle } = link(hand, targets[0] as Vec3, 'hop0');
    const mask = ionMask(ctx, [path], width + 1);
    out.push(
      piece('ion', ctx.depth(middle), (canvas, c) => {
        paintEmissive(canvas, mask, getMaterial('lightning.ion'), {
          style: c.style,
          seed: c.seed,
          core: 2.4,
          turbulence: 0.1,
          ceiling: 0.5 + 0.2 * i,
          bias: -0.2,
        });
      }),
    );
    out.push(motifPiece(ctx, { id: 'hand-node', motif: BOLT_NODE, at: hand, frame: i }));
    return out;
  }

  if (i <= 7) {
    // Trois sauts : chaque saut a sa frappe (2, 4, 6) et sa tenue (3, 5, 7).
    const step = Math.min(hops - 1, Math.floor((i - 2) / 2));
    const fresh = (i - 2) % 2 === 0;
    for (let k = 0; k <= step; k++) {
      const from = k === 0 ? hand : (targets[k - 1] as Vec3);
      const to = targets[k] as Vec3;
      const { path, branches, middle } = link(from, to, `hop${k}`);
      const age = step - k;
      out.push(
        boltPiece(ctx, {
          id: `link#${k}`,
          paths: [path],
          at: middle,
          width: Math.max(1, width - age * 0.5),
          bias: -0.12 * age,
          ceiling: 1 - 0.18 * age,
        }),
      );
      if (age === 0) {
        out.push(boltPiece(ctx, { id: `link-branch#${k}`, paths: branches, at: middle, width: Math.max(1, width - 1), bias: -0.2 }));
      }
      out.push(
        motifPiece(ctx, {
          id: `node#${k}`,
          motif: BOLT_NODE,
          at: to,
          frame: age === 0 && fresh ? 0 : 1,
          scale: nodeScale,
        }),
      );
      out.push(
        piece(`mark#${k}`, ctx.depth({ x: to.x, y: to.y, z: 0 }) - 2, (canvas, c) => {
          paintGroundMark(canvas, c, { x: to.x, y: to.y, z: 0 }, 0.5, 'lightning.scorch', {
            id: `mark#${k}`,
            density: 0.6 - 0.12 * age,
          });
        }),
      );
    }
    return out;
  }

  if (i <= 9) {
    // Coupure : les liens disparaissent, les nœuds restent une image de plus.
    const k = i - 8;
    for (let n = 0; n < hops; n++) {
      const to = targets[n] as Vec3;
      out.push(
        motifPiece(ctx, { id: `node#${n}`, motif: BOLT_NODE, at: to, frame: 1, roleShift: -k }),
      );
      out.push(
        piece(`mark#${n}`, ctx.depth({ x: to.x, y: to.y, z: 0 }) - 2, (canvas, c) => {
          paintGroundMark(canvas, c, { x: to.x, y: to.y, z: 0 }, 0.5, 'lightning.scorch', {
            id: `mark#${n}`,
            density: 0.6 - 0.15 * k,
          });
        }),
      );
    }
    out.push(
      ...scatterMotifs(ctx, {
        id: 'arc',
        motif: ARC_SPARK,
        center: targets[hops - 1] as Vec3,
        count: 3 - k,
        radius: 0.6,
        spread: 0.5 + 0.3 * k,
        lift: 0.2,
        gravity: 0.5,
        frame: () => k,
      }),
    );
    return out;
  }

  const k = i - 10;
  for (let n = 0; n < hops; n++) {
    const to = targets[n] as Vec3;
    out.push(
      piece(`mark#${n}`, ctx.depth({ x: to.x, y: to.y, z: 0 }) - 2, (canvas, c) => {
        paintGroundMark(canvas, c, { x: to.x, y: to.y, z: 0 }, 0.5 - 0.1 * k, 'lightning.scorch', {
          id: `mark#${n}`,
          density: 0.5 - 0.2 * k,
        });
      }),
    );
    if (k === 0 && n === hops - 1) {
      out.push(motifPiece(ctx, { id: 'last-arc', motif: ARC_SPARK, at: to, frame: 1 }));
    }
  }
  return out;
}

export const LIGHTNING_IONIC_RICOCHET: SpellBuilder = {
  id: 'lightning-ionic-ricochet-m',
  label: 'Ricochet ionique',
  element: 'lightning',
  rank: 'M',
  action: 'connection',
  params: RICOCHET_PARAMS,
  uses: {
    motifs: ['bolt-node-v1', 'arc-spark-v1'],
    operators: ['ion-ghost', 'bolt-network', 'ground-mark'],
  },
  build: ricochetBuild,
};

// ---------------------------------------------------------------------------
// L — Couronne du tonnerre
// ---------------------------------------------------------------------------

const CROWN_PARAMS: ParamSpec[] = [
  { key: 'columnHeight', label: 'Hauteur de la frappe', kind: 'number', default: 5, min: 2, max: 9, step: 0.2, unit: 'tuile', group: 'Silhouette' },
  { key: 'branches', label: 'Branches au sol', kind: 'integer', default: 5, min: 2, max: 10, step: 1, group: 'Conséquence' },
  { key: 'branchLength', label: 'Longueur des branches', kind: 'number', default: 1.9, min: 0.5, max: 4, step: 0.1, unit: 'tuile', group: 'Conséquence' },
  { key: 'segments', label: 'Segments', kind: 'integer', default: 8, min: 3, max: 14, step: 1, group: 'Silhouette' },
  { key: 'jitter', label: 'Brisure', kind: 'number', default: 0.12, min: 0.02, max: 0.4, step: 0.01, group: 'Silhouette' },
  { key: 'width', label: 'Épaisseur', kind: 'number', default: 3, min: 1, max: 6, step: 0.5, unit: 'px', group: 'Silhouette' },
  { key: 'scorchRadius', label: 'Rayon de la marque', kind: 'number', default: 1.6, min: 0.3, max: 3.5, step: 0.1, unit: 'tuile', group: 'Conséquence' },
];

function crownBuild(ctx: FrameContext, p: ParamBag): Piece[] {
  const columnHeight = p.num('columnHeight');
  const branchCount = p.int('branches');
  const branchLength = p.num('branchLength');
  const segments = p.int('segments');
  const jitter = p.num('jitter');
  const width = p.num('width');
  const scorchRadius = p.num('scorchRadius');
  const i = ctx.index;
  const out: Piece[] = [];
  const ground: Vec3 = { x: ctx.target.x, y: ctx.target.y, z: 0 };
  const sky: Vec3 = { x: ctx.target.x, y: ctx.target.y, z: columnHeight };
  const middle: Vec3 = { x: ground.x, y: ground.y, z: columnHeight * 0.5 };

  const column = (id: string, progress = 1) =>
    boltPath(ctx, { id, from: sky, to: ground, seed: ctx.seed, segments, jitter, progress });

  /** Branches au sol : elles partent du point d'impact, dans le repère du cap. */
  const groundBranches = (id: string, extent: number): Vec3[][] => {
    const paths: Vec3[][] = [];
    for (let k = 0; k < branchCount; k++) {
      const gid = `${id}/branch#${k}`;
      const a = ctx.heading + (k / branchCount) * Math.PI * 2 + ctx.rnd(gid, 1) * 0.5;
      const len = branchLength * (0.55 + 0.7 * ctx.rnd(gid, 2)) * extent;
      const to: Vec3 = { x: ground.x + Math.cos(a) * len, y: ground.y + Math.sin(a) * len, z: 0.04 };
      paths.push(boltPath(ctx, { id: gid, from: { ...ground, z: 0.06 }, to, seed: ctx.seed, segments: 4, jitter: 0.22 }));
    }
    return paths;
  };

  if (i <= 2) {
    // L'air se charge : une colonne d'ionisation descend sans frapper.
    const path = column('charge', 0.4 + 0.3 * i);
    const mask = ionMask(ctx, [path], width);
    out.push(
      piece('charge', ctx.depth(middle), (canvas, c) => {
        paintEmissive(canvas, mask, getMaterial('lightning.ion'), {
          style: c.style,
          seed: c.seed,
          core: 2.8,
          turbulence: 0.1,
          ceiling: 0.45 + 0.15 * i,
          bias: -0.3 + 0.12 * i,
        });
      }),
    );
    out.push(
      piece('pre-mark', ctx.depth(ground) - 2, (canvas, c) => {
        paintGroundMark(canvas, c, ground, scorchRadius * (0.3 + 0.15 * i), 'lightning.scorch', {
          id: 'pre-mark',
          density: 0.4 + 0.1 * i,
        });
      }),
    );
    return out;
  }

  if (i <= 5) {
    // Frappe (3), tenue (4), coupure partielle (5).
    const hold = i - 3;
    if (i === 5) {
      const path = column('strike', 0.45);
      out.push(boltPiece(ctx, { id: 'strike', paths: [path], at: middle, width: Math.max(1, width - 1.5), bias: -0.25, ceiling: 0.7 }));
    } else {
      const path = column('strike');
      const forks = boltForks(ctx, path, { id: 'strike', seed: ctx.seed, count: 3, lengthRatio: 0.3 });
      out.push(boltPiece(ctx, { id: 'strike', paths: [path], at: middle, width: width + (i === 3 ? 1 : 0) }));
      out.push(boltPiece(ctx, { id: 'strike-forks', paths: forks, at: middle, width: Math.max(1, width - 1.5), bias: -0.15 }));
    }
    out.push(motifPiece(ctx, { id: 'impact-node', motif: BOLT_NODE, at: { ...ground, z: 0.15 }, frame: hold === 0 ? 0 : 1, scale: 2 }));
    out.push(
      piece('mark', ctx.depth(ground) - 2, (canvas, c) => {
        paintGroundMark(canvas, c, ground, scorchRadius * (0.75 + 0.12 * hold), 'lightning.scorch', {
          id: 'mark',
          density: 0.85,
        });
      }),
    );
    out.push(motifPiece(ctx, { id: 'ground-arc', motif: GROUND_ARC, at: ground, frame: 0 }));
    return out;
  }

  if (i <= 9) {
    // Les branches courent au sol, puis s'interrompent une à une.
    const k = i - 6;
    const extent = [0.6, 1, 1, 0.9][k] ?? 1;
    const paths = groundBranches('run', extent);
    const alive = k < 2 ? paths : paths.slice(0, Math.max(1, branchCount - 2 * (k - 1)));
    out.push(
      piece('mark', ctx.depth(ground) - 2, (canvas, c) => {
        paintGroundMark(canvas, c, ground, scorchRadius, 'lightning.scorch', { id: 'mark', density: 0.85 - 0.1 * k });
      }),
    );
    out.push(motifPiece(ctx, { id: 'ground-arc', motif: GROUND_ARC, at: ground, frame: 0, roleShift: -Math.floor(k / 2) }));
    out.push(
      boltPiece(ctx, {
        id: 'run',
        paths: alive,
        at: { ...ground, z: 0.05 },
        width: Math.max(1, width - 1 - 0.4 * k),
        bias: -0.1 * k,
        ceiling: 1 - 0.14 * k,
        depthBias: 0.5,
      }),
    );
    if (k === 0) {
      const tail = column('strike', 0.3);
      out.push(boltPiece(ctx, { id: 'tail', paths: [tail], at: middle, width: Math.max(1, width - 2), bias: -0.3, ceiling: 0.65 }));
    }
    for (let n = 0; n < Math.max(0, 3 - k); n++) {
      const gid = `spark#${n}`;
      const a = ctx.heading + ctx.rnd(gid, 1) * Math.PI * 2;
      const r = scorchRadius * (0.5 + ctx.rnd(gid, 2));
      out.push(
        motifPiece(ctx, {
          id: gid,
          motif: ARC_SPARK,
          at: { x: ground.x + Math.cos(a) * r, y: ground.y + Math.sin(a) * r, z: 0.1 + 0.3 * ctx.rnd(gid, 3) },
          frame: k > 1 ? 1 : 0,
        }),
      );
    }
    return out;
  }

  // Résidu : la marque et deux branches faibles, puis plus rien.
  const k = i - 10;
  out.push(
    piece('mark', ctx.depth(ground) - 2, (canvas, c) => {
      paintGroundMark(canvas, c, ground, scorchRadius * (1 - 0.2 * k), 'lightning.scorch', {
        id: 'mark',
        density: 0.6 - 0.25 * k,
      });
    }),
  );
  out.push(motifPiece(ctx, { id: 'ground-arc', motif: GROUND_ARC, at: ground, frame: 0, roleShift: -1 - k }));
  if (k === 0) {
    const paths = groundBranches('rest', 0.7).slice(0, 2);
    const mask = boltMask(ctx, paths, 1, 0.3);
    out.push(
      piece('rest', ctx.depth(ground) + 0.5, (canvas) => {
        paintRole(canvas, mask, getMaterial('lightning.ion'), 'body');
      }),
    );
  }
  return out;
}

export const LIGHTNING_THUNDER_CROWN: SpellBuilder = {
  id: 'lightning-thunder-crown-l',
  label: 'Couronne du tonnerre',
  element: 'lightning',
  rank: 'L',
  action: 'skystrike',
  params: CROWN_PARAMS,
  uses: {
    motifs: ['bolt-node-v1', 'arc-spark-v1', 'lightning-scorch-v1'],
    operators: ['ion-ghost', 'bolt-network', 'ground-mark'],
  },
  build: crownBuild,
};

export const LIGHTNING_BUILDERS: readonly SpellBuilder[] = [
  LIGHTNING_STORM_THREAD,
  LIGHTNING_IONIC_RICOCHET,
  LIGHTNING_THUNDER_CROWN,
];
