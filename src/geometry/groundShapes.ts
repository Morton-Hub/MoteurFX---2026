/**
 * Formes construites **dans le plan du sol**.
 *
 * C'est le point qui rend une onde de choc juste en isométrie : une couronne
 * dessinée à l'écran est un cercle qui ne se pose sur rien, alors qu'une
 * couronne construite au sol se projette en ellipse et tourne avec le cap.
 * Toutes les formes ci-dessous partent de coordonnées polaires monde, avec un
 * angle de départ pris sur le cap du sort.
 */

import type { Vec2, Vec3 } from '../core/math.js';
import { randN } from '../core/rng.js';
import type { ShapeMask } from '../pixels/mask.js';
import type { FrameContext } from '../renderer/context.js';

function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const polar = (ctx: FrameContext, c: Vec3, r: number, a: number): Vec2 =>
  ctx.p({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r, z: c.z });

/**
 * Couronne irrégulière : un anneau au sol dont le rayon respire. Le tramage
 * en donne l'épaisseur perçue sans alpha partiel.
 */
export function groundRing(
  ctx: FrameContext,
  o: { id: string; centre: Vec3; radius: number; thickness: number; wobble?: number; steps?: number },
): ShapeMask {
  const steps = Math.max(12, Math.round(o.steps ?? 28));
  const seed = ctx.seed ^ hashId(o.id);
  const wobble = o.wobble ?? 0.12;
  const outer: Vec2[] = [];
  const inner: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = ctx.heading + (i / steps) * Math.PI * 2;
    const jitter = 1 + (randN(seed, i % steps, 1) - 0.5) * 2 * wobble;
    outer.push(polar(ctx, o.centre, o.radius * jitter, a));
    inner.push(polar(ctx, o.centre, Math.max(0, o.radius * jitter - o.thickness), a));
  }
  const poly = [...outer, ...inner.reverse()];
  const mask = ctx.mask(poly, 2);
  mask.addPolygon(poly);
  return mask;
}

/**
 * Pétales rayonnants au sol : la forme d'une nova de feu. Chaque pétale est
 * large à sa racine et pointu au bout — pas un secteur angulaire.
 */
export function groundPetals(
  ctx: FrameContext,
  o: {
    id: string;
    centre: Vec3;
    radius: number;
    count: number;
    /** Rayon intérieur : le vide au centre d'une onde qui s'écarte. */
    inner?: number;
    width?: number;
  },
): ShapeMask {
  const seed = ctx.seed ^ hashId(o.id);
  const width = o.width ?? 0.7;
  const inner = o.inner ?? 0;
  const polys: Vec2[][] = [];
  const all: Vec2[] = [];
  for (let i = 0; i < o.count; i++) {
    const base = ctx.heading + (i / o.count) * Math.PI * 2 + (randN(seed, i, 1) - 0.5) * 0.25;
    const len = o.radius * (0.7 + 0.6 * randN(seed, i, 2));
    const half = ((Math.PI * 2) / o.count) * 0.5 * width;
    const poly: Vec2[] = [];
    const steps = 4;
    for (let s = 0; s <= steps; s++) {
      const k = s / steps;
      const r = inner + (len - inner) * k;
      poly.push(polar(ctx, o.centre, r, base - half * (1 - k) ** 0.7));
    }
    for (let s = steps; s >= 0; s--) {
      const k = s / steps;
      const r = inner + (len - inner) * k;
      poly.push(polar(ctx, o.centre, r, base + half * (1 - k) ** 0.7));
    }
    polys.push(poly);
    all.push(...poly);
  }
  const mask = ctx.mask(all, 2);
  for (const p of polys) mask.addPolygon(p);
  return mask;
}

/**
 * Pointes rayonnantes au sol : la forme d'une cristallisation. Triangles
 * nets, longueurs inégales, aucune courbe.
 */
export function groundSpikes(
  ctx: FrameContext,
  o: { id: string; centre: Vec3; radius: number; count: number; width?: number; inner?: number },
): ShapeMask {
  const seed = ctx.seed ^ hashId(o.id);
  const width = o.width ?? 0.35;
  const inner = o.inner ?? o.radius * 0.12;
  const polys: Vec2[][] = [];
  const all: Vec2[] = [];
  for (let i = 0; i < o.count; i++) {
    const a = ctx.heading + (i / o.count) * Math.PI * 2 + (randN(seed, i, 1) - 0.5) * 0.3;
    const len = o.radius * (0.55 + 0.75 * randN(seed, i, 2));
    const half = ((Math.PI * 2) / o.count) * 0.5 * width;
    const poly = [
      polar(ctx, o.centre, inner, a - half),
      polar(ctx, o.centre, len, a + (randN(seed, i, 3) - 0.5) * 0.12),
      polar(ctx, o.centre, inner, a + half),
    ];
    polys.push(poly);
    all.push(...poly);
  }
  const mask = ctx.mask(all, 2);
  for (const p of polys) mask.addPolygon(p);
  return mask;
}

/**
 * Branches rayonnantes au sol, qui se divisent : la forme d'une décharge qui
 * court. Elles s'interrompent net, elles ne s'estompent pas.
 */
export function groundBranches(
  ctx: FrameContext,
  o: {
    id: string;
    centre: Vec3;
    radius: number;
    count: number;
    width?: number;
    /** Avancement sur [0,1] : une branche pousse, elle n'apparaît pas entière. */
    growth?: number;
    forks?: number;
  },
): ShapeMask {
  const seed = ctx.seed ^ hashId(o.id);
  const width = o.width ?? 1;
  const growth = o.growth ?? 1;
  const forks = o.forks ?? 1;
  const lines: Vec2[][] = [];
  const all: Vec2[] = [];
  for (let i = 0; i < o.count; i++) {
    const a0 = ctx.heading + (i / o.count) * Math.PI * 2 + (randN(seed, i, 1) - 0.5) * 0.5;
    const len = o.radius * (0.6 + 0.7 * randN(seed, i, 2)) * growth;
    const line: Vec2[] = [];
    const steps = 4;
    let a = a0;
    for (let s = 0; s <= steps; s++) {
      a += (randN(seed, i * 8 + s, 3) - 0.5) * 0.55;
      line.push(polar(ctx, o.centre, (len * s) / steps, a));
    }
    lines.push(line);
    all.push(...line);
    for (let f = 0; f < forks; f++) {
      const at = 2 + Math.floor(randN(seed, i * 4 + f, 4) * 2);
      const start = line[Math.min(at, line.length - 1)] as Vec2;
      const branchAngle = a + (randN(seed, i * 4 + f, 5) > 0.5 ? 0.8 : -0.8);
      const branchLen = len * (0.25 + 0.3 * randN(seed, i * 4 + f, 6));
      const end = polar(ctx, o.centre, (len * at) / steps + branchLen, branchAngle);
      lines.push([start, end]);
      all.push(start, end);
    }
  }
  const mask = ctx.mask(all, width + 2);
  for (const line of lines) mask.addPolyline(line, width);
  return mask;
}

/** Disque au sol à bord irrégulier : lueur d'ignition, flaque, dépôt. */
export function groundBlob(
  ctx: FrameContext,
  o: { id: string; centre: Vec3; radius: number; wobble?: number; steps?: number },
): ShapeMask {
  const steps = Math.max(10, Math.round(o.steps ?? 26));
  const seed = ctx.seed ^ hashId(o.id);
  const wobble = o.wobble ?? 0.18;
  const poly: Vec2[] = [];
  for (let i = 0; i < steps; i++) {
    const a = ctx.heading + (i / steps) * Math.PI * 2;
    poly.push(polar(ctx, o.centre, o.radius * (1 + (randN(seed, i, 1) - 0.5) * 2 * wobble), a));
  }
  const mask = ctx.mask(poly, 2);
  mask.addPolygon(poly);
  return mask;
}
