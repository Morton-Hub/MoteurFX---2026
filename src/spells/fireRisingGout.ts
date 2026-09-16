/**
 * FEU — « Gerbe Ascendante »
 *
 * Concept : le feu n'est pas une forme, c'est un débit. Une traînée de braises
 * court au sol jusqu'à la cible, la base s'embrase, et à partir de là des
 * parcelles de flamme naissent en continu au ras du sol, montent, s'étirent,
 * se resserrent et refroidissent en descendant la rampe jusqu'à la fumée. La
 * silhouette n'est jamais dessinée : elle est la somme de ce qui monte à
 * l'instant considéré, donc elle vit d'elle-même.
 *
 * Le déchirement n'est pas un effet ajouté : c'est ce qui arrive quand le
 * débit se coupe. Les dernières parcelles continuent de monter, le socle
 * s'éteint sous elles, et un vide s'ouvre entre les deux. La colonne se
 * sépare de sa base parce qu'il n'y a plus rien pour l'alimenter.
 *
 * Le refroidissement est une descente dans la rampe, pas une baisse
 * d'opacité : une parcelle devient orange, puis rouge sombre, puis fumée, et
 * seul le tramage la fait disparaître.
 *
 * Signature de forme : colonne large en bas et effilée en haut, parcelles
 * asymétriques penchées, vides internes dans la moitié haute, séparation
 * franche entre le socle et la colonne. Aucun contour circulaire, aucun
 * anneau de choc.
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

/** Aucune matière visible au-delà de cet instant : le clip finit propre. */
const CLIP_OUT = 0.96;

const T = {
  trailStart: 0.02,
  ignite: 0.12,
  /** Débit maximal atteint. */
  full: 0.26,
  /** Le débit commence à se couper : c'est là que la colonne se sépare. */
  tearStart: 0.42,
  /** Plus aucune parcelle n'est émise. */
  flowOut: 0.52,
  /** Le socle s'éteint. */
  baseOut: 0.66,
  smokeEnd: CLIP_OUT,
} as const;

/** Hauteur de référence de la colonne, en tuiles. Cale le dégradé partagé. */
const COLUMN_TOP = 3.3;

/** Intervalle d'émission, en fraction de clip. */
const EMIT_STEP = 0.015;
/** Assez de parcelles pour couvrir toute la fenêtre d'émission. */
const PACKETS = Math.ceil((T.flowOut - T.ignite) / EMIT_STEP) + 2;

/**
 * Débit à un instant donné. Il monte vite, tient, puis se coupe.
 * C'est la seule courbe qui décide de la forme de la colonne : sa largeur,
 * sa hauteur et sa rupture en découlent toutes.
 */
function flowAt(t: number): number {
  if (t < T.ignite) return 0;
  if (t < T.full) return easeOut(ramp(t, T.ignite, T.full));
  if (t < T.tearStart) return 1;
  return 1 - easeOut(ramp(t, T.tearStart, T.flowOut));
}

type LobeOptions = {
  readonly heat: number;
  readonly alpha: number;
  readonly voids: number;
  readonly tag: string;
  readonly depthBias?: number;
  /** Cœur clair interne. Coûteux : réservé aux parcelles encore chaudes. */
  readonly core?: boolean;
  /**
   * Dégradé commun à toute la colonne. Sans lui, chaque parcelle porte son
   * propre dégradé clair-vers-sombre et la colonne se lit comme une pile de
   * tranches. Avec lui, la couleur ne dépend que de la hauteur : les
   * parcelles se fondent en un seul corps continu.
   */
  readonly sharedRamp?: Ramp;
};

/**
 * Corps mou avec dégradé vertical postérisé et vides internes.
 * `heat` = 0 : blanc-jaune du cœur. `heat` = 1 : fumée.
 */
function emitLobe(ctx: SpellContext, spec: BlobSpec, o: LobeOptions): DrawCmd[] {
  if (o.alpha <= 0 || spec.radius <= 0.01) return [];
  const pts3 = blobPolygon(ctx.projection, spec);
  if (pts3.length < 3) return [];
  const pts = pts3.map((p) => ctx.p(p));
  let top = Infinity;
  let bottom = -Infinity;
  for (const p of pts) {
    if (p.y < top) top = p.y;
    if (p.y > bottom) bottom = p.y;
  }
  // Sans dégradé partagé, il est ancré sur la silhouette de la parcelle :
  // c'est ce qu'il faut pour un objet isolé — une braise de traînée, une
  // volute de fumée — mais pas pour un élément d'un flux continu.
  const from = clamp01(o.heat * 0.62);
  const to = clamp01(0.42 + o.heat * 0.58);
  const gradient: Ramp =
    o.sharedRamp ?? { y0: bottom, y1: top, stops: rampSlice(ctx.palette, from, to, 5) };

  const holes: Shape[] = [];
  for (let i = 0; i < o.voids; i++) {
    holes.push(poly(voidPolygon(ctx.projection, spec, i, 0.3 + i * 0.1).map((p) => ctx.p(p))));
  }

  const depth = depthOf(spec.center) + (o.depthBias ?? 0);
  const out: DrawCmd[] = [
    {
      layer: 'main',
      depth,
      shape: poly(pts),
      paint: {
        color: ctx.palette.ramp[2] ?? ctx.palette.core,
        ramp: gradient,
        dither: o.alpha < 1 ? { level: o.alpha, matrix: 4 } : undefined,
      },
      holes: holes.length > 0 ? holes : undefined,
      tag: o.tag,
    },
  ];
  if (o.core && o.heat < 0.5) {
    const core: BlobSpec = {
      ...spec,
      radius: spec.radius * 0.5,
      center: add3(spec.center, { x: 0, y: 0, z: -spec.radius * spec.aspect * 0.2 }),
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
        ramp: { y0: bottom, y1: top, stops: rampSlice(ctx.palette, 0, 0.3 + o.heat, 4) },
        dither: o.alpha < 1 ? { level: o.alpha, matrix: 4, phaseX: 1 } : undefined,
      },
      tag: o.tag,
    });
  }
  return out;
}

export const fireRisingGout: SpellRecipe = {
  id: 'fire-rising-gout',
  element: 'fire',
  title: 'Gerbe Ascendante',
  concept:
    "Une traînée de braises court au sol, la cible s'embrase, et des parcelles de flamme montent en continu depuis la base en refroidissant jusqu'à la fumée. Quand le débit se coupe, la colonne se sépare du socle et finit sa montée seule.",
  signature: [
    'Colonne large en bas et effilée en haut, jamais une boule',
    "Flux ascendant continu : la silhouette n'est jamais dessinée, elle est la somme de ce qui monte",
    'Déchirement par coupure du débit, pas par un effet ajouté',
    'Refroidissement par descente dans la rampe, pas par opacité',
  ],
  role: 'oneshot',
  duration: DURATION,
  fps: 24,
  canvas: { width: 296, height: 248 },
  pivot: { x: 148, y: 166 },
  defaultRange: 3.3,
  defaultPower: 0.5,
  radial: false,
  loop: 'none',
  events: [
    { id: 'cast', at: T.trailStart, note: 'Traînée de braises au sol' },
    { id: 'release', at: T.ignite, note: 'Embrasement de la base' },
    { id: 'peak', at: T.full, note: 'Débit maximal' },
    { id: 'fracture', at: T.tearStart, note: 'Le débit se coupe : la colonne se sépare' },
    { id: 'settled', at: T.smokeEnd, note: 'Fumée dissipée' },
  ],

  sample(t, ctx) {
    const out: DrawCmd[] = [];
    const pal = ctx.palette;
    const style = ctx.style;
    const seed = deriveSeed(ctx.seed, 'fire-rising-gout');
    const hit: Vec3 = ctx.wl(ctx.distance, 0, 0);
    // Le rang ajoute des conduits : la gerbe passe d'une colonne unique à deux
    // ou trois colonnes tressées qui se recouvrent. C'est le comportement qui
    // change — la silhouette se dédouble — et non l'échelle du sprite.
    const flues = 1 + Math.round(ctx.power * 2);
    const flowWidth = 1 + (flues - 1) * 0.26;

    // ------------------------------------------------------------------
    // Traînée de braises : elle donne la direction avant que le feu parte.
    // ------------------------------------------------------------------
    const trail = window4(t, T.trailStart, T.trailStart + 0.02, T.ignite, T.ignite + 0.06);
    if (trail > 0) {
      const head = easeOutExpo(ramp(t, T.trailStart, T.ignite));
      for (let i = 0; i < 9; i++) {
        const along = (i + 1) / 10;
        if (along > head) continue;
        const age = clamp01((head - along) * 5);
        const hop = Math.abs(Math.sin(along * 9 + i)) * 0.32 * (1 - age * 0.6);
        const pos = ctx.wl(ctx.distance * along, randRange(seed, i, 111, -0.28, 0.28), 0.06 + hop);
        out.push(
          ...emitLobe(
            ctx,
            {
              center: pos,
              radius: (0.1 + randRange(seed, i, 112, 0, 0.09)) * (1 - age * 0.45),
              aspect: 1.5,
              lean: 0.25,
              wobble: 0.3,
              phase: t * 22 + i,
              sides: 9,
              seed: seed + i * 71,
              taper: 0.5,
            },
            { heat: 0.15 + age * 0.5, alpha: trail * (1 - age * 0.8), voids: 0, tag: 'trail' },
          ),
        );
      }
    }

    // ------------------------------------------------------------------
    // Sol : brûlure à la cible.
    // ------------------------------------------------------------------
    if (t >= T.ignite - 0.02) {
      const scorch =
        residueAlpha(t, 0.72, 0.99, 0.5) * easeOut(ramp(t, T.ignite - 0.02, T.ignite + 0.1));
      out.push(...emitPlate(ctx, hit, 1.15, 11, seed + 21, pal.rim, scorch, 'decal', 0.35));
      const embers = window4(t, T.ignite, T.ignite + 0.08, T.baseOut, 0.82);
      out.push(...emitPlate(ctx, hit, 0.72, 9, seed + 22, pal.ground, embers * 0.45, 'decal', 0.4));
    }

    // ------------------------------------------------------------------
    // Socle : une flaque rasante, pas un dôme. Il ancre la colonne au sol et
    // donne l'échelle, mais ne monte jamais — c'est le flux qui monte.
    //
    // Deux écueils à éviter : une calotte haute et régulière se lit comme un
    // objet distinct posé sous la gerbe ; une nappe large et bruitée se lit
    // comme une éclaboussure au sol. Le socle doit donc rester **plus étroit
    // que le pied de la colonne** et peu accidenté : il ferme le bas du flux
    // sans jamais en dépasser.
    // ------------------------------------------------------------------
    // Dégradé de colonne : il va du pied de la gerbe à son sommet théorique.
    // Toutes les parcelles et le socle s'y réfèrent, donc la couleur d'un
    // pixel ne dépend que de sa hauteur dans la gerbe.
    const columnRamp: Ramp = {
      y0: ctx.p(hit).y,
      y1: ctx.p(add3(hit, { x: 0, y: 0, z: COLUMN_TOP })).y,
      stops: rampSlice(pal, 0, 1, 9),
    };

    const baseLife = window4(t, T.ignite, T.ignite + 0.05, T.tearStart + 0.06, T.baseOut);
    if (baseLife > 0) {
      const swell = easeOut(ramp(t, T.ignite, T.ignite + 0.14));
      const wane = ramp(t, T.tearStart, T.baseOut);
      const r = (0.3 + 0.16 * swell) * (1 - wane * 0.62) * flowWidth;
      out.push(
        ...emitLobe(
          ctx,
          {
            center: add3(hit, { x: 0, y: 0, z: r * 0.3 }),
            radius: r,
            aspect: 0.52,
            lean: 0.04,
            wobble: 0.2,
            phase: t * 13,
            // Beaucoup de côtés et peu de bruit : le socle doit être une
            // flaque, pas une étoile. L'ancienne version le hérissait de
            // pointes triangulaires qui se lisaient comme des éclats.
            sides: 15,
            seed: seed + 3,
            taper: 0.08,
          },
          {
            heat: clamp01(0.14 + wane * 0.55),
            alpha: baseLife,
            voids: 0,
            tag: 'base',
            depthBias: 1,
            sharedRamp: columnRamp,
          },
        ),
      );
    }

    // ------------------------------------------------------------------
    // Le flux.
    //
    // Chaque parcelle est une fonction fermée de son index et du temps : elle
    // naît à un instant fixe, monte, s'étire, se resserre et refroidit. Leur
    // recouvrement fait la colonne ; leur échelonnement fait le mouvement.
    //
    // La largeur d'une parcelle est multipliée par le débit **à sa naissance**.
    // Quand le débit tombe à zéro, plus rien n'alimente la base : les
    // dernières parcelles poursuivent leur montée et la colonne se détache.
    // ------------------------------------------------------------------
    for (let flue = 0; flue < flues; flue++) {
      const flueSeed = seed + flue * 9173;
      const flueSide = flues === 1 ? 0 : (flue - (flues - 1) / 2) * 0.38;
      const flueLag = flue * 0.024;

      for (let i = 0; i < PACKETS; i++) {
        const born = T.ignite + flueLag + i * EMIT_STEP;
        const gate = flowAt(born);
        if (gate <= 0.02) continue;
        const age = t - born;
        if (age < 0) continue;
        const life = randRange(flueSeed, i, 201, 0.34, 0.48);
        if (age > life) continue;
        const k = clamp01(age / life);

        const climb = randRange(flueSeed, i, 202, 2.6, 3.7);
        const sway = randRange(flueSeed, i, 203, -0.2, 0.2);
        const lateral = flueSide + randRange(flueSeed, i, 204, -0.28, 0.28);
        const forward = randRange(flueSeed, i, 205, -0.26, 0.26);
        const size = randRange(flueSeed, i, 206, 0.34, 0.5);
        const phase = randRange(flueSeed, i, 207, 0, 6.3);

        // Montée : rapide au départ, elle ralentit à mesure que la parcelle
        // refroidit et s'alourdit.
        const z = 0.08 + climb * easeOut(k);
        // La colonne se resserre en montant, et la parcelle s'étire. Les
        // conduits convergent aussi vers l'axe : ils se tressent au lieu de
        // rester parallèles.
        const radius = size * gate * (1 - k * 0.55);
        const aspect = 1.6 + k * 1.7;
        const drift = (lateral + Math.sin(phase + k * 3.1) * sway) * (1 - k * 0.6);

        const center = add3(hit, { x: forward * (1 - k * 0.6), y: drift, z });
        // Chaque parcelle décale légèrement le dégradé partagé. La couleur reste
        // continue d'une parcelle à l'autre, mais les limites de bandes cessent
        // d'être des lignes parfaitement droites en travers de la colonne —
        // sinon le feu se lit comme un drapeau à rayures.
        const bandShift = randRange(flueSeed, i, 208, -3.5, 3.5);
        const packetRamp: Ramp = {
          y0: columnRamp.y0 + bandShift,
          y1: columnRamp.y1 + bandShift,
          stops: columnRamp.stops,
        };
        out.push(
          ...emitLobe(
            ctx,
            {
              center,
              radius,
              aspect,
              lean: sway * 1.6 + Math.sin(phase + t * 9) * 0.12,
              wobble: 0.3 + k * 0.24,
              phase: t * 15 + phase,
              sides: 13,
              seed: flueSeed + i * 457,
              taper: 0.4 + k * 0.4,
            },
            {
              // Refroidissement : la parcelle descend la rampe en montant.
              heat: clamp01(k * 1.12),
              alpha: 1 - ramp(k, 0.74, 1),
              voids: k > 0.42 ? 2 : k > 0.2 ? 1 : 0,
              tag: 'flow',
              core: k < 0.34,
              depthBias: 2 + flue * 0.1,
              sharedRamp: packetRamp,
            },
          ),
        );
      }
    }

    // Lumière : une seule passe pour toute la colonne, au lieu d'un halo par
    // parcelle. Le sujet doit rester lisible sans elle.
    if (style.glow) {
      const lit = window4(t, T.ignite, T.ignite + 0.06, T.tearStart, T.baseOut);
      if (lit > 0) {
        const px = ctx.projection.groundScale;
        for (const [h, r, a] of [
          [0.3, 0.95, 0.3],
          [1.5, 0.7, 0.2],
        ] as const) {
          out.push({
            layer: 'light',
            depth: depthOf(hit) + 4,
            shape: { t: 'disc', c: ctx.p(add3(hit, { x: 0, y: 0, z: h })), r: r * px * flowWidth },
            paint: { color: fade(pal.glow, a * lit), dither: { level: 0.55 } },
            tag: 'glow',
          });
        }
      }
    }

    // ------------------------------------------------------------------
    // Braises : cône orienté vers le haut, refroidissement dans la rampe.
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
    // Fumée : elle prend la suite du flux, là où les dernières parcelles se
    // sont éteintes, et non au ras du sol.
    // ------------------------------------------------------------------
    for (let i = 0; i < 5; i++) {
      const at = T.tearStart + 0.16 + i * 0.055;
      const life = Math.min(0.42, CLIP_OUT - at);
      const age = t - at;
      if (age < 0 || age > life) continue;
      const k = clamp01(age / life);
      const center = add3(hit, {
        x: randRange(seed, i, 141, -0.45, 0.45) * (0.5 + k),
        y: randRange(seed, i, 142, -0.45, 0.45) * (0.5 + k),
        z: 2.3 + 1.4 * easeOut(k),
      });
      out.push(
        ...emitLobe(
          ctx,
          {
            center,
            radius: (0.2 + randRange(seed, i, 143, 0, 0.1)) * (1 + k * 0.95) * flowWidth,
            aspect: 1.25,
            lean: 0.12,
            wobble: 0.34,
            phase: t * 6 + i * 3,
            sides: 12,
            seed: seed + 900 + i * 131,
            taper: 0.15,
          },
          {
            heat: 1,
            alpha: (1 - k) * 0.5 * (1 - ramp(t, CLIP_OUT - 0.1, CLIP_OUT)),
            voids: 1,
            tag: 'smoke',
            depthBias: -2,
          },
        ),
      );
    }

    return out;
  },
};
