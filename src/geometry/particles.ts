/**
 * Particules.
 *
 * Trois règles, prises dans la pratique des FX de jeu et adaptées au pixel art :
 *
 *  1. **Déterministe.** Une particule tire tout de `(seed, identifiant, index)`.
 *     Rien n'est renouvelé d'une image à l'autre : c'est ce qui distingue un
 *     semis animé d'un bruit qui grésille.
 *  2. **Analytique.** La position vient d'une formule fermée, pas d'une
 *     accumulation : naviguer directement à l'image 9 donne exactement le même
 *     résultat qu'une lecture depuis le début.
 *  3. **Épaisse.** Une particule est un **amas** d'au moins quatre pixels, pas
 *     un point isolé. Un pixel seul à cette échelle disparaît à la lecture et
 *     grésille en mouvement ; les accents d'un pixel restent l'exception.
 *
 * L'émission se fait dans le **monde** et s'oriente sur le cap : c'est ce qui
 * rend les huit directions réellement différentes, au lieu d'un même nuage
 * recollé sur chaque cap.
 */

import { add3, clamp01, norm3, scale3, type Vec2, type Vec3 } from '../core/math.js';
import { randN } from '../core/rng.js';
import type { IndexedCanvas } from '../pixels/canvas.js';
import { ShapeMask } from '../pixels/mask.js';
import { getMaterial, rampRole, type MaterialId, type RoleId } from '../pixels/palette.js';
import { paintRole } from '../pixels/shade.js';
import type { FrameContext } from '../renderer/context.js';
import type { Piece } from '../renderer/piece.js';

function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type EmitterOptions = {
  readonly id: string;
  /** Position d'émission, en monde. Une fonction permet d'émettre le long d'un mouvement. */
  readonly at: Vec3 | ((birth: number) => Vec3);
  readonly count: number;
  /** Fenêtre de naissance, en progression [0,1]. Toutes nées ensemble par défaut. */
  readonly birth?: readonly [number, number];
  /** Durée de vie, en progression. */
  readonly life: number;
  /** Vitesse initiale, en tuiles par unité de progression. */
  readonly speed: readonly [number, number];
  /** Direction moyenne, en monde. Par défaut vers le haut. */
  readonly dir?: Vec3;
  /** Demi-ouverture du cône, en radians. π = toutes directions. */
  readonly spread?: number;
  /** Gravité, en tuiles par unité de progression au carré. */
  readonly gravity?: number;
  /** Freinage. 0 = aucun ; 3 = la particule s'arrête vite. */
  readonly drag?: number;
  /** Rotation autour de l'axe vertical, en radians par unité de progression. */
  readonly swirl?: number;
  /** Les particules s'arrêtent au sol au lieu de passer dessous. */
  readonly floor?: boolean;
};

export type Particle = {
  readonly id: string;
  readonly index: number;
  readonly position: Vec3;
  readonly velocity: Vec3;
  /** Âge normalisé sur [0,1]. 0 = naissance, 1 = fin de vie. */
  readonly age: number;
  /** Valeur stable propre à la particule, pour varier taille et rôle. */
  readonly variation: number;
};

/**
 * Particules vivantes à la progression `t`. Une particule non encore née ou
 * déjà morte n'est simplement pas renvoyée : l'extinction est une disparition
 * dessinée, pas une rampe d'alpha.
 */
export function emitParticles(ctx: FrameContext, o: EmitterOptions, t: number): Particle[] {
  const seed = ctx.seed ^ hashId(o.id);
  const [birthStart, birthEnd] = o.birth ?? [0, 0];
  const dir = norm3(o.dir ?? { x: 0, y: 0, z: 1 });
  const spread = o.spread ?? 0.6;
  const gravity = o.gravity ?? 0;
  const drag = o.drag ?? 0;
  const swirl = o.swirl ?? 0;
  const out: Particle[] = [];

  // Base orthonormée du cône. Elle suit la direction demandée, donc le cap.
  const ref: Vec3 = Math.abs(dir.z) > 0.92 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
  const side = norm3({
    x: dir.y * ref.z - dir.z * ref.y,
    y: dir.z * ref.x - dir.x * ref.z,
    z: dir.x * ref.y - dir.y * ref.x,
  });
  const up = norm3({
    x: dir.y * side.z - dir.z * side.y,
    y: dir.z * side.x - dir.x * side.z,
    z: dir.x * side.y - dir.y * side.x,
  });

  for (let i = 0; i < o.count; i++) {
    const birth = birthEnd > birthStart
      ? birthStart + (birthEnd - birthStart) * ((i + 0.5) / o.count)
      : birthStart;
    const life = o.life * (0.7 + 0.6 * randN(seed, i, 7));
    const tau = t - birth;
    if (tau < 0 || tau > life) continue;

    const angle = randN(seed, i, 1) * Math.PI * 2;
    // Racine carrée : sans elle, les particules se massent au centre du cône.
    const cone = spread * Math.sqrt(randN(seed, i, 2));
    const speed = o.speed[0] + (o.speed[1] - o.speed[0]) * randN(seed, i, 3);
    const v0: Vec3 = scale3(
      norm3(
        add3(
          scale3(dir, Math.cos(cone)),
          add3(
            scale3(side, Math.sin(cone) * Math.cos(angle)),
            scale3(up, Math.sin(cone) * Math.sin(angle)),
          ),
        ),
      ),
      speed,
    );

    // Intégrale fermée d'un freinage linéaire : la particule ralentit sans
    // qu'aucun état ne soit accumulé d'une image à l'autre.
    const travel = drag > 0 ? (1 - Math.exp(-drag * tau)) / drag : tau;
    const origin = typeof o.at === 'function' ? o.at(birth) : o.at;
    let position = add3(origin, scale3(v0, travel));
    position = { x: position.x, y: position.y, z: position.z - 0.5 * gravity * tau * tau };

    if (swirl !== 0) {
      const a = swirl * tau;
      const dx = position.x - origin.x;
      const dy = position.y - origin.y;
      position = {
        x: origin.x + dx * Math.cos(a) - dy * Math.sin(a),
        y: origin.y + dx * Math.sin(a) + dy * Math.cos(a),
        z: position.z,
      };
    }
    if (o.floor && position.z < 0.02) position = { ...position, z: 0.02 };

    out.push({
      id: `${o.id}#${i}`,
      index: i,
      position,
      velocity: scale3(v0, drag > 0 ? Math.exp(-drag * tau) : 1),
      age: clamp01(tau / life),
      variation: randN(seed, i, 9),
    });
  }
  return out;
}

export type ClusterShape = 'diamond' | 'puff';

/**
 * Amas de pixels contigus. Jamais un point isolé : `radius` 1 donne déjà 5 px.
 *
 * Deux formes, et le choix compte : le losange lit comme une braise ou un
 * éclat — net, minéral ; la bouffée a un bord irrégulier et arrondi, seule
 * forme acceptable pour de la fumée ou de la brume. Un gros losange gris se
 * lit comme un carreau, pas comme un nuage.
 */
export function clusterMask(
  ctx: FrameContext,
  centre: Vec2,
  radius: number,
  o: { shape?: ClusterShape; seed?: number } = {},
): ShapeMask {
  const r = Math.max(0, Math.round(radius));
  const cx = Math.round(centre.x);
  const cy = Math.round(centre.y);
  const mask = ShapeMask.forRect(cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1, ctx.width, ctx.height);
  if (r <= 0) {
    // Le plus petit amas reste un carré de deux pixels de côté.
    mask.set(cx, cy);
    mask.set(cx + 1, cy);
    mask.set(cx, cy + 1);
    mask.set(cx + 1, cy + 1);
    return mask;
  }
  const puff = o.shape === 'puff';
  const seed = o.seed ?? 0;
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (puff) {
        // Bord arrondi, puis rogné par une bosse stable : un contour de
        // fumée n'est ni un cercle ni un carré.
        const d = Math.hypot(x, y * 1.15);
        const bump = 0.22 * (randN(seed, x + 32, y + 32) - 0.5) * 2;
        if (d <= r * (1 + bump)) mask.set(cx + x, cy + y);
      } else if (Math.abs(x) + Math.abs(y) <= r) {
        mask.set(cx + x, cy + y);
      }
    }
  }
  return mask;
}

/** Traînée courte le long de la vitesse : une étincelle qui file, pas un point. */
export function streakMask(
  ctx: FrameContext,
  from: Vec2,
  to: Vec2,
  width: number,
): ShapeMask {
  const mask = ctx.mask([from, to], Math.ceil(width) + 1);
  mask.addSegment(from, to, Math.max(1, width));
  return mask;
}

export type ParticlePaint = {
  readonly material: MaterialId;
  /** Rayon en pixels au début et à la fin de vie. */
  readonly size: readonly [number, number];
  /** Rôles parcourus du début à la fin de vie. */
  readonly roles?: readonly RoleId[];
  /** Longueur de la traînée, en fraction de la vitesse. 0 = amas seul. */
  readonly streak?: number;
  /** Décalage de profondeur, pour passer devant ou derrière la masse. */
  readonly depthBias?: number;
  /** Tramage de l'amas : utile pour la fumée et la brume. */
  readonly dither?: number;
  /** Forme de l'amas. `puff` pour tout ce qui est gazeux. */
  readonly shape?: ClusterShape;
};

/** Un objet par particule : le tri de profondeur reste juste. */
export function particlePieces(
  ctx: FrameContext,
  particles: readonly Particle[],
  paint: ParticlePaint,
): Piece[] {
  const material = getMaterial(paint.material);
  return particles.map((p) => {
    const screen = ctx.p(p.position);
    const size = paint.size[0] + (paint.size[1] - paint.size[0]) * p.age;
    // Plancher à un pixel de rayon : un amas fait alors au moins cinq pixels,
    // et survit à un recouvrement partiel sans tomber à un point isolé.
    const radius = Math.max(paint.streak ? 0 : 1, Math.round(size * (0.75 + 0.5 * p.variation)));
    const roles = paint.roles;
    const role: RoleId = roles && roles.length > 0
      ? (roles[Math.min(roles.length - 1, Math.floor(p.age * roles.length))] as RoleId)
      : rampRole(material, 1 - p.age);
    const streak = paint.streak ?? 0;
    return {
      id: p.id,
      depth: ctx.depth(p.position) + (paint.depthBias ?? 0),
      paint: (canvas: IndexedCanvas) => {
        if (streak > 0) {
          let back = ctx.p(add3(p.position, scale3(p.velocity, -streak)));
          // Une traînée doit rester une **forme** : trop courte, elle tombe à
          // un pixel isolé, qui grésille et disparaît à la lecture.
          const dx = back.x - screen.x;
          const dy = back.y - screen.y;
          const length = Math.hypot(dx, dy);
          if (length < 3.2) {
            const k = length < 1e-3 ? 0 : 3.2 / length;
            back = length < 1e-3
              ? { x: screen.x - 3, y: screen.y - 1 }
              : { x: screen.x + dx * k, y: screen.y + dy * k };
          }
          paintRole(
            canvas,
            streakMask(ctx, screen, back, Math.max(1, radius)),
            material,
            role,
            paint.dither !== undefined ? { level: paint.dither, matrix: 4 } : undefined,
          );
          return;
        }
        const mask = clusterMask(ctx, screen, radius, {
          ...(paint.shape ? { shape: paint.shape } : {}),
          seed: ctx.seed ^ p.index,
        });
        if (paint.dither !== undefined) {
          // Cœur plein, bord tramé — et le bord tramé ne se pose que sur du
          // vide. Sans cela, une bouffée perfore ce qu'elle recouvre : on
          // retrouve un pixel sur deux de la matière du dessous, c'est-à-dire
          // exactement la poussière que le style refuse.
          paintRole(canvas, mask, material, role, { level: paint.dither, matrix: 4 }, true);
          if (radius >= 2) paintRole(canvas, mask.erode(1), material, role);
          return;
        }
        paintRole(canvas, mask, material, role);
      },
    };
  });
}

/** Émission et peinture en un geste. */
export function particleField(
  ctx: FrameContext,
  t: number,
  emitter: EmitterOptions,
  paint: ParticlePaint,
): Piece[] {
  return particlePieces(ctx, emitParticles(ctx, emitter, t), paint);
}
