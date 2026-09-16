/**
 * TERRE — « Marteau de Pierre »
 *
 * Concept : une seule masse, et tout le sort tient dans son poids.
 *
 * La version précédente alignait sept dalles semblables le long d'une
 * fracture : aucune ne dominait, le même battement — monter, tenir, retomber —
 * se répétait sept fois, et la silhouette se réduisait à une rangée de
 * rectangles. Ici il n'y a qu'un bloc. Il s'arrache du sol à côté du lanceur,
 * monte haut, marque une suspension — c'est ce temps mort qui donne la masse —
 * puis s'abat en arc sur la cible et éclate.
 *
 * L'amplitude verticale passe de 30 à près de 60 pixels : le sort occupe enfin
 * le volume isométrique au lieu de ramper au ras du sol.
 *
 * Les fragments ne sont pas des cailloux inventés au moment de la rupture :
 * c'est le bloc lui-même, découpé selon une grille, qui se disperse. À
 * l'instant du choc ils occupent exactement son volume.
 *
 * Signature de forme : une masse anguleuse unique et dominante, strates
 * horizontales, suspension lourde, arc d'abattage aligné sur le cap.
 */

import {
  type Vec3,
  add3,
  clamp01,
  easeInHeavy,
  easeInOut,
  easeOut,
  norm3,
  ramp,
  scale3,
  window4,
} from '../core/math.js';
import { deriveSeed, randRange } from '../core/rng.js';
import { depthOf } from '../space/projection.js';
import { type DrawCmd, ellipse } from '../render/draw.js';
import { fade } from '../raster/framebuffer.js';
import {
  emitSolid,
  rockLump,
  rotateFacesAbout,
  shatterVolume,
  stratify,
  type Face,
} from '../grammar/solid.js';
import { emitDebris, groundShadow } from '../grammar/motion.js';
import { crackBranches, crackPath, emitCrack, emitPlate, residueAlpha } from '../grammar/ground.js';
import type { SpellRecipe } from '../sim/types.js';

const DURATION = 1.75;
const CLIP_OUT = 0.96;

const T = {
  stomp: 0.0,
  /** Le bloc s'arrache du sol. */
  tearOut: 0.08,
  /** Il atteint son point haut. */
  apex: 0.36,
  /** Fin de la suspension : l'abattage commence. */
  swing: 0.46,
  contact: 0.64,
  settle: 0.86,
} as const;

/**
 * Demi-extensions du volume du bloc, en tuiles. Servent au creux laissé au
 * sol et au découpage en fragments.
 */
const BLOCK = { right: 0.86, forward: 0.72, up: 0.46 };
/** Rayon du bloc et aplatissement. Une boîte à six faces se lit toujours
 *  comme une boîte : il faut des faces d'orientations variées pour obtenir
 *  une silhouette de pierre. */
const BLOCK_R = 0.92;
const BLOCK_SQUASH = 0.52;
/** Altitude du point haut, en tuiles. */
const APEX_UP = 2.3;

/** Courbe de Bézier quadratique : l'arc d'abattage. */
function bezier(a: Vec3, c: Vec3, b: Vec3, u: number): Vec3 {
  const m = 1 - u;
  return {
    x: m * m * a.x + 2 * m * u * c.x + u * u * b.x,
    y: m * m * a.y + 2 * m * u * c.y + u * u * b.y,
    z: m * m * a.z + 2 * m * u * c.z + u * u * b.z,
  };
}

/** Translation rigide d'un solide. Aucune déformation. */
function moveFaces(faces: readonly Face[], delta: Vec3): Face[] {
  return faces.map((f) => ({
    ...f,
    pts: f.pts.map((q) => add3(q, delta)),
    centroid: add3(f.centroid, delta),
  }));
}

export const earthStoneHammer: SpellRecipe = {
  id: 'earth-stone-hammer',
  element: 'earth',
  title: 'Marteau de Pierre',
  concept:
    "Un bloc massif s'arrache du sol à côté du lanceur, monte à deux tuiles et demie, marque une suspension lourde, puis s'abat en arc sur la cible et éclate en fragments issus de son propre volume.",
  signature: [
    'Une masse dominante unique, jamais une rangée de blocs équivalents',
    'Suspension en haut de course : le temps mort qui donne le poids',
    "Arc d'abattage aligné sur le cap, accéléré vers le bas",
    'Fragments découpés dans le volume du bloc, pas des cailloux ajoutés',
  ],
  role: 'oneshot',
  duration: DURATION,
  // Douze images par seconde, comme le reste du catalogue : c'est la cadence
  // des feuilles 16 bits, et elle oblige chaque image à porter un changement
  // lisible au lieu de glisser d'un pixel.
  fps: 12,
  canvas: { width: 424, height: 224 },
  pivot: { x: 212, y: 122 },
  defaultRange: 3.3,
  defaultPower: 0.2,
  radial: false,
  loop: 'none',
  events: [
    { id: 'cast', at: T.stomp, note: 'Appui au sol' },
    { id: 'release', at: T.tearOut, note: 'Le bloc est arraché du sol' },
    { id: 'peak', at: T.apex, note: 'Suspension en haut de course' },
    { id: 'contact', at: T.contact, note: "Fracas à l'impact" },
    { id: 'fracture', at: T.contact, note: 'La masse éclate selon son volume' },
    { id: 'settled', at: CLIP_OUT, note: 'Poussière retombée' },
  ],

  sample(t, ctx) {
    const out: DrawCmd[] = [];
    const pal = ctx.palette;
    const style = ctx.style;
    const seed = deriveSeed(ctx.seed, 'earth-stone-hammer');
    // Le rang ajoute des marteaux successifs, échelonnés le long du cap :
    // le sort frappe plusieurs fois au lieu de frapper plus fort.
    const blows = 1 + Math.round(ctx.power * 2);
    const residue = 1 - ramp(t, CLIP_OUT - 0.1, CLIP_OUT);

    for (let blow = 0; blow < blows; blow++) {
      const lag = blow * 0.1;
      const blowSeed = seed + blow * 3767;
      const side = blow === 0 ? 0.85 : 0.85 * (blow % 2 === 0 ? 1 : -1);
      const reach = ctx.distance * (blow === 0 ? 1 : 1 - blow * 0.16);
      const impact = ctx.wl(reach, blow === 0 ? 0 : randRange(blowSeed, blow, 501, -0.6, 0.6), 0.18);

      const tearAt = T.tearOut + lag;
      const apexAt = T.apex + lag;
      const swingAt = T.swing + lag;
      const contactAt = T.contact + lag;

      const socket = ctx.wl(0.45, side, 0);
      // Le point haut reste au-dessus du creux : l'arrachement se lit comme
      // une extraction verticale, pas comme un départ de côté.
      const apexPos = ctx.wl(0.62, side * 0.82, APEX_UP);

      // ----------------------------------------------------------------
      // Appui du lanceur : une bouffée de poussière basse.
      // ----------------------------------------------------------------
      if (blow === 0) {
        const stomp = window4(t, T.stomp, 0.03, 0.1, 0.24);
        if (stomp > 0) {
          const r = (0.22 + 0.4 * easeOut(ramp(t, T.stomp, 0.24))) * ctx.projection.groundScale;
          out.push({
            layer: 'ground',
            depth: depthOf(ctx.wl(0.2, 0, 0)) - 1,
            shape: ellipse(ctx.p(ctx.wl(0.2, 0, 0.1)), r, r * ctx.projection.groundRatio * 1.35),
            paint: { color: fade(pal.glow, stomp * 0.4), dither: { level: 0.4, matrix: 4 } },
            material: 'soft',
      tag: 'dust',
          });
        }
      }

      if (t < tearAt || residue <= 0) continue;

      // ----------------------------------------------------------------
      // Le creux laissé par l'arrachement. Il reste jusqu'à la fin : la
      // terre garde la trace d'où la masse est sortie.
      // ----------------------------------------------------------------
      // Le creux se lit comme une ombre dans la terre, pas comme un trou noir :
      // il se superpose à l'ombre portée du bloc, et deux décalques sombres
      // semi-transparents au même endroit additionnent leurs alphas.
      const holeAlpha = residue * clamp01(ramp(t, tearAt, tearAt + 0.06)) * 0.32;
      out.push(
        ...emitPlate(ctx, socket, BLOCK.right * 1.05, 9, blowSeed + 21, pal.ramp[5] ?? pal.rim, holeAlpha, 'socket', 0.34),
      );

      // ----------------------------------------------------------------
      // Trajectoire de la masse.
      //   arrachement  : sortie lourde et lente du sol vers le point haut
      //   suspension   : quasi immobile, une légère dérive seulement
      //   abattage     : arc accéléré vers la cible
      // ----------------------------------------------------------------
      const broken = t >= contactAt;
      let centre: Vec3;
      let pitch: number;

      if (t < apexAt) {
        // Lent au départ — la masse résiste —, puis elle se libère, puis elle
        // ralentit en haut. `easeOutHeavy` la faisait jaillir d'un coup, ce
        // qui est exactement la lecture inverse du poids.
        const k = easeInOut(clamp01(ramp(t, tearAt, apexAt)));
        centre = {
          x: socket.x + (apexPos.x - socket.x) * k,
          y: socket.y + (apexPos.y - socket.y) * k,
          z: -BLOCK.up * 1.2 + (APEX_UP + BLOCK.up * 1.2) * k,
        };
        // Il sort à plat et se redresse en montant.
        pitch = k * 0.85;
      } else if (t < swingAt) {
        // Suspension : une dérive de quelques centimètres, pas un arrêt net.
        const hang = clamp01(ramp(t, apexAt, swingAt));
        centre = add3(apexPos, { x: 0, y: 0, z: 0.14 * Math.sin(hang * Math.PI) });
        pitch = 0.85 + hang * 0.16;
      } else {
        const k = easeInHeavy(clamp01(ramp(t, swingAt, contactAt)));
        // Point de contrôle devant et au-dessus : l'arc passe par le haut
        // avant de plonger, au lieu de couper en ligne droite.
        const control = add3(
          add3(apexPos, scale3(ctx.frame.forward, (reach - 0.9) * 0.55)),
          { x: 0, y: 0, z: 0.75 },
        );
        centre = bezier(apexPos, control, impact, k);
        pitch = 1.01 + k * 1.15;
      }

      if (!broken) {
        const faces = rockLump(centre, BLOCK_R, 7, blowSeed + 3, BLOCK_SQUASH, 0.44);
        // Bascule autour de l'axe latéral : le bloc se redresse puis pique.
        const tilted = rotateFacesAbout(faces, centre, ctx.frame.side, pitch);
        // Tant qu'il n'a pas dégagé le sol, on ne peint que ce qui dépasse :
        // le décor du jeu ne peut pas occulter un bloc enterré.
        const lowest = Math.min(...tilted.flatMap((f) => f.pts.map((q) => q.z)));
        // Le bloc apparaît à mesure qu'il dégage le sol : entièrement enterré
        // il est invisible, entièrement sorti il est opaque.
        const buried = BLOCK.up * 1.6;
        const emerged = clamp01((lowest + buried) / buried) * residue;
        if (emerged > 0) {
          const groupDepth = depthOf(centre) + blow * 0.03;
          out.push(
            ...emitSolid(ctx, tilted, {
              palette: pal,
              style,
              alpha: emerged,
              // La masse est sombre : une pierre arrachée au sous-sol n'a pas
              // la valeur claire d'une dalle exposée au soleil.
              bias: 0.14,
              tag: 'block',
              groupDepth,
            }),
          );
          // Strates construites sur le bloc non basculé, donc horizontales à
          // l'origine, puis tournées avec lui.
          // Seules les strates : les éclats plaqués sur les grandes faces se
          // lisaient comme des trous percés dans la pierre.
          const detail: Face[] = [];
          for (const f of faces) {
            if (Math.abs(f.normal.z) <= 0.55) detail.push(...stratify(f, [0.34, 0.68], 0.07));
          }
          out.push(
            ...emitSolid(ctx, rotateFacesAbout(detail, centre, ctx.frame.side, pitch), {
              palette: pal,
              style,
              alpha: emerged,
              tag: 'strata',
              groupDepth: groupDepth + 0.008,
            }),
          );
          // Ombre au sol : elle suit la position au sol, pas la hauteur.
          out.push(...groundShadow(ctx, centre, 0.72, 0.2 * emerged));
        }

        // Gravats arrachés avec le bloc, qui retombent pendant la montée.
        out.push(
          ...emitDebris(ctx, {
            seed: blowSeed + 71,
            count: 14,
            clipTime: t - tearAt,
            startedAt: tearAt,
            origin: () => add3(socket, { x: 0, y: 0, z: 0.1 }),
            axis: () => ({ x: 0, y: 0, z: 1 }),
            spread: 1.1,
            speed: [1.2, 3],
            gravity: 8,
            launch: (i) => randRange(blowSeed, i, 502, 0, 0.12),
            life: [0.3, 0.55],
            size: [1.3, 2.8],
            kind: 'block',
            palette: pal,
            style,
            alpha: residue,
            tag: 'gravel',
          }),
        );
        continue;
      }

      // ----------------------------------------------------------------
      // Fracas.
      // ----------------------------------------------------------------
      const age = t - contactAt;
      const shardAlpha = residue * (1 - ramp(t, T.settle, 0.92));
      const fall = norm3(scale3(ctx.frame.forward, 1));

      if (shardAlpha > 0) {
        const chunks = shatterVolume(
          impact,
          scale3(ctx.frame.side, BLOCK.right),
          scale3(ctx.frame.forward, BLOCK.forward),
          { x: 0, y: 0, z: BLOCK.up },
          3,
          2,
          2,
          blowSeed + 3,
          0.16,
        );
        chunks.forEach((chunk, j) => {
          // Éjection vers l'extérieur et vers l'avant : la masse arrivait du
          // haut et de l'arrière, les morceaux repartent dans sa continuité.
          const dir = norm3(
            add3(
              scale3(ctx.frame.side, chunk.offset.x * 1.1),
              add3(scale3(fall, 0.35 + chunk.offset.y * 0.7), {
                x: 0,
                y: 0,
                z: 0.55 + chunk.offset.z * 0.35,
              }),
            ),
          );
          const speed = randRange(blowSeed, j, 503, 1.4, 3.1);
          const off = add3(scale3(dir, speed * age), { x: 0, y: 0, z: -8.5 * age * age });
          let moved = moveFaces(chunk.faces, off);
          const c = add3(chunk.centre, off);
          moved = rotateFacesAbout(
            moved,
            c,
            norm3({ x: chunk.offset.z, y: chunk.offset.x, z: 0.4 }),
            age * randRange(blowSeed, j, 504, 2.5, 7),
          );
          const lowest = Math.min(...moved.flatMap((f) => f.pts.map((q) => q.z)));
          if (lowest < 0.02) moved = moveFaces(moved, { x: 0, y: 0, z: 0.02 - lowest });
          out.push(
            ...emitSolid(ctx, moved, {
              palette: pal,
              style,
              alpha: shardAlpha,
              tag: 'shard',
              groupDepth: depthOf(c) + j * 0.02,
            }),
          );
        });
      }

      // Cratère et fractures rayonnantes.
      const craterAlpha = residue * residueAlpha(t, T.settle, 0.99, 0.9);
      if (craterAlpha > 0) {
        const progress = easeOut(clamp01(age / 0.14));
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 + 0.4;
          const end = add3(impact, {
            x: Math.cos(a) * (1.5 + randRange(blowSeed, i, 505, 0, 0.9)),
            y: Math.sin(a) * (1.5 + randRange(blowSeed, i, 506, 0, 0.9)),
            z: 0,
          });
          const path = crackPath({ ...impact, z: 0 }, end, 5, blowSeed + i * 311, 0.26);
          out.push(...emitCrack(ctx, path, 3, pal.rim, craterAlpha, progress));
          if (i % 2 === 0) {
            for (const b of crackBranches(path, blowSeed + i * 71, 1, 0.6)) {
              out.push(...emitCrack(ctx, b, 1.6, pal.rim, craterAlpha * 0.7, progress));
            }
          }
        }
      }

      // Gravats du choc.
      out.push(
        ...emitDebris(ctx, {
          seed: blowSeed + 91,
          count: 26,
          clipTime: age,
          startedAt: contactAt,
          origin: () => impact,
          axis: () => ({ x: 0, y: 0, z: 1 }),
          spread: 1.25,
          speed: [1.6, 3.8],
          gravity: 9.5,
          launch: (i) => randRange(blowSeed, i, 507, 0, 0.04),
          life: [0.25, 0.5],
          size: [1.2, 2.8],
          kind: 'block',
          palette: pal,
          style,
          alpha: residue,
          tag: 'gravel',
        }),
      );

      // Onde de poussière : basse et large, poussée vers l'avant. Pas un
      // anneau vertical centré sur le point d'impact.
      const puffEnd = Math.min(CLIP_OUT, contactAt + 0.36);
      const puff = window4(t, contactAt, contactAt + 0.04, contactAt + 0.14, puffEnd);
      if (puff > 0) {
        const spread = 0.6 + 1.6 * easeOut(clamp01(age / 0.34));
        for (let i = 0; i < 3; i++) {
          const along = i - 1;
          const p = add3(
            add3(impact, scale3(fall, along * spread * 0.75 + spread * 0.25)),
            { x: 0, y: 0, z: 0.16 + 0.12 * spread },
          );
          const r = spread * (0.85 - Math.abs(along) * 0.25) * ctx.projection.groundScale;
          out.push({
            layer: 'main',
            depth: depthOf(p) + 0.2,
            shape: ellipse(ctx.p(p), r, r * 0.4),
            paint: {
              color: fade(pal.ramp[2] ?? pal.glow, puff * 0.3 * residue),
              dither: { level: 0.34, matrix: 4, phaseX: i * 3, phaseY: i },
            },
            material: 'soft',
      tag: 'dust',
          });
        }
      }
    }

    return out;
  },
};
