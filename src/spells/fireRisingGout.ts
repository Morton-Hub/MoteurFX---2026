/**
 * FEU — « Gerbe Ascendante »
 *
 * Concept : le feu n'explose pas en boule, il gonfle puis se déchire. Une
 * traînée de braises court au sol jusqu'à la cible, la base s'embrase en un
 * lobe large et bas, le corps monte en se resserrant, et des langues se
 * détachent une a une vers le haut. Les vides internes s'ouvrent au moment de
 * l'étirement : c'est le trou qui raconte la déchirure, pas le contour.
 *
 * Le refroidissement est une descente dans la rampe, pas une baisse d'opacité :
 * une langue devient orange, puis rouge sombre, puis fumée, et seul le tramage
 * la fait disparaitre.
 *
 * Signature de forme : lobes asymétriques penches, vides internes, base large
 * et sommet effile. Aucun contour circulaire, aucun anneau de choc.
 */

import { type Vec3, add3, clamp01, easeOut, easeOutExpo, ramp, window4 } from '../core/math.js';
import { deriveSeed, randRange } from '../core/rng.js';
import { depthOf } from '../space/projection.js';
import type { DrawCmd, Ramp, Shape } from '../render/draw.js';
import { poly } from '../render/draw.js';
import { fade } from '../raster/framebuffer.js';
import { rampSlice } from '../style/palette.js';
import { blobPolygon, voidPolygon, type BlobSpec } from '../grammar/blob.js';
import { emitDebris } from '../grammar/motion.js';
import { emitPlate, residueAlpha } from '../grammar/ground.js';
import type { SpellContext, SpellRecipe } from '../sim/types.js';

const DURATION = 1.35;

/** Aucune matiere visible au-dela de cet instant : le clip finit propre. */
const CLIP_OUT = 0.96;

const T = {
  trailStart: 0.02,
  ignite: 0.14,
  swellEnd: 0.36,
  tearStart: 0.38,
  collapse: 0.56,
  smokeEnd: 0.97,
} as const;

/**
 * Corps mou avec dégradé vertical postérisé et vides internes.
 * `heat` = 0 : blanc-jaune du coeur. `heat` = 1 : fumée.
 */
function emitLobe(
  ctx: SpellContext,
  spec: BlobSpec,
  heat: number,
  alpha: number,
  voids: number,
  tag: string,
  depthBias = 0,
): DrawCmd[] {
  const pts3 = blobPolygon(ctx.projection, spec);
  if (pts3.length < 3) return [];
  const pts = pts3.map((p) => ctx.p(p));
  let top = Infinity;
  let bottom = -Infinity;
  for (const p of pts) {
    if (p.y < top) top = p.y;
    if (p.y > bottom) bottom = p.y;
  }
  // Le dégradé est ancre sur la silhouette elle-même : une langue qui monte
  // garde son coeur clair en bas, quelle que soit sa position a l'écran.
  const from = clamp01(heat * 0.62);
  const to = clamp01(0.42 + heat * 0.58);
  const gradient: Ramp = { y0: bottom, y1: top, stops: rampSlice(ctx.palette, from, to, 5) };

  const holes: Shape[] = [];
  for (let i = 0; i < voids; i++) {
    holes.push(poly(voidPolygon(ctx.projection, spec, i, 0.3 + i * 0.1).map((p) => ctx.p(p))));
  }

  const depth = depthOf(spec.center) + depthBias;
  const out: DrawCmd[] = [
    {
      layer: 'main',
      depth,
      shape: poly(pts),
      paint: {
        color: ctx.palette.ramp[2] ?? ctx.palette.core,
        ramp: gradient,
        dither: alpha < 1 ? { level: alpha, matrix: 4 } : undefined,
      },
      holes: holes.length > 0 ? holes : undefined,
      tag,
    },
  ];
  // Coeur : une langue intérieure plus claire, décalée vers le bas.
  if (heat < 0.55) {
    const core: BlobSpec = {
      ...spec,
      radius: spec.radius * 0.52,
      center: add3(spec.center, { x: 0, y: 0, z: -spec.radius * spec.aspect * 0.18 }),
      wobble: spec.wobble * 0.7,
      seed: spec.seed + 313,
    };
    const corePts = blobPolygon(ctx.projection, core).map((p) => ctx.p(p));
    out.push({
      layer: 'main',
      depth: depth + 0.4,
      shape: poly(corePts),
      paint: {
        color: ctx.palette.ramp[0] ?? ctx.palette.core,
        ramp: { y0: bottom, y1: top, stops: rampSlice(ctx.palette, 0, 0.3 + heat, 4) },
        dither: alpha < 1 ? { level: alpha, matrix: 4, phaseX: 1 } : undefined,
      },
      tag,
    });
  }
  if (ctx.style.glow && heat < 0.7) {
    const c = ctx.p(spec.center);
    out.push({
      layer: 'light',
      depth,
      shape: { t: 'disc', c, r: spec.radius * ctx.projection.groundScale * 0.9 },
      paint: { color: fade(ctx.palette.glow, 0.28 * (1 - heat) * alpha), dither: { level: 0.6 } },
      tag: 'glow',
    });
  }
  return out;
}

export const fireRisingGout: SpellRecipe = {
  id: 'fire-rising-gout',
  element: 'fire',
  title: 'Gerbe Ascendante',
  concept:
    "Une traînée de braises court au sol, la cible s'embrase en un lobe large, le corps monte en se resserrant et se déchire en langues qui se détachent et refroidissent jusqu'à la fumée.",
  signature: [
    'Lobes asymétriques penchés, base large et sommet effilé',
    "Vides internes qui s'ouvrent pendant l'étirement",
    'Refroidissement par descente dans la rampe, pas par opacité',
    'Détachement des langues une à une, jamais un souffle unique',
  ],
  role: 'oneshot',
  duration: DURATION,
  fps: 24,
  canvas: { width: 296, height: 216 },
  pivot: { x: 145, y: 128 },
  defaultRange: 3.3,
  defaultPower: 0.5,
  radial: false,
  loop: 'none',
  events: [
    { id: 'cast', at: T.trailStart, note: 'Traînée de braises au sol' },
    { id: 'release', at: T.ignite, note: 'Embrasement de la base' },
    { id: 'peak', at: T.swellEnd, note: 'Extension maximale' },
    { id: 'fracture', at: T.tearStart, note: 'Déchirement : les langues se détachent' },
    { id: 'settled', at: T.smokeEnd, note: 'Fumée dissipée' },
  ],

  sample(t, ctx) {
    const out: DrawCmd[] = [];
    const pal = ctx.palette;
    const style = ctx.style;
    const seed = deriveSeed(ctx.seed, 'fire-rising-gout');
    const hit: Vec3 = ctx.wl(ctx.distance, 0, 0);
    // Le rang ajoute des langues, pas de la taille : le sort garde sa silhouette.
    const tongueCount = 3 + Math.round(ctx.power * 3);

    // ------------------------------------------------------------------
    // Trainee de braises : elle donne la direction avant que le feu parte.
    // ------------------------------------------------------------------
    const trail = window4(t, T.trailStart, T.trailStart + 0.02, T.ignite, T.ignite + 0.06);
    if (trail > 0) {
      const head = easeOutExpo(ramp(t, T.trailStart, T.ignite));
      for (let i = 0; i < 9; i++) {
        const along = (i + 1) / 10;
        if (along > head) continue;
        const life = clamp01((head - along) * 5);
        const hop = Math.abs(Math.sin(along * 9 + i)) * 0.32 * (1 - life * 0.6);
        const pos = ctx.wl(
          ctx.distance * along,
          randRange(seed, i, 111, -0.28, 0.28),
          0.06 + hop,
        );
        const r = (0.1 + randRange(seed, i, 112, 0, 0.09)) * (1 - life * 0.45);
        out.push(
          ...emitLobe(
            ctx,
            {
              center: pos,
              radius: r,
              aspect: 1.5,
              lean: 0.25,
              wobble: 0.3,
              phase: t * 22 + i,
              sides: 9,
              seed: seed + i * 71,
              taper: 0.5,
            },
            0.15 + life * 0.5,
            trail * (1 - life * 0.8),
            0,
            'trail',
          ),
        );
      }
    }

    // ------------------------------------------------------------------
    // Sol : brulure à la cible.
    // ------------------------------------------------------------------
    if (t >= T.ignite - 0.02) {
      const scorch = residueAlpha(t, 0.72, 0.99, 0.5) * easeOut(ramp(t, T.ignite - 0.02, T.ignite + 0.1));
      out.push(...emitPlate(ctx, hit, 1.15, 11, seed + 21, pal.rim, scorch, 'decal', 0.35));
      const glowRing = window4(t, T.ignite, T.ignite + 0.08, T.collapse, 0.8);
      out.push(...emitPlate(ctx, hit, 0.72, 9, seed + 22, pal.ground, glowRing * 0.45, 'decal', 0.4));
    }

    // ------------------------------------------------------------------
    // Socle : la flaque en feu au sol. Large, basse, très claire. Elle ancre
    // la gerbe et donne l'échelle sans jamais monter.
    // ------------------------------------------------------------------
    const baseLife = window4(t, T.ignite, T.ignite + 0.05, T.collapse, 0.8);
    if (baseLife > 0) {
      const swell = easeOut(ramp(t, T.ignite, T.ignite + 0.14));
      const wane = ramp(t, T.tearStart, 0.8);
      const r = (0.5 + 0.4 * swell) * (1 - wane * 0.5);
      out.push(
        ...emitLobe(
          ctx,
          {
            center: add3(hit, { x: 0, y: 0, z: r * 0.42 }),
            radius: r,
            aspect: 0.62,
            lean: 0.05,
            wobble: 0.3,
            phase: t * 13,
            sides: 13,
            seed: seed + 3,
            taper: 0.1,
          },
          clamp01(0.16 + wane * 0.5),
          baseLife,
          0,
          'base',
          1,
        ),
      );
    }

    // ------------------------------------------------------------------
    // La gerbe : un faisceau de langues, chacune avec sa hauteur, son
    // inclinaison et sa phase. Elles montent ensemble puis se détachent une
    // a une, en partant de la plus haute.
    //
    // C'est la séparation des langues, et non un contour unique, qui donne
    // la silhouette du feu. Aucune ne partage la phase d'une autre.
    // ------------------------------------------------------------------
    type Tongue = { side: number; fwd: number; height: number; width: number; lean: number; phase: number };
    const TONGUES: readonly Tongue[] = [
      { side: -0.46, fwd: -0.12, height: 1.15, width: 0.4, lean: -0.42, phase: 0 },
      { side: 0.06, fwd: 0.14, height: 1.85, width: 0.5, lean: 0.14, phase: 1.9 },
      { side: 0.5, fwd: -0.06, height: 1.35, width: 0.36, lean: 0.46, phase: 3.3 },
      { side: -0.14, fwd: -0.34, height: 0.9, width: 0.32, lean: -0.12, phase: 4.7 },
      { side: 0.28, fwd: 0.34, height: 1.5, width: 0.3, lean: 0.3, phase: 5.8 },
      { side: -0.34, fwd: 0.28, height: 1.0, width: 0.27, lean: -0.28, phase: 2.4 },
    ];
    const activeTongues = Math.min(TONGUES.length, tongueCount);

    for (let i = 0; i < activeTongues; i++) {
      const g = TONGUES[i]!;
      const born = T.ignite + i * 0.016;
      // Les plus hautes se détachent les premieres : la gerbe se vide par le haut.
      const detach = T.tearStart + (activeTongues - 1 - i) * 0.055;
      // Toute langue doit etre eteinte avant la derniere image : la gerbe se
      // resout en fumee, elle ne se fait pas couper par la fin du clip.
      const death = Math.min(CLIP_OUT, detach + 0.34 + randRange(seed, i, 151, 0, 0.14));
      if (t < born || t > death) continue;

      const grow = easeOut(ramp(t, born, born + 0.16));
      const freed = clamp01(ramp(t, detach, death));
      const flicker = Math.sin(t * 26 + g.phase * 2) * 0.5 + 0.5;

      // Tant qu'elle tient au socle, la langue reste ancree ; une fois
      // détachée, elle monte et dérive latéralement.
      const rise = 1.15 * easeOut(freed) * (0.6 + g.height * 0.5);
      const drift = freed * g.lean * 1.1;
      const radius = g.width * (0.55 + 0.45 * grow) * (1 - freed * 0.42) * (0.92 + flicker * 0.16);
      const aspect = (1.9 + g.height * 1.05) * (0.7 + 0.3 * grow) * (1 - freed * 0.18);
      // Le bas de la langue reste pose sur le socle tant qu'elle n'est pas
      // détachée : la hauteur vient de l'étirement, pas d'un decollage.
      const center = add3(hit, {
        x: g.fwd * 0.55 + drift,
        y: g.side * 0.8,
        z: radius * aspect * 0.78 + rise,
      });
      out.push(
        ...emitLobe(
          ctx,
          {
            center,
            radius,
            aspect,
            lean: g.lean * (0.6 + flicker * 0.5) + freed * 0.25,
            wobble: 0.34 + freed * 0.2,
            phase: t * 15 + g.phase,
            sides: 13,
            seed: seed + i * 457,
            taper: 0.52 + freed * 0.3,
          },
          clamp01(freed * 0.92),
          1 - ramp(freed, 0.78, 1),
          freed > 0.3 ? 2 : grow > 0.8 ? 1 : 0,
          'tongue',
          3 + i * 0.2 + g.fwd,
        ),
      );
    }

    // ------------------------------------------------------------------
    // Braises : cone oriente vers le haut, refroidissement dans la rampe.
    // ------------------------------------------------------------------
    if (t >= T.ignite) {
      out.push(
        ...emitDebris(ctx, {
          seed: seed + 61,
          count: 42,
          clipTime: t - T.ignite,
          startedAt: T.ignite,
          origin: (i) =>
            add3(hit, {
              x: randRange(seed, i, 131, -0.35, 0.35),
              y: randRange(seed, i, 132, -0.35, 0.35),
              z: 0.12,
            }),
          axis: () => ({ x: 0, y: 0, z: 1 }),
          spread: 0.62,
          speed: [1.3, 3.4],
          gravity: 1.7,
          launch: (i) => randRange(seed, i, 133, 0, 0.42),
          life: [0.28, 0.66],
          size: [1, 2.4],
          kind: 'ember',
          palette: pal,
          style,
          tone: [0, 0.35],
          tag: 'ember',
        }),
      );
    }

    // ------------------------------------------------------------------
    // Fumee : elle prend la suite des langues, sombre et très tramee.
    // ------------------------------------------------------------------
    for (let i = 0; i < 4; i++) {
      const at = T.collapse + i * 0.06;
      const life = Math.min(0.4, CLIP_OUT - at);
      const age = t - at;
      if (age < 0 || age > life) continue;
      const k = clamp01(age / life);
      const center = add3(hit, {
        x: randRange(seed, i, 141, -0.5, 0.5) * (0.4 + k),
        y: randRange(seed, i, 142, -0.5, 0.5) * (0.4 + k),
        z: 0.8 + 1.15 * easeOut(k),
      });
      out.push(
        ...emitLobe(
          ctx,
          {
            center,
            radius: (0.28 + randRange(seed, i, 143, 0, 0.12)) * (1 + k * 1.2),
            aspect: 1.05,
            lean: 0.1,
            wobble: 0.34,
            phase: t * 6 + i * 3,
            sides: 12,
            seed: seed + 900 + i * 131,
            taper: 0.15,
          },
          1,
          (1 - k) * 0.55 * (1 - ramp(t, T.smokeEnd - 0.1, T.smokeEnd)),
          1,
          'smoke',
          -2,
        ),
      );
    }

    return out;
  },
};
