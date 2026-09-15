/**
 * Mouvement analytique. Toute particule est une fonction fermee de son
 * index et du temps : aucune integration, donc le scrubbing est exact et
 * l'ordre d'evaluation n'a aucune influence.
 */

import { type Vec3, add3, clamp01, norm3, ramp, scale3 } from '../core/math.js';
import { randN, randRange } from '../core/rng.js';
import { cross3 } from '../core/math.js';
import { depthOf } from '../space/projection.js';
import type { DrawCmd } from '../render/draw.js';
import { disc, ellipse, poly } from '../render/draw.js';
import { fade, type Dither, type RGBA } from '../raster/framebuffer.js';
import { rampAt, type Palette } from '../style/palette.js';
import type { StyleProfile } from '../style/styleProfile.js';
import type { SpellContext } from '../sim/types.js';

/** Position d'un mobile balistique. Gravite artistique, pas physique reelle. */
export function ballisticAt(origin: Vec3, velocity: Vec3, gravity: number, t: number): Vec3 {
  return {
    x: origin.x + velocity.x * t,
    y: origin.y + velocity.y * t,
    z: origin.z + velocity.z * t - 0.5 * gravity * t * t,
  };
}

export function ballisticVelocity(velocity: Vec3, gravity: number, t: number): Vec3 {
  return { x: velocity.x, y: velocity.y, z: velocity.z - gravity * t };
}

/**
 * Direction tiree dans un cone oriente. Le cone suit l'axe fourni : les
 * debris et les jets ne partent jamais dans une direction indépendante du cap.
 */
export function coneDirection(axis: Vec3, spread: number, u: number, v: number): Vec3 {
  const w = norm3(axis);
  const helper: Vec3 = Math.abs(w.z) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
  const a = norm3(cross3(helper, w));
  const b = cross3(w, a);
  const theta = u * Math.PI * 2;
  const cosMax = Math.cos(spread);
  const cosPhi = 1 - v * (1 - cosMax);
  const sinPhi = Math.sqrt(Math.max(0, 1 - cosPhi * cosPhi));
  return norm3(
    add3(
      scale3(w, cosPhi),
      add3(scale3(a, Math.cos(theta) * sinPhi), scale3(b, Math.sin(theta) * sinPhi)),
    ),
  );
}

export type DebrisKind = 'shard' | 'block' | 'drop' | 'spark' | 'ember';

/**
 * Unite de temps des systemes de debris : le temps normalise du clip, dans
 * [0,1]. Les vitesses s'expriment donc en tuiles par clip et la gravite en
 * tuiles par clip au carre. C'est une gravite artistique, pas une simulation
 * physique : ce qui compte est que la meme recette relue a une autre cadence
 * donne exactement la meme trajectoire, ce qu'un temps en secondes couple a
 * une duree de clip variable ne garantirait pas.
 *
 * Consequence directe, verifiee par les tests : `launch + life` doit rester
 * sous 1 pour qu'aucun grain ne survive a la derniere image.
 */
export type DebrisOptions = {
  readonly seed: number;
  readonly count: number;
  /** Instant courant, en fraction du clip, relatif a `startedAt`. */
  readonly clipTime: number;
  /**
   * Position absolue de l'origine du systeme dans le clip. Elle permet a
   * l'emetteur de garantir lui-meme qu'aucun grain ne survit a la derniere
   * image, au lieu de laisser chaque recette recalculer ce budget a la main.
   */
  readonly startedAt: number;
  /** Position de depart d'un grain. */
  readonly origin: (i: number) => Vec3;
  /** Axe du cone d'emission, en monde. */
  readonly axis: (i: number) => Vec3;
  /** Demi-angle du cone, en radians. */
  readonly spread: number;
  readonly speed: readonly [number, number];
  readonly gravity: number;
  /** Instant d'éjection de chaque grain, en secondes. */
  readonly launch: (i: number) => number;
  readonly life: readonly [number, number];
  readonly size: readonly [number, number];
  readonly kind: DebrisKind;
  readonly palette: Palette;
  readonly style: StyleProfile;
  /** Hauteur du sol : les grains s'arretent en dessous. */
  readonly groundZ?: number;
  readonly alpha?: number;
  readonly dither?: Dither;
  readonly tag?: string;
  /** Position sur la rampe. 0 = clair, 1 = sombre. */
  readonly tone?: readonly [number, number];
  /** Fraction de clip a laquelle tout grain doit avoir disparu. */
  readonly endsBy?: number;
  /** Ombre portee de chaque grain. Couteux, réserve aux gros debris. */
  readonly shadows?: boolean;
};

/**
 * Debris projetés. Les éclats sont orientes a l'écran selon leur vitesse
 * projetée : a deux ou trois pixels, un vrai solide tournant ne serait pas
 * lisible, tandis que l'allongement selon la tangente l'est. Le scintillement
 * de facette est module par une phase de rotation propre au grain.
 */
export function emitDebris(ctx: SpellContext, o: DebrisOptions): DrawCmd[] {
  const out: DrawCmd[] = [];
  const groundZ = o.groundZ ?? 0;
  const alpha = o.alpha ?? 1;
  const [toneLo, toneHi] = o.tone ?? [0.1, 0.75];

  for (let i = 0; i < o.count; i++) {
    const t0 = o.launch(i);
    const age = o.clipTime - t0;
    if (age < 0) continue;
    // La duree de vie est rabotee pour que le grain s'eteigne avant la fin
    // du clip : un debris encore visible sur la derniere image empeche toute
    // mise en boucle et laisse un residu dans l'atlas.
    const budget = (o.endsBy ?? 0.97) - o.startedAt - t0;
    const life = Math.min(randRange(o.seed, i, 1, o.life[0], o.life[1]), budget);
    if (life <= 0 || age > life) continue;
    const k = clamp01(age / life);

    const speed = randRange(o.seed, i, 2, o.speed[0], o.speed[1]);
    const dir = coneDirection(o.axis(i), o.spread, randN(o.seed, i, 3), randN(o.seed, i, 4));
    const origin = o.origin(i);
    let pos = ballisticAt(origin, scale3(dir, speed), o.gravity, age);

    let grounded = false;
    if (pos.z < groundZ) {
      pos = { x: pos.x, y: pos.y, z: groundZ };
      grounded = true;
    }

    const vel = ballisticVelocity(scale3(dir, speed), o.gravity, age);
    const size = randRange(o.seed, i, 5, o.size[0], o.size[1]);
    const fadeOut = 1 - ramp(k, 0.7, 1);
    const tone = randRange(o.seed, i, 6, toneLo, toneHi);
    const spin = randRange(o.seed, i, 7, 0, Math.PI * 2) + age * randRange(o.seed, i, 8, 6, 22);

    const s = ctx.p(pos);
    const sv = ctx.p(add3(pos, scale3(vel, 0.03)));
    const dx = sv.x - s.x;
    const dy = sv.y - s.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const depth = depthOf(pos);

    let color: RGBA;
    let shape: DrawCmd['shape'];

    switch (o.kind) {
      case 'shard': {
        // Eclat anguleux : pointe selon la tangente, facette scintillante.
        const facet = clamp01(tone + Math.sin(spin) * 0.22);
        color = rampAt(o.palette, facet);
        const w = size * 0.55;
        shape = poly([
          { x: s.x + ux * size, y: s.y + uy * size },
          { x: s.x - uy * w, y: s.y + ux * w },
          { x: s.x - ux * size * 0.7, y: s.y - uy * size * 0.7 },
          { x: s.x + uy * w, y: s.y - ux * w },
        ]);
        break;
      }
      case 'block': {
        const facet = clamp01(tone + Math.sin(spin) * 0.12);
        color = rampAt(o.palette, facet);
        const w = size;
        const h = size * 0.75;
        const c = Math.cos(spin * 0.35);
        const sn = Math.sin(spin * 0.35);
        shape = poly([
          { x: s.x + c * w, y: s.y + sn * w * 0.5 },
          { x: s.x - sn * h, y: s.y + c * h * 0.5 },
          { x: s.x - c * w, y: s.y - sn * w * 0.5 },
          { x: s.x + sn * h, y: s.y - c * h * 0.5 },
        ]);
        break;
      }
      case 'drop': {
        color = rampAt(o.palette, tone);
        if (grounded) {
          shape = ellipse(s, size * 1.4, size * 0.7);
        } else {
          // Goutte étirée selon la tangente reelle de la trajectoire.
          const stretch = Math.min(3, 1 + Math.hypot(vel.x, vel.y, vel.z) * 0.12);
          shape = poly([
            { x: s.x + ux * size * stretch, y: s.y + uy * size * stretch },
            { x: s.x - uy * size * 0.8, y: s.y + ux * size * 0.8 },
            { x: s.x - ux * size * 0.9, y: s.y - uy * size * 0.9 },
            { x: s.x + uy * size * 0.8, y: s.y - ux * size * 0.8 },
          ]);
        }
        break;
      }
      case 'spark': {
        color = i % 3 === 0 ? o.palette.accent : o.palette.core;
        const tail = size * (1.5 + Math.hypot(vel.x, vel.y, vel.z) * 0.06);
        shape = {
          t: 'line',
          pts: [
            { x: s.x - ux * tail, y: s.y - uy * tail },
            { x: s.x + ux * size * 0.4, y: s.y + uy * size * 0.4 },
          ],
          width: 1,
        };
        break;
      }
      case 'ember': {
        // Braise : elle refroidit en descendant la rampe avec l'age.
        color = rampAt(o.palette, clamp01(tone + k * 0.55));
        shape = disc(s, Math.max(0.5, size * (1 - k * 0.5)));
        break;
      }
    }

    if (o.shadows && !grounded && ctx.style.groundShadow) {
      const g = ctx.p({ x: pos.x, y: pos.y, z: groundZ });
      out.push({
        layer: 'ground',
        depth: depthOf({ x: pos.x, y: pos.y, z: groundZ }) - 1,
        shape: ellipse(g, size * 1.1, size * 0.55),
        paint: { color: fade(o.palette.shadow, alpha * fadeOut * 0.7) },
        tag: o.tag ? `${o.tag}-shadow` : 'shadow',
      });
    }

    out.push({
      layer: o.kind === 'spark' ? 'main' : 'main',
      depth,
      shape,
      paint: { color: fade(color, alpha * fadeOut), dither: o.dither },
      ...(o.tag ? { tag: o.tag } : {}),
    });
  }
  return out;
}

/** Ombre portee elliptique, projetée depuis la position au sol. */
export function groundShadow(
  ctx: SpellContext,
  world: Vec3,
  radius: number,
  alpha: number,
  tag = 'shadow',
): DrawCmd[] {
  if (!ctx.style.groundShadow || alpha <= 0 || radius <= 0) return [];
  const ground: Vec3 = { x: world.x, y: world.y, z: 0 };
  const c = ctx.p(ground);
  const rx = radius * ctx.projection.groundScale;
  return [
    {
      layer: 'ground',
      depth: depthOf(ground) - 2,
      shape: ellipse(c, rx, rx * ctx.projection.groundRatio),
      paint: { color: fade(ctx.palette.shadow, alpha) },
      tag,
    },
  ];
}
