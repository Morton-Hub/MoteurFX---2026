/**
 * VENT — « Spirale de Coupe »
 *
 * Concept : le vent ne se voit que par ce qu'il écarte. Le sort n'est donc
 * jamais une masse pleine : ce sont des arcs ouverts, espacés, qui tournent
 * autour d'un axe vertical au dessus de la cible. Ils accélèrent, montent, et
 * chacun s'allonge en s'amincissant jusqu'a n'etre plus qu'un trait. Le centre
 * reste vide : c'est l'écart entre les arcs qui donne la rotation, pas un
 * tourbillon rempli.
 *
 * Chaque arc est decoupe en segments projetés independamment : la partie qui
 * passe devant la cible est peinte après celle qui passe derriere. La spirale
 * s'enroule donc reellement autour de l'axe au lieu d'etre un anneau plat.
 *
 * A la fin, les arcs lachent leur orbite par la tangente et partent en ligne
 * droite — la rotation se resout en fuite, pas en fondu sur place.
 *
 * Signature de forme : arcs ouverts, espacement, aucune boucle fermee, sortie
 * tangentielle.
 */

import { type Vec3, TAU, add3, clamp01, easeIn, easeOut, ramp, scale3, window4 } from '../core/math.js';
import { deriveSeed, randRange } from '../core/rng.js';
import { depthOf } from '../space/projection.js';
import type { DrawCmd } from '../render/draw.js';
import { fade } from '../raster/framebuffer.js';
import { rampAt } from '../style/palette.js';
import { emitDebris } from '../grammar/motion.js';
import type { SpellContext, SpellRecipe } from '../sim/types.js';

const DURATION = 1.25;

const T = {
  gust: 0.0,
  spawn: 0.1,
  accelerate: 0.3,
  peak: 0.56,
  release: 0.64,
  gone: 0.96,
} as const;

type Arc = {
  readonly phase: number;
  readonly radius: number;
  readonly height: number;
  readonly span: number;
  readonly width: number;
  readonly tilt: number;
  readonly born: number;
};

function arcsFor(count: number, seed: number): Arc[] {
  const out: Arc[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      phase: (i / count) * TAU + randRange(seed, i, 201, -0.3, 0.3),
      radius: randRange(seed, i, 202, 0.62, 1.3),
      height: (i / count) * 1.5 + randRange(seed, i, 203, 0, 0.35),
      span: randRange(seed, i, 204, 1.25, 2.1),
      width: randRange(seed, i, 205, 3.4, 6.2),
      // Les orbites ne sont pas coplanaires : la spirale a du volume.
      tilt: randRange(seed, i, 206, -0.22, 0.22),
      born: T.spawn + (i / count) * 0.14,
    });
  }
  return out;
}

/**
 * Un arc ouvert, decoupe en segments. Chaque segment porte sa propre
 * profondeur, ce qui permet a l'arc de passer devant puis derriere l'axe.
 */
function emitArc(
  ctx: SpellContext,
  centre: Vec3,
  arc: Arc,
  angle: number,
  radius: number,
  span: number,
  width: number,
  alpha: number,
  tone: number,
  segments: number,
  tag: string,
): DrawCmd[] {
  const out: DrawCmd[] = [];
  const pal = ctx.palette;
  const pts: Vec3[] = [];
  const widths: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const a = angle - span / 2 + span * u;
    // Fuseau : l'arc est fin a ses deux extremites, il n'a pas de bout franc.
    const taper = Math.pow(Math.sin(Math.PI * u), 0.55);
    pts.push(
      add3(centre, {
        x: Math.cos(a) * radius,
        y: Math.sin(a) * radius,
        z: Math.sin(a) * radius * arc.tilt,
      }),
    );
    widths.push(Math.max(0.6, width * taper));
  }
  for (let i = 0; i < segments; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const wa = widths[i]!;
    const wb = widths[i + 1]!;
    if (wa < 0.7 && wb < 0.7) continue;
    const mid: Vec3 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
    out.push({
      layer: 'main',
      // Un arc de vent est de l'air : ni liseré de volume, ni contour franc.
      material: 'soft',
      depth: depthOf(mid),
      shape: { t: 'ribbon', pts: [ctx.p(a), ctx.p(b)], widths: [wa, wb] },
      paint: {
        color: fade(rampAt(pal, tone), alpha),
        dither: alpha < 0.55 ? { level: 0.45 + alpha, matrix: 4 } : undefined,
      },
      tag,
    });
  }
  return out;
}

export const windCuttingSpiral: SpellRecipe = {
  id: 'wind-cutting-spiral',
  element: 'wind',
  title: 'Spirale de Coupe',
  concept:
    "Des arcs ouverts tournent autour d'un axe vertical au-dessus de la cible, accélèrent en montant, s'allongent jusqu'au trait, puis lâchent l'orbite par la tangente et fuient en ligne droite.",
  signature: [
    'Arcs ouverts et espacés, jamais une boucle fermée ni un cône plein',
    "Centre vide : la rotation se lit dans l'écart entre les arcs",
    "Segments triés indépendamment : l'arc passe devant puis derrière l'axe",
    'Sortie tangentielle, pas de disparition sur place',
  ],
  role: 'oneshot',
  duration: DURATION,
  // Douze images par seconde, comme le reste du catalogue : c'est la cadence
  // des feuilles 16 bits, et elle oblige chaque image à porter un changement
  // lisible au lieu de glisser d'un pixel.
  fps: 12,
  canvas: { width: 384, height: 256 },
  pivot: { x: 188, y: 156 },
  defaultRange: 3.3,
  defaultPower: 0.5,
  radial: false,
  loop: 'none',
  events: [
    { id: 'cast', at: T.gust, note: 'Rafale du lanceur vers la cible' },
    { id: 'release', at: T.spawn, note: 'Les arcs prennent leur orbite' },
    { id: 'peak', at: T.peak, note: 'Vitesse et extension maximales' },
    { id: 'settled', at: T.gone, note: 'Les arcs ont fui' },
  ],

  sample(t, ctx) {
    const out: DrawCmd[] = [];
    const pal = ctx.palette;
    const style = ctx.style;
    const seed = deriveSeed(ctx.seed, 'wind-cutting-spiral');
    const hit: Vec3 = ctx.wl(ctx.distance, 0, 0);
    // Le rang ajoute des arcs : la spirale se densifie sans grossir.
    const arcCount = 5 + Math.round(ctx.power * 3);
    const arcs = arcsFor(arcCount, seed);

    // ------------------------------------------------------------------
    // Rafale : un arc unique qui court du lanceur à la cible en s'etirant.
    // Il donne la direction avant que la spirale ne s'installe.
    // ------------------------------------------------------------------
    const gust = window4(t, T.gust, 0.02, T.spawn, T.spawn + 0.08);
    if (gust > 0) {
      const travel = easeOut(clamp01(ramp(t, T.gust, T.spawn + 0.04)));
      for (let k = 0; k < 3; k++) {
        const lag = travel - k * 0.12;
        if (lag <= 0) continue;
        const along = ctx.distance * lag;
        const centre = ctx.wl(along, 0, 0.35 + k * 0.28);
        out.push(
          ...emitArc(
            ctx,
            centre,
            arcs[k % arcs.length]!,
            ctx.heading + Math.PI + (k - 1) * 0.5,
            0.55 + k * 0.22,
            1.5 + travel * 1.4,
            3.4 - k * 0.6,
            gust * (0.9 - k * 0.22),
            0.25 + k * 0.12,
            9,
            'gust',
          ),
        );
      }
    }

    // ------------------------------------------------------------------
    // La spirale.
    // ------------------------------------------------------------------
    // La vitesse angulaire monte puis reste haute : l'accélération est le
    // sujet, elle ne doit pas etre lissee par une interpolation douce.
    const spin = (u: number): number => 3.4 * u + 16 * easeIn(clamp01(ramp(u, T.spawn, T.peak))) * (u - T.spawn);

    for (let i = 0; i < arcs.length; i++) {
      const arc = arcs[i]!;
      if (t < arc.born) continue;
      const releaseAt = T.release + (i / arcs.length) * 0.12;
      const life = window4(t, arc.born, arc.born + 0.06, releaseAt, T.gone);
      if (life <= 0) continue;

      const grow = easeOut(clamp01(ramp(t, arc.born, arc.born + 0.18)));
      const freed = clamp01(ramp(t, releaseAt, T.gone));
      const angle = arc.phase + spin(t) * TAU * 0.1;

      // Le rayon se resserre pendant l'accélération puis s'ouvre à la fuite.
      const pinch = 1 - 0.32 * easeOut(clamp01(ramp(t, T.accelerate, T.peak)));
      const radius = arc.radius * grow * pinch * (1 + freed * 1.3);
      const climb = arc.height * grow + 0.9 * easeOut(clamp01(ramp(t, T.spawn, T.peak))) + freed * 0.5;
      // L'étirement : l'arc couvre de plus en plus d'angle en s'amincissant.
      const span = arc.span * (0.55 + 0.75 * easeOut(clamp01(ramp(t, T.spawn, T.peak)))) * (1 - freed * 0.45);
      const width = arc.width * (0.5 + 0.5 * grow) * (1 - freed * 0.72);

      // A la libération, le centre de l'orbite part par la tangente.
      const tangent: Vec3 = { x: -Math.sin(angle), y: Math.cos(angle), z: 0 };
      const centre = add3(
        add3(hit, { x: 0, y: 0, z: climb }),
        scale3(tangent, freed * freed * 1.8),
      );

      const tone = 0.1 + (i / arcs.length) * 0.26 + freed * 0.3;
      out.push(
        ...emitArc(ctx, centre, arc, angle, radius, span, width, life, tone, 13, 'arc'),
      );

      // Arete de coupe : un trait clair d'un pixel sur le bord intérieur.
      if (width > 1.8 && life > 0.4) {
        out.push(
          ...emitArc(
            ctx,
            centre,
            arc,
            angle,
            radius - width * 0.02,
            span * 0.8,
            1,
            life * 0.85,
            0,
            13,
            'edge',
          ),
        );
      }
    }

    // ------------------------------------------------------------------
    // Debris pris dans l'orbite : ils tournent avec la spirale puis sont
    // éjectés par la tangente. Leur cone d'emission suit cette tangente.
    // ------------------------------------------------------------------
    const orbiting = window4(t, T.spawn, T.spawn + 0.08, T.release, T.release + 0.06);
    if (orbiting > 0) {
      for (let i = 0; i < 14; i++) {
        const r = randRange(seed, i, 211, 0.5, 1.5);
        const h = randRange(seed, i, 212, 0.1, 1.9);
        const a = randRange(seed, i, 213, 0, TAU) + spin(t) * TAU * 0.1 * randRange(seed, i, 214, 0.8, 1.3);
        const p = add3(hit, { x: Math.cos(a) * r, y: Math.sin(a) * r, z: h * easeOut(clamp01(ramp(t, T.spawn, T.peak))) + 0.1 });
        const s = ctx.p(p);
        const size = randRange(seed, i, 215, 1, 2.4);
        out.push({
          layer: 'main',
          depth: depthOf(p),
          shape: {
            t: 'line',
            pts: [
              { x: s.x - Math.sin(a) * size * 2.2, y: s.y + Math.cos(a) * size },
              { x: s.x + Math.sin(a) * size * 2.2, y: s.y - Math.cos(a) * size },
            ],
            width: 1,
          },
          paint: { color: fade(i % 4 === 0 ? pal.accent : pal.ramp[2] ?? pal.core, orbiting * 0.9) },
          material: 'soft',
          tag: 'leaf',
        });
      }
    }

    if (t >= T.release) {
      out.push(
        ...emitDebris(ctx, {
          seed: seed + 301,
          count: 20,
          clipTime: t - T.release,
          startedAt: T.release,
          origin: (i) =>
            add3(hit, {
              x: randRange(seed, i, 221, -0.9, 0.9),
              y: randRange(seed, i, 222, -0.9, 0.9),
              z: randRange(seed, i, 223, 0.3, 2),
            }),
          axis: (i) => {
            const a = randRange(seed, i, 224, 0, TAU);
            return { x: Math.cos(a), y: Math.sin(a), z: 0.18 };
          },
          spread: 0.35,
          speed: [2.0, 3.8],
          gravity: 1.2,
          launch: (i) => randRange(seed, i, 225, 0, 0.08),
          life: [0.16, 0.32],
          size: [1, 2.2],
          kind: 'shard',
          palette: pal,
          style,
          tone: [0.1, 0.45],
          tag: 'leaf',
        }),
      );
    }

    // ------------------------------------------------------------------
    // Sol : deux arcs de poussière ouverts, jamais un anneau complet.
    // ------------------------------------------------------------------
    const ground = window4(t, T.spawn, T.spawn + 0.1, T.release + 0.1, T.gone);
    if (ground > 0) {
      const spread = 0.85 + 0.85 * easeOut(clamp01(ramp(t, T.spawn, T.gone)));
      for (let k = 0; k < 2; k++) {
        out.push(
          ...emitArc(
            ctx,
            add3(hit, { x: 0, y: 0, z: 0.03 }),
            arcs[k % arcs.length]!,
            spin(t) * TAU * 0.06 + k * Math.PI,
            spread,
            2.0,
            3.2,
            ground * 0.5,
            0.45,
            11,
            'dust',
          ),
        );
      }
    }

    if (style.glow) {
      const core = window4(t, T.spawn, T.accelerate, T.release, T.gone);
      if (core > 0) {
        const c = ctx.p(add3(hit, { x: 0, y: 0, z: 1.1 }));
        out.push({
          layer: 'light',
          depth: depthOf(hit) + 5,
          shape: { t: 'ring', c, rx: 26, ry: 22, thickness: 12 },
          paint: { color: fade(pal.glow, 0.18 * core), dither: { level: 0.45 } },
          tag: 'glow',
        });
      }
    }

    return out;
  },
};
