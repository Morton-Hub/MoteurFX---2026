/**
 * EAU — « Lame Deferlante »
 *
 * Concept : l'eau est une masse pleine, pas un nuage de gouttes. Une lame se
 * leve devant le lanceur et court au sol jusqu'à la cible. Sa crête monte,
 * puis la lèvre depasse la base : le tube se forme et l'on voit son dessous
 * rentrer dans l'ombre. A la rupture, la crête seule se disloque en gouttes
 * étirées selon leur tangente reelle, et le corps s'affaisse en s'etalant
 * latéralement.
 *
 * La lame est construite par colonnes transversales : chaque colonne a sa
 * position de base, sa hauteur et son avancee de lèvre. La silhouette vient
 * donc de la section, jamais d'une deformation d'image.
 *
 * Signature de forme : crête continue, ruban plein, lèvre en surplomb,
 * gouttes étirées. Aucune particule ronde isolee, aucun anneau.
 */

import { type Vec3, add3, clamp01, easeIn, easeOut, ramp, window4 } from '../core/math.js';
import { deriveSeed, randRange } from '../core/rng.js';
import { depthOf } from '../space/projection.js';
import { type DrawCmd, poly } from '../render/draw.js';
import { fade } from '../raster/framebuffer.js';
import { rampSlice } from '../style/palette.js';
import { emitDebris } from '../grammar/motion.js';
import { emitPlate, residueAlpha } from '../grammar/ground.js';
import type { SpellContext, SpellRecipe } from '../sim/types.js';

const DURATION = 1.45;

/** Aucune matière visible au-delà de cet instant : le clip finit propre. */
const CLIP_OUT = 0.96;

const T = {
  gather: 0.0,
  surgeStart: 0.1,
  curlStart: 0.42,
  breakAt: 0.58,
  collapseEnd: 0.84,
  dryEnd: 0.98,
} as const;

const COLUMNS = 15;
const HALF_WIDTH = 1.45;

/** Profil latéral : 1 au centre, 0 aux extremites, epaules marquees. */
function lateralProfile(s: number): number {
  const c = Math.cos((s * Math.PI) / 2);
  return Math.pow(Math.max(0, c), 0.75);
}

type WaveShape = {
  /** Pied arrière de la masse, au sol. */
  readonly back: Vec3[];
  /** Ligne de crête, en hauteur, avancee par la lèvre. */
  readonly crest: Vec3[];
  /** Pied avant, au sol, sous la lèvre. */
  readonly front: Vec3[];
  readonly height: number;
  readonly lip: number;
  readonly frontAt: number;
};

/**
 * Section de la lame à un instant donne, en coordonnees monde.
 * `delay` decale la lame dans le temps et `scale` reduit sa masse : c'est
 * ainsi que les rangs superieurs produisent des lames successives sans
 * dupliquer la moindre logique.
 */
function waveShape(
  ctx: SpellContext,
  t: number,
  seed: number,
  delay = 0,
  scale = 1,
): WaveShape | null {
  const u = t - delay;
  const surge = clamp01(ramp(u, T.surgeStart, T.breakAt));
  if (surge <= 0) return null;
  const front = 0.55 + (ctx.distance - 0.55) * easeOut(surge);

  const collapse = ramp(u, T.breakAt, T.collapseEnd);
  const growH = easeOut(clamp01(ramp(u, T.surgeStart, T.curlStart + 0.08)));
  const height = (0.32 + 1.55 * growH) * (1 - collapse * 0.85) * scale;
  const lip = 0.62 * easeIn(clamp01(ramp(u, T.curlStart, T.breakAt))) * (1 - collapse);
  // En s'affaissant, la lame s'elargit : la masse va quelque part.
  const widen = 1 + collapse * 0.42;
  const collapseSpread = collapse * 0.5;

  // Trois lignes transversales : pied arrière, crête, pied avant. La
  // silhouette de la lame est l'assemblage de ces sections, jamais une image
  // deformee.
  const back: Vec3[] = [];
  const crest: Vec3[] = [];
  const frontLine: Vec3[] = [];
  for (let i = 0; i < COLUMNS; i++) {
    const s = (i / (COLUMNS - 1)) * 2 - 1;
    const p = lateralProfile(s);
    const wobble = randRange(seed, i, 161, -0.07, 0.07);
    const fwdBase = front - 0.42 * (1 - p) + wobble;
    const side = s * HALF_WIDTH * widen * scale;
    back.push(ctx.wl(fwdBase - 0.85 - collapseSpread, side * 0.96, 0.02));
    crest.push(ctx.wl(fwdBase + lip * p, side * 0.9, Math.max(0.03, height * p + wobble * 0.3)));
    frontLine.push(ctx.wl(fwdBase + 0.32 + lip * p * 0.55 + collapseSpread * 0.8, side, 0.02));
  }
  return { back, crest, front: frontLine, height, lip, frontAt: front };
}

/**
 * Corps d'une lame : dos, face avant, dessous de tube, crête et écume.
 * Extrait ici pour que les rangs superieurs puissent emettre plusieurs lames
 * successives sans dupliquer la moindre regle de rendu.
 */
function emitLame(ctx: SpellContext, shape: WaveShape, alpha: number, withGlow: boolean): DrawCmd[] {
  const out: DrawCmd[] = [];
  if (alpha <= 0) return out;
  const pal = ctx.palette;
  const anchor = shape.back[Math.floor(COLUMNS / 2)]!;
  const foot = shape.front[Math.floor(COLUMNS / 2)]!;

  const screenSpan = (pts: readonly { x: number; y: number }[]): { top: number; bottom: number } => {
    let top = Infinity;
    let bottom = -Infinity;
    for (const p of pts) {
      if (p.y < top) top = p.y;
      if (p.y > bottom) bottom = p.y;
    }
    return { top, bottom };
  };

  // Dos de la lame : pente arrière, sombre, peinte en premier.
  const backPts = [...shape.back, ...[...shape.crest].reverse()].map((p) => ctx.p(p));
  const backSpan = screenSpan(backPts);
  out.push({
    layer: 'main',
    depth: depthOf(anchor),
    shape: poly(backPts),
    paint: {
      color: pal.ramp[4] ?? pal.core,
      ramp: { y0: backSpan.bottom, y1: backSpan.top, stops: rampSlice(pal, 0.95, 0.62, 4) },
      dither: alpha < 1 ? { level: alpha, matrix: 4 } : undefined,
    },
    tag: 'body',
  });

  // Face avant : la paroi d'eau. Elle s'eclaircit vers la crête, là où la
  // lame est mince et laisse passer la lumière.
  const frontPts = [...shape.crest, ...[...shape.front].reverse()].map((p) => ctx.p(p));
  const frontSpan = screenSpan(frontPts);
  const depth = depthOf(foot);
  out.push({
    layer: 'main',
    depth,
    shape: poly(frontPts),
    paint: {
      color: pal.ramp[3] ?? pal.core,
      ramp: { y0: frontSpan.bottom, y1: frontSpan.top, stops: rampSlice(pal, 0.82, 0.24, 5) },
      dither: alpha < 1 ? { level: alpha, matrix: 4, phaseX: 2 } : undefined,
    },
    tag: 'body',
  });

  // Dessous du tube : la lèvre porte son ombre sur le corps.
  if (shape.lip > 0.08) {
    const under: { x: number; y: number }[] = [];
    for (let i = 0; i < COLUMNS; i++) under.push(ctx.p(shape.crest[i]!));
    for (let i = COLUMNS - 1; i >= 0; i--) {
      const c = shape.crest[i]!;
      under.push(ctx.p({ x: c.x, y: c.y, z: Math.max(0.02, c.z - 0.34 - shape.lip * 0.3) }));
    }
    out.push({
      layer: 'main',
      depth: depth + 0.4,
      shape: poly(under),
      paint: { color: fade(pal.ramp[5] ?? pal.rim, 0.55 * alpha * clamp01(shape.lip * 2)) },
      tag: 'tube',
    });
  }

  // Crête : un liseré clair continu, plus epais au centre.
  const crestPts = shape.crest.map((p) => ctx.p(p));
  const crestWidths = shape.crest.map((_, i) => {
    const s = (i / (COLUMNS - 1)) * 2 - 1;
    return 1.6 + 5 * lateralProfile(s);
  });
  out.push({
    layer: 'main',
    depth: depth + 0.8,
    shape: { t: 'ribbon', pts: crestPts, widths: crestWidths },
    paint: { color: fade(pal.ramp[1] ?? pal.core, alpha) },
    tag: 'crest',
  });

  // Écume : elle apparait quand la lèvre se forme, pas avant.
  if (shape.lip > 0.05) {
    out.push({
      layer: 'main',
      depth: depth + 1,
      shape: { t: 'ribbon', pts: crestPts, widths: crestWidths.map((w) => w * 0.5) },
      paint: {
        color: fade(pal.accent, alpha * clamp01(shape.lip * 2.2)),
        dither: { level: 0.75, matrix: 2 },
      },
      material: 'soft',
      tag: 'foam',
    });
  }

  if (withGlow && ctx.style.glow) {
    const c = ctx.p(shape.crest[Math.floor(COLUMNS / 2)]!);
    out.push({
      layer: 'light',
      depth: depth + 2,
      shape: { t: 'disc', c, r: 10 + shape.height * 8 },
      paint: { color: fade(pal.glow, 0.2 * alpha), dither: { level: 0.5 } },
      tag: 'glow',
    });
  }
  return out;
}

export const waterBreakingWave: SpellRecipe = {
  id: 'water-breaking-wave',
  element: 'water',
  title: 'Lame Déferlante',
  concept:
    "Une lame pleine court au sol jusqu'à la cible, sa lèvre dépasse la base pour former un tube, puis la crête se disloque en gouttes étirées pendant que le corps s'affaisse en s'élargissant.",
  signature: [
    'Ruban plein à crête continue, jamais un nuage de particules',
    "Lèvre en surplomb et dessous de tube dans l'ombre",
    'Gouttes étirées selon la tangente réelle de leur trajectoire',
    'Affaissement qui élargit la masse au lieu de la faire disparaître',
  ],
  role: 'oneshot',
  duration: DURATION,
  // Douze images par seconde, comme le reste du catalogue : c'est la cadence
  // des feuilles 16 bits, et elle oblige chaque image à porter un changement
  // lisible au lieu de glisser d'un pixel.
  fps: 12,
  canvas: { width: 344, height: 232 },
  pivot: { x: 169, y: 138 },
  defaultRange: 3.3,
  defaultPower: 0.5,
  radial: false,
  loop: 'none',
  events: [
    { id: 'cast', at: T.gather, note: "L'eau se rassemble à la source" },
    { id: 'release', at: T.surgeStart, note: 'Départ de la lame' },
    { id: 'peak', at: T.curlStart, note: 'Formation du tube' },
    { id: 'contact', at: T.breakAt, note: 'Rupture de la crête' },
    { id: 'settled', at: T.dryEnd, note: 'Sol séché' },
  ],

  sample(t, ctx) {
    const out: DrawCmd[] = [];
    const pal = ctx.palette;
    const style = ctx.style;
    const seed = deriveSeed(ctx.seed, 'water-breaking-wave');
    const lameCount = 1 + Math.round(ctx.power * 2);

    // ------------------------------------------------------------------
    // Rassemblement à la source : une flaque basse qui se creuse.
    // ------------------------------------------------------------------
    const gather = window4(t, T.gather, 0.05, T.surgeStart + 0.05, T.surgeStart + 0.16);
    if (gather > 0) {
      const r = 0.45 + 0.35 * easeOut(ramp(t, T.gather, T.surgeStart));
      out.push(...emitPlate(ctx, ctx.wl(0.15, 0, 0), r, 10, seed + 3, pal.ramp[3] ?? pal.ground, gather * 0.7, 'decal', 0.22));
      out.push(...emitPlate(ctx, ctx.wl(0.15, 0, 0), r * 0.55, 8, seed + 4, pal.ramp[1] ?? pal.core, gather * 0.5, 'decal', 0.3));
    }

    const shape = waveShape(ctx, t, seed);

    // ------------------------------------------------------------------
    // Sillage mouille : il reste derriere la lame et seche en dernier.
    // ------------------------------------------------------------------
    if (shape) {
      const wet = residueAlpha(t, T.collapseEnd, T.dryEnd, 0.5);
      if (wet > 0) {
        // Un seul ruban trame, et non une file de taches qui se recouvrent :
        // le sillage doit se lire comme une trace continue.
        const pts = [];
        const widths = [];
        const steps = 8;
        for (let i = 0; i <= steps; i++) {
          const along = 0.2 + (shape.frontAt - 0.2) * (i / steps);
          pts.push(ctx.p(ctx.wl(along, 0, 0.01)));
          widths.push((0.5 + 1.6 * (i / steps)) * ctx.projection.groundScale * 0.55);
        }
        out.push({
          layer: 'ground',
          depth: depthOf(ctx.wl(shape.frontAt * 0.5, 0, 0)) - 5,
          shape: { t: 'ribbon', pts, widths },
          paint: {
            color: fade(pal.ramp[4] ?? pal.ground, wet),
            dither: { level: 0.42, matrix: 4 },
          },
          tag: 'decal',
        });
      }
    }

    // ------------------------------------------------------------------
    // Corps des lames. Le rang ajoute des lames successives, plus basses et
    // decalees : c'est le comportement qui change, pas l'echelle du sprite.
    // ------------------------------------------------------------------
    // Les lames de rang superieur sont peintes en premier : elles suivent la
    // lame de tete, donc elles passent derriere elle.
    const tail = 1 - ramp(t, CLIP_OUT - 0.08, CLIP_OUT);
    for (let n = lameCount - 1; n >= 0; n--) {
      const delay = n * 0.11;
      const scale = 1 - n * 0.34;
      const lame = n === 0 ? shape : waveShape(ctx, t, seed + n * 811, delay, scale);
      if (!lame) continue;
      const fadeIn = 1 - ramp(t - delay, T.collapseEnd - 0.06, T.collapseEnd + 0.08);
      out.push(...emitLame(ctx, lame, fadeIn * tail * (n === 0 ? 1 : 0.7), n === 0));
    }

    // ------------------------------------------------------------------
    // Gouttes : arrachees à la crête pendant la course, projetées en masse
    // à la rupture.
    // ------------------------------------------------------------------
    if (shape && t > T.surgeStart) {
      const crest = shape.crest;
      out.push(
        ...emitDebris(ctx, {
          seed: seed + 41,
          count: 16,
          clipTime: t - T.surgeStart,
          startedAt: T.surgeStart,
          origin: (i) => crest[i % COLUMNS] ?? crest[0]!,
          axis: () => ctx.frame.forward,
          spread: 0.8,
          speed: [0.6, 1.8],
          gravity: 6.5,
          launch: (i) => randRange(seed, i, 171, 0, T.breakAt - T.surgeStart),
          life: [0.18, 0.38],
          size: [1, 2],
          kind: 'drop',
          palette: pal,
          style,
          tone: [0.05, 0.45],
          tag: 'spray',
        }),
      );
    }

    if (t >= T.breakAt) {
      const age = t - T.breakAt;
      const burst = waveShape(ctx, T.breakAt, seed);
      const line = burst?.crest ?? [];
      if (line.length > 0) {
        out.push(
          ...emitDebris(ctx, {
            seed: seed + 51,
            count: 52,
            clipTime: age,
            startedAt: T.breakAt,
            origin: (i) => line[i % line.length]!,
            axis: (i) =>
              add3(ctx.frame.forward, {
                x: 0,
                y: 0,
                z: 0.55 + randRange(seed, i, 172, 0, 0.5),
              }),
            spread: 0.85,
            speed: [1.4, 3.8],
            gravity: 7.5,
            launch: (i) => randRange(seed, i, 173, 0, 0.06),
            life: [0.3, 0.6],
            size: [1, 2.6],
            kind: 'drop',
            palette: pal,
            style,
            alpha: 1 - ramp(t, T.collapseEnd, T.dryEnd),
            tone: [0, 0.4],
            tag: 'drop',
            shadows: true,
          }),
        );
      }

      // Ecume d'impact : une ligne brisee au sol, pas un anneau.
      const foam = window4(age, 0, 0.04, 0.16, 0.36);
      if (foam > 0) {
        for (let i = 0; i < 7; i++) {
          const s = (i / 6) * 2 - 1;
          const p = ctx.wl(
            ctx.distance + randRange(seed, i, 174, -0.2, 0.45),
            s * HALF_WIDTH * 1.35,
            0.02,
          );
          out.push(
            ...emitPlate(
              ctx,
              p,
              0.22 + 0.2 * lateralProfile(s),
              7,
              seed + 300 + i,
              pal.accent,
              foam * 0.8,
              'foam',
              0.4,
            ),
          );
        }
      }
    }

    return out;
  },
};
