/**
 * Famille de la glace — trois rangs, trois constructions.
 *
 *  S  Aiguille d’aurore    : un prisme unique, projeté puis rompu net.
 *  M  Jardin de givre      : une couronne de prismes qui pousse par paliers.
 *  L  Cathédrale boréale   : un front de gel et une arche qui se referme.
 *
 * La glace est rigide : elle ne se déforme jamais, elle **casse**. Aucune de
 * ces recettes n'utilise de primitive ronde, et aucune ne se contente d'être
 * un pic de terre repeint en bleu (§3).
 */

import { add3, clamp01, norm3, scale3, type Vec3 } from '../core/math.js';
import { getMaterial } from '../pixels/palette.js';
import { paintRole } from '../pixels/shade.js';
import { ICE_FLAKE, ICE_FRACTURE, ICE_MOTE, ICE_SHARD, FROST_PATCH } from '../motifs/index.js';
import { prism } from '../geometry/forms.js';
import { paintSolidObject } from '../geometry/solid.js';
import { groundCracks, paintGroundMark } from '../geometry/ground.js';
import { lineTrajectory } from '../geometry/paths.js';
import type { FrameContext } from '../renderer/context.js';
import type { Piece } from '../renderer/piece.js';
import { motifPiece, piece, scatterMotifs, shadowPiece } from './common.js';
import type { ParamBag, ParamSpec } from './params.js';
import type { SpellBuilder } from './types.js';

/** Prisme peint comme un objet entier : facettes triées, liseré, contour. */
function prismPiece(
  ctx: FrameContext,
  o: {
    id: string;
    base: Vec3;
    axis: Vec3;
    length: number;
    radius: number;
    sides: number;
    roll?: number;
    bias?: number;
    irregular?: number;
    taper?: number;
    tip?: number;
    depthBias?: number;
  },
): Piece {
  const solid = prism({
    id: o.id,
    seed: ctx.seed,
    base: o.base,
    axis: o.axis,
    length: o.length,
    radius: o.radius,
    sides: o.sides,
    ...(o.roll !== undefined ? { roll: o.roll } : {}),
    ...(o.irregular !== undefined ? { irregular: o.irregular } : {}),
    ...(o.taper !== undefined ? { taper: o.taper } : {}),
    ...(o.tip !== undefined ? { tip: o.tip } : {}),
  });
  return {
    id: o.id,
    depth: ctx.depth(solid.center) + (o.depthBias ?? 0),
    paint: (canvas, c) => {
      paintSolidObject(canvas, c, solid, {
        material: getMaterial('ice.crystal'),
        rim: 'accent',
        contact: 'deep',
        ...(o.bias !== undefined ? { bias: o.bias } : {}),
      });
    },
  };
}

// ---------------------------------------------------------------------------
// S — Aiguille d’aurore
// ---------------------------------------------------------------------------

const NEEDLE_PARAMS: ParamSpec[] = [
  { key: 'crystalLength', label: 'Longueur du prisme', kind: 'number', default: 1.15, min: 0.4, max: 2.2, step: 0.05, unit: 'tuile', group: 'Silhouette' },
  { key: 'crystalRadius', label: 'Épaisseur du prisme', kind: 'number', default: 0.17, min: 0.06, max: 0.4, step: 0.01, unit: 'tuile', group: 'Silhouette' },
  { key: 'facets', label: 'Pans', kind: 'integer', default: 6, min: 3, max: 8, step: 1, group: 'Silhouette' },
  { key: 'facetContrast', label: 'Contraste des facettes', kind: 'number', default: 0.8, min: 0, max: 1.5, step: 0.05, group: 'Matière' },
  { key: 'fragmentCount', label: 'Fragments', kind: 'integer', default: 5, min: 0, max: 12, step: 1, group: 'Rupture' },
  { key: 'frostRadius', label: 'Rayon de givre', kind: 'number', default: 0.9, min: 0, max: 2.5, step: 0.1, unit: 'tuile', group: 'Conséquence' },
];

/** Paliers de croissance : la glace pousse par à-coups, pas en continu. */
const NEEDLE_GROWTH = [0.32, 0.72, 1];
const NEEDLE_FLIGHT = [0.32, 0.62, 0.86];

function needleBuild(ctx: FrameContext, p: ParamBag): Piece[] {
  const length = p.num('crystalLength');
  const radius = p.num('crystalRadius');
  const facets = p.int('facets');
  const contrast = p.num('facetContrast');
  const fragmentCount = p.int('fragmentCount');
  const frostRadius = p.num('frostRadius');
  const i = ctx.index;
  const out: Piece[] = [];
  // Le contraste de facettes est un décalage de rampe : à 0,8 les faces
  // restent dans la moitié claire, à 1,5 le prisme devient tranchant.
  const bias = (contrast - 0.8) * 0.18;

  const hand = ctx.wl(0.28, 0.2, 0);
  const impact: Vec3 = { x: ctx.target.x, y: ctx.target.y, z: 0.42 };
  const path = lineTrajectory(hand, impact, 0.12);
  const axis = norm3({ x: impact.x - hand.x, y: impact.y - hand.y, z: impact.z - hand.z });

  if (i <= 2) {
    const grow = NEEDLE_GROWTH[i] ?? 1;
    const base = i === 2 ? path.at(0.06) : hand;
    out.push(
      prismPiece(ctx, {
        id: 'needle',
        base: add3(base, scale3(axis, -length * grow * 0.5)),
        axis,
        length: length * grow,
        radius: radius * (0.7 + 0.3 * grow),
        sides: facets,
        bias,
        roll: 0.4,
      }),
    );
    // Poudrin d'accompagnement : rare, et il ne remplace pas la silhouette.
    out.push(
      ...scatterMotifs(ctx, {
        id: 'mote',
        motif: ICE_MOTE,
        center: base,
        count: i + 1,
        radius: 0.4,
        spread: 0.5 + 0.2 * i,
        lift: 0.3,
        gravity: 0.2,
        frame: () => (i === 2 ? 1 : 0),
      }),
    );
    return out;
  }

  if (i <= 5) {
    const t = NEEDLE_FLIGHT[i - 3] ?? 0.5;
    const at = path.at(t);
    out.push(shadowPiece(ctx, 'shadow', at, radius * 2.6, 0.5));
    out.push(
      prismPiece(ctx, {
        id: 'needle',
        base: add3(at, scale3(axis, -length * 0.55)),
        axis,
        length,
        radius,
        sides: facets,
        bias,
        roll: 0.4,
      }),
    );
    // Traînée : deux poudrins qui finissent leur mouvement derrière la pointe.
    for (let k = 1; k <= 2; k++) {
      const back = path.at(Math.max(0, t - 0.12 * k));
      out.push(
        motifPiece(ctx, {
          id: `wake#${k}`,
          motif: ICE_MOTE,
          at: add3(back, { x: 0, y: 0, z: 0.05 * k }),
          frame: k - 1,
        }),
      );
    }
    return out;
  }

  if (i === 6) {
    // Contact : la pointe entre, le corps se fend. Pas de flash blanc.
    out.push(shadowPiece(ctx, 'shadow', impact, radius * 3, 0.5));
    out.push(
      prismPiece(ctx, {
        id: 'needle',
        base: add3(impact, scale3(axis, -length * 0.75)),
        axis,
        length: length * 0.82,
        radius: radius * 1.05,
        sides: facets,
        bias: bias - 0.05,
        roll: 0.4,
      }),
    );
    out.push(
      motifPiece(ctx, { id: 'fracture', motif: ICE_FRACTURE, at: impact, frame: 0, scale: 2 }),
    );
    const cracks = groundCracks(ctx, ctx.target, { id: 'ice-cracks', seed: ctx.seed, count: 3, length: frostRadius * 0.8, width: 1, angleOffset: ctx.heading });
    out.push(
      piece('ice-cracks', ctx.depth(ctx.target) - 1, (canvas) => {
        paintRole(canvas, cracks, getMaterial('ice.frost'), 'light');
      }),
    );
    return out;
  }

  if (i <= 8) {
    // Rupture : la matière ne s'estompe pas, elle se sépare en facettes plates.
    const k = i - 7;
    out.push(
      motifPiece(ctx, { id: 'fracture', motif: ICE_FRACTURE, at: impact, frame: 1, scale: 2 - k, roleShift: -k }),
    );
    out.push(
      prismPiece(ctx, {
        id: 'stump',
        base: add3(impact, scale3(axis, -length * 0.5)),
        axis,
        length: length * (0.34 - 0.12 * k),
        radius: radius * 0.85,
        sides: facets,
        bias: bias + 0.1,
        roll: 0.4,
      }),
    );
    for (let f = 0; f < fragmentCount; f++) {
      const gid = `shard#${f}`;
      const a = ctx.rnd(gid, 1) * Math.PI * 2;
      const rise = 0.35 + 0.5 * ctx.rnd(gid, 2);
      const dist = (0.35 + 0.8 * ctx.rnd(gid, 3)) * (0.5 + 0.6 * k);
      const at: Vec3 = {
        x: impact.x + Math.cos(a) * dist,
        y: impact.y + Math.sin(a) * dist,
        z: Math.max(0.05, impact.z + rise * (0.5 + 0.5 * k) - 0.55 * k * k),
      };
      out.push(
        motifPiece(ctx, {
          id: gid,
          motif: ctx.rnd(gid, 4) > 0.55 ? ICE_SHARD : ICE_FLAKE,
          at,
          frame: ctx.rnd(gid, 5) > 0.5 ? 1 : 0,
          flipX: ctx.rnd(gid, 6) > 0.5,
        }),
      );
    }
    return out;
  }

  // Résidu : givre au sol et fragments posés. La fin est dessinée.
  const k = i - 9;
  if (frostRadius > 0) {
    out.push(
      piece('frost', ctx.depth(ctx.target) - 2, (canvas, c) => {
        paintGroundMark(canvas, c, ctx.target, frostRadius * (1 - 0.15 * k), 'ice.frost', {
          id: 'frost',
          core: 'light',
          edge: 'shadow',
          density: 0.8 - 0.22 * k,
        });
      }),
    );
    out.push(
      motifPiece(ctx, {
        id: 'frost-star',
        motif: FROST_PATCH,
        at: ctx.target,
        frame: k === 0 ? 1 : 0,
        roleShift: -k,
      }),
    );
  }
  for (let f = 0; f < Math.max(0, fragmentCount - 1 - k); f++) {
    const gid = `shard#${f}`;
    const a = ctx.rnd(gid, 1) * Math.PI * 2;
    const dist = (0.35 + 0.8 * ctx.rnd(gid, 3)) * (1.1 + 0.15 * k);
    out.push(
      motifPiece(ctx, {
        id: gid,
        motif: ICE_FLAKE,
        at: { x: impact.x + Math.cos(a) * dist, y: impact.y + Math.sin(a) * dist, z: 0.03 },
        frame: Math.min(1, k),
        flipX: ctx.rnd(gid, 6) > 0.5,
        roleShift: -k,
      }),
    );
  }
  return out;
}

export const ICE_AURORA_NEEDLE: SpellBuilder = {
  id: 'ice-aurora-needle-s',
  label: 'Aiguille d’aurore',
  element: 'ice',
  rank: 'S',
  action: 'projectile',
  params: NEEDLE_PARAMS,
  uses: {
    motifs: ['ice-shard-v1', 'ice-flake-v1', 'ice-mote-v1', 'ice-fracture-v1', 'ice-frost-patch-v1'],
    operators: ['prism', 'oriented-crystal', 'fracture-source-crystal', 'ground-mark'],
  },
  build: needleBuild,
};

// ---------------------------------------------------------------------------
// M — Jardin de givre
// ---------------------------------------------------------------------------

const GARDEN_PARAMS: ParamSpec[] = [
  { key: 'prismCount', label: 'Prismes', kind: 'integer', default: 6, min: 3, max: 10, step: 1, group: 'Silhouette' },
  { key: 'prismHeight', label: 'Hauteur des prismes', kind: 'number', default: 1.35, min: 0.5, max: 2.5, step: 0.05, unit: 'tuile', group: 'Silhouette' },
  { key: 'prismRadius', label: 'Épaisseur', kind: 'number', default: 0.22, min: 0.08, max: 0.5, step: 0.01, unit: 'tuile', group: 'Silhouette' },
  { key: 'spread', label: 'Rayon de la couronne', kind: 'number', default: 1.05, min: 0.4, max: 2.5, step: 0.05, unit: 'tuile', group: 'Silhouette' },
  { key: 'growthSteps', label: 'Paliers de croissance', kind: 'integer', default: 3, min: 1, max: 5, step: 1, group: 'Geste' },
  { key: 'shatterCount', label: 'Éclats à la rupture', kind: 'integer', default: 6, min: 0, max: 14, step: 1, group: 'Rupture' },
];

function gardenBuild(ctx: FrameContext, p: ParamBag): Piece[] {
  const count = p.int('prismCount');
  const height = p.num('prismHeight');
  const radius = p.num('prismRadius');
  const spread = p.num('spread');
  const steps = p.int('growthSteps');
  const shatterCount = p.int('shatterCount');
  const i = ctx.index;
  const out: Piece[] = [];
  const centre: Vec3 = { x: ctx.target.x, y: ctx.target.y, z: 0 };

  const frost = (scale: number, density: number, shift = 0): void => {
    out.push(
      piece('frost', ctx.depth(centre) - 2, (canvas, c) => {
        paintGroundMark(canvas, c, centre, spread * scale, 'ice.frost', {
          id: 'frost',
          core: 'body',
          edge: 'shadow',
          density,
        });
      }),
    );
    out.push(motifPiece(ctx, { id: 'frost-star', motif: FROST_PATCH, at: centre, frame: 1, roleShift: shift }));
  };

  // Position et inclinaison d'un prisme de la couronne. Chaque prisme a son
  // identifiant : ajouter un prisme ne déplace pas les autres.
  const prismAt = (k: number): { base: Vec3; axis: Vec3; roll: number; delay: number } => {
    const gid = `prism#${k}`;
    const a = ctx.heading + (k / count) * Math.PI * 2 + ctx.rnd(gid, 1) * 0.35;
    const r = spread * (0.75 + 0.45 * ctx.rnd(gid, 2));
    const base: Vec3 = { x: centre.x + Math.cos(a) * r, y: centre.y + Math.sin(a) * r, z: 0 };
    // Les prismes penchent **vers l'extérieur** : une couronne, pas une cage.
    const lean = 0.3 + 0.25 * ctx.rnd(gid, 3);
    const axis = norm3({ x: Math.cos(a) * lean, y: Math.sin(a) * lean, z: 1 });
    return { base, axis, roll: ctx.rnd(gid, 4) * Math.PI, delay: ctx.rnd(gid, 5) };
  };

  if (i <= 2) {
    frost(0.45 + 0.28 * i, 0.5 + 0.15 * i);
    if (i >= 1) {
      // Les premières pointes percent la plaque : croissance par paliers.
      for (let k = 0; k < count; k++) {
        const { base, axis, roll, delay } = prismAt(k);
        if (delay > (i === 1 ? 0.35 : 0.7)) continue;
        out.push(
          prismPiece(ctx, {
            id: `prism#${k}`,
            base,
            axis,
            length: height * (i === 1 ? 0.16 : 0.3),
            radius: radius * 0.8,
            sides: 6,
            roll,
          }),
        );
      }
    }
    return out;
  }

  if (i <= 7) {
    // Croissance (3-5) puis maintien rigide (6-7) : la pose tenue est une
    // pose, pas un plateau — seuls le givre et le poudrin bougent encore.
    const stage = i <= 5 ? (i - 2) / steps : 1;
    frost(1.1, 0.85);
    for (let k = 0; k < count; k++) {
      const { base, axis, roll, delay } = prismAt(k);
      const grown = clamp01((stage - delay * 0.4) / 0.8);
      if (grown <= 0.02) continue;
      // Paliers : la longueur avance par marches, pas en rampe continue.
      const stepped = Math.ceil(grown * steps) / steps;
      out.push(
        prismPiece(ctx, {
          id: `prism#${k}`,
          base,
          axis,
          length: height * stepped,
          radius: radius * (0.85 + 0.15 * stepped),
          sides: 6,
          roll,
          irregular: 0.18,
        }),
      );
    }
    if (i >= 6) {
      out.push(
        ...scatterMotifs(ctx, {
          id: 'mote',
          motif: ICE_MOTE,
          center: { x: centre.x, y: centre.y, z: height * 0.8 },
          count: 4,
          radius: spread * 1.2,
          spread: 0.4 + 0.3 * (i - 6),
          lift: 0.3,
          gravity: 0.15,
          frame: () => (i === 7 ? 1 : 0),
        }),
      );
    }
    return out;
  }

  if (i <= 9) {
    // Rupture sèche : les têtes cassent, les fûts restent.
    const k = i - 8;
    frost(1.05, 0.8);
    for (let n = 0; n < count; n++) {
      const { base, axis, roll } = prismAt(n);
      out.push(
        prismPiece(ctx, {
          id: `prism#${n}`,
          base,
          axis,
          length: height * (0.62 - 0.14 * k),
          radius: radius,
          sides: 6,
          roll,
          tip: 0.1,
          bias: 0.05,
        }),
      );
    }
    for (let f = 0; f < shatterCount; f++) {
      const gid = `frag#${f}`;
      const a = ctx.heading + ctx.rnd(gid, 1) * Math.PI * 2;
      const r = spread * (0.6 + 0.9 * ctx.rnd(gid, 2)) * (1 + 0.35 * k);
      const z = Math.max(0.05, height * (0.8 + 0.3 * ctx.rnd(gid, 3)) - 0.8 * k * k);
      out.push(
        motifPiece(ctx, {
          id: gid,
          motif: ctx.rnd(gid, 4) > 0.5 ? ICE_SHARD : ICE_FLAKE,
          at: { x: centre.x + Math.cos(a) * r, y: centre.y + Math.sin(a) * r, z },
          frame: ctx.rnd(gid, 5) > 0.5 ? 1 : 0,
          flipX: ctx.rnd(gid, 6) > 0.5,
        }),
      );
    }
    return out;
  }

  // Résidu : souches basses, éclats au sol, givre qui se retire.
  const k = i - 10;
  frost(1 - 0.2 * k, 0.75 - 0.25 * k, -k);
  for (let n = 0; n < count; n++) {
    const { base, axis, roll } = prismAt(n);
    if (ctx.rnd(`prism#${n}`, 7) < 0.3 * (k + 1)) continue;
    out.push(
      prismPiece(ctx, {
        id: `prism#${n}`,
        base,
        axis,
        length: height * (0.3 - 0.12 * k),
        radius: radius * (0.9 - 0.1 * k),
        sides: 6,
        roll,
        tip: 0.12,
        bias: 0.08 + 0.1 * k,
      }),
    );
  }
  for (let f = 0; f < Math.max(0, shatterCount - 2 - 2 * k); f++) {
    const gid = `frag#${f}`;
    const a = ctx.heading + ctx.rnd(gid, 1) * Math.PI * 2;
    const r = spread * (0.6 + 0.9 * ctx.rnd(gid, 2)) * 1.5;
    out.push(
      motifPiece(ctx, {
        id: gid,
        motif: ICE_FLAKE,
        at: { x: centre.x + Math.cos(a) * r, y: centre.y + Math.sin(a) * r, z: 0.03 },
        frame: Math.min(1, k),
        flipX: ctx.rnd(gid, 6) > 0.5,
        roleShift: -k,
      }),
    );
  }
  return out;
}

export const ICE_FROST_GARDEN: SpellBuilder = {
  id: 'ice-frost-garden-m',
  label: 'Jardin de givre',
  element: 'ice',
  rank: 'M',
  action: 'summon',
  params: GARDEN_PARAMS,
  uses: {
    motifs: ['ice-shard-v1', 'ice-flake-v1', 'ice-mote-v1', 'ice-frost-patch-v1'],
    operators: ['prism', 'ground-mark'],
  },
  build: gardenBuild,
};

// ---------------------------------------------------------------------------
// L — Cathédrale boréale
// ---------------------------------------------------------------------------

const CATHEDRAL_PARAMS: ParamSpec[] = [
  { key: 'frontWidth', label: 'Largeur du front', kind: 'number', default: 2.6, min: 1, max: 5, step: 0.1, unit: 'tuile', group: 'Silhouette' },
  { key: 'archHeight', label: 'Hauteur de l’arche', kind: 'number', default: 2.5, min: 1, max: 4.5, step: 0.1, unit: 'tuile', group: 'Silhouette' },
  { key: 'ribs', label: 'Nervures par côté', kind: 'integer', default: 5, min: 2, max: 8, step: 1, group: 'Silhouette' },
  { key: 'ribRadius', label: 'Épaisseur des nervures', kind: 'number', default: 0.26, min: 0.1, max: 0.6, step: 0.02, unit: 'tuile', group: 'Silhouette' },
  { key: 'closure', label: 'Fermeture de l’arche', kind: 'number', default: 0.85, min: 0.3, max: 1, step: 0.05, group: 'Geste' },
  { key: 'shatterCount', label: 'Éclats à la fracture', kind: 'integer', default: 9, min: 0, max: 20, step: 1, group: 'Rupture' },
];

function cathedralBuild(ctx: FrameContext, p: ParamBag): Piece[] {
  const frontWidth = p.num('frontWidth');
  const archHeight = p.num('archHeight');
  const ribs = p.int('ribs');
  const ribRadius = p.num('ribRadius');
  const closure = p.num('closure');
  const shatterCount = p.int('shatterCount');
  const i = ctx.index;
  const out: Piece[] = [];
  const centre: Vec3 = { x: ctx.target.x, y: ctx.target.y, z: 0 };
  const fwd = { x: Math.cos(ctx.heading), y: Math.sin(ctx.heading) };
  const side = { x: -fwd.y, y: fwd.x };

  /** Une nervure : position le long du front, côté, inclinaison vers le centre. */
  const rib = (n: number, sign: 1 | -1) => {
    const gid = `rib#${sign > 0 ? 'a' : 'b'}${n}`;
    const along = ((n + 0.5) / ribs - 0.5) * frontWidth;
    const lateral = sign * frontWidth * 0.33;
    const base: Vec3 = {
      x: centre.x + fwd.x * along + side.x * lateral,
      y: centre.y + fwd.y * along + side.y * lateral,
      z: 0,
    };
    const inward = -sign * closure;
    const axis = norm3({ x: side.x * inward, y: side.y * inward, z: 1.15 });
    return { gid, base, axis, roll: ctx.rnd(gid, 1) * Math.PI, delay: ctx.rnd(gid, 2) * 0.5 };
  };

  const frontMark = (advance: number, density: number): void => {
    const at: Vec3 = {
      x: centre.x - fwd.x * (1 - advance) * frontWidth * 0.5,
      y: centre.y - fwd.y * (1 - advance) * frontWidth * 0.5,
      z: 0,
    };
    out.push(
      piece('front', ctx.depth(at) - 2, (canvas, c) => {
        paintGroundMark(canvas, c, at, frontWidth * 0.45 * (0.5 + advance), 'ice.frost', {
          id: 'front',
          core: 'body',
          edge: 'shadow',
          density,
        });
      }),
    );
    out.push(motifPiece(ctx, { id: 'front-star', motif: FROST_PATCH, at, frame: 1 }));
  };

  if (i <= 2) {
    // Front de gel : il avance au sol, il ne tombe pas du ciel.
    const advance = [0.25, 0.55, 0.85][i] ?? 1;
    frontMark(advance, 0.55 + 0.12 * i);
    const spikes = Math.max(1, Math.round(ribs * advance));
    for (let n = 0; n < spikes; n++) {
      const { gid, base, axis, roll } = rib(n, n % 2 === 0 ? 1 : -1);
      out.push(
        prismPiece(ctx, {
          id: gid,
          base,
          axis,
          length: archHeight * 0.14 * advance,
          radius: ribRadius * 0.7,
          sides: 6,
          roll,
        }),
      );
    }
    return out;
  }

  if (i <= 7) {
    // Levée (3-5) puis arche fermée tenue (6-7).
    const stage = i <= 5 ? (i - 2) / 3.2 : 1;
    frontMark(1, 0.85);
    for (const sign of [1, -1] as const) {
      for (let n = 0; n < ribs; n++) {
        const { gid, base, axis, roll, delay } = rib(n, sign);
        const grown = clamp01((stage - delay) / 0.75);
        if (grown <= 0.02) continue;
        const stepped = Math.ceil(grown * 4) / 4;
        out.push(
          prismPiece(ctx, {
            id: gid,
            base,
            axis,
            length: archHeight * stepped,
            radius: ribRadius * (0.8 + 0.2 * stepped),
            sides: 6,
            roll,
            irregular: 0.2,
            taper: 0.6,
          }),
        );
      }
    }
    if (i >= 6) {
      // Clé de voûte : les deux rangées se rejoignent.
      for (let n = 0; n < ribs; n++) {
        const along = ((n + 0.5) / ribs - 0.5) * frontWidth;
        const at: Vec3 = {
          x: centre.x + fwd.x * along,
          y: centre.y + fwd.y * along,
          z: archHeight * (0.92 + 0.04 * Math.sin(n)),
        };
        out.push(
          motifPiece(ctx, {
            id: `key#${n}`,
            motif: ICE_SHARD,
            at,
            frame: n % 2,
            flipX: n % 2 === 1,
          }),
        );
      }
      out.push(
        ...scatterMotifs(ctx, {
          id: 'mote',
          motif: ICE_MOTE,
          center: { x: centre.x, y: centre.y, z: archHeight * 0.7 },
          count: 5,
          radius: frontWidth * 0.5,
          spread: 0.4 + 0.25 * (i - 6),
          lift: 0.2,
          gravity: 0.1,
          frame: () => (i === 7 ? 1 : 0),
        }),
      );
    }
    return out;
  }

  if (i <= 9) {
    // Fracture : l'arche se rompt en son milieu, les nervures se raccourcissent.
    const k = i - 8;
    frontMark(1, 0.8 - 0.1 * k);
    for (const sign of [1, -1] as const) {
      for (let n = 0; n < ribs; n++) {
        const { gid, base, axis, roll } = rib(n, sign);
        out.push(
          prismPiece(ctx, {
            id: gid,
            base,
            axis,
            length: archHeight * (0.72 - 0.18 * k),
            radius: ribRadius,
            sides: 6,
            roll,
            tip: 0.12,
            bias: 0.05 * k,
          }),
        );
      }
    }
    out.push(
      motifPiece(ctx, {
        id: 'burst',
        motif: ICE_FRACTURE,
        at: { x: centre.x, y: centre.y, z: archHeight * 0.85 },
        frame: k,
      }),
    );
    for (let f = 0; f < shatterCount; f++) {
      const gid = `frag#${f}`;
      const a = ctx.rnd(gid, 1) * Math.PI * 2;
      const r = frontWidth * (0.2 + 0.6 * ctx.rnd(gid, 2)) * (1 + 0.4 * k);
      const z = Math.max(0.05, archHeight * (0.5 + 0.5 * ctx.rnd(gid, 3)) - 1.1 * k * k);
      out.push(
        motifPiece(ctx, {
          id: gid,
          motif: ctx.rnd(gid, 4) > 0.45 ? ICE_SHARD : ICE_FLAKE,
          at: { x: centre.x + Math.cos(a) * r, y: centre.y + Math.sin(a) * r, z },
          frame: ctx.rnd(gid, 5) > 0.5 ? 1 : 0,
          flipX: ctx.rnd(gid, 6) > 0.5,
        }),
      );
    }
    return out;
  }

  // Résidu : souches et éclats plats, givre qui se retire.
  const k = i - 10;
  frontMark(1, 0.7 - 0.25 * k);
  for (const sign of [1, -1] as const) {
    for (let n = 0; n < ribs; n++) {
      const { gid, base, axis, roll } = rib(n, sign);
      if (ctx.rnd(gid, 8) < 0.35 * (k + 1)) continue;
      out.push(
        prismPiece(ctx, {
          id: gid,
          base,
          axis,
          length: archHeight * (0.3 - 0.12 * k),
          radius: ribRadius * 0.9,
          sides: 6,
          roll,
          tip: 0.14,
          bias: 0.1 + 0.1 * k,
        }),
      );
    }
  }
  for (let f = 0; f < Math.max(0, shatterCount - 3 - 3 * k); f++) {
    const gid = `frag#${f}`;
    const a = ctx.rnd(gid, 1) * Math.PI * 2;
    const r = frontWidth * (0.2 + 0.6 * ctx.rnd(gid, 2)) * 1.6;
    out.push(
      motifPiece(ctx, {
        id: gid,
        motif: ICE_FLAKE,
        at: { x: centre.x + Math.cos(a) * r, y: centre.y + Math.sin(a) * r, z: 0.03 },
        frame: Math.min(1, k),
        flipX: ctx.rnd(gid, 6) > 0.5,
        roleShift: -k,
      }),
    );
  }
  return out;
}

export const ICE_BOREAL_CATHEDRAL: SpellBuilder = {
  id: 'ice-boreal-cathedral-l',
  label: 'Cathédrale boréale',
  element: 'ice',
  rank: 'L',
  action: 'wave',
  params: CATHEDRAL_PARAMS,
  uses: {
    motifs: ['ice-shard-v1', 'ice-flake-v1', 'ice-mote-v1', 'ice-fracture-v1', 'ice-frost-patch-v1'],
    operators: ['prism', 'ground-mark'],
  },
  build: cathedralBuild,
};

export const ICE_BUILDERS: readonly SpellBuilder[] = [
  ICE_AURORA_NEEDLE,
  ICE_FROST_GARDEN,
  ICE_BOREAL_CATHEDRAL,
];
