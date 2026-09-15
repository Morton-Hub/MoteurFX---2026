/**
 * ELECTRICITE — « Arc de Rupture »
 *
 * Concept : l'electricite ne coule pas, elle rate. Le sort est une suite de
 * décharges franches séparées par du noir. Chaque décharge calcule son reseau
 * une seule fois, a partir de sa propre seed, et le garde identique pendant
 * tout son maintien : c'est ce qui permet de lire la forme au lieu d'un
 * grouillement. Entre deux décharges il ne reste qu'un fantome d'ionisation
 * sur le trace précédent, qui s'éteint pendant que le suivant frappe ailleurs.
 *
 * Le reseau accepte une liste de points d'ancrage quelconque. Ici : la main
 * du lanceur, la cible, et trois relais au sol au moment du pic. Rien n'est
 * suppose d'un système de combat.
 *
 * Signature de forme : polylignes brisees, ramification decroissante, rythme
 * stroboscopique. Aucune courbe lisse, aucun ruban continu.
 */

import { type Vec3, add3, clamp01, ramp, window4 } from '../core/math.js';
import { deriveSeed, randRange } from '../core/rng.js';
import { depthOf } from '../space/projection.js';
import { type DrawCmd, poly } from '../render/draw.js';
import { fade, type RGBA } from '../raster/framebuffer.js';
import { rampAt } from '../style/palette.js';
import { dischargeNetwork, pathPrefix, type DischargeSegment } from '../grammar/discharge.js';
import { emitDebris } from '../grammar/motion.js';
import { emitPlate, residueAlpha } from '../grammar/ground.js';
import type { SpellContext, SpellRecipe } from '../sim/types.js';

const DURATION = 1.15;

/**
 * Une décharge = un instant d'allumage, une durée de maintien, une seed de
 * géométrie. L'extinction est plus rapide que l'allumage : c'est ce
 * desequilibre qui fait « claquer » plutot que « pulser ».
 */
type Strike = {
  readonly at: number;
  readonly hold: number;
  readonly fade: number;
  readonly seed: number;
  readonly width: number;
  readonly branches: number;
  readonly amplitude: number;
  readonly relays: boolean;
};

const STRIKES: readonly Strike[] = [
  { at: 0.13, hold: 0.055, fade: 0.035, seed: 1, width: 3.2, branches: 5, amplitude: 0.4, relays: false },
  { at: 0.25, hold: 0.04, fade: 0.03, seed: 2, width: 2.4, branches: 7, amplitude: 0.58, relays: false },
  { at: 0.36, hold: 0.075, fade: 0.05, seed: 3, width: 4.2, branches: 6, amplitude: 0.3, relays: true },
  { at: 0.5, hold: 0.028, fade: 0.025, seed: 4, width: 2, branches: 3, amplitude: 0.62, relays: false },
  { at: 0.6, hold: 0.025, fade: 0.03, seed: 5, width: 1.6, branches: 2, amplitude: 0.72, relays: false },
];

/** Intensite d'une décharge : 1 pendant le maintien, chute nette ensuite. */
function strikeLevel(t: number, s: Strike): number {
  if (t < s.at) return 0;
  if (t <= s.at + s.hold) return 1;
  return 1 - ramp(t, s.at + s.hold, s.at + s.hold + s.fade);
}

/** Fantome d'ionisation : le trace reste faiblement visible après extinction. */
function ghostLevel(t: number, s: Strike): number {
  const start = s.at + s.hold + s.fade;
  // Un fantome ne precede jamais la decharge qui l'a laisse.
  if (t < start) return 0;
  return 0.26 * (1 - ramp(t, start, start + 0.16));
}

function emitSegments(
  ctx: SpellContext,
  segs: readonly DischargeSegment[],
  level: number,
  width: number,
  progress: number,
  tag: string,
): DrawCmd[] {
  const out: DrawCmd[] = [];
  const pal = ctx.palette;
  for (const seg of segs) {
    const pts3 = pathPrefix(seg.pts, progress);
    if (pts3.length < 2) continue;
    const pts = pts3.map((p) => ctx.p(p));
    const mid = pts3[Math.floor(pts3.length / 2)]!;
    const depth = depthOf(mid);
    const w = Math.max(1, width * (seg.rank === 0 ? 1 : seg.rank === 1 ? 0.45 : 0.28));
    const dim = seg.rank === 0 ? 1 : seg.rank === 1 ? 0.72 : 0.5;

    if (ctx.style.glow && w > 1.5) {
      out.push({
        layer: 'light',
        depth,
        shape: { t: 'line', pts, width: w + 3 },
        paint: { color: fade(pal.glow, 0.32 * level * dim), dither: { level: 0.7 } },
        tag: 'glow',
      });
    }
    // Enveloppe : la couleur froide de la décharge.
    out.push({
      layer: 'main',
      depth,
      shape: { t: 'line', pts, width: w },
      paint: { color: fade(rampAt(pal, seg.rank === 0 ? 0.35 : 0.5), level * dim) },
      tag,
    });
    // Ame : un pixel blanc au centre, seulement sur le tronc et les branches.
    if (w >= 2) {
      out.push({
        layer: 'main',
        depth: depth + 0.5,
        shape: { t: 'line', pts, width: Math.max(1, w - 2) },
        paint: { color: fade(seg.rank === 0 ? pal.core : pal.accent, level * dim) },
        tag,
      });
    }
  }
  return out;
}

/** Etoile anguleuse a quatre branches : le flash d'extremite. */
function starShape(cx: number, cy: number, big: number, small: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = i % 2 === 0 ? big : small;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.85 });
  }
  return pts;
}

export const lightningRuptureArc: SpellRecipe = {
  id: 'lightning-rupture-arc',
  element: 'lightning',
  title: 'Arc de Rupture',
  concept:
    "Cinq décharges successives, chacune de géométrie figée pendant son maintien, séparées par du noir et reliées par un fantôme d'ionisation. Le pic relaie la cible vers trois ancres au sol.",
  signature: [
    'Polylignes brisées, jamais de courbe lisse',
    'Géométrie figée pendant chaque décharge, renouvelée entre elles',
    'Rythme stroboscopique : maintien bref, extinction plus brève encore',
    'Ramification à largeur décroissante et relais multi-ancres',
  ],
  role: 'oneshot',
  duration: DURATION,
  fps: 30,
  canvas: { width: 304, height: 168 },
  pivot: { x: 161, y: 88 },
  defaultRange: 3.3,
  defaultPower: 0.5,
  radial: false,
  loop: 'none',
  events: [
    { id: 'cast', at: 0.0, note: 'Charge : crépitements à la main' },
    { id: 'release', at: STRIKES[0]!.at, note: 'Première décharge' },
    { id: 'peak', at: STRIKES[2]!.at, note: 'Décharge majeure, relais au sol' },
    { id: 'settled', at: 0.82, note: 'Dernière reprise éteinte' },
  ],

  sample(t, ctx) {
    const out: DrawCmd[] = [];
    const pal = ctx.palette;
    const style = ctx.style;
    const seed = deriveSeed(ctx.seed, 'lightning-rupture-arc');

    // Le rang densifie le reseau et ouvre des relais supplementaires : la
    // decharge se ramifie davantage au lieu d'etre simplement plus grosse.
    const extraBranches = Math.round(ctx.power * 4);
    const relayCount = 2 + Math.round(ctx.power * 3);

    const hand: Vec3 = ctx.wl(0.28, 0, 0.72);
    const hit: Vec3 = ctx.wl(ctx.distance, 0, 0.22);

    // ------------------------------------------------------------------
    // Charge : quatre crepitements courts autour de la main, chacun avec
    // sa propre seed. Ils annoncent le rythme sans le devoiler.
    // ------------------------------------------------------------------
    for (let i = 0; i < 4; i++) {
      const at = i * 0.028;
      const lvl = window4(t, at, at + 0.008, at + 0.016, at + 0.03);
      if (lvl <= 0) continue;
      const tip = add3(hand, {
        x: randRange(seed, i, 101, -0.45, 0.45),
        y: randRange(seed, i, 102, -0.45, 0.45),
        z: randRange(seed, i, 103, -0.3, 0.45),
      });
      const net = dischargeNetwork([hand, tip], {
        seed: seed + i * 613,
        levels: 3,
        amplitude: 0.1,
        branchCount: 1,
        branchLength: 0.3,
        branchDepth: 1,
      });
      out.push(...emitSegments(ctx, net, lvl * 0.9, 1.6, 1, 'crackle'));
    }

    // Pre-ionisation : un trace très faible indique la cible avant la frappe.
    const pre = window4(t, 0.06, 0.09, STRIKES[0]!.at - 0.01, STRIKES[0]!.at);
    if (pre > 0) {
      const net = dischargeNetwork([hand, hit], {
        seed: seed + 97,
        levels: 4,
        amplitude: 0.3,
        branchCount: 0,
        branchLength: 0,
        branchDepth: 0,
      });
      out.push(...emitSegments(ctx, net, pre * 0.22, 1.4, 1, 'preion'));
    }

    // ------------------------------------------------------------------
    // Les décharges.
    // ------------------------------------------------------------------
    for (const s of STRIKES) {
      const level = strikeLevel(t, s);
      const ghost = ghostLevel(t, s);
      if (level <= 0 && ghost <= 0) continue;

      // Ancres. Au pic, la cible relaie vers trois points au sol : la même
      // fonction de reseau sert donc a l'arc simple et à la chaine.
      const anchors: Vec3[] = [hand, hit];
      const relays: Vec3[] = [];
      if (s.relays) {
        for (let r = 0; r < relayCount; r++) {
          const a = randRange(seed, r, 104, 0, Math.PI * 2);
          const d = randRange(seed, r, 105, 0.9, 1.7);
          relays.push(add3(hit, { x: Math.cos(a) * d, y: Math.sin(a) * d, z: 0.05 }));
        }
      }

      const net = dischargeNetwork(anchors, {
        seed: seed + s.seed * 1301,
        levels: 5,
        amplitude: s.amplitude,
        branchCount: s.branches + extraBranches,
        branchLength: 0.42,
        branchDepth: 2,
      });

      // Progression du front : la décharge se propage en deux images, puis
      // le trace est complet et ne bouge plus jusqu'a l'extinction.
      const progress = clamp01(ramp(t, s.at, s.at + 0.022));

      if (level > 0) out.push(...emitSegments(ctx, net, level, s.width, progress, 'arc'));
      if (ghost > 0 && level <= 0) {
        out.push(...emitSegments(ctx, net, ghost, 1.2, 1, 'ghost'));
      }

      if (s.relays && level > 0) {
        for (let r = 0; r < relays.length; r++) {
          const relayNet = dischargeNetwork([hit, relays[r]!], {
            seed: seed + s.seed * 1301 + r * 211,
            levels: 4,
            amplitude: 0.26,
            branchCount: 2,
            branchLength: 0.3,
            branchDepth: 1,
          });
          const relayProgress = clamp01(ramp(t, s.at + 0.012, s.at + 0.04));
          out.push(...emitSegments(ctx, relayNet, level * 0.85, s.width * 0.55, relayProgress, 'relay'));
        }
      }

      // Flash aux extremites : anguleux, très bref, cale sur le maintien.
      if (level > 0.35) {
        const k = (level - 0.35) / 0.65;
        for (const [pos, size] of [
          [hand, 5 + 4 * k],
          [hit, 7 + 7 * k * (s.width / 3)],
        ] as const) {
          const c = ctx.p(pos);
          out.push({
            layer: 'main',
            depth: depthOf(pos) + 10,
            shape: poly(starShape(c.x, c.y, size, size * 0.22)),
            paint: { color: fade(pal.core, k) },
            tag: 'flash',
          });
          if (style.glow) {
            out.push({
              layer: 'light',
              depth: depthOf(pos) + 11,
              shape: { t: 'disc', c, r: size * 0.9 },
              paint: { color: fade(pal.glow, 0.45 * k), dither: { level: 0.55 } },
              tag: 'glow',
            });
          }
        }
      }
    }

    // ------------------------------------------------------------------
    // Sol à la cible : brulure, puis gerbe d'etincelles rasantes.
    // ------------------------------------------------------------------
    const firstHit = STRIKES[0]!.at;
    if (t >= firstHit) {
      const scorch = residueAlpha(t, 0.7, 0.96, 0.34) * ramp(t, firstHit, firstHit + 0.05);
      out.push(
        ...emitPlate(
          ctx,
          { x: hit.x, y: hit.y, z: 0 },
          0.95,
          10,
          seed + 51,
          pal.rim,
          scorch,
          'decal',
          0.4,
        ),
      );
      const ringColor: RGBA = pal.ground;
      out.push(
        ...emitPlate(
          ctx,
          { x: hit.x, y: hit.y, z: 0 },
          0.5,
          8,
          seed + 52,
          ringColor,
          scorch * 0.5,
          'decal',
          0.45,
        ),
      );
    }

    for (const s of STRIKES) {
      if (t < s.at) continue;
      const age = t - s.at;
      out.push(
        ...emitDebris(ctx, {
          seed: seed + s.seed * 733,
          count: s.relays ? 26 : 12,
          clipTime: age,
          startedAt: s.at,
          origin: () => hit,
          axis: () => ({ x: 0, y: 0, z: 1 }),
          // Gerbe large et rasante : l'electricite balaie le sol.
          spread: 1.35,
          speed: [1.6, 4.4],
          gravity: 9,
          launch: (i) => randRange(seed + s.seed, i, 106, 0, 0.02),
          life: [0.08, 0.26],
          size: [1, 2.2],
          kind: 'spark',
          palette: pal,
          style,
          tag: 'spark',
        }),
      );
    }

    return out;
  },
};
