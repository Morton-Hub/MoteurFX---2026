/**
 * FEU — « Météore »
 *
 * Concept : une masse, une trajectoire, un impact. Le sort n'est pas un
 * phénomène qui dure, c'est un événement qu'on voit arriver.
 *
 * Le bloc n'entre pas à la verticale : il descend sur une **oblique alignée
 * sur le cap**, venant de derrière et au-dessus du lanceur, et file au-dessus
 * de lui jusqu'à la cible. C'est ce qui sauve le sort en isométrie — une
 * chute verticale donnerait la même silhouette dans les huit caps, alors
 * qu'une entrée oblique change complètement d'aspect selon qu'elle vient vers
 * la caméra ou s'en éloigne.
 *
 * L'anticipation est portée par l'ombre au sol, qui court le long du cap et
 * se resserre à mesure que le bloc descend : le joueur lit le point de chute
 * avant l'impact. Elle suit la projection au sol, jamais la hauteur visuelle.
 *
 * La conséquence est **dirigée**, pas concentrique : les fragments partent
 * dans un cône orienté par la trajectoire d'arrivée, et une nappe de feu
 * rasante court vers l'avant. Pas d'anneau de choc.
 *
 * Signature de forme : un bloc anguleux à croûte sombre et fissures
 * incandescentes, une traînée qui suit la tangente réelle, une nappe au sol
 * poussée vers l'avant.
 */

import {
  type Vec3,
  add3,
  clamp01,
  easeIn,
  easeOut,
  norm3,
  ramp,
  scale3,
  sub3,
  window4,
} from '../core/math.js';
import { deriveSeed, randRange } from '../core/rng.js';
import { depthOf } from '../space/projection.js';
import { type DrawCmd, type Ramp, type Shape, ellipse, poly } from '../render/draw.js';
import { fade } from '../raster/framebuffer.js';
import { rampAt, rampSlice } from '../style/palette.js';
import { blobPolygon, voidPolygon, type BlobSpec } from '../grammar/blob.js';
import { emitSolid, rockLump, rotateFacesAbout, shatterVolume, type Face } from '../grammar/solid.js';
import { emitDebris } from '../grammar/motion.js';
import { crackBranches, crackPath, emitCrack, emitPlate, residueAlpha } from '../grammar/ground.js';
import type { SpellContext, SpellRecipe } from '../sim/types.js';

const DURATION = 1.6;
const CLIP_OUT = 0.96;

const T = {
  /** La terre noircit avant l'impact : c'est le repère de chute. */
  mark: 0.02,
  entry: 0.1,
  contact: 0.46,
  flashEnd: 0.53,
  sheetEnd: 0.76,
  smokeEnd: CLIP_OUT,
} as const;

/** Recul de l'entrée derrière le point d'impact, en tuiles. */
const ENTRY_BACK = 5.4;
/** Altitude d'entrée, en tuiles. */
const ENTRY_UP = 4.0;

/** Demi-extensions servant à découper la masse en fragments. */
const ROCK = { right: 0.82, forward: 0.72, up: 0.64 };
/** Rayon du bloc, en tuiles. */
const ROCK_R = 0.82;

/**
 * Position du bloc à l'instant `u` de sa course.
 * Horizontale à vitesse constante, verticale en chute accélérée : c'est une
 * vraie parabole, ce qui fait que la traînée s'aplatit en fin de course.
 */
function meteorAt(ctx: SpellContext, u: number): Vec3 {
  const k = clamp01(u);
  const fwd = ctx.distance - ENTRY_BACK * (1 - k);
  const z = 0.22 + (ENTRY_UP - 0.22) * (1 - k) * (1 - k);
  return ctx.wl(fwd, 0, z);
}

/**
 * Une face est-elle une coulée en fusion plutôt que de la croûte ?
 *
 * Dessiner des fentes rectangulaires sur chaque face produisait des glyphes —
 * une croix, une équerre — parfaitement lisibles et parfaitement faux. Faire
 * rougeoyer des faces entières donne la même lecture « roche en fusion » sans
 * jamais dessiner de symbole, et tient à vingt pixels.
 */
function isMoltenFace(seed: number, faceIndex: number): boolean {
  return randRange(seed, faceIndex, 401, 0, 1) < 0.28;
}

type LobeOptions = {
  readonly heat: number;
  readonly alpha: number;
  readonly voids: number;
  readonly tag: string;
  readonly depthBias?: number;
  readonly sharedRamp?: Ramp;
};

/** Corps mou à dégradé vertical postérisé. Traînée, nappe, fumée. */
function emitLobe(ctx: SpellContext, spec: BlobSpec, o: LobeOptions): DrawCmd[] {
  if (o.alpha <= 0 || spec.radius <= 0.012) return [];
  const pts3 = blobPolygon(ctx.projection, spec);
  if (pts3.length < 3) return [];
  const pts = pts3.map((p) => ctx.p(p));
  let top = Infinity;
  let bottom = -Infinity;
  for (const p of pts) {
    if (p.y < top) top = p.y;
    if (p.y > bottom) bottom = p.y;
  }
  const from = clamp01(o.heat * 0.62);
  const to = clamp01(0.42 + o.heat * 0.58);
  const gradient: Ramp =
    o.sharedRamp ?? { y0: bottom, y1: top, stops: rampSlice(ctx.palette, from, to, 5) };

  const holes: Shape[] = [];
  for (let i = 0; i < o.voids; i++) {
    holes.push(poly(voidPolygon(ctx.projection, spec, i, 0.32 + i * 0.1).map((p) => ctx.p(p))));
  }
  return [
    {
      layer: 'main',
      depth: depthOf(spec.center) + (o.depthBias ?? 0),
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
}

export const fireMeteorStrike: SpellRecipe = {
  id: 'fire-meteor-strike',
  element: 'fire',
  title: 'Météore',
  concept:
    "La terre noircit sous le point de chute, puis un bloc en fusion entre en oblique dans l'axe du cap, file au-dessus du lanceur et s'écrase sur la cible. Il éclate en fragments issus de sa propre masse et pousse devant lui une nappe de feu rasante.",
  signature: [
    'Une masse unique, à croûte sombre et fissures incandescentes',
    "Entrée oblique alignée sur le cap, jamais une chute verticale",
    "Ombre au sol qui court et se resserre : le point de chute est lisible avant l'impact",
    'Conséquence dirigée vers l\'avant — fragments en cône et nappe rasante, aucun anneau',
  ],
  role: 'oneshot',
  duration: DURATION,
  fps: 24,
  canvas: { width: 416, height: 272 },
  pivot: { x: 209, y: 155 },
  defaultRange: 3.3,
  defaultPower: 0.25,
  radial: false,
  loop: 'none',
  events: [
    { id: 'cast', at: T.mark, note: 'La terre noircit sous le point de chute' },
    { id: 'release', at: T.entry, note: "Entrée du bloc dans l'axe du cap" },
    { id: 'contact', at: T.contact, note: 'Impact' },
    { id: 'fracture', at: T.contact, note: 'La masse éclate en fragments issus de son volume' },
    { id: 'settled', at: T.smokeEnd, note: 'Fumée dissipée' },
  ],

  sample(t, ctx) {
    const out: DrawCmd[] = [];
    const pal = ctx.palette;
    const style = ctx.style;
    const seed = deriveSeed(ctx.seed, 'fire-meteor-strike');
    // Le rang ajoute des météores en séquence rapprochée, décalés le long du
    // cap : le comportement change, pas l'échelle du bloc.
    const shots = ctx.power < 0.34 ? 1 : ctx.power < 0.7 ? 2 : 3;

    for (let shot = 0; shot < shots; shot++) {
      const lag = shot * 0.085;
      const shotSeed = seed + shot * 5171;
      const skew = shot === 0 ? 0 : randRange(shotSeed, shot, 301, -0.75, 0.75);
      const reach = ctx.distance + (shot === 0 ? 0 : randRange(shotSeed, shot, 302, -0.7, 0.5));
      const impact = ctx.wl(reach, skew, 0);

      const markAt = T.mark + lag;
      const entryAt = T.entry + lag;
      const contactAt = T.contact + lag;

      // --------------------------------------------------------------
      // Repère de chute : la terre noircit avant l'arrivée. Ce n'est pas un
      // anneau — c'est la brûlure qui commence, et elle reste après coup.
      // --------------------------------------------------------------
      if (t >= markAt) {
        const warn = window4(t, markAt, markAt + 0.06, contactAt, contactAt + 0.02);
        const pulse = 0.55 + 0.45 * Math.sin(t * 46 + shot);
        const scorch = residueAlpha(t, T.sheetEnd, 0.99, 0.62);
        out.push(
          ...emitPlate(ctx, impact, 0.62, 9, shotSeed + 11, pal.rim, warn * 0.5 * pulse, 'mark', 0.4),
        );
        if (t >= contactAt) {
          out.push(...emitPlate(ctx, impact, 1.35, 12, shotSeed + 12, pal.rim, scorch, 'decal', 0.34));
        }
      }

      // --------------------------------------------------------------
      // La course.
      // --------------------------------------------------------------
      const flight = clamp01(ramp(t, entryAt, contactAt));
      const inFlight = t >= entryAt && t < contactAt;

      // L'axe local du tir : le météore de rang supérieur n'arrive pas
      // exactement dans l'axe du cap, mais sa propre oblique reste cohérente.
      const shotPos = (u: number): Vec3 => {
        const base = meteorAt(ctx, u);
        return add3(base, scale3(ctx.frame.side, skew * u));
      };

      if (inFlight) {
        const pos = shotPos(flight);
        const ahead = shotPos(Math.min(1, flight + 0.02));
        const travel = norm3(sub3(ahead, pos));

        // Traînée : échantillonnée le long de la trajectoire réelle, donc
        // elle suit la tangente et s'aplatit quand la course s'incline.
        const TAIL = 15;
        for (let k = TAIL; k >= 1; k--) {
          const back = flight - k * 0.017;
          if (back <= 0) continue;
          const p = shotPos(back);
          const age = k / TAIL;
          out.push(
            ...emitLobe(
              ctx,
              {
                center: p,
                radius: (0.66 - age * 0.38) * (0.88 + 0.24 * Math.sin(k * 1.7 + t * 20)),
                aspect: 1.15 + age * 0.5,
                lean: 0.1,
                wobble: 0.3 + age * 0.25,
                phase: t * 16 + k,
                sides: 11,
                seed: shotSeed + k * 331,
                taper: 0.2,
              },
              {
                heat: clamp01(age * 1.25),
                alpha: 1 - ramp(age, 0.72, 1),
                voids: age > 0.45 ? 1 : 0,
                tag: 'trail',
                depthBias: -1 - k * 0.01,
              },
            ),
          );
        }

        // Braises arrachées à la traînée : elles tombent et finissent au sol.
        out.push(
          ...emitDebris(ctx, {
            seed: shotSeed + 41,
            count: 26,
            clipTime: t - entryAt,
            startedAt: entryAt,
            origin: (i) => shotPos(clamp01(flight - randRange(shotSeed, i, 303, 0, 0.3))),
            axis: () => scale3(travel, -1),
            spread: 0.85,
            speed: [0.6, 2.2],
            gravity: 5.5,
            launch: (i) => randRange(shotSeed, i, 304, 0, contactAt - entryAt),
            life: [0.12, 0.3],
            size: [1, 2.4],
            kind: 'ember',
            palette: pal,
            style,
            tone: [0, 0.4],
            tag: 'ember',
          }),
        );

        // Ombre au sol : elle se resserre et se durcit à mesure que le bloc
        // descend. C'est elle qui donne le point de chute, pas un marqueur.
        const height = pos.z;
        const near = clamp01(1 - height / ENTRY_UP);
        const ground: Vec3 = { x: pos.x, y: pos.y, z: 0 };
        const rx = (1.15 - 0.62 * near) * ctx.projection.groundScale;
        out.push({
          layer: 'ground',
          depth: depthOf(ground) - 1,
          shape: ellipse(ctx.p(ground), rx, rx * ctx.projection.groundRatio),
          paint: { color: fade(pal.shadow, 0.3 + 0.55 * near) },
          tag: 'shadow',
        });

        // Le bloc. Croûte sombre : le biais le pousse au bas de la rampe,
        // sinon une palette de feu donnerait un caillou orange.
        const spin = (t - entryAt) * 7.5;
        const axis = norm3({ x: 0.4, y: -0.9, z: 0.35 });
        const rock: Face[] = rotateFacesAbout(
          rockLump(pos, ROCK_R, 7, shotSeed + 7, 0.92, 0.36),
          pos,
          axis,
          spin,
        );
        const groupDepth = depthOf(pos);
        // Croûte : le biais pousse les faces au bas de la rampe, sinon une
        // palette de feu donnerait un caillou orange vif.
        out.push(
          ...emitSolid(ctx, rock.filter((_, i) => !isMoltenFace(shotSeed + 17, i)), {
            palette: pal,
            style,
            bias: 0.5,
            tag: 'rock',
            edge: pal.rim,
            groupDepth,
          }),
        );
        // Fissures incandescentes : couleur imposée, elles ne s'assombrissent
        // pas avec l'orientation de leur face.
        // Coulées en fusion : couleur imposée, elles ne s'assombrissent pas
        // parce que leur face est tournée loin de la lumière.
        const glowPulse = 0.78 + 0.22 * Math.sin(t * 30 + shot * 2);
        out.push(
          ...emitSolid(ctx, rock.filter((_, i) => isMoltenFace(shotSeed + 17, i)), {
            palette: pal,
            style,
            flatColor: rampAt(pal, 0.34),
            alpha: glowPulse,
            tag: 'molten',
            edge: pal.rim,
            groupDepth: groupDepth + 0.004,
          }),
        );

        if (style.glow) {
          out.push({
            layer: 'light',
            depth: groupDepth,
            shape: { t: 'disc', c: ctx.p(pos), r: 22 },
            paint: { color: fade(pal.glow, 0.4), dither: { level: 0.55 } },
            tag: 'glow',
          });
        }
      }

      // --------------------------------------------------------------
      // Impact.
      // --------------------------------------------------------------
      if (t < contactAt) continue;
      const age = t - contactAt;
      const arrival = norm3(sub3(shotPos(1), shotPos(0.96)));

      // Flash : étoile anguleuse, ~3 images à 24 Hz. Pas de disque blanc.
      const flash = window4(t, contactAt - 0.005, contactAt + 0.02, contactAt + 0.05, contactAt + 0.09);
      if (flash > 0) {
        const c = ctx.p(add3(impact, { x: 0, y: 0, z: 0.28 }));
        const pts = [];
        const big = 22 * flash + 6;
        const small = 4.5 * flash + 2;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + 0.25;
          const r = i % 2 === 0 ? big : small;
          pts.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r * 0.6 });
        }
        out.push({
          layer: 'main',
          depth: depthOf(impact) + 12,
          shape: poly(pts),
          paint: { color: fade(pal.core, flash) },
          tag: 'flash',
        });
        if (style.glow) {
          out.push({
            layer: 'light',
            depth: depthOf(impact) + 13,
            shape: { t: 'disc', c, r: 18 + 26 * flash },
            paint: { color: fade(pal.glow, 0.55 * flash), dither: { level: 0.5 } },
            tag: 'glow',
          });
        }
      }

      // Fracture : la masse est découpée en huit morceaux qui occupent
      // exactement son volume, puis éjectés dans un cône orienté par
      // l'arrivée — donc vers l'avant, jamais en étoile symétrique.
      const shardAlpha = 1 - ramp(t, T.sheetEnd, 0.9);
      if (shardAlpha > 0) {
        const chunks = shatterVolume(
          impact,
          scale3(ctx.frame.side, ROCK.right),
          scale3(ctx.frame.forward, ROCK.forward),
          { x: 0, y: 0, z: ROCK.up },
          3,
          3,
          2,
          shotSeed + 7,
          0.2,
        );
        chunks.forEach((chunk, j) => {
          const dir = norm3(
            add3(
              scale3(arrival, 0.55 + chunk.offset.y * 0.35),
              add3(scale3(ctx.frame.side, chunk.offset.x * 0.9), {
                x: 0,
                y: 0,
                z: 0.75 + chunk.offset.z * 0.4,
              }),
            ),
          );
          const speed = randRange(shotSeed, j, 305, 1.8, 3.4);
          const off = add3(scale3(dir, speed * age), { x: 0, y: 0, z: -7.5 * age * age });
          let moved: Face[] = chunk.faces.map((f) => ({
            ...f,
            pts: f.pts.map((q) => add3(q, off)),
            centroid: add3(f.centroid, off),
          }));
          const centre = add3(chunk.centre, off);
          moved = rotateFacesAbout(
            moved,
            centre,
            norm3({ x: chunk.offset.z, y: chunk.offset.x, z: 0.5 }),
            age * randRange(shotSeed, j, 306, 3, 9),
          );
          const lowest = Math.min(...moved.flatMap((f) => f.pts.map((q) => q.z)));
          if (lowest < 0.02) {
            const lift = 0.02 - lowest;
            moved = moved.map((f) => ({
              ...f,
              pts: f.pts.map((q) => ({ x: q.x, y: q.y, z: q.z + lift })),
              centroid: { ...f.centroid, z: f.centroid.z + lift },
            }));
          }
          // Les morceaux refroidissent : le biais descend la rampe avec l'âge.
          out.push(
            ...emitSolid(ctx, moved, {
              palette: pal,
              style,
              alpha: shardAlpha,
              bias: 0.28 + clamp01(age * 1.4) * 0.34,
              tag: 'shard',
              edge: pal.rim,
              groupDepth: depthOf(centre) + j * 0.02,
            }),
          );
        });
      }

      // Nappe rasante : elle part du point de chute et court vers l'avant,
      // en s'élargissant. C'est la conséquence dirigée qui remplace l'anneau.
      const sheet = window4(t, contactAt, contactAt + 0.05, T.sheetEnd - 0.12, T.sheetEnd);
      if (sheet > 0) {
        const spread = easeOut(clamp01(age / 0.3));
        for (let i = 0; i < 20; i++) {
          const along = randRange(shotSeed, i, 307, 0.1, 1);
          const side = randRange(shotSeed, i, 308, -0.85, 0.85);
          const lane = add3(
            impact,
            add3(
              scale3(arrival, along * 2.5 * spread),
              scale3(ctx.frame.side, side * (0.4 + 1.5 * spread) * (1 - along * 0.35)),
            ),
          );
          const local = clamp01(age / (0.34 + randRange(shotSeed, i, 309, 0, 0.16)));
          out.push(
            ...emitLobe(
              ctx,
              {
                center: { x: lane.x, y: lane.y, z: 0.1 + (1 - local) * 0.34 },
                radius: (0.24 + randRange(shotSeed, i, 310, 0, 0.16)) * (1 - local * 0.4),
                aspect: 1.5 + local * 1.1,
                lean: 0.12,
                wobble: 0.34,
                phase: t * 14 + i * 1.7,
                sides: 11,
                seed: shotSeed + 700 + i * 97,
                taper: 0.5,
              },
              {
                // Plus la flamme est loin du cratère, plus elle est froide.
                heat: clamp01(local * 0.75 + along * 0.5),
                alpha: sheet * (1 - ramp(local, 0.7, 1)),
                voids: local > 0.4 ? 1 : 0,
                tag: 'sheet',
                depthBias: 1,
              },
            ),
          );
        }
      }

      // Sol : cratère et fractures rayonnantes, biaisées vers l'avant.
      const craterAlpha = residueAlpha(t, T.sheetEnd, 0.99, 0.75);
      if (craterAlpha > 0) {
        const progress = easeOut(clamp01(age / 0.16));
        for (let i = 0; i < 7; i++) {
          const spreadAngle = randRange(shotSeed, i, 311, -1.5, 1.5);
          const dir = add3(
            scale3(arrival, Math.cos(spreadAngle)),
            scale3(ctx.frame.side, Math.sin(spreadAngle)),
          );
          const end = add3(impact, scale3(dir, 1.5 + randRange(shotSeed, i, 312, 0, 0.9)));
          const path = crackPath(impact, end, 5, shotSeed + i * 211, 0.22);
          out.push(...emitCrack(ctx, path, 2, pal.rim, craterAlpha * 0.85, progress));
          if (i % 2 === 0) {
            for (const b of crackBranches(path, shotSeed + i * 53, 1, 0.5)) {
              out.push(...emitCrack(ctx, b, 1.2, pal.rim, craterAlpha * 0.6, progress));
            }
          }
        }
      }

      // Gravats et braises projetés, puis fumée qui monte du cratère.
      out.push(
        ...emitDebris(ctx, {
          seed: shotSeed + 61,
          count: 34,
          clipTime: age,
          startedAt: contactAt,
          origin: () => add3(impact, { x: 0, y: 0, z: 0.15 }),
          axis: () => norm3(add3(scale3(arrival, 0.6), { x: 0, y: 0, z: 1 })),
          spread: 0.95,
          speed: [1.6, 4],
          gravity: 7,
          launch: (i) => randRange(shotSeed, i, 313, 0, 0.05),
          life: [0.25, 0.5],
          size: [1, 2.6],
          kind: 'ember',
          palette: pal,
          style,
          tone: [0, 0.45],
          tag: 'ember',
        }),
      );

      for (let i = 0; i < 4; i++) {
        const at = contactAt + 0.12 + i * 0.06;
        const life = Math.min(0.4, CLIP_OUT - at);
        const smokeAge = t - at;
        if (smokeAge < 0 || smokeAge > life) continue;
        const k = clamp01(smokeAge / life);
        out.push(
          ...emitLobe(
            ctx,
            {
              center: add3(impact, {
                x: randRange(shotSeed, i, 314, -0.5, 0.5) * (0.5 + k),
                y: randRange(shotSeed, i, 315, -0.5, 0.5) * (0.5 + k),
                z: 0.5 + 1.7 * easeOut(k),
              }),
              radius: (0.26 + randRange(shotSeed, i, 316, 0, 0.12)) * (1 + k * 1.1),
              aspect: 1.15,
              lean: 0.12,
              wobble: 0.34,
              phase: t * 6 + i * 3,
              sides: 12,
              seed: shotSeed + 900 + i * 131,
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
    }

    void easeIn;
    return out;
  },
};
