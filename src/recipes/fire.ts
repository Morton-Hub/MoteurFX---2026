/**
 * Famille du feu — trois rangs, trois constructions.
 *
 *  S  Pétale de braise  : une petite masse lancée, qui s'ouvre en pétales.
 *  M  Pilier du dragon  : une colonne qui jaillit du sol et se déchire.
 *  L  Cœur de comète    : une masse rocheuse enflammée qui tombe du ciel.
 *
 * Elles partagent une braise et une fumée. Elles ne partagent ni silhouette,
 * ni geste, ni conséquence : le météore n'est pas une boule de feu agrandie,
 * la colonne n'a pas de phase de vol (§11).
 */

import { add3, norm3, scale3, type Vec3 } from '../core/math.js';
import { getMaterial } from '../pixels/palette.js';
import { paintRole } from '../pixels/shade.js';
import { FIRE_LOBE, ROCK_CHIP } from '../motifs/index.js';
import { flameBody, leanToward, openLobes, veinMask } from '../geometry/flame.js';
import { chunk } from '../geometry/forms.js';
import { paintSolidObject, solidMask } from '../geometry/solid.js';
import { groundCracks, paintGroundMark, paintGroundShadow } from '../geometry/ground.js';
import { lineTrajectory, skyFall } from '../geometry/paths.js';
import { shatter, fragmentAt } from '../geometry/fragments.js';
import type { FrameContext } from '../renderer/context.js';
import type { Piece } from '../renderer/piece.js';
import { emissivePiece, groundPiece, motifPiece, scatterMotifs, shadowPiece } from './common.js';
import { ash, converge, embers, fireNova, forwardUp, groundGlow, smoke, sparks } from './fx.js';
import type { ParamBag, ParamSpec } from './params.js';
import type { SpellBuilder } from './types.js';

// ---------------------------------------------------------------------------
// S — Pétale de braise
// ---------------------------------------------------------------------------

const PETAL_PARAMS: ParamSpec[] = [
  { key: 'emberSize', label: 'Taille de la braise', kind: 'number', default: 0.34, min: 0.15, max: 0.7, step: 0.01, unit: 'tuile', group: 'Silhouette' },
  { key: 'tongues', label: 'Langues', kind: 'integer', default: 3, min: 1, max: 5, step: 1, group: 'Silhouette' },
  { key: 'curl', label: 'Crochet', kind: 'number', default: 0.55, min: 0, max: 1, step: 0.05, group: 'Silhouette', help: 'Recourbement du bout des langues' },
  { key: 'trail', label: 'Longueur de traînée', kind: 'integer', default: 3, min: 0, max: 5, step: 1, group: 'Vol' },
  { key: 'flightArc', label: 'Cambrure du vol', kind: 'number', default: 0.3, min: 0, max: 1.2, step: 0.05, unit: 'tuile', group: 'Vol' },
  { key: 'lobes', label: 'Pétales à l’ouverture', kind: 'integer', default: 3, min: 2, max: 5, step: 1, group: 'Impact' },
  { key: 'emberCount', label: 'Braises', kind: 'integer', default: 7, min: 0, max: 16, step: 1, group: 'Conséquence' },
  { key: 'smoke', label: 'Fumée', kind: 'number', default: 0.8, min: 0, max: 1, step: 0.1, group: 'Conséquence' },
];

/** Positions de vol : espacements non uniformes, l'accélération se voit. */
const PETAL_FLIGHT = [0.3, 0.6, 0.85];

function petalBuild(ctx: FrameContext, p: ParamBag): Piece[] {
  const size = p.num('emberSize');
  const tongues = p.int('tongues');
  const curl = p.num('curl');
  const trailCount = p.int('trail');
  const arc = p.num('flightArc');
  const lobes = p.int('lobes');
  const emberCount = p.int('emberCount');
  const smokeAmount = p.num('smoke');
  const i = ctx.index;
  const out: Piece[] = [];

  const hand = ctx.wl(0.3, 0.16, 0);
  const impact: Vec3 = { x: ctx.target.x, y: ctx.target.y, z: 0.32 };
  const path = lineTrajectory(hand, impact, arc);
  const ground: Vec3 = { x: ctx.target.x, y: ctx.target.y, z: 0 };

  const flame = (id: string, at: Vec3, height: number, width: number, opts: {
    count?: number; phase?: number; lean?: number; holes?: number; bias?: number; core?: number; ceiling?: number;
  } = {}): void => {
    const body = flameBody(ctx, {
      id,
      anchor: at,
      height,
      width,
      count: opts.count ?? tongues,
      curl,
      phase: opts.phase ?? ctx.phase,
      ...(opts.lean !== undefined ? { lean: opts.lean } : {}),
      ...(opts.holes !== undefined ? { holes: opts.holes } : {}),
      seed: ctx.seed,
    });
    out.push(
      emissivePiece(ctx, {
        id,
        mask: body.mask,
        at,
        material: 'fire.flame',
        core: opts.core ?? 2.4,
        turbulence: 0.18,
        ...(opts.bias !== undefined ? { bias: opts.bias } : {}),
        ...(opts.ceiling !== undefined ? { ceiling: opts.ceiling } : {}),
      }),
    );
  };

  // --- Anticipation (0-1) puis départ (2).
  if (i <= 2) {
    const grow = [0.5, 0.9, 1.05][i] ?? 1;
    const at = i === 2 ? path.at(0.08) : hand;
    // La convergence dit qu'il va se passer quelque chose avant que ça arrive.
    out.push(
      ...converge(ctx, {
        id: 'gather',
        centre: hand,
        t: [0.15, 0.6, 1][i] ?? 1,
        count: 6 - i,
        radius: size * 3.4,
        material: 'fire.ember',
        size: 1,
        lift: size * 1.6,
      }),
    );
    flame('head', at, size * 2.4 * grow, size * 1.9 * grow, {
      count: Math.max(2, tongues - (i === 0 ? 1 : 0)),
      phase: 0.3 + i * 0.25,
      lean: 0,
    });
    if (i >= 1) {
      out.push(...embers(ctx, { id: 'cast-embers', at: hand, t: 0.2 + 0.35 * i, count: 3 + i, scale: size * 1.6 }));
    }
    if (i === 2) {
      out.push(shadowPiece(ctx, 'shadow', at, size * 1.1, 0.4));
      out.push(
        ...sparks(ctx, {
          id: 'release-sparks',
          at,
          t: 0.3,
          count: 6,
          scale: size * 2.2,
          dir: forwardUp(ctx, 0.5),
          spread: 0.7,
        }),
      );
    }
    return out;
  }

  // --- Vol (3-5) : tête nette, traînée qui finit son mouvement après elle.
  if (i <= 5) {
    const t = PETAL_FLIGHT[i - 3] ?? 0.5;
    const at = path.at(t);
    const ahead = path.at(Math.min(1, t + 0.06));
    const sa = ctx.p(at);
    const sb = ctx.p(ahead);
    const lean = leanToward(ctx, at, { x: sa.x - sb.x, y: sa.y - sb.y });
    out.push(shadowPiece(ctx, 'shadow', at, size * 1.15, 0.5));
    // Les braises naissent le long du trajet : elles restent derrière le
    // projectile au lieu de le suivre en bloc.
    out.push(
      ...embers(ctx, {
        id: 'wake',
        at: (birth) => path.at(Math.max(0, Math.min(1, birth))),
        t,
        birth: [0.05, t],
        count: 9,
        scale: size * 1.4,
        spread: 1.1,
        rise: 0.15,
      }),
    );
    for (let k = 1; k <= trailCount; k++) {
      const tt = Math.max(0, t - k * 0.17);
      const tAt = path.at(tt);
      const fade = 1 - k / (trailCount + 1);
      flame(`trail#${k}`, tAt, size * (2 - 0.25 * k) * fade, size * 1.5 * fade, {
        count: 2,
        phase: 0.2 + 0.2 * k,
        lean,
        bias: -0.12 * k,
        ceiling: 0.9 - 0.1 * k,
      });
    }
    flame('head', at, size * 2.9, size * 2.1, { phase: 0.45 + 0.2 * (i - 3), lean });
    return out;
  }

  // --- Contact (6) : le climax. Densité et contraste maximaux, une seule image.
  if (i === 6) {
    out.push(groundGlow(ctx, { id: 'glow', centre: ground, radius: size * 2, level: 0.32 }));
    out.push(shadowPiece(ctx, 'shadow', impact, size * 1.4, 0.5));
    out.push(...fireNova(ctx, { id: 'nova', centre: ground, t: 0.12, radius: size * 3.4, petals: 7 }));
    const squashed = flameBody(ctx, {
      id: 'contact',
      anchor: { x: impact.x, y: impact.y, z: 0.18 },
      height: size * 2.1,
      width: size * 3.6,
      count: tongues + 2,
      curl: curl * 0.5,
      phase: 0.9,
      seed: ctx.seed,
    });
    out.push(
      emissivePiece(ctx, {
        id: 'contact',
        mask: squashed.mask,
        at: impact,
        material: 'fire.flame',
        core: 2.4,
        turbulence: 0.2,
      }),
    );
    out.push(motifPiece(ctx, { id: 'contact-lobe', motif: FIRE_LOBE, at: { ...impact, z: 0.3 }, frame: 0 }));
    // La gerbe part vers l'avant du sort : les huit caps ne se ressemblent pas.
    out.push(
      ...sparks(ctx, {
        id: 'burst',
        at: impact,
        t: 0.18,
        count: 14,
        scale: size * 3,
        dir: forwardUp(ctx, 0.9),
        spread: 1.25,
      }),
    );
    out.push(...embers(ctx, { id: 'ember', at: impact, t: 0.15, count: emberCount + 4, scale: size * 2.4 }));
    return out;
  }

  // --- Ouverture (7-8) : trois pétales, et l'onde qui s'écarte au sol.
  if (i <= 8) {
    const k = i - 7;
    const opening = k === 0 ? 0.6 : 1;
    out.push(
      groundPiece('scorch', ctx.depth(ground) - 1.5, (canvas, c) => {
        paintGroundMark(canvas, c, ctx.target, size * 2.4 * opening, 'fire.scorch', { id: 'scorch' });
      }),
    );
    out.push(...fireNova(ctx, { id: 'nova', centre: ground, t: 0.42 + 0.34 * k, radius: size * 3.4, petals: 7 }));
    const lobeMask = openLobes(ctx, {
      id: 'petals',
      center: { x: impact.x, y: impact.y, z: 0.3 + 0.12 * opening },
      radius: size * 4.2,
      lobes,
      opening,
      seed: ctx.seed,
      thickness: 0.46,
    });
    out.push(
      emissivePiece(ctx, {
        id: 'petals',
        mask: lobeMask,
        at: impact,
        material: 'fire.flame',
        core: 3,
        turbulence: 0.22,
        bias: k === 1 ? -0.12 : 0,
      }),
    );
    out.push(
      motifPiece(ctx, { id: 'lobe-core', motif: FIRE_LOBE, at: { ...impact, z: 0.28 }, frame: k }),
    );
    out.push(...embers(ctx, { id: 'ember', at: impact, t: 0.32 + 0.26 * k, count: emberCount + 4, scale: size * 2.4 }));
    out.push(
      ...sparks(ctx, { id: 'burst', at: impact, t: 0.42 + 0.3 * k, count: 12, scale: size * 3, dir: forwardUp(ctx, 0.9), spread: 1.25 }),
    );
    if (k === 1 && smokeAmount > 0) {
      out.push(...smoke(ctx, { id: 'smoke', at: { ...ground, z: 0.2 }, t: 0.18, count: 4, scale: size * 1.6 }));
    }
    return out;
  }

  // --- Dissipation (9-11) : ce qui reste retombe, la fumée prend le relais.
  const k = i - 9;
  out.push(
    groundPiece('scorch', ctx.depth(ground) - 1.5, (canvas, c) => {
      paintGroundMark(canvas, c, ctx.target, size * (2.4 - 0.25 * k), 'fire.scorch', {
        id: 'scorch',
        density: 0.85 - 0.2 * k,
      });
    }),
  );
  if (k === 0) {
    const lobeMask = openLobes(ctx, {
      id: 'petals',
      center: { x: impact.x, y: impact.y, z: 0.3 },
      radius: size * 3.2,
      lobes,
      opening: 0.6,
      seed: ctx.seed,
      thickness: 0.38,
    });
    out.push(
      emissivePiece(ctx, {
        id: 'petals',
        mask: lobeMask,
        at: impact,
        material: 'fire.flame',
        core: 2.4,
        turbulence: 0.24,
        bias: -0.25,
        ceiling: 0.78,
      }),
    );
  }
  out.push(
    ...embers(ctx, {
      id: 'ember',
      at: impact,
      t: Math.min(1, 0.62 + 0.22 * k),
      count: emberCount + 4,
      scale: size * 2.4,
    }),
  );
  out.push(...ash(ctx, { id: 'ash', at: { ...impact, z: 0.4 }, t: 0.3 + 0.3 * k, count: 5, scale: size * 2 }));
  if (smokeAmount > 0) {
    out.push(
      ...smoke(ctx, {
        id: 'smoke',
        at: { ...ground, z: 0.2 },
        t: Math.min(1, 0.34 + 0.28 * k),
        count: 5,
        scale: size * 1.8 * smokeAmount,
      }),
    );
  }
  return out;
}

export const FIRE_EMBER_PETAL: SpellBuilder = {
  id: 'fire-ember-petal-s',
  label: 'Pétale de braise',
  element: 'fire',
  rank: 'S',
  action: 'projectile',
  params: PETAL_PARAMS,
  uses: {
    motifs: ['fire-ember-v1', 'fire-lobe-v1', 'fire-smoke-v1'],
    operators: ['flame-body', 'open-lobes', 'ground-mark'],
  },
  build: petalBuild,
};

// ---------------------------------------------------------------------------
// M — Pilier du dragon
// ---------------------------------------------------------------------------

const PILLAR_PARAMS: ParamSpec[] = [
  { key: 'height', label: 'Hauteur de la colonne', kind: 'number', default: 2.4, min: 1, max: 4, step: 0.1, unit: 'tuile', group: 'Silhouette' },
  { key: 'girth', label: 'Épaisseur', kind: 'number', default: 0.75, min: 0.3, max: 1.6, step: 0.05, unit: 'tuile', group: 'Silhouette' },
  { key: 'tongues', label: 'Langues', kind: 'integer', default: 5, min: 2, max: 8, step: 1, group: 'Silhouette' },
  { key: 'tear', label: 'Déchirement', kind: 'number', default: 0.7, min: 0, max: 1, step: 0.05, group: 'Geste', help: 'Hauteur du vide qui s’ouvre quand le débit est coupé' },
  { key: 'crackCount', label: 'Failles au sol', kind: 'integer', default: 5, min: 0, max: 10, step: 1, group: 'Ignition' },
  { key: 'holes', label: 'Trous internes', kind: 'integer', default: 3, min: 0, max: 8, step: 1, group: 'Silhouette' },
  { key: 'smoke', label: 'Fumée', kind: 'number', default: 1, min: 0, max: 1, step: 0.1, group: 'Conséquence' },
];

function pillarBuild(ctx: FrameContext, p: ParamBag): Piece[] {
  const height = p.num('height');
  const girth = p.num('girth');
  const tongues = p.int('tongues');
  const tear = p.num('tear');
  const crackCount = p.int('crackCount');
  const holes = p.int('holes');
  const smokeAmount = p.num('smoke');
  const i = ctx.index;
  const out: Piece[] = [];
  const foot: Vec3 = { x: ctx.target.x, y: ctx.target.y, z: 0 };
  const groundDepth = ctx.depth(foot);

  const mark = (radius: number, density: number): void => {
    out.push(
      groundPiece('ignition', groundDepth - 2.5, (canvas) => {
        paintGroundMark(canvas, ctx, foot, radius, 'fire.scorch', { id: 'ignition', density });
      }),
    );
  };
  const cracks = (length: number, hot: boolean): void => {
    if (crackCount <= 0) return;
    const mask = groundCracks(ctx, foot, {
      id: 'cracks',
      seed: ctx.seed,
      count: crackCount,
      length: length * 0.32,
      width: 1,
      angleOffset: ctx.heading,
    });
    out.push(
      groundPiece('cracks', groundDepth - 1.5, (canvas) => {
        paintRole(canvas, mask, getMaterial(hot ? 'fire.vein' : 'fire.scorch'), hot ? 'body' : 'shadow');
      }),
    );
  };

  // --- Anticipation (0-2) : le sol chauffe, la matière converge, rien ne vole.
  if (i <= 2) {
    out.push(groundGlow(ctx, { id: 'glow', centre: foot, radius: girth * (1 + 0.4 * i), level: 0.28 + 0.1 * i }));
    mark(girth * (1.1 + 0.5 * i), 0.55 + 0.15 * i);
    cracks(girth * (1 + 0.6 * i), i >= 1);
    out.push(
      ...converge(ctx, {
        id: 'gather',
        centre: { ...foot, z: 0.1 },
        t: [0.1, 0.5, 0.9][i] ?? 1,
        count: 8 - i,
        radius: girth * 3,
        material: 'fire.ember',
        lift: girth * 1.4,
      }),
    );
    if (i >= 1) {
      const lick = flameBody(ctx, {
        id: 'lick',
        anchor: foot,
        height: height * (i === 1 ? 0.18 : 0.42),
        width: girth * (0.8 + 0.3 * i),
        count: tongues,
        curl: 0.7,
        phase: 0.2 * i,
        holes: 0,
        seed: ctx.seed,
      });
      out.push(
        emissivePiece(ctx, { id: 'lick', mask: lick.mask, at: foot, material: 'fire.flame', core: 2.6, turbulence: 0.3 }),
      );
      out.push(...sparks(ctx, { id: 'vent', at: foot, t: 0.25 * i, count: 5 + 2 * i, scale: girth * 1.6, dir: { x: 0, y: 0, z: 1 }, spread: 0.9 }));
    }
    return out;
  }

  // --- Montée (3-5) puis colonne ouverte (6-7) : le climax est une pose tenue.
  if (i <= 7) {
    const rise = [0.42, 0.68, 0.88, 1, 1][i - 3] ?? 1;
    const open = i >= 6;
    mark(girth * 1.7, 0.75);
    cracks(girth * 1.7, true);
    const column = flameBody(ctx, {
      id: 'column',
      anchor: foot,
      height: height * rise,
      width: girth * (open ? 1.25 : 1),
      count: Math.max(2, Math.round(tongues * 0.6)) + (open ? 1 : 0),
      curl: 0.45,
      phase: 0.25 + 0.18 * (i - 3),
      holes: open ? holes : Math.max(0, holes - 2),
      core: 'column',
      topRatio: open ? 0.75 : 0.5,
      seed: ctx.seed,
    });
    out.push(
      emissivePiece(ctx, {
        id: 'column',
        mask: column.mask,
        at: { x: foot.x, y: foot.y, z: height * rise * 0.4 },
        material: 'fire.flame',
        core: 3.6,
        turbulence: 0.3,
        grain: 3,
      }),
    );
    const base = flameBody(ctx, {
      id: 'base',
      anchor: foot,
      height: height * 0.16,
      width: girth * 0.9,
      count: 3,
      curl: 0.2,
      phase: 0.8,
      seed: ctx.seed,
    });
    out.push(
      emissivePiece(ctx, { id: 'base', mask: base.mask, at: foot, material: 'fire.flame', core: 2, turbulence: 0.15, depthBias: -0.4 }),
    );

    // Le flux emporte des braises sur toute la hauteur : c'est le secondaire
    // qui dit que la colonne monte, même quand sa silhouette est tenue.
    out.push(
      ...embers(ctx, {
        id: 'updraft',
        at: (birth) => ({ x: foot.x, y: foot.y, z: 0.1 + height * 0.15 * birth }),
        t: 0.2 + 0.16 * (i - 3),
        birth: [0, 0.75],
        count: open ? 14 : 10,
        scale: girth * 1.5,
        spread: 0.55,
        rise: 0.75,
      }),
    );
    out.push(
      ...sparks(ctx, {
        id: 'vent',
        at: foot,
        t: 0.2 + 0.18 * (i - 3),
        count: open ? 10 : 6,
        scale: girth * 2,
        dir: { x: 0, y: 0, z: 1 },
        spread: 0.8,
      }),
    );

    if (open) {
      // Colonne ouverte : deux lobes latéraux élargissent la silhouette, et
      // l'onde de chaleur part au sol. Sans eux, la pose tenue ne se distingue
      // pas de la montée.
      out.push(...fireNova(ctx, { id: 'nova', centre: foot, t: 0.25 + 0.4 * (i - 6), radius: girth * 2.1, petals: 6 }));
      for (const sign of [1, -1] as const) {
        const lobeAt = {
          x: foot.x + Math.cos(ctx.heading) * sign * girth * 0.45,
          y: foot.y + Math.sin(ctx.heading) * sign * girth * 0.45,
          z: height * 0.62,
        };
        const lobe = flameBody(ctx, {
          id: `lobe${sign > 0 ? 'a' : 'b'}`,
          anchor: lobeAt,
          height: height * 0.42,
          width: girth * 0.6,
          count: 2,
          curl: 0.8,
          phase: 0.5 + 0.2 * (i - 6),
          lean: sign * 0.75,
          seed: ctx.seed,
        });
        out.push(
          emissivePiece(ctx, {
            id: `lobe${sign > 0 ? 'a' : 'b'}`,
            mask: lobe.mask,
            at: lobeAt,
            material: 'fire.flame',
            core: 2.6,
            turbulence: 0.24,
            depthBias: -0.2,
          }),
        );
      }
      if (smokeAmount > 0) {
        out.push(
          ...smoke(ctx, {
            id: 'smoke',
            at: { x: foot.x, y: foot.y, z: height * 0.9 },
            t: 0.2 + 0.25 * (i - 6),
            count: 4,
            scale: girth * 1.4 * smokeAmount,
          }),
        );
      }
    }
    return out;
  }

  // --- Déchirement (8-9) : le débit est coupé, la tête poursuit sa montée.
  if (i <= 9) {
    const k = i - 8;
    const gap = tear * (0.35 + 0.3 * k);
    mark(girth * 1.6, 0.6 - 0.1 * k);
    const headZ = height * (1 + 0.18 * k);
    const head = flameBody(ctx, {
      id: 'head',
      anchor: { x: foot.x, y: foot.y, z: height * (0.55 + gap) },
      height: height * (0.5 - 0.1 * k),
      width: girth * (1.1 - 0.15 * k),
      count: Math.max(2, Math.round(tongues * 0.6)),
      curl: 0.6,
      phase: 0.7 + 0.2 * k,
      holes,
      core: 'column',
      topRatio: 0.45,
      seed: ctx.seed,
    });
    out.push(
      emissivePiece(ctx, {
        id: 'head',
        mask: head.mask,
        at: { x: foot.x, y: foot.y, z: headZ },
        material: 'fire.flame',
        core: 3,
        turbulence: 0.34,
        bias: -0.1 * k,
      }),
    );
    const stump = flameBody(ctx, {
      id: 'stump',
      anchor: foot,
      height: height * (0.42 - 0.18 * k),
      width: girth * (1 - 0.2 * k),
      count: 3,
      curl: 0.5,
      phase: 0.4,
      holes: 1,
      core: 'column',
      topRatio: 0.4,
      seed: ctx.seed,
    });
    out.push(
      emissivePiece(ctx, {
        id: 'stump',
        mask: stump.mask,
        at: foot,
        material: 'fire.flame',
        core: 2.4,
        turbulence: 0.3,
        bias: -0.15 - 0.25 * k,
        ceiling: 0.85 - 0.2 * k,
      }),
    );
    // Dans le vide qui s'ouvre, il reste des braises : la coupure se lit
    // d'autant mieux que quelque chose continue de monter.
    out.push(
      ...embers(ctx, {
        id: 'updraft',
        at: (birth) => ({ x: foot.x, y: foot.y, z: 0.1 + height * 0.15 * birth }),
        t: 0.72 + 0.14 * k,
        birth: [0, 0.75],
        count: 12,
        scale: girth * 1.5,
        spread: 0.7,
        rise: 0.75,
      }),
    );
    if (smokeAmount > 0) {
      out.push(
        ...smoke(ctx, {
          id: 'smoke',
          at: { x: foot.x, y: foot.y, z: height * 0.85 },
          t: 0.5 + 0.2 * k,
          count: 5,
          scale: girth * 1.6 * smokeAmount,
        }),
      );
    }
    return out;
  }

  // --- Extinction (10-11) : la fumée prend le relais, les cendres retombent.
  const k = i - 10;
  mark(girth * (1.5 - 0.2 * k), 0.8 - 0.25 * k);
  if (k === 0) {
    const rest = flameBody(ctx, {
      id: 'rest',
      anchor: foot,
      height: height * 0.22,
      width: girth * 0.8,
      count: 3,
      curl: 0.6,
      phase: 0.6,
      seed: ctx.seed,
    });
    out.push(
      emissivePiece(ctx, { id: 'rest', mask: rest.mask, at: foot, material: 'fire.flame', core: 2, turbulence: 0.3, bias: -0.35, ceiling: 0.62 }),
    );
  }
  out.push(
    ...embers(ctx, {
      id: 'updraft',
      at: (birth) => ({ x: foot.x, y: foot.y, z: 0.1 + height * 0.15 * birth }),
      t: Math.min(1, 0.86 + 0.1 * k),
      birth: [0, 0.75],
      count: 10,
      scale: girth * 1.4,
      spread: 0.9,
      rise: 0.6,
    }),
  );
  out.push(...ash(ctx, { id: 'ash', at: { x: foot.x, y: foot.y, z: height * 0.7 }, t: 0.35 + 0.35 * k, count: 7, scale: girth * 1.4 }));
  if (smokeAmount > 0) {
    out.push(
      ...smoke(ctx, {
        id: 'smoke',
        at: { x: foot.x, y: foot.y, z: height * 0.6 },
        t: Math.min(1, 0.68 + 0.22 * k),
        count: 6,
        scale: girth * 1.9 * smokeAmount,
      }),
    );
  }
  return out;
}

export const FIRE_DRAGON_PILLAR: SpellBuilder = {
  id: 'fire-dragon-pillar-m',
  label: 'Pilier du dragon',
  element: 'fire',
  rank: 'M',
  action: 'eruption',
  params: PILLAR_PARAMS,
  uses: {
    motifs: ['fire-ember-v1', 'fire-smoke-v1'],
    operators: ['flame-body', 'ground-mark', 'ground-cracks'],
  },
  build: pillarBuild,
};

// ---------------------------------------------------------------------------
// L — Cœur de comète
// ---------------------------------------------------------------------------

const COMET_PARAMS: ParamSpec[] = [
  { key: 'coreSize', label: 'Masse rocheuse', kind: 'number', default: 0.62, min: 0.3, max: 1.2, step: 0.02, unit: 'tuile', group: 'Silhouette' },
  { key: 'rough', label: 'Irrégularité de la croûte', kind: 'number', default: 0.34, min: 0, max: 0.6, step: 0.02, group: 'Silhouette' },
  { key: 'fallHeight', label: 'Hauteur d’apparition', kind: 'number', default: 5.2, min: 2, max: 9, step: 0.2, unit: 'tuile', group: 'Chute' },
  { key: 'lean', label: 'Inclinaison de la chute', kind: 'number', default: 1.5, min: 0, max: 4, step: 0.1, unit: 'tuile', group: 'Chute' },
  { key: 'trailLength', label: 'Traînée', kind: 'number', default: 1.5, min: 0, max: 4, step: 0.1, unit: 'tuile', group: 'Chute' },
  { key: 'fragments', label: 'Fragments', kind: 'integer', default: 6, min: 0, max: 12, step: 1, group: 'Impact' },
  { key: 'lobes', label: 'Lobes d’éclatement', kind: 'integer', default: 3, min: 2, max: 5, step: 1, group: 'Impact' },
  { key: 'craterRadius', label: 'Rayon du cratère', kind: 'number', default: 1.5, min: 0.5, max: 3, step: 0.1, unit: 'tuile', group: 'Conséquence' },
];

function cometBuild(ctx: FrameContext, p: ParamBag): Piece[] {
  const coreSize = p.num('coreSize');
  const rough = p.num('rough');
  const fallHeight = p.num('fallHeight');
  const leanDist = p.num('lean');
  const trailLength = p.num('trailLength');
  const fragments = p.int('fragments');
  const lobes = p.int('lobes');
  const craterRadius = p.num('craterRadius');
  const i = ctx.index;
  const out: Piece[] = [];
  const ground: Vec3 = { x: ctx.target.x, y: ctx.target.y, z: 0 };
  const groundDepth = ctx.depth(ground);

  // La comète arrive dans l'axe du cap : le sort a une direction, même s'il
  // tombe du ciel.
  const leanDir: Vec3 = { x: -Math.cos(ctx.heading), y: -Math.sin(ctx.heading), z: 0 };
  const fall = skyFall({ x: ground.x, y: ground.y, z: coreSize * 0.6 }, fallHeight, leanDir, leanDist);

  const rock = (at: Vec3, id: string, scale = 1, roll = 0): Piece[] => {
    const solid = chunk({
      id,
      seed: ctx.seed,
      center: at,
      size: { x: coreSize * scale, y: coreSize * scale, z: coreSize * 0.85 * scale },
      rough,
      roll,
    });
    const mask = solidMask(ctx, solid);
    return [
      {
        id,
        depth: ctx.depth(at),
        paint: (canvas, c) => {
          paintSolidObject(canvas, c, solid, {
            material: getMaterial('fire.crust'),
            rim: 'light',
            contact: 'deep',
          });
          // Veines chaudes : quelques traits qui courent dans la croûte. Une
          // moucheture donnerait des confettis, pas une roche fissurée.
          const host = mask.erode(1);
          const veins = veinMask(c, host, {
            id: `${id}/vein`,
            center: at,
            count: 3,
            length: coreSize * 0.9 * scale,
            seed: c.seed,
          });
          paintRole(canvas, veins, getMaterial('fire.vein'), 'body');
          paintRole(canvas, veins.erode(1), getMaterial('fire.vein'), 'light');
        },
      },
    ];
  };

  // --- Présage (0-2) : l'ombre d'abord, l'air qui chauffe, la masse ensuite.
  if (i <= 2) {
    const grow = [0.45, 0.7, 1][i] ?? 1;
    out.push(groundGlow(ctx, { id: 'omen-glow', centre: ground, radius: craterRadius * 0.7 * grow, level: 0.22 + 0.1 * i }));
    out.push(
      groundPiece('omen', groundDepth - 2.5, (canvas, c) => {
        paintGroundShadow(canvas, c, ground, craterRadius * 0.5 * grow, { id: 'omen', density: 0.45 + 0.2 * i });
      }),
    );
    out.push(
      ...converge(ctx, {
        id: 'herald',
        centre: { ...ground, z: 0.3 },
        t: [0.15, 0.55, 0.95][i] ?? 1,
        count: 7 - i,
        radius: craterRadius * 2,
        material: 'fire.ember',
        lift: craterRadius,
      }),
    );
    if (i === 2) {
      // La masse devient visible en hauteur : haute dans l'image, petite.
      const at = fall.at(0.08);
      out.push(...rock(at, 'core', 0.85));
      const halo = flameBody(ctx, {
        id: 'ignite',
        anchor: at,
        height: coreSize * 1.6,
        width: coreSize * 1.4,
        count: 3,
        curl: 0.4,
        phase: 0.4,
        seed: ctx.seed,
      });
      out.push(
        emissivePiece(ctx, { id: 'ignite', mask: halo.mask, at, material: 'fire.flame', core: 2.4, turbulence: 0.3, depthBias: -0.2 }),
      );
      out.push(...sparks(ctx, { id: 'ignite-sparks', at, t: 0.3, count: 6, scale: coreSize * 2, dir: { x: 0, y: 0, z: 1 }, spread: 1.2 }));
    }
    return out;
  }

  // --- Chute (3-5) : la traînée s'étire, les braises restent en arrière.
  if (i <= 5) {
    const t = [0.34, 0.62, 0.86][i - 3] ?? 0.5;
    const at = fall.at(t);
    const behind = fall.at(Math.max(0, t - 0.18));
    const sa = ctx.p(at);
    const sb = ctx.p(behind);
    const lean = leanToward(ctx, at, { x: sb.x - sa.x, y: sb.y - sa.y });
    out.push(
      groundPiece('shadow', groundDepth - 2.5, (canvas, c) => {
        paintGroundShadow(canvas, c, { x: at.x, y: at.y, z: at.z }, craterRadius * (0.45 + 0.3 * t), { id: 'shadow', density: 0.55 });
      }),
    );
    out.push(groundGlow(ctx, { id: 'omen-glow', centre: ground, radius: craterRadius * (0.8 + 0.5 * t), level: 0.3 }));

    // La traînée démarre **derrière** la masse, sinon la roche en cache la
    // moitié et le météore n'a plus de queue.
    const backDir = norm3({ x: behind.x - at.x, y: behind.y - at.y, z: behind.z - at.z });
    const trailAnchor = add3(at, scale3(backDir, coreSize * 0.75));
    const trail = flameBody(ctx, {
      id: 'trail',
      anchor: trailAnchor,
      height: trailLength * (0.9 + 1.1 * t),
      width: coreSize * 2.4,
      count: 3,
      curl: 0.3,
      phase: 0.3 + 0.3 * t,
      lean,
      holes: 1,
      core: 'column',
      topRatio: 0.35,
      seed: ctx.seed,
    });
    out.push(
      emissivePiece(ctx, { id: 'trail', mask: trail.mask, at: trailAnchor, material: 'fire.flame', core: 3, turbulence: 0.3, depthBias: -0.3 }),
    );
    // Braises et fumée semées le long de la chute : elles marquent le trajet
    // que la masse vient de parcourir.
    out.push(
      ...embers(ctx, {
        id: 'shed',
        at: (birth) => fall.at(Math.max(0, Math.min(1, birth))),
        t,
        birth: [0.06, t],
        count: 12,
        scale: coreSize * 2,
        spread: 1.2,
        rise: 0.1,
      }),
    );
    out.push(
      ...smoke(ctx, {
        id: 'trail-smoke',
        at: (birth) => fall.at(Math.max(0, Math.min(1, birth))),
        t,
        birth: [0.06, t],
        count: 5,
        scale: coreSize * 1.2,
        spread: 1.1,
      }),
    );
    out.push(...rock(at, 'core', 1, t * 1.2));
    out.push(
      ...scatterMotifs(ctx, {
        id: 'spall',
        motif: ROCK_CHIP,
        center: at,
        count: 2,
        radius: coreSize * 2,
        spread: 0.6,
        lift: 0.2,
        gravity: 0.8,
        frame: (k) => 1 + (k % 2),
      }),
    );
    return out;
  }

  // --- Contact (6) : le climax. Onde au sol, gerbe vers l'avant, fissures.
  if (i === 6) {
    const at: Vec3 = { x: ground.x, y: ground.y, z: coreSize * 0.55 };
    out.push(groundGlow(ctx, { id: 'impact-glow', centre: ground, radius: craterRadius * 1.5, level: 0.34 }));
    out.push(
      groundPiece('crater', groundDepth - 2.5, (canvas, c) => {
        paintGroundMark(canvas, c, ground, craterRadius * 0.8, 'fire.scorch', { id: 'crater', density: 0.9 });
      }),
    );
    out.push(...fireNova(ctx, { id: 'nova', centre: ground, t: 0.12, radius: craterRadius * 1.8, petals: 10 }));
    const crackMask = groundCracks(ctx, ground, {
      id: 'impact-cracks',
      seed: ctx.seed,
      count: 6,
      length: craterRadius * 1.3,
      width: 1,
      angleOffset: ctx.heading,
    });
    out.push(
      groundPiece('impact-cracks', groundDepth - 1.5, (canvas) => {
        paintRole(canvas, crackMask, getMaterial('fire.vein'), 'light');
      }),
    );
    out.push(...rock(at, 'core', 1.05, 1.4));
    const flash = flameBody(ctx, {
      id: 'flash',
      anchor: { x: ground.x, y: ground.y, z: 0.2 },
      height: coreSize * 2.2,
      width: coreSize * 4.2,
      count: 6,
      curl: 0.3,
      phase: 0.95,
      seed: ctx.seed,
    });
    out.push(
      emissivePiece(ctx, { id: 'flash', mask: flash.mask, at: ground, material: 'fire.flame', core: 2.2, turbulence: 0.18, depthBias: 0.4 }),
    );
    out.push(
      ...sparks(ctx, {
        id: 'burst',
        at: { ...ground, z: 0.15 },
        t: 0.16,
        count: 20,
        scale: craterRadius * 1.6,
        dir: forwardUp(ctx, 1.1),
        spread: 1.35,
      }),
    );
    out.push(...embers(ctx, { id: 'ember', at: { ...ground, z: 0.2 }, t: 0.12, count: 12, scale: craterRadius * 1.6 }));
    return out;
  }

  // --- Écrasement, lobes, dispersion (7-9).
  const shards = shatter(
    chunk({ id: 'core', seed: ctx.seed, center: { x: ground.x, y: ground.y, z: coreSize * 0.5 }, size: { x: coreSize, y: coreSize, z: coreSize * 0.85 }, rough }),
    { id: 'shatter', seed: ctx.seed, count: fragments, lift: 0.75, speed: 2.2 },
  );

  if (i <= 9) {
    const k = i - 7; // 0, 1, 2
    out.push(
      groundPiece('crater', groundDepth - 2.5, (canvas, c) => {
        paintGroundMark(canvas, c, ground, craterRadius * (0.95 + 0.12 * k), 'fire.scorch', { id: 'crater', density: 0.9 });
      }),
    );
    out.push(...fireNova(ctx, { id: 'nova', centre: ground, t: 0.34 + 0.3 * k, radius: craterRadius * 1.8, petals: 10 }));
    if (k === 0) {
      const at: Vec3 = { x: ground.x, y: ground.y, z: coreSize * 0.35 };
      out.push(...rock(at, 'core', 0.9, 1.9));
    }
    if (k >= 1) {
      const lobeMask = openLobes(ctx, {
        id: 'burst',
        center: { x: ground.x, y: ground.y, z: coreSize * 0.9 },
        radius: craterRadius * 2.1,
        lobes,
        opening: k === 1 ? 0.85 : 0.6,
        seed: ctx.seed,
        thickness: 0.5,
      });
      out.push(
        emissivePiece(ctx, {
          id: 'burst',
          mask: lobeMask,
          at: { x: ground.x, y: ground.y, z: coreSize },
          material: 'fire.flame',
          core: 3.4,
          turbulence: 0.26,
          bias: k === 2 ? -0.18 : 0,
        }),
      );
    }
    for (const f of shards) {
      const t = 0.18 + 0.2 * k;
      const at = fragmentAt(f, t, 3.4);
      out.push(
        motifPiece(ctx, {
          id: f.id,
          motif: ROCK_CHIP,
          at,
          frame: f.scale > 0.75 ? 0 : f.scale > 0.5 ? 1 : 2,
          flipX: f.roll > 1.5,
        }),
      );
    }
    out.push(...embers(ctx, { id: 'ember', at: { ...ground, z: 0.25 }, t: 0.3 + 0.24 * k, count: 12, scale: craterRadius * 1.6 }));
    out.push(
      ...sparks(ctx, { id: 'burst', at: { ...ground, z: 0.15 }, t: 0.4 + 0.24 * k, count: 16, scale: craterRadius * 1.6, dir: forwardUp(ctx, 1.1), spread: 1.2 }),
    );
    if (k >= 1) {
      out.push(...smoke(ctx, { id: 'smoke', at: { ...ground, z: 0.3 }, t: 0.2 * k, count: 6, scale: craterRadius * 1.2 }));
    }
    return out;
  }

  // --- Résidus (10-11) : la fumée monte, les morceaux s'assombrissent.
  const k = i - 10;
  out.push(
    groundPiece('crater', groundDepth - 2.5, (canvas, c) => {
      paintGroundMark(canvas, c, ground, craterRadius * (1.1 - 0.15 * k), 'fire.scorch', {
        id: 'crater',
        density: 0.85 - 0.25 * k,
      });
    }),
  );
  for (const f of shards) {
    if (f.scale < 0.45 + 0.2 * k) continue;
    const at = fragmentAt(f, 0.62 + 0.22 * k, 3.4);
    out.push(
      motifPiece(ctx, {
        id: f.id,
        motif: ROCK_CHIP,
        at: { ...at, z: Math.max(0, at.z) },
        frame: 1 + k,
        flipX: f.roll > 1.5,
        roleShift: -k,
      }),
    );
  }
  if (k === 0) {
    const rest = flameBody(ctx, {
      id: 'rest',
      anchor: { x: ground.x, y: ground.y, z: 0.1 },
      height: coreSize * 1.1,
      width: craterRadius * 1.1,
      count: 3,
      curl: 0.6,
      phase: 0.6,
      holes: 1,
      seed: ctx.seed,
    });
    out.push(
      emissivePiece(ctx, { id: 'rest', mask: rest.mask, at: ground, material: 'fire.flame', core: 2.2, turbulence: 0.3, bias: -0.3, ceiling: 0.7 }),
    );
  }
  out.push(...embers(ctx, { id: 'ember', at: { ...ground, z: 0.25 }, t: Math.min(1, 0.78 + 0.16 * k), count: 10, scale: craterRadius * 1.5 }));
  out.push(...ash(ctx, { id: 'ash', at: { ...ground, z: 0.6 }, t: 0.4 + 0.3 * k, count: 8, scale: craterRadius }));
  out.push(
    ...smoke(ctx, {
      id: 'smoke',
      at: { ...ground, z: 0.3 },
      t: Math.min(1, 0.45 + 0.3 * k),
      count: 8,
      scale: craterRadius * 1.3,
    }),
  );
  return out;
}

export const FIRE_COMET_HEART: SpellBuilder = {
  id: 'fire-comet-heart-l',
  label: 'Cœur de comète',
  element: 'fire',
  rank: 'L',
  action: 'skystrike',
  params: COMET_PARAMS,
  uses: {
    motifs: ['fire-ember-v1', 'fire-chip-v1', 'fire-smoke-v1'],
    operators: ['flame-body', 'open-lobes', 'chunk', 'shatter', 'ground-mark', 'ground-cracks'],
  },
  build: cometBuild,
};

export const FIRE_BUILDERS: readonly SpellBuilder[] = [
  FIRE_EMBER_PETAL,
  FIRE_DRAGON_PILLAR,
  FIRE_COMET_HEART,
];
