/**
 * FEU — « Boule de Feu »
 *
 * Le classique, et il y a une raison à ça : le sort raconte une phrase en
 * trois temps que l'œil suit sans effort. Des flammes se rassemblent dans la
 * main — on voit la charge se constituer, elle ne surgit pas. La masse part.
 * Elle éclate.
 *
 * Rien ici n'est un solide. Les tentatives précédentes peignaient le feu
 * comme des corps distincts empilés, chacun avec son contour et son dégradé :
 * ça donnait un amas de briques orange. Toute la matière de ce sort est
 * déclarée `emissive`, donc le renderer prend la **silhouette réunie** de ce
 * qui brûle et la colore par son épaisseur — bord sombre, cœur blanc. Deux
 * langues qui se recouvrent fusionnent en un corps plus épais, donc plus
 * chaud en son milieu. C'est ce qui fait qu'une boule de feu se lit comme une
 * masse et non comme un tas.
 *
 * Signature de forme : une masse ronde et churnante à la tête, une traînée
 * qui s'effiloche derrière, une explosion qui s'ouvre large avant de monter
 * et de se déchirer en langues.
 */

import {
  type Vec3,
  add3,
  clamp01,
  easeIn,
  easeOut,
  easeOutExpo,
  ramp,
  scale3,
  window4,
} from '../core/math.js';
import { deriveSeed, randRange } from '../core/rng.js';
import { depthOf } from '../space/projection.js';
import { type DrawCmd, poly } from '../render/draw.js';
import { fade } from '../raster/framebuffer.js';
import { blobPolygon, type BlobSpec } from '../grammar/blob.js';
import { emitDebris } from '../grammar/motion.js';
import { emitPlate, residueAlpha } from '../grammar/ground.js';
import type { SpellContext, SpellRecipe } from '../sim/types.js';

const DURATION = 1.5;
const CLIP_OUT = 0.96;

const T = {
  /** Les premières flammes apparaissent autour de la main. */
  gather: 0.0,
  /** La masse est constituée et pulse. */
  charged: 0.22,
  release: 0.28,
  contact: 0.56,
  /** L'explosion a fini de s'ouvrir et commence à monter. */
  bloom: 0.68,
  smokeEnd: CLIP_OUT,
} as const;

/**
 * Une flamme : un contour mou, sans couleur propre.
 *
 * La couleur est posée par la passe émissive à partir de l'épaisseur de la
 * silhouette réunie, donc inutile — et contre-productif — de la décider ici :
 * c'est précisément ce qui transformait les lobes en objets séparés.
 */
function flame(
  ctx: SpellContext,
  spec: BlobSpec,
  depth: number,
  alpha = 1,
  tag = 'flame',
): DrawCmd[] {
  // Une flamme ne s'efface pas en se trouant : elle rétrécit et s'éteint.
  //
  // Tramer l'opacité d'un corps émissif perce sa silhouette, et la passe
  // émissive mesure alors l'épaisseur d'un grillage : toute la masse retombe
  // sur les échelons sombres et l'explosion finit en treillis rouge. On
  // module donc le rayon, et la langue disparaît d'un coup une fois trop
  // faible pour compter.
  if (alpha < 0.3 || spec.radius <= 0.02) return [];
  const shrunk: BlobSpec = { ...spec, radius: spec.radius * (0.55 + 0.45 * clamp01(alpha)) };
  const pts = blobPolygon(ctx.projection, shrunk);
  if (pts.length < 3) return [];
  return [
    {
      layer: 'main',
      material: 'emissive',
      depth,
      shape: poly(pts.map((p) => ctx.p(p))),
      paint: { color: ctx.palette.ramp[1] ?? ctx.palette.core },
      tag,
    },
  ];
}

export const fireBall: SpellRecipe = {
  id: 'fire-ball',
  element: 'fire',
  title: 'Boule de Feu',
  concept:
    "Des flammes se rassemblent dans la main du lanceur jusqu'à former une masse, qui part en laissant une traînée effilochée, puis éclate à la cible en s'ouvrant large avant de monter et de se déchirer en langues.",
  signature: [
    'Une masse ronde et churnante, jamais un empilement de lobes distincts',
    "Charge visible : les flammes convergent et s'accumulent avant le tir",
    "Traînée qui s'effiloche derrière la tête, pas un ruban propre",
    "Explosion qui s'ouvre d'abord large et basse, puis monte et se déchire",
  ],
  role: 'oneshot',
  duration: DURATION,
  fps: 24,
  canvas: { width: 384, height: 272 },
  pivot: { x: 192, y: 163 },
  defaultRange: 3.3,
  defaultPower: 0.3,
  radial: false,
  loop: 'none',
  events: [
    { id: 'cast', at: T.gather, note: 'Les flammes convergent vers la main' },
    { id: 'peak', at: T.charged, note: 'La masse est constituée' },
    { id: 'release', at: T.release, note: 'Départ du projectile' },
    { id: 'contact', at: T.contact, note: 'Explosion à la cible' },
    { id: 'settled', at: T.smokeEnd, note: 'Fumée dissipée' },
  ],

  sample(t, ctx) {
    const out: DrawCmd[] = [];
    const pal = ctx.palette;
    const style = ctx.style;
    const seed = deriveSeed(ctx.seed, 'fire-ball');
    // Le rang grossit la charge — plus de flammes convergent, donc une masse
    // plus épaisse, donc un cœur plus blanc — et ouvre l'explosion plus large.
    const wisps = 5 + Math.round(ctx.power * 5);
    const bloomLobes = 9 + Math.round(ctx.power * 7);

    const hand: Vec3 = ctx.wl(0.34, 0, 0.72);
    const target: Vec3 = ctx.wl(ctx.distance, 0, 0.55);

    // ------------------------------------------------------------------
    // Charge : des langues tournent autour de la main et s'y rabattent.
    // Leur convergence fait grossir la masse — la boule n'apparaît pas, elle
    // se constitue.
    // ------------------------------------------------------------------
    const charge = window4(t, T.gather, T.charged, T.release, T.release + 0.03);
    if (charge > 0 && t < T.release + 0.03) {
      for (let i = 0; i < wisps; i++) {
        const at = T.gather + i * 0.022;
        const pull = clamp01(ramp(t, at, T.charged));
        if (pull <= 0) continue;
        // Spirale rentrante : la flamme part loin et se rabat sur la main.
        const angle = randRange(seed, i, 601, 0, Math.PI * 2) + pull * 4.2;
        const reach = (0.95 + randRange(seed, i, 602, 0, 0.5)) * (1 - easeIn(pull));
        const lift = randRange(seed, i, 603, -0.35, 0.45) * (1 - pull);
        const centre = add3(hand, {
          x: Math.cos(angle) * reach,
          y: Math.sin(angle) * reach,
          z: lift,
        });
        out.push(
          ...flame(
            ctx,
            {
              center: centre,
              radius: (0.19 + randRange(seed, i, 604, 0, 0.12)) * (0.5 + pull * 0.9),
              aspect: 1.5 - pull * 0.4,
              lean: 0.2,
              wobble: 0.34,
              phase: t * 18 + i * 1.7,
              sides: 10,
              seed: seed + i * 173,
              taper: 0.45,
            },
            depthOf(centre) + 2,
            charge,
            'gather',
          ),
        );
      }
      // Le noyau qui grossit à mesure que les langues arrivent.
      const grown = easeOut(clamp01(ramp(t, T.gather + 0.04, T.charged)));
      const pulse = 1 + 0.08 * Math.sin(t * 40);
      out.push(
        ...flame(
          ctx,
          {
            center: hand,
            radius: 0.56 * grown * pulse,
            aspect: 1.05,
            lean: 0.05,
            wobble: 0.26,
            phase: t * 22,
            sides: 13,
            seed: seed + 5,
            taper: 0.1,
          },
          depthOf(hand) + 3,
          charge,
          'core',
        ),
      );
    }

    // ------------------------------------------------------------------
    // Vol.
    // ------------------------------------------------------------------
    const flight = clamp01(ramp(t, T.release, T.contact));
    const inFlight = t >= T.release && t < T.contact;
    const posAt = (u: number): Vec3 => {
      const k = clamp01(u);
      // Course tendue, très légèrement cintrée : un projectile, pas un obus.
      const arc = Math.sin(k * Math.PI) * 0.22;
      return {
        x: hand.x + (target.x - hand.x) * k,
        y: hand.y + (target.y - hand.y) * k,
        z: hand.z + (target.z - hand.z) * k + arc,
      };
    };

    if (inFlight) {
      const eased = easeOutExpo(flight) * 0.25 + flight * 0.75;
      const head = posAt(eased);

      // Traînée : des langues lâchées derrière la tête, qui ralentissent et
      // s'amincissent. Elles se recouvrent, donc la passe émissive les fond
      // en une queue continue plutôt qu'en un chapelet.
      for (let k = 12; k >= 1; k--) {
        const back = eased - k * 0.026;
        if (back <= 0) continue;
        const p = posAt(back);
        const age = k / 12;
        const drift = add3(p, {
          x: randRange(seed, k, 605, -0.12, 0.12) * age,
          y: randRange(seed, k, 606, -0.12, 0.12) * age,
          z: age * 0.24,
        });
        out.push(
          ...flame(
            ctx,
            {
              center: drift,
              radius: (0.46 - age * 0.3) * (0.85 + 0.3 * Math.sin(k * 2.1 + t * 26)),
              aspect: 1.1 + age * 0.6,
              lean: 0.14,
              wobble: 0.38 + age * 0.3,
              phase: t * 20 + k * 1.3,
              sides: 10,
              seed: seed + 400 + k * 131,
              taper: 0.25,
            },
            depthOf(drift) - k * 0.02,
            1 - ramp(age, 0.7, 1),
            'trail',
          ),
        );
      }

      // Tête : trois lobes qui se recouvrent et tournent. Le churn vient de
      // leur rotation les uns par rapport aux autres, pas d'un bruit global.
      for (let i = 0; i < 3; i++) {
        const spin = t * 26 + (i * Math.PI * 2) / 3;
        const off = 0.14;
        const centre = add3(head, {
          x: Math.cos(spin) * off,
          y: Math.sin(spin) * off * 0.6,
          z: Math.sin(spin * 1.3) * off * 0.5,
        });
        out.push(
          ...flame(
            ctx,
            {
              center: centre,
              radius: 0.6 + 0.07 * Math.sin(spin * 2),
              aspect: 1.02,
              lean: 0.08,
              wobble: 0.3,
              phase: t * 24 + i * 2.1,
              sides: 12,
              seed: seed + 900 + i * 331,
              taper: 0.12,
            },
            depthOf(head) + 4 + i * 0.01,
            1,
            'head',
          ),
        );
      }

      if (style.glow) {
        out.push({
          layer: 'light',
          depth: depthOf(head) + 5,
          shape: { t: 'disc', c: ctx.p(head), r: 17 },
          paint: { color: fade(pal.glow, 0.42), dither: { level: 0.55 } },
          tag: 'glow',
        });
      }

      // Braises lâchées par la traînée.
      out.push(
        ...emitDebris(ctx, {
          seed: seed + 61,
          count: 22,
          clipTime: t - T.release,
          startedAt: T.release,
          origin: (i) => posAt(clamp01(eased - randRange(seed, i, 607, 0, 0.25))),
          axis: () => ({ x: 0, y: 0, z: 1 }),
          spread: 1.2,
          speed: [0.5, 1.6],
          gravity: 3.4,
          launch: (i) => randRange(seed, i, 608, 0, T.contact - T.release),
          life: [0.1, 0.24],
          size: [1, 2.2],
          kind: 'ember',
          palette: pal,
          style,
          tone: [0, 0.4],
          tag: 'ember',
        }),
      );
    }

    // ------------------------------------------------------------------
    // Explosion.
    // ------------------------------------------------------------------
    if (t < T.contact) return out;
    const age = t - T.contact;
    const impact = ctx.wl(ctx.distance, 0, 0);

    // Sol : brûlure, puis résidu.
    const scorch = residueAlpha(t, 0.74, 0.99, 0.55) * easeOut(clamp01(age / 0.1));
    out.push(...emitPlate(ctx, impact, 1.3, 11, seed + 21, pal.rim, scorch, 'decal', 0.32));

    // Le corps de l'explosion. Il s'ouvre d'abord large et bas — c'est ce
    // temps-là qui donne le souffle —, puis il monte et se déchire.
    const open = easeOut(clamp01(age / 0.13));
    const rise = clamp01(ramp(t, T.bloom - 0.06, 0.86));
    const fadeOut = 1 - ramp(t, 0.8, 0.92);
    if (fadeOut > 0) {
      for (let i = 0; i < bloomLobes; i++) {
        const a = (i / bloomLobes) * Math.PI * 2 + randRange(seed, i, 611, -0.3, 0.3);
        const band = randRange(seed, i, 612, 0.35, 1);
        const spread = (0.28 + 0.82 * band) * open * (1 + rise * 0.4);
        const lobeSeedZ = randRange(seed, i, 613, 0.1, 0.75);
        const centre = add3(impact, {
          x: Math.cos(a) * spread,
          y: Math.sin(a) * spread * 0.9,
          // Bas à l'ouverture, haut ensuite : le souffle passe, la colonne monte.
          z: 0.3 + lobeSeedZ * 0.5 + rise * (1.1 + lobeSeedZ * 1.5),
        });
        const shrink = 1 - rise * 0.45;
        out.push(
          ...flame(
            ctx,
            {
              center: centre,
              radius: (0.46 + randRange(seed, i, 614, 0, 0.26)) * open * shrink,
              aspect: 1 + rise * 1.1,
              lean: Math.cos(a) * 0.2,
              wobble: 0.34 + rise * 0.24,
              phase: t * 16 + i * 1.9,
              sides: 12,
              seed: seed + 1300 + i * 197,
              taper: 0.2 + rise * 0.4,
            },
            depthOf(centre) + 2,
            fadeOut * (1 - ramp(rise, 0.72, 1)),
            'bloom',
          ),
        );
      }
      // Langues de bord : plus fines, plus loin, dans l'axe radial. Elles
      // touchent la masse, donc la passe émissive les y soude — le contour
      // cesse d'être une patate lisse et se met à lécher.
      for (let i = 0; i < bloomLobes; i++) {
        const a = (i / bloomLobes) * Math.PI * 2 + randRange(seed, i, 621, -0.5, 0.5);
        const band = randRange(seed, i, 622, 0.7, 1.35);
        const spread = (0.55 + 0.95 * band) * open * (1 + rise * 0.5);
        const centre = add3(impact, {
          x: Math.cos(a) * spread,
          y: Math.sin(a) * spread * 0.9,
          z: 0.34 + randRange(seed, i, 623, 0, 0.6) + rise * (1.3 + randRange(seed, i, 624, 0, 1.2)),
        });
        out.push(
          ...flame(
            ctx,
            {
              center: centre,
              radius: (0.2 + randRange(seed, i, 625, 0, 0.14)) * open * (1 - rise * 0.35),
              aspect: 1.7 + rise * 1.2,
              lean: Math.cos(a) * 0.35,
              wobble: 0.42,
              phase: t * 19 + i * 2.3,
              sides: 11,
              seed: seed + 2100 + i * 211,
              taper: 0.55 + rise * 0.3,
            },
            depthOf(centre) + 2.5,
            fadeOut * (1 - ramp(rise, 0.66, 1)),
            'tongue',
          ),
        );
      }

      // Cœur : il tient bas et garde l'épaisseur qui donne le blanc.
      const coreLife = window4(t, T.contact, T.contact + 0.03, T.contact + 0.16, T.bloom + 0.08);
      if (coreLife > 0) {
        out.push(
          ...flame(
            ctx,
            {
              center: add3(impact, { x: 0, y: 0, z: 0.42 + rise * 0.5 }),
              radius: 0.98 * open * (1 - rise * 0.5),
              aspect: 0.92 + rise * 0.7,
              lean: 0.04,
              wobble: 0.22,
              phase: t * 15,
              sides: 14,
              seed: seed + 11,
              taper: 0.12,
            },
            depthOf(impact) + 3,
            coreLife,
            'bloom',
          ),
        );
      }
    }

    // Flash de contact : très court, anguleux.
    const flash = window4(t, T.contact - 0.005, T.contact + 0.015, T.contact + 0.04, T.contact + 0.075);
    if (flash > 0 && style.glow) {
      out.push({
        layer: 'light',
        depth: depthOf(impact) + 12,
        shape: { t: 'disc', c: ctx.p(add3(impact, { x: 0, y: 0, z: 0.5 })), r: 20 + 30 * flash },
        paint: { color: fade(pal.glow, 0.6 * flash), dither: { level: 0.5 } },
        tag: 'glow',
      });
    }

    // Braises projetées puis fumée.
    out.push(
      ...emitDebris(ctx, {
        seed: seed + 71,
        count: 40,
        clipTime: age,
        startedAt: T.contact,
        origin: () => add3(impact, { x: 0, y: 0, z: 0.3 }),
        axis: () => ({ x: 0, y: 0, z: 1 }),
        spread: 1.15,
        speed: [1.5, 3.8],
        gravity: 4.5,
        launch: (i) => randRange(seed, i, 615, 0, 0.06),
        life: [0.2, 0.44],
        size: [1, 2.5],
        kind: 'ember',
        palette: pal,
        style,
        tone: [0, 0.4],
        tag: 'ember',
      }),
    );

    for (let i = 0; i < 5; i++) {
      const at = T.contact + 0.2 + i * 0.05;
      const life = Math.min(0.38, CLIP_OUT - at);
      const smokeAge = t - at;
      if (smokeAge < 0 || smokeAge > life) continue;
      const k = clamp01(smokeAge / life);
      const centre = add3(impact, {
        x: randRange(seed, i, 616, -0.6, 0.6) * (0.5 + k),
        y: randRange(seed, i, 617, -0.6, 0.6) * (0.5 + k),
        z: 1 + 1.6 * easeOut(k),
      });
      const pts = blobPolygon(ctx.projection, {
        center: centre,
        radius: (0.26 + randRange(seed, i, 618, 0, 0.14)) * (1 + k * 1.2),
        aspect: 1.15,
        lean: 0.12,
        wobble: 0.36,
        phase: t * 6 + i * 3,
        sides: 12,
        seed: seed + 1700 + i * 131,
        taper: 0.15,
      });
      out.push({
        layer: 'main',
        // La fumée n'est pas émissive : elle ne doit pas se fondre dans la
        // silhouette du feu, sinon elle en rallumerait le cœur.
        material: 'soft',
        depth: depthOf(centre) - 2,
        shape: poly(pts.map((p) => ctx.p(p))),
        paint: {
          color: fade(pal.debris, (1 - k) * 0.55 * (1 - ramp(t, CLIP_OUT - 0.1, CLIP_OUT))),
          dither: { level: 0.6 - k * 0.3, matrix: 4 },
        },
        tag: 'smoke',
      });
    }

    void scale3;
    return out;
  },
};
