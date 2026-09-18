/**
 * Vocabulaires FX par élément.
 *
 * Trois familles de secondaires, et elles ne sont pas interchangeables : ce
 * qui distingue le feu de la glace à l'écran, une fois la masse principale
 * retirée, ce sont **ces** particules-là.
 *
 *  Feu     — braises qui montent et refroidissent, étincelles rapides, cendres
 *            qui retombent, fumée qui s'ouvre, couronne de langues dressées au sol.
 *  Glace   — éclats rigides projetés, poudrin qui flotte, brume rasante,
 *            cristallisation en pointes au sol, éclats de lumière tenus une image.
 *  Foudre  — étincelles filantes, poussière statique attirée, rémanence
 *            ionique, couronne de branches qui court au sol.
 *
 * Tout est ancré dans le monde et orienté par le cap : à l'impact, la gerbe
 * part vers l'avant du sort, ce qui rend les huit directions réellement
 * différentes.
 */

import { norm3, type Vec3 } from '../core/math.js';
import { flameBody, leanToward } from '../geometry/flame.js';
import { prism } from '../geometry/forms.js';
import { paintSolidObject } from '../geometry/solid.js';
import { getMaterial } from '../pixels/palette.js';
import { paintRole } from '../pixels/shade.js';
import { clusterMask, particleField, type EmitterOptions } from '../geometry/particles.js';
import { groundBlob, groundBranches, groundRing } from '../geometry/groundShapes.js';
import { boltMask } from '../geometry/bolt.js';
import type { FrameContext } from '../renderer/context.js';
import type { Piece } from '../renderer/piece.js';
import { emissivePiece, groundPiece, piece } from './common.js';

/** Vecteur du cap, dans le plan du sol. */
export function forward(ctx: FrameContext): Vec3 {
  return { x: Math.cos(ctx.heading), y: Math.sin(ctx.heading), z: 0 };
}

/** Direction mêlant l'avant du sort et la verticale. */
export function forwardUp(ctx: FrameContext, upBias: number): Vec3 {
  const f = forward(ctx);
  return norm3({ x: f.x, y: f.y, z: upBias });
}

export type FxBase = {
  readonly id: string;
  readonly at: Vec3 | ((birth: number) => Vec3);
  /** Progression de l'effet sur [0,1]. */
  readonly t: number;
  readonly count?: number;
  /** Échelle générale, en tuiles. */
  readonly scale?: number;
  readonly dir?: Vec3;
  readonly spread?: number;
  readonly birth?: readonly [number, number];
  readonly depthBias?: number;
};

function emitter(o: FxBase, extra: Partial<EmitterOptions>): EmitterOptions {
  return {
    id: o.id,
    at: o.at,
    count: o.count ?? 8,
    life: 0.7,
    speed: [0.5, 1.2],
    ...(o.birth ? { birth: o.birth } : {}),
    ...(o.dir ? { dir: o.dir } : {}),
    ...(o.spread !== undefined ? { spread: o.spread } : {}),
    ...extra,
  } as EmitterOptions;
}


/**
 * Convergence : des amas qui **rentrent** vers un point au lieu d'en sortir.
 * C'est l'anticipation la moins chère et la plus lisible — le spectateur sait
 * qu'il va se passer quelque chose avant que ça se passe.
 */
export function converge(
  ctx: FrameContext,
  o: {
    id: string;
    centre: Vec3;
    t: number;
    count?: number;
    radius: number;
    material: 'fire.ember' | 'ice.mist' | 'lightning.ion';
    size?: number;
    /** Hauteur de départ au-dessus du point, en tuiles. */
    lift?: number;
  },
): Piece[] {
  const count = o.count ?? 6;
  const material = getMaterial(o.material);
  const size = o.size ?? 1;
  const out: Piece[] = [];
  for (let i = 0; i < count; i++) {
    const gid = `${o.id}#${i}`;
    // L'angle part du cap : la convergence tourne avec le sort.
    const a = ctx.heading + (i / count) * Math.PI * 2 + (ctx.rnd(gid, 1) - 0.5) * 0.6;
    const distance = o.radius * (0.55 + 0.65 * ctx.rnd(gid, 2)) * Math.max(0, 1 - o.t);
    const at: Vec3 = {
      x: o.centre.x + Math.cos(a) * distance,
      y: o.centre.y + Math.sin(a) * distance,
      z: o.centre.z + (o.lift ?? 0.25) * (0.3 + ctx.rnd(gid, 3)) * Math.max(0, 1 - o.t),
    };
    const screen = ctx.p(at);
    const role = o.t > 0.6 ? 'accent' : o.t > 0.3 ? 'light' : 'body';
    out.push(
      piece(gid, ctx.depth(at) + 0.5, (canvas) => {
        paintRole(canvas, clusterMask(ctx, screen, Math.round(size)), material, role);
      }),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Feu
// ---------------------------------------------------------------------------

/** Braises : elles montent, ralentissent et refroidissent. */
export function embers(ctx: FrameContext, o: FxBase & { rise?: number }): Piece[] {
  const scale = o.scale ?? 1;
  return particleField(
    ctx,
    o.t,
    emitter(o, {
      life: 0.85,
      speed: [0.5 * scale, 1.5 * scale],
      dir: o.dir ?? { x: 0, y: 0, z: 1 },
      spread: o.spread ?? 0.9,
      gravity: -(o.rise ?? 0.35),
      drag: 2.4,
    }),
    {
      material: 'fire.ember',
      size: [1.4 * scale, 0.2],
      roles: ['accent', 'light', 'body', 'shadow'],
      ...(o.depthBias !== undefined ? { depthBias: o.depthBias } : {}),
    },
  );
}

/** Étincelles : rapides, droites, avec une traînée d'une image. */
export function sparks(ctx: FrameContext, o: FxBase): Piece[] {
  const scale = o.scale ?? 1;
  return particleField(
    ctx,
    o.t,
    emitter(o, {
      life: 0.45,
      speed: [2.2 * scale, 4.5 * scale],
      dir: o.dir ?? forwardUp(ctx, 0.8),
      spread: o.spread ?? 1.1,
      gravity: 2.6,
      drag: 1.2,
    }),
    {
      material: 'fire.ember',
      size: [1, 0],
      roles: ['accent', 'light', 'body'],
      streak: 0.09,
      ...(o.depthBias !== undefined ? { depthBias: o.depthBias } : {}),
    },
  );
}

/** Fumée : lente, elle grossit, se trame et finit par se trouer. */
export function smoke(ctx: FrameContext, o: FxBase): Piece[] {
  const scale = o.scale ?? 1;
  return particleField(
    ctx,
    o.t,
    emitter(o, {
      life: 1.1,
      speed: [0.25 * scale, 0.7 * scale],
      dir: o.dir ?? { x: 0, y: 0, z: 1 },
      spread: o.spread ?? 0.8,
      gravity: -0.15,
      drag: 2.8,
    }),
    {
      material: 'fire.smoke',
      size: [1.6 * scale, 3.4 * scale],
      roles: ['light', 'body', 'shadow', 'deep'],
      dither: 0.62,
      shape: 'puff',
      ...(o.depthBias !== undefined ? { depthBias: o.depthBias } : {}),
    },
  );
}

/** Cendres : elles retombent en tournoyant, bien après le reste. */
export function ash(ctx: FrameContext, o: FxBase): Piece[] {
  const scale = o.scale ?? 1;
  return particleField(
    ctx,
    o.t,
    emitter(o, {
      life: 1.2,
      speed: [0.4 * scale, 1.1 * scale],
      dir: o.dir ?? { x: 0, y: 0, z: 1 },
      spread: o.spread ?? 1.3,
      gravity: 1.4,
      drag: 1.6,
      swirl: 1.1,
      floor: true,
    }),
    {
      material: 'fire.smoke',
      size: [1, 0.6],
      roles: ['body', 'shadow', 'deep'],
      ...(o.depthBias !== undefined ? { depthBias: o.depthBias } : {}),
    },
  );
}

/**
 * Nova de feu : un **anneau de langues debout**.
 *
 * La première version posait des pétales à plat sur le sol. À cette échelle un
 * polygone couché se lit comme une feuille découpée, pas comme du feu : il n'a
 * ni volume, ni direction, ni bord chaud. Ici chaque langue est une vraie
 * petite flamme, plantée sur un cercle du plan du sol, peinte à **sa** propre
 * profondeur — celles de devant passent donc devant, et l'anneau s'ouvre en
 * ellipse comme tout le reste de la scène.
 */
export function fireNova(
  ctx: FrameContext,
  o: { id: string; centre: Vec3; t: number; radius: number; tongues?: number; depthBias?: number },
): Piece[] {
  const count = Math.max(4, Math.round(o.tongues ?? 7));
  const radius = o.radius * (0.3 + 0.85 * o.t);
  const out: Piece[] = [];

  // Poussière soulevée : sombre, basse, tramée. Elle donne l'assise de l'onde
  // sans rien éclairer.
  const dust = groundRing(ctx, {
    id: `${o.id}/dust`,
    centre: { x: o.centre.x, y: o.centre.y, z: 0.02 },
    radius: radius * 1.02,
    thickness: Math.max(0.12, o.radius * 0.16),
    wobble: 0.2,
  });
  out.push(
    groundPiece(`${o.id}/dust`, ctx.depth({ x: o.centre.x, y: o.centre.y, z: 0 }) - 1, (canvas) => {
      paintRole(canvas, dust, getMaterial('fire.scorch'), o.t < 0.5 ? 'body' : 'shadow', {
        level: 0.5 - 0.3 * o.t,
        matrix: 4,
      });
    }),
  );

  for (let i = 0; i < count; i++) {
    const gid = `${o.id}/tongue#${i}`;
    const angle = ctx.heading + (i / count) * Math.PI * 2 + (ctx.rnd(gid, 1) - 0.5) * 0.3;
    const r = radius * (0.85 + 0.3 * ctx.rnd(gid, 2));
    const foot: Vec3 = { x: o.centre.x + Math.cos(angle) * r, y: o.centre.y + Math.sin(angle) * r, z: 0 };
    // Les langues se couchent vers l'extérieur en s'écartant : l'onde pousse.
    const outward = ctx.p({ x: foot.x + Math.cos(angle), y: foot.y + Math.sin(angle), z: 0 });
    const origin = ctx.p(foot);
    const lean = leanToward(ctx, foot, { x: outward.x - origin.x, y: outward.y - origin.y }) * (0.25 + 0.4 * o.t);
    // Hauteurs très inégales, et une langue sur cinq qui manque : un anneau
    // régulier se lit comme une couronne de décoration, pas comme une onde.
    if (ctx.rnd(gid, 9) < 0.18) continue;
    const height = o.radius * (0.4 + 0.55 * ctx.rnd(gid, 3) ** 1.6) * (1 - 0.4 * o.t);
    const body = flameBody(ctx, {
      id: gid,
      anchor: foot,
      height,
      width: o.radius * 0.3 * (1 - 0.25 * o.t),
      count: 2,
      curl: 0.55,
      phase: 0.3 + 0.5 * o.t + ctx.rnd(gid, 4) * 0.3,
      lean,
      seed: ctx.seed,
    });
    out.push(
      emissivePiece(ctx, {
        id: gid,
        mask: body.mask,
        at: foot,
        material: 'fire.flame',
        core: 2.2,
        turbulence: 0.22,
        bias: -0.3 * o.t,
        ceiling: 1 - 0.25 * o.t,
        ...(o.depthBias !== undefined ? { depthBias: o.depthBias } : {}),
      }),
    );
  }
  return out;
}

/** Lueur d'ignition au sol : chaude, tramée, elle prévient l'impact. */
export function groundGlow(
  ctx: FrameContext,
  o: { id: string; centre: Vec3; radius: number; material?: 'fire.scorch' | 'ice.frost' | 'lightning.scorch'; level?: number },
): Piece {
  const mask = groundBlob(ctx, { id: o.id, centre: { ...o.centre, z: 0.01 }, radius: o.radius, wobble: 0.22 });
  return groundPiece(o.id, ctx.depth({ x: o.centre.x, y: o.centre.y, z: 0 }) - 1.5, (canvas) => {
    // Une lueur au sol reste **sous** la matière : sombre et clairsemée. Posée
    // en clair, elle devient un tapis qui mange le sort qu'elle annonce.
    paintRole(canvas, mask, getMaterial(o.material ?? 'fire.scorch'), 'body', {
      level: o.level ?? 0.3,
      matrix: 4,
    });
  });
}

// ---------------------------------------------------------------------------
// Glace
// ---------------------------------------------------------------------------

/** Éclats : rigides, projetés vers l'avant, ils tombent et restent au sol. */
export function shards(ctx: FrameContext, o: FxBase): Piece[] {
  const scale = o.scale ?? 1;
  return particleField(
    ctx,
    o.t,
    emitter(o, {
      life: 0.95,
      speed: [1.6 * scale, 3.4 * scale],
      dir: o.dir ?? forwardUp(ctx, 1.1),
      spread: o.spread ?? 1.2,
      gravity: 3.4,
      drag: 0.6,
      floor: true,
    }),
    {
      material: 'ice.crystal',
      // Pas de traînée pour la glace : un éclat rigide ne file pas, il vole.
      size: [1.6 * scale, 1 * scale],
      roles: ['accent', 'light', 'body', 'shadow'],
      ...(o.depthBias !== undefined ? { depthBias: o.depthBias } : {}),
    },
  );
}

/** Poudrin : il flotte, il descend à peine, il scintille en refroidissant. */
export function frostMotes(ctx: FrameContext, o: FxBase): Piece[] {
  const scale = o.scale ?? 1;
  return particleField(
    ctx,
    o.t,
    emitter(o, {
      life: 1.15,
      speed: [0.3 * scale, 0.9 * scale],
      dir: o.dir ?? { x: 0, y: 0, z: 1 },
      spread: o.spread ?? 1.4,
      gravity: 0.5,
      drag: 2.6,
      swirl: 0.8,
    }),
    {
      material: 'ice.mist',
      size: [1, 0.2],
      roles: ['accent', 'light', 'body', 'shadow'],
      ...(o.depthBias !== undefined ? { depthBias: o.depthBias } : {}),
    },
  );
}

/** Brume rasante : elle s'étale au sol au lieu de monter. */
export function mist(ctx: FrameContext, o: FxBase): Piece[] {
  const scale = o.scale ?? 1;
  return particleField(
    ctx,
    o.t,
    emitter(o, {
      life: 1.2,
      speed: [0.6 * scale, 1.4 * scale],
      dir: o.dir ?? forward(ctx),
      spread: o.spread ?? Math.PI,
      gravity: 0.1,
      drag: 3.2,
      floor: true,
    }),
    {
      material: 'ice.mist',
      size: [2 * scale, 3.6 * scale],
      roles: ['light', 'body', 'shadow'],
      dither: 0.5,
      shape: 'puff',
      depthBias: o.depthBias ?? -0.5,
    },
  );
}

/**
 * Nova de gel : une **couronne de pointes debout**, qui pousse par paliers.
 *
 * Même correction que pour le feu : des triangles couchés au sol se lisent
 * comme des feuilles, pas comme de la glace. Ce sont maintenant de petits
 * prismes plantés en cercle, facettés et contournés comme le reste de
 * l'élément, chacun à sa profondeur.
 */
export function frostNova(
  ctx: FrameContext,
  o: { id: string; centre: Vec3; t: number; radius: number; spikes?: number; depthBias?: number },
): Piece[] {
  const count = Math.max(4, Math.round(o.spikes ?? 9));
  // Croissance par paliers : quatre marches, comme le reste de l'élément.
  const stepped = Math.ceil(Math.max(0.05, o.t) * 4) / 4;
  const radius = o.radius * (0.35 + 0.75 * stepped);
  const out: Piece[] = [];

  const ring = groundRing(ctx, {
    id: `${o.id}/ring`,
    centre: { x: o.centre.x, y: o.centre.y, z: 0.02 },
    radius: radius * 0.92,
    thickness: Math.max(0.1, o.radius * 0.12),
    wobble: 0.22,
  });
  out.push(
    groundPiece(`${o.id}/ring`, ctx.depth({ x: o.centre.x, y: o.centre.y, z: 0 }) - 1, (canvas) => {
      paintRole(canvas, ring, getMaterial('ice.frost'), o.t < 0.5 ? 'light' : 'body', {
        level: 0.7 - 0.3 * o.t,
        matrix: 4,
      });
    }),
  );

  for (let i = 0; i < count; i++) {
    const gid = `${o.id}/spike#${i}`;
    const angle = ctx.heading + (i / count) * Math.PI * 2 + (ctx.rnd(gid, 1) - 0.5) * 0.35;
    const r = radius * (0.8 + 0.35 * ctx.rnd(gid, 2));
    const base: Vec3 = { x: o.centre.x + Math.cos(angle) * r, y: o.centre.y + Math.sin(angle) * r, z: 0 };
    const lean = 0.35 + 0.3 * ctx.rnd(gid, 3);
    const axis = norm3({ x: Math.cos(angle) * lean, y: Math.sin(angle) * lean, z: 1 });
    const length = o.radius * (0.5 + 0.45 * ctx.rnd(gid, 4)) * stepped;
    const solid = prism({
      id: gid,
      seed: ctx.seed,
      base,
      axis,
      length,
      radius: o.radius * 0.11,
      sides: 5,
      irregular: 0.22,
      taper: 0.5,
      roll: ctx.rnd(gid, 5) * Math.PI,
    });
    out.push({
      id: gid,
      depth: ctx.depth(solid.center) + (o.depthBias ?? 0),
      paint: (canvas, c) => {
        paintSolidObject(canvas, c, solid, {
          material: getMaterial('ice.crystal'),
          rim: 'accent',
          contact: 'deep',
          bias: 0.08 * o.t,
        });
      },
    });
  }
  return out;
}

/**
 * Éclat de lumière : un plus de quatre pixels, tenu une image, posé sur une
 * arête. C'est l'accent le plus économique du pixel art, et il ne coûte rien
 * à la silhouette.
 */
export function glints(
  ctx: FrameContext,
  o: { id: string; points: readonly Vec3[]; role?: 'accent' | 'light'; size?: number },
): Piece[] {
  const material = getMaterial('ice.crystal');
  const size = Math.max(1, Math.round(o.size ?? 2));
  return o.points.map((point, i) => {
    const screen = ctx.p(point);
    return piece(`${o.id}#${i}`, ctx.depth(point) + 1, (canvas) => {
      const ink = canvas.ink(material, o.role ?? 'accent');
      const cx = Math.round(screen.x);
      const cy = Math.round(screen.y);
      for (let d = -size; d <= size; d++) {
        canvas.set(cx + d, cy, ink);
        canvas.set(cx, cy + d, ink);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Foudre
// ---------------------------------------------------------------------------

/** Étincelles d'arc : très rapides, très courtes, en traînées. */
export function arcSparks(ctx: FrameContext, o: FxBase): Piece[] {
  const scale = o.scale ?? 1;
  return particleField(
    ctx,
    o.t,
    emitter(o, {
      life: 0.35,
      speed: [3 * scale, 6 * scale],
      dir: o.dir ?? forwardUp(ctx, 0.6),
      spread: o.spread ?? 1.5,
      gravity: 2.2,
      drag: 2.2,
    }),
    {
      material: 'lightning.bolt',
      size: [1.3, 0],
      roles: ['accent', 'light', 'body'],
      streak: 0.07,
      ...(o.depthBias !== undefined ? { depthBias: o.depthBias } : {}),
    },
  );
}

/** Poussière statique : elle est **attirée** vers le point de charge. */
export function staticMotes(
  ctx: FrameContext,
  o: { id: string; centre: Vec3; t: number; count?: number; radius: number },
): Piece[] {
  const count = o.count ?? 10;
  const material = getMaterial('lightning.ion');
  const out: Piece[] = [];
  for (let i = 0; i < count; i++) {
    const gid = `${o.id}#${i}`;
    const a = ctx.heading + ctx.rnd(gid, 1) * Math.PI * 2;
    const r = o.radius * (0.5 + 0.7 * ctx.rnd(gid, 2)) * (1 - o.t * 0.85);
    const z = 0.15 + o.radius * 0.7 * ctx.rnd(gid, 3) * (1 - o.t * 0.5);
    const at: Vec3 = { x: o.centre.x + Math.cos(a) * r, y: o.centre.y + Math.sin(a) * r, z };
    const screen = ctx.p(at);
    out.push(
      piece(gid, ctx.depth(at), (canvas) => {
        const ink = canvas.ink(material, o.t > 0.6 ? 'body' : 'shadow');
        canvas.set(Math.round(screen.x), Math.round(screen.y), ink);
        canvas.set(Math.round(screen.x) + 1, Math.round(screen.y), ink);
      }),
    );
  }
  return out;
}

/**
 * Couronne du tonnerre : des branches qui **courent** au sol depuis le point
 * d'impact, avec un cœur clair. Elles s'interrompent net.
 */
export function boltNova(
  ctx: FrameContext,
  o: { id: string; centre: Vec3; t: number; radius: number; branches?: number; depthBias?: number },
): Piece[] {
  const branches = groundBranches(ctx, {
    id: `${o.id}/branches`,
    centre: { x: o.centre.x, y: o.centre.y, z: 0.03 },
    radius: o.radius,
    count: o.branches ?? 6,
    width: o.t < 0.5 ? 2 : 1,
    growth: Math.min(1, 0.35 + o.t),
    forks: 1,
  });
  // Pas d'anneau pour la foudre : une couronne lumineuse ferait exactement
  // l'effet passe-partout que le style refuse. Le sol est simplement **brûlé**
  // sous les branches, et cette marque, elle, reste.
  const scorch = groundBlob(ctx, {
    id: `${o.id}/scorch`,
    centre: { x: o.centre.x, y: o.centre.y, z: 0.01 },
    radius: o.radius * (0.25 + 0.35 * o.t),
    wobble: 0.3,
  });
  const depth = ctx.depth({ x: o.centre.x, y: o.centre.y, z: 0 }) + (o.depthBias ?? -1);
  return [
    groundPiece(`${o.id}/scorch`, depth - 0.2, (canvas) => {
      paintRole(canvas, scorch, getMaterial('lightning.scorch'), 'shadow', { level: 0.55, matrix: 4 });
    }),
    groundPiece(`${o.id}/branches`, depth, (canvas) => {
      const material = getMaterial('lightning.bolt');
      paintRole(canvas, branches, material, o.t < 0.4 ? 'light' : 'body');
      paintRole(canvas, branches.erode(1), material, 'accent');
    }),
  ];
}

/**
 * Éclair de contact : la gerbe blanche de la décharge de retour.
 *
 * Ce n'est ni un disque ni une couronne — deux formes que le style refuse —
 * mais une **étoile brisée** : des dards droits, d'inégale longueur, qui
 * partent tous du point de contact. Un dard sur trois est cassé en deux
 * tronçons, ce qui évite la symétrie florale et donne l'irrégularité propre
 * à une décharge. Les dards sont construits dans le monde puis projetés, si
 * bien que l'étoile s'aplatit correctement selon le cap.
 */
export function boltFlash(
  ctx: FrameContext,
  o: { id: string; centre: Vec3; t: number; radius: number; spikes?: number; depthBias?: number },
): Piece[] {
  const count = Math.max(5, Math.round(o.spikes ?? 9));
  // La gerbe s'ouvre vite puis se rétracte : elle ne tient jamais une pose.
  const open = o.t < 0.35 ? o.t / 0.35 : 1 - (o.t - 0.35) / 0.65;
  const reach = o.radius * (0.35 + 0.75 * Math.max(0, open));
  if (reach < 0.05) return [];
  const paths: Vec3[][] = [];
  for (let i = 0; i < count; i++) {
    const gid = `${o.id}#${i}`;
    // Répartition inégale : un pas régulier plus un décalage propre au dard.
    const a = ctx.heading + (i / count) * Math.PI * 2 + (ctx.rnd(gid, 1) - 0.5) * 1.1;
    // Longueurs franchement inégales — l'égalité ferait une fleur.
    const len = reach * (0.35 + 0.95 * ctx.rnd(gid, 2) ** 1.7);
    // Les dards du haut montent, ceux du bas rasent le sol.
    const lift = (ctx.rnd(gid, 3) - 0.25) * 1.3;
    const dir = norm3({ x: Math.cos(a), y: Math.sin(a), z: lift });
    const bend = (ctx.rnd(gid, 4) - 0.5) * 0.5;
    const side = { x: -Math.sin(a), y: Math.cos(a), z: 0 };
    const mid: Vec3 = {
      x: o.centre.x + dir.x * len * 0.5 + side.x * len * bend,
      y: o.centre.y + dir.y * len * 0.5 + side.y * len * bend,
      z: Math.max(0.02, o.centre.z + dir.z * len * 0.5),
    };
    const tip: Vec3 = {
      x: o.centre.x + dir.x * len,
      y: o.centre.y + dir.y * len,
      z: Math.max(0.02, o.centre.z + dir.z * len),
    };
    paths.push([o.centre, mid, tip]);
  }
  const mask = boltMask(ctx, paths, 2.2 * (0.55 + 0.5 * Math.max(0, open)), 0.85);
  return [
    emissivePiece(ctx, {
      id: `${o.id}/flash`,
      mask,
      at: o.centre,
      material: 'lightning.bolt',
      core: 1.6,
      turbulence: 0.06,
      grain: 2,
      bias: 0.1,
      ...(o.depthBias !== undefined ? { depthBias: o.depthBias } : {}),
    }),
  ];
}

/**
 * Colonne de retour : le canal vertical qui reste allumé une image après le
 * contact. C'est ce qui donne à la foudre sa **hauteur** — sans lui, une
 * frappe vue de trois quarts se lit comme un gribouillis posé au sol.
 */
export function boltColumn(
  ctx: FrameContext,
  o: { id: string; foot: Vec3; height: number; t: number; width?: number; seed?: number },
): Piece[] {
  const width = o.width ?? 3;
  const steps = 5;
  const path: Vec3[] = [];
  for (let s = 0; s <= steps; s++) {
    const k = s / steps;
    const gid = `${o.id}@${s}`;
    const wobble = s === 0 ? 0 : (ctx.rnd(gid, 1) - 0.5) * o.height * 0.16;
    const lateral = s === 0 ? 0 : (ctx.rnd(gid, 2) - 0.5) * o.height * 0.16;
    path.push({
      x: o.foot.x + wobble,
      y: o.foot.y + lateral,
      z: o.foot.z + o.height * k,
    });
  }
  // La colonne s'éteint par le haut : le sommet disparaît avant le pied.
  const alive = Math.max(0, 1 - o.t);
  const mask = boltMask(ctx, [path], width * (0.5 + 0.7 * alive), 0.35);
  return [
    emissivePiece(ctx, {
      id: `${o.id}/column`,
      mask,
      at: o.foot,
      material: 'lightning.bolt',
      core: Math.max(1.4, width * 0.7),
      turbulence: 0.08,
      grain: 2,
      bias: -0.35 * o.t,
      ceiling: 1 - 0.3 * o.t,
    }),
  ];
}
