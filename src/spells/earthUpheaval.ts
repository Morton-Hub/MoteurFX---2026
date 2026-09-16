/**
 * TERRE — « Eventration »
 *
 * Concept : la terre est lourde et elle ne se dissipe pas, elle retombe. Une
 * fracture court au sol du lanceur vers la cible, puis des dalles stratifiees
 * basculent hors du sol en séquence le long de cette fracture, chacune
 * pivotant autour de son arête arrière. Elles marquent un temps en haut de
 * course — c'est ce temps mort qui donne la masse — avant d'accelerer vers le
 * bas et de claquer au sol en projetant gravats et poussière.
 *
 * Aucune dalle ne disparait en fondu : elle redescend, se replante, et c'est
 * la poussière qui s'efface.
 *
 * Signature de forme : blocs a faces planes, strates horizontales, arêtes de
 * fracture. Timing lourd : sortie lente, suspension, chute acceleree.
 */

import {
  type Vec3,
  add3,
  clamp01,
  easeInHeavy,
  easeOut,
  easeOutHeavy,
  norm3,
  ramp,
  scale3,
  window4,
} from '../core/math.js';
import { deriveSeed, randRange } from '../core/rng.js';
import { depthOf } from '../space/projection.js';
import type { DrawCmd } from '../render/draw.js';
import { ellipse, poly } from '../render/draw.js';
import { fade } from '../raster/framebuffer.js';
import { box, emitSolid, patches, rotateFacesAbout, stratify, type Face } from '../grammar/solid.js';
import { emitDebris } from '../grammar/motion.js';
import { crackBranches, crackPath, emitCrack, residueAlpha } from '../grammar/ground.js';
import type { SpellRecipe } from '../sim/types.js';

const DURATION = 1.7;

/** Aucune matière visible au-delà de cet instant : le clip finit propre. */
const CLIP_OUT = 0.96;

/**
 * Inclinaison que la dalle conserve une fois replantee, en radians.
 * En projection isometrique, une dalle a 24 degres se lit deja comme posee a
 * plat : il faut nettement plus pour que le sol reste visiblement eventre.
 * La chute reste lisible parce que les dalles partent de 60 a 86 degres.
 */
const REST_TILT = 0.7;
/** Part maximale de l'inclinaison initiale conservee au repos. */
const REST_SHARE_MAX = 0.6;

const T = {
  stomp: 0.0,
  crackStart: 0.05,
  crackEnd: 0.26,
  firstRise: 0.18,
  hold: 0.5,
  firstFall: 0.58,
  dustEnd: 0.97,
} as const;

/** Une dalle : sa place le long de la fracture et son rythme propre. */
type Slab = {
  readonly along: number;
  readonly side: number;
  readonly length: number;
  readonly width: number;
  readonly thickness: number;
  readonly tilt: number;
  readonly delay: number;
};

function slabsFor(count: number, seed: number): Slab[] {
  const out: Slab[] = [];
  for (let i = 0; i < count; i++) {
    const u = (i + 0.8) / (count + 0.6);
    out.push({
      along: u,
      // Alternance de part et d'autre de la fracture : la terre s'ouvre.
      side: (i % 2 === 0 ? 1 : -1) * randRange(seed, i, 181, 0.34, 0.66),
      length: randRange(seed, i, 182, 0.32, 0.62),
      // La largeur est le bras de levier : c'est elle qui devient la hauteur
      // une fois la dalle redressee.
      width: randRange(seed, i, 183, 0.44, 0.86),
      thickness: randRange(seed, i, 184, 0.1, 0.17),
      tilt: randRange(seed, i, 185, 0.9, 1.5) * (i % 2 === 0 ? 1 : -1),
      delay: u * 0.3,
    });
  }
  return out;
}

export const earthUpheaval: SpellRecipe = {
  id: 'earth-upheaval',
  element: 'earth',
  title: 'Éventration',
  concept:
    "Une fracture court au sol jusqu'à la cible, puis des dalles stratifiées basculent hors du sol en séquence, marquent un temps en haut de course et claquent au sol en projetant gravats et poussière.",
  signature: [
    'Blocs à faces planes et strates horizontales',
    "Bascule autour de l'arête arrière, jamais un surgissement vertical",
    'Suspension en haut de course puis chute accélérée',
    'Retombée au sol : rien ne disparaît en fondu sauf la poussière',
  ],
  role: 'oneshot',
  duration: DURATION,
  fps: 24,
  canvas: { width: 272, height: 168 },
  pivot: { x: 135, y: 94 },
  defaultRange: 3.3,
  defaultPower: 0.5,
  radial: false,
  loop: 'none',
  events: [
    { id: 'cast', at: T.stomp, note: 'Appui au sol' },
    { id: 'release', at: T.crackStart, note: 'Départ de la fracture' },
    { id: 'peak', at: T.hold, note: 'Suspension des dalles' },
    { id: 'contact', at: T.firstFall, note: 'Première retombée' },
    { id: 'settled', at: T.dustEnd, note: 'Poussière retombée' },
  ],

  sample(t, ctx) {
    const out: DrawCmd[] = [];
    const pal = ctx.palette;
    const style = ctx.style;
    const seed = deriveSeed(ctx.seed, 'earth-upheaval');

    const from = ctx.wl(0.45, 0, 0);
    const to = ctx.wl(ctx.distance, 0, 0);
    // Le rang ajoute des dalles le long de la même fracture.
    const slabCount = 4 + Math.round(ctx.power * 3);
    const slabs = slabsFor(slabCount, seed);

    // ------------------------------------------------------------------
    // Fracture au sol. Elle progresse puis reste : c'est la trace du sort.
    // ------------------------------------------------------------------
    const crackProgress = easeOut(clamp01(ramp(t, T.crackStart, T.crackEnd)));
    const crackAlpha = residueAlpha(t, 0.82, T.dustEnd, 0.9);
    if (crackProgress > 0 && crackAlpha > 0) {
      const main = crackPath(from, to, 9, seed + 1, 0.3);
      out.push(...emitCrack(ctx, main, 4.5, pal.rim, crackAlpha, crackProgress));
      for (const b of crackBranches(main, seed + 2, 5, 1.0)) {
        out.push(...emitCrack(ctx, b, 2.2, pal.rim, crackAlpha * 0.75, crackProgress));
      }
    }

    // ------------------------------------------------------------------
    // Appui du lanceur : une bouffee de poussière basse.
    // ------------------------------------------------------------------
    const stomp = window4(t, T.stomp, 0.03, 0.1, 0.24);
    if (stomp > 0) {
      const r = (0.22 + 0.4 * easeOut(ramp(t, T.stomp, 0.24))) * ctx.projection.groundScale;
      const c = ctx.p(ctx.wl(0.2, 0, 0.1));
      out.push({
        layer: 'ground',
        depth: depthOf(ctx.wl(0.2, 0, 0)) - 1,
        shape: ellipse(c, r, r * ctx.projection.groundRatio * 1.35),
        paint: { color: fade(pal.glow, stomp * 0.4), dither: { level: 0.5, matrix: 2 } },
        tag: 'dust',
      });
    }

    // ------------------------------------------------------------------
    // Les dalles.
    //
    // Chaque dalle est peinte comme un objet entier (`groupDepth`) et non
    // face par face : une dalle inclinee couvre a elle seule une centaine
    // d'unites de profondeur, la ou deux dalles voisines n'en separent qu'une
    // vingtaine. Un tri global face par face les entrelacerait alors qu'elles
    // ne se croisent jamais.
    //
    // Retour au calme : la terre se referme. Les dalles redescendent dans le
    // sol au lieu de passer d'un coup sous un seuil de visibilite, et le
    // fondu ne fait que masquer la part qui glisse sous le decor du jeu.
    // ------------------------------------------------------------------
    const closing = ramp(t, CLIP_OUT - 0.12, CLIP_OUT);
    const residue = 1 - closing;

    for (let i = 0; i < slabs.length; i++) {
      const g = slabs[i]!;
      const riseAt = T.firstRise + g.delay;
      const fallAt = T.firstFall + g.delay * 0.7;
      // La derniere dalle doit etre replantee assez tot pour que sa poussiere
      // ait le temps de retomber dans le clip.
      const landAt = Math.min(0.82, fallAt + 0.16);
      if (t < riseAt || residue <= 0) continue;

      // Sortie lente et large, suspension, puis chute acceleree.
      const up = easeOutHeavy(clamp01(ramp(t, riseAt, riseAt + 0.26)));
      const down = easeInHeavy(clamp01(ramp(t, fallAt, landAt)));
      // La dalle ne revient pas a plat : elle se replante de travers. C'est ce
      // reste d'inclinaison qui supprime la disparition brutale — dans la
      // version precedente l'angle repassait sous le seuil de visibilite en
      // deux images, et la dalle s'evaporait sur place.
      const restShare = Math.min(REST_SHARE_MAX, REST_TILT / Math.abs(g.tilt));
      const settle = window4(t, landAt, landAt + 0.015, landAt + 0.04, landAt + 0.14);
      const angle = g.tilt * (up - down * (1 - restShare)) - settle * 0.06 * Math.sign(g.tilt);
      const emerged = clamp01((Math.abs(angle) - 0.04) / 0.1) * residue;
      if (emerged <= 0) continue;

      const anchorGround = add3(
        add3(from, scale3({ x: to.x - from.x, y: to.y - from.y, z: 0 }, g.along)),
        scale3(ctx.frame.side, g.side),
      );
      const groupDepth = depthOf(anchorGround) + i * 0.02;
      const sideSign = Math.sign(g.side);

      // Logement : le creux d'ou la dalle est sortie. Sans lui, la dalle a
      // l'air posee sur le sol plutot que d'en etre arrachee.
      const socketPts = [
        add3(anchorGround, scale3(ctx.frame.side, sideSign * g.width)),
        add3(
          add3(anchorGround, scale3(ctx.frame.side, sideSign * g.width)),
          scale3(ctx.frame.forward, g.length),
        ),
        add3(
          add3(anchorGround, scale3(ctx.frame.side, -sideSign * g.width)),
          scale3(ctx.frame.forward, g.length),
        ),
        add3(anchorGround, scale3(ctx.frame.side, -sideSign * g.width)),
      ].map((q) => ctx.p(q));
      out.push({
        layer: 'ground',
        depth: depthOf(anchorGround) - 2,
        shape: poly(socketPts),
        paint: { color: fade(pal.rim, 0.6 * emerged) },
        tag: 'socket',
      });

      const centre: Vec3 = {
        x: anchorGround.x,
        y: anchorGround.y,
        z: g.thickness,
      };
      const faces: Face[] = box(
        centre,
        scale3(ctx.frame.side, g.width),
        scale3(ctx.frame.forward, g.length),
        { x: 0, y: 0, z: g.thickness },
      );
      // Pivot : l'arête arrière de la dalle, côté fracture.
      const hingePoint: Vec3 = {
        x: anchorGround.x - ctx.frame.side.x * sideSign * g.width,
        y: anchorGround.y - ctx.frame.side.y * sideSign * g.width,
        z: 0,
      };
      // Le meme deplacement s'applique au bloc et a ses details, pour qu'ils
      // ne se decollent jamais l'un de l'autre.
      const rotate = (fs: readonly Face[]): Face[] =>
        rotateFacesAbout(fs, hingePoint, ctx.frame.forward, angle);

      const rotated = rotate(faces);
      // L'arête de charniere reste plantee au sol. Seule l'épaisseur peut
      // passer legerement dessous ; on la corrige pour ne pas peindre un bloc
      // enterre par dessus le decor du jeu, qui ne peut pas l'occulter.
      const lowest = Math.min(...rotated.flatMap((f) => f.pts.map((q) => q.z)));
      const lift = lowest < -0.02 ? -0.02 - lowest : 0;
      const sink =
        closing > 0
          ? easeInHeavy(closing) * (g.width * Math.abs(Math.sin(angle)) + g.thickness * 2.5)
          : 0;
      const dz = lift - sink;
      const shift = (fs: readonly Face[]): Face[] =>
        dz === 0
          ? [...fs]
          : fs.map((f) => ({
              ...f,
              pts: f.pts.map((q) => ({ x: q.x, y: q.y, z: q.z + dz })),
              centroid: { ...f.centroid, z: f.centroid.z + dz },
            }));

      const tilted = shift(rotated);

      out.push(
        ...emitSolid(ctx, tilted, {
          palette: pal,
          style,
          alpha: emerged,
          tag: 'slab',
          edge: pal.rim,
          groupDepth,
        }),
      );

      // Matière. Les strates sont construites sur le bloc **avant** bascule,
      // puis tournent avec lui : ce sont des lits de sedimentation, donc des
      // plans horizontaux a l'origine. Les construire sur la face inclinee
      // les alignait sur une arête quelconque, et la pierre se lisait comme
      // du carton ondule.
      const detailRaw: Face[] = [];
      for (const f of faces) {
        if (Math.abs(f.normal.z) > 0.55) {
          detailRaw.push(
            ...patches(f, [
              [0.16, 0.22, 0.37, 0.35],
              [0.58, 0.55, 0.85, 0.72],
              [0.44, 0.07, 0.56, 0.18],
            ]),
          );
        } else {
          detailRaw.push(...stratify(f, [0.34, 0.68], 0.07));
        }
      }
      out.push(
        ...emitSolid(ctx, shift(rotate(detailRaw)), {
          palette: pal,
          style,
          alpha: emerged,
          tag: 'strata',
          groupDepth: groupDepth + 0.008,
        }),
      );

      // Gravats à la sortie et au choc.
      const emergence = clamp01(ramp(t, riseAt, riseAt + 0.12));
      if (emergence > 0) {
        out.push(
          ...emitDebris(ctx, {
            seed: seed + i * 311,
            count: 9,
            clipTime: t - riseAt,
            startedAt: riseAt,
            origin: () => ({ x: anchorGround.x, y: anchorGround.y, z: 0.05 }),
            axis: () => norm3(add3(scale3(ctx.frame.side, Math.sign(g.side) * 0.5), { x: 0, y: 0, z: 1 })),
            spread: 0.8,
            speed: [1, 2.6],
            gravity: 8,
            launch: (k) => randRange(seed + i, k, 191, 0, 0.1),
            life: [0.3, 0.6],
            size: [1.4, 3],
            kind: 'block',
            palette: pal,
            style,
            tag: 'gravel',
            shadows: true,
          }),
        );
      }
      if (t >= landAt) {
        out.push(
          ...emitDebris(ctx, {
            seed: seed + i * 733,
            count: 12,
            clipTime: t - landAt,
            startedAt: landAt,
            origin: () => ({ x: anchorGround.x, y: anchorGround.y, z: 0.08 }),
            axis: () => ({ x: 0, y: 0, z: 1 }),
            spread: 1.3,
            speed: [1.2, 3.2],
            gravity: 9.5,
            launch: (k) => randRange(seed + i, k, 192, 0, 0.04),
            life: [0.25, 0.5],
            size: [1.2, 2.6],
            kind: 'block',
            palette: pal,
            style,
            tag: 'gravel',
          }),
        );
        // Poussiere de choc : basse, large, très tramee.
        const puffEnd = Math.min(CLIP_OUT, landAt + 0.42);
        const puff = window4(t, landAt, landAt + 0.04, landAt + 0.14, puffEnd);
        if (puff > 0) {
          const spread = 0.5 + 1.1 * easeOut(clamp01(ramp(t, landAt, puffEnd)));
          const c = ctx.p({ x: anchorGround.x, y: anchorGround.y, z: 0.14 * spread });
          const r = spread * ctx.projection.groundScale;
          out.push({
            layer: 'main',
            depth: depthOf(anchorGround) + 0.2,
            shape: ellipse(c, r, r * 0.42),
            paint: { color: fade(pal.ramp[2] ?? pal.glow, puff * 0.5), dither: { level: 0.45, matrix: 2, phaseX: i } },
            tag: 'dust',
          });
        }
      }
    }

    // ------------------------------------------------------------------
    // Poussiere résiduelle le long de la fracture : elle relie les dalles
    // entre elles et s'efface en dernier.
    // ------------------------------------------------------------------
    const haze = window4(t, T.firstFall, T.firstFall + 0.12, 0.82, T.dustEnd);
    if (haze > 0) {
      for (let i = 0; i < 6; i++) {
        const u = (i + 0.5) / 6;
        const p = add3(
          add3(from, scale3({ x: to.x - from.x, y: to.y - from.y, z: 0 }, u)),
          { x: 0, y: 0, z: 0.18 + 0.25 * haze },
        );
        const r = (0.55 + randRange(seed, i, 193, 0, 0.35)) * (0.6 + haze) * ctx.projection.groundScale;
        out.push({
          layer: 'main',
          depth: depthOf(p) - 0.5,
          shape: ellipse(ctx.p(p), r, r * 0.38),
          paint: {
            color: fade(pal.ramp[3] ?? pal.glow, haze * 0.3),
            dither: { level: 0.35, matrix: 2, phaseX: i * 2, phaseY: i },
          },
          tag: 'dust',
        });
      }
    }

    return out;
  },
};
