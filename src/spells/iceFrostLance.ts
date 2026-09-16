/**
 * GLACE — « Lance de Givre »
 *
 * Concept : la glace ne jaillit pas, elle se construit. Une plaque de givre
 * gagne le sol sous le lanceur, trois aiguilles obliques percent cette plaque,
 * puis un prisme hexagonal s'extrude vers l'avant, facette par facette. Il
 * tient sa forme sans trembler — c'est le seul élément du catalogue a marquer
 * un maintien parfaitement rigide — avant de partir d'un bloc, sans
 * deformation, et de se rompre a l'impact le long de plans de fracture nets.
 * Les fragments conservent le facettage du prisme dont ils sont issus.
 *
 * Signature de forme : facettes planes, arêtes droites, aiguilles obliques,
 * fracture transversale. Aucune forme ronde, aucune dissipation molle.
 */

import {
  type Vec3,
  add3,
  clamp01,
  easeBack,
  easeIn,
  easeOut,
  easeOutExpo,
  len3,
  norm3,
  ramp,
  scale3,
  sub3,
  window4,
} from '../core/math.js';
import { deriveSeed, randRange, randSigned } from '../core/rng.js';
import { cameraPlane, depthOf } from '../space/projection.js';
import { type DrawCmd, poly } from '../render/draw.js';
import { fade } from '../raster/framebuffer.js';
import {
  type Face,
  emitSolid,
  prism,
  rotateFacesAbout,
  spike,
  translateFaces,
} from '../grammar/solid.js';
import { emitDebris, groundShadow } from '../grammar/motion.js';
import { crackBranches, crackPath, emitCrack, residueAlpha } from '../grammar/ground.js';
import { emitFrostPlate } from '../grammar/frost.js';
import type { SpellRecipe } from '../sim/types.js';

const DURATION = 1.5;

// Reperes temporels, en fraction du clip. Un seul endroit les definit.
const T = {
  frostIn: 0.0,
  needlesIn: 0.06,
  growStart: 0.14,
  growEnd: 0.33,
  release: 0.4,
  contact: 0.55,
  flashEnd: 0.625,
  fractureEnd: 0.78,
  settled: 0.9,
} as const;

const LANCE_LENGTH = 1.6;
const LANCE_RADIUS = 0.23;
const SIDES = 6;

/** Axe de la lance : de la main du lanceur vers le point de contact. */
function lanceAxis(ctx: { wl: (f: number, s: number, u: number) => Vec3; distance: number }, lateral: number) {
  const from = ctx.wl(0.3, lateral, 0.66);
  const to = ctx.wl(ctx.distance, lateral * 0.25, 0.14);
  const dir = norm3(sub3(to, from));
  return { from, to, dir, span: len3(sub3(to, from)) };
}

export const iceFrostLance: SpellRecipe = {
  id: 'ice-frost-lance',
  element: 'ice',
  title: 'Lance de Givre',
  concept:
    "Un prisme hexagonal se construit devant le lanceur, tient sa forme sans trembler, part d'un bloc, puis se rompt en fragments facettés le long de plans de fracture transversaux.",
  signature: [
    'Facettes planes et arêtes droites, jamais de contour rond',
    'Maintien rigide avant le départ : zéro déformation',
    'Fracture transversale ; les fragments gardent le facettage du prisme',
    'Aiguilles obliques qui percent la plaque de givre',
  ],
  role: 'oneshot',
  duration: DURATION,
  // Douze images par seconde, comme le reste du catalogue : c'est la cadence
  // des feuilles 16 bits, et elle oblige chaque image à porter un changement
  // lisible au lieu de glisser d'un pixel.
  fps: 12,
  canvas: { width: 336, height: 200 },
  pivot: { x: 165, y: 109 },
  defaultRange: 3.3,
  defaultPower: 0.3,
  radial: false,
  loop: 'none',
  events: [
    { id: 'cast', at: T.frostIn, note: 'La plaque de givre gagne le sol' },
    { id: 'release', at: T.release, note: 'Départ rigide de la lance' },
    { id: 'contact', at: T.contact, note: 'La pointe atteint la cible' },
    { id: 'fracture', at: T.contact, note: 'Rupture le long des plans transversaux' },
    { id: 'settled', at: T.settled, note: 'Les fragments sont au sol' },
  ],

  sample(t, ctx) {
    const out: DrawCmd[] = [];
    const style = ctx.style;
    const pal = ctx.palette;
    const seed = deriveSeed(ctx.seed, 'ice-frost-lance');
    const { right, up } = cameraPlane(ctx.projection);

    // --- Rang : 1 a 3 lances tirees en séquence, décalées latéralement. ---
    const lanceCount = ctx.power < 0.34 ? 1 : ctx.power < 0.67 ? 2 : 3;

    // ------------------------------------------------------------------
    // Sol : plaque de givre sous le lanceur.
    // ------------------------------------------------------------------
    const castPlate = window4(t, T.frostIn, 0.12, 0.62, 0.96);
    if (castPlate > 0) {
      const grow = ramp(t, T.frostIn, 0.16);
      out.push(
        ...emitFrostPlate(ctx, ctx.wl(0.05, 0, 0), 0.85 * easeOut(grow), 6, seed + 11, castPlate),
      );
    }

    // ------------------------------------------------------------------
    // Aiguilles obliques à la source : elles percent la plaque, tiennent,
    // puis s'effacent. Elles ne tournent pas avec le sprite : leur
    // inclinaison est definie dans le repère local du sort.
    // ------------------------------------------------------------------
    for (let i = 0; i < 3; i++) {
      const at = T.needlesIn + i * 0.035;
      const life = window4(t, at, at + 0.1, 0.6, 0.78);
      if (life <= 0) continue;
      const grow = easeOutExpo(ramp(t, at, at + 0.12));
      const side = (i - 1) * 0.42;
      const base = ctx.wl(0.05 + i * 0.12, side, 0);
      const h = (0.5 + i * 0.12) * grow;
      const tip = ctx.wl(0.05 + i * 0.12 + 0.24 * grow, side * 1.25, h);
      const faces = spike(base, tip, 0.075 + i * 0.012, 0.45, 5, i * 0.7);
      out.push(
        ...emitSolid(ctx, faces, {
          palette: pal,
          style,
          alpha: life,
          tag: 'needle',
        }),
      );
    }

    // ------------------------------------------------------------------
    // Les lances.
    // ------------------------------------------------------------------
    for (let n = 0; n < lanceCount; n++) {
      const delay = n * 0.06;
      const lateral = lanceCount === 1 ? 0 : (n - (lanceCount - 1) / 2) * 0.34;
      const axis = lanceAxis(ctx, lateral);
      const lanceSeed = seed + n * 4409;

      const growth = clamp01(ramp(t, T.growStart + delay, T.growEnd + delay));
      const flight = clamp01(ramp(t, T.release + delay, T.contact + delay));
      const broken = t >= T.contact + delay;

      if (growth <= 0) continue;

      // Croissance : la lance s'extrude depuis la main, avec un leger
      // depassement en fin de course. La base ne bouge pas.
      const grown = LANCE_LENGTH * (0.12 + 0.88 * easeBack(growth, 1.1));
      const travel = (axis.span - LANCE_LENGTH) * easeIn(flight);

      const baseWorld = add3(axis.from, scale3(axis.dir, travel));
      const tipWorld = add3(baseWorld, scale3(axis.dir, grown));

      if (!broken) {
        const faces = spike(baseWorld, tipWorld, LANCE_RADIUS, 0.34, SIDES, 0.26, (i) =>
          1 + randSigned(lanceSeed, i, 51, 0.13),
        );
        out.push(
          ...emitSolid(ctx, faces, {
            palette: pal,
            style,
            tag: 'lance',
          }),
        );

        // Reflet migrant le long du fut pendant le maintien rigide : la
        // lance ne bouge pas, seule la lumière se deplace.
        const hold = window4(t, T.growEnd + delay - 0.02, T.growEnd + delay + 0.03, T.release + delay, T.release + delay + 0.04);
        if (hold > 0) {
          const slide = ramp(t, T.growEnd + delay - 0.02, T.release + delay + 0.04);
          const a = add3(baseWorld, scale3(axis.dir, grown * clamp01(slide - 0.18)));
          const b = add3(baseWorld, scale3(axis.dir, grown * clamp01(slide + 0.1)));
          out.push({
            layer: 'main',
            depth: depthOf(b) + 0.5,
            shape: { t: 'ribbon', pts: [ctx.p(a), ctx.p(b)], widths: [1, 2.5] },
            paint: { color: fade(pal.core, 0.85 * hold) },
            tag: 'glint',
          });
        }

        out.push(...groundShadow(ctx, baseWorld, 0.3, 0.32));
        out.push(...groundShadow(ctx, tipWorld, 0.22, 0.26));

        if (style.glow) {
          out.push({
            layer: 'light',
            depth: depthOf(tipWorld),
            shape: { t: 'disc', c: ctx.p(tipWorld), r: 4 + 3 * flight },
            paint: { color: fade(pal.glow, 0.3 + 0.3 * flight), dither: { level: 0.55 } },
            tag: 'glow',
          });
        }
      } else {
        // ------------------------------------------------------------
        // Fracture : la lance est decoupee en tranches transversales.
        // Chaque fragment est le morceau reel du prisme, pas une nouvelle
        // primitive : il conserve rayon, roulis et facettage.
        // ------------------------------------------------------------
        const age = t - (T.contact + delay);
        const frac = clamp01(age / (T.fractureEnd - T.contact));
        const alpha = 1 - ramp(t, T.fractureEnd, T.settled);
        if (alpha <= 0) continue;

        const impact = add3(axis.from, scale3(axis.dir, axis.span));
        const pieces = 5;
        for (let j = 0; j < pieces; j++) {
          const a0 = j / pieces;
          const a1 = (j + 1) / pieces;
          const p0 = add3(impact, scale3(axis.dir, -LANCE_LENGTH * (1 - a0)));
          const p1 = add3(impact, scale3(axis.dir, -LANCE_LENGTH * (1 - a1)));
          const r0 = LANCE_RADIUS * (a0 < 0.66 ? 1 : 1 - (a0 - 0.66) * 2.4);
          const r1 = LANCE_RADIUS * (a1 < 0.66 ? 1 : 1 - (a1 - 0.66) * 2.4);
          let faces: Face[] =
            j === pieces - 1
              ? spike(p0, add3(impact, scale3(axis.dir, 0.02)), Math.max(0.03, r0), 0.8, SIDES, 0.26)
              : prism(p0, p1, Math.max(0.03, r0), Math.max(0.03, r1), SIDES, 0.26, (i) =>
                  1 + randSigned(lanceSeed, i + j * 13, 51, 0.13),
                );

          // Ejection : cone oriente autour de l'axe d'arrivee, avec gravite.
          const spreadA = randSigned(lanceSeed, j, 61, 1);
          const spreadB = randSigned(lanceSeed, j, 62, 1);
          const outward = norm3(
            add3(
              scale3(axis.dir, -0.15 - j * 0.12),
              add3(scale3(right, spreadA * 0.9), { x: 0, y: 0, z: 0.55 + spreadB * 0.35 }),
            ),
          );
          const speed = randRange(lanceSeed, j, 63, 1.5, 2.6);
          const dt = age;
          const off = add3(scale3(outward, speed * dt), { x: 0, y: 0, z: -3.6 * dt * dt });
          let moved = translateFaces(faces, off);
          const centre = add3(scale3(add3(p0, p1), 0.5), off);
          moved = rotateFacesAbout(
            moved,
            centre,
            norm3({ x: spreadB, y: spreadA, z: 0.4 }),
            dt * randRange(lanceSeed, j, 64, 4, 11),
          );
          // Le fragment ne traverse pas le sol.
          const lowest = Math.min(...moved.flatMap((f) => f.pts.map((p) => p.z)));
          if (lowest < 0.02) moved = translateFaces(moved, { x: 0, y: 0, z: 0.02 - lowest });

          out.push(
            ...emitSolid(ctx, moved, {
              palette: pal,
              style,
              alpha,
              tag: 'shard',
            }),
          );
        }

        // Eclats fins projetés par la rupture.
        out.push(
          ...emitDebris(ctx, {
            seed: lanceSeed + 71,
            count: 22,
            clipTime: age,
            startedAt: T.contact + delay,
            origin: () => impact,
            axis: () => norm3(add3(scale3(axis.dir, -0.2), { x: 0, y: 0, z: 0.9 })),
            spread: 1.15,
            speed: [1.4, 3.0],
            gravity: 7.5,
            launch: (i) => randRange(lanceSeed, i, 72, 0, 0.05),
            life: [0.3, 0.62],
            size: [1.2, 2.8],
            kind: 'shard',
            palette: pal,
            style,
            alpha,
            tag: 'debris',
            tone: [0.05, 0.6],
          }),
        );
        void frac;
      }
    }

    // ------------------------------------------------------------------
    // Impact : plaque de givre, fractures rayonnantes, aiguilles obliques.
    // ------------------------------------------------------------------
    const impactWorld = ctx.wl(ctx.distance, 0, 0);
    if (t >= T.contact) {
      const age = t - T.contact;
      const plateAlpha = residueAlpha(t, T.settled, 0.97, 0.72);
      const plateGrow = easeOut(clamp01(age / 0.12));
      out.push(...emitFrostPlate(ctx, impactWorld, 1.5 * plateGrow, 8, seed + 31, plateAlpha));

      const crackProgress = easeOut(clamp01(age / 0.18));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        const end = add3(impactWorld, { x: Math.cos(a) * 1.7, y: Math.sin(a) * 1.7, z: 0 });
        const path = crackPath(impactWorld, end, 5, seed + i * 331, 0.22);
        out.push(...emitCrack(ctx, path, 1.6, pal.rim, plateAlpha * 0.8, crackProgress));
        if (i % 2 === 0) {
          for (const b of crackBranches(path, seed + i * 97, 1, 0.55)) {
            out.push(...emitCrack(ctx, b, 1, pal.rim, plateAlpha * 0.6, crackProgress));
          }
        }
      }

      // Aiguilles obliques qui percent au point de contact.
      const needleCount = 6;
      for (let i = 0; i < needleCount; i++) {
        const at = 0.01 + i * 0.018;
        const life = window4(age, at, at + 0.05, 0.22, 0.34);
        if (life <= 0) continue;
        const g = easeOutExpo(clamp01((age - at) / 0.07));
        const a = (i / needleCount) * Math.PI * 2 + 0.9;
        const r = 0.5 + randRange(seed, i, 81, 0, 0.42);
        const base = add3(impactWorld, { x: Math.cos(a) * r, y: Math.sin(a) * r, z: 0 });
        const h = (0.95 + randRange(seed, i, 82, 0, 0.7)) * g;
        const tip = add3(base, { x: Math.cos(a) * 0.42 * g, y: Math.sin(a) * 0.42 * g, z: h });
        out.push(
          ...emitSolid(ctx, spike(base, tip, 0.14, 0.5, 5, i * 1.1), {
            palette: pal,
            style,
            alpha: life,
            tag: 'needle',
          }),
        );
      }
    }

    // ------------------------------------------------------------------
    // Flash de contact : étoile anguleuse, pas un disque blanc.
    // La fenêtre fait ~0,075 du clip, soit environ trois images a 24 Hz :
    // elle reste visible a cadence reduite sans devenir un halo permanent.
    // ------------------------------------------------------------------
    const flash = window4(t, T.contact - 0.005, T.contact + 0.02, T.contact + 0.04, T.flashEnd);
    if (flash > 0) {
      const c = ctx.p(add3(impactWorld, { x: 0, y: 0, z: 0.2 }));
      const pts = [];
      const spikes = 4;
      const big = 16 * flash + 5;
      const small = 3.4 * flash + 1.5;
      for (let i = 0; i < spikes * 2; i++) {
        const a = (i / (spikes * 2)) * Math.PI * 2 + 0.2;
        const r = i % 2 === 0 ? big : small;
        pts.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r * 0.62 });
      }
      out.push({
        layer: 'main',
        depth: depthOf(impactWorld) + 8,
        shape: poly(pts),
        paint: { color: fade(pal.core, flash) },
        tag: 'flash',
      });
      if (style.glow) {
        out.push({
          layer: 'light',
          depth: depthOf(impactWorld) + 9,
          shape: { t: 'disc', c, r: 9 + 12 * flash },
          paint: { color: fade(pal.glow, 0.55 * flash), dither: { level: 0.5 } },
          tag: 'glow',
        });
      }
    }

    void up;
    return out;
  },
};
