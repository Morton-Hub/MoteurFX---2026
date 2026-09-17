/**
 * Masses de feu.
 *
 * Une flamme n'est pas un disque flou : c'est une **masse** d'où montent des
 * langues qui s'étirent et se crochent. Tout est construit dans le plan face
 * caméra, en coordonnées (u, v) exprimées en unités monde, puis projeté une
 * seule fois. Les largeurs sont posées **perpendiculairement à l'axe de la
 * langue** : une largeur appliquée selon une direction fixe transforme toute
 * langue inclinée en planche, ce qui était le défaut du premier jet.
 *
 * Les trous internes sont dessinés, pas obtenus par transparence : ce sont
 * eux qui évitent le « nuage rond uniformément orange » (§3).
 */

import { add3, scale3, type Vec2, type Vec3 } from '../core/math.js';
import { randN } from '../core/rng.js';
import { ShapeMask } from '../pixels/mask.js';
import { cameraPlane } from '../projection/projection.js';
import type { FrameContext } from '../renderer/context.js';

/** Point du plan face caméra, en unités monde. */
type P = { u: number; v: number };

function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Ruban fermé autour d'une ligne médiane, largeur perpendiculaire à l'axe. */
function ribbon(center: readonly P[], widths: readonly number[]): P[] {
  const n = center.length;
  const left: P[] = [];
  const right: P[] = [];
  for (let i = 0; i < n; i++) {
    const a = center[Math.max(0, i - 1)] as P;
    const b = center[Math.min(n - 1, i + 1)] as P;
    const du = b.u - a.u;
    const dv = b.v - a.v;
    const len = Math.hypot(du, dv) || 1;
    const nu = dv / len;
    const nv = -du / len;
    const w = (widths[i] ?? 0) * 0.5;
    const c = center[i] as P;
    left.push({ u: c.u + nu * w, v: c.v + nv * w });
    right.push({ u: c.u - nu * w, v: c.v - nv * w });
  }
  return [...left, ...right.reverse()];
}

/** Ellipse approchée par un polygone, en coordonnées de plan. */
function ellipse(cu: number, cv: number, ru: number, rv: number, steps = 12): P[] {
  const out: P[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    out.push({ u: cu + Math.cos(a) * ru, v: cv + Math.sin(a) * rv });
  }
  return out;
}

export type TongueOptions = {
  readonly id: string;
  /** Base de la flamme, en monde. */
  readonly anchor: Vec3;
  /** Hauteur totale, en unités monde. */
  readonly height: number;
  /** Largeur au pied, en unités monde. */
  readonly width: number;
  /** Nombre de langues. 1 = une seule masse, 5 = gerbe. */
  readonly count?: number;
  /** Ouverture latérale des langues, en unités monde. */
  readonly spread?: number;
  /** Crochet du bout : 0 droit, 1 fortement recourbé. */
  readonly curl?: number;
  /** Décalage de phase : fait monter la matière sans redessiner. */
  readonly phase?: number;
  /** Inclinaison dans le plan écran, en radians. */
  readonly lean?: number;
  /** Trous internes. 0 = masse pleine. */
  readonly holes?: number;
  /** Part de la hauteur occupée par la masse basse. */
  readonly bodyRatio?: number;
  /**
   * Forme de la masse principale.
   *  - `blob`   : masse basse et langues au-dessus. Une boule, un socle.
   *  - `column` : fût continu sur toute la hauteur. Une colonne, une traînée.
   *
   * Sans ce choix, une colonne construite en `blob` donne une gerbe de
   * filaments : chaque langue est fine, et le feu perd sa masse.
   */
  readonly core?: 'blob' | 'column';
  /** Largeur au sommet du fût, en fraction de la largeur de base. */
  readonly topRatio?: number;
  readonly seed: number;
};

export type FlameBody = {
  readonly mask: ShapeMask;
  /** Bouts des langues, en pixels écran : points d'attache des braises. */
  readonly tips: readonly Vec2[];
  readonly apex: Vec2;
};

export function flameBody(ctx: FrameContext, o: TongueOptions): FlameBody {
  const plane = cameraPlane(ctx.projection);
  const count = Math.max(1, Math.round(o.count ?? 3));
  const spread = o.spread ?? o.width * 0.55;
  const curl = o.curl ?? 0.5;
  const phase = o.phase ?? 0;
  const lean = o.lean ?? 0;
  const bodyRatio = o.bodyRatio ?? 0.34;
  const seed = o.seed ^ hashId(o.id);
  const cos = Math.cos(lean);
  const sin = Math.sin(lean);

  const project = (p: P): Vec2 => {
    const u = cos * p.u - sin * p.v;
    const v = sin * p.u + cos * p.v;
    return ctx.p(add3(o.anchor, add3(scale3(plane.right, u), scale3(plane.up, v))));
  };

  const polys: Vec2[][] = [];
  const all: Vec2[] = [];
  const push = (poly: readonly P[]): void => {
    const screen = poly.map(project);
    polys.push(screen);
    all.push(...screen);
  };

  // 1. La masse principale. C'est elle qui donne le poids ; sans elle les
  //    langues se lisent comme des griffes séparées.
  const shape = o.core ?? 'blob';
  const bodyH = shape === 'column' ? o.height * 0.78 : o.height * bodyRatio;
  if (shape === 'column') {
    const steps = 6;
    const center: P[] = [];
    const widths: number[] = [];
    for (let s = 0; s <= steps; s++) {
      const k = s / steps;
      // Le fût ondule légèrement et se resserre en montant : une colonne de
      // feu n'est pas un tuyau.
      const sway = (randN(seed, s, 7) - 0.5) * o.width * 0.22;
      center.push({ u: sway * k, v: bodyH * k });
      const taper = 1 - (1 - (o.topRatio ?? 0.55)) * k;
      widths.push(o.width * taper * (1 + 0.1 * Math.sin(k * 5 + phase * 3)));
    }
    push(ribbon(center, widths));
  } else {
    push(ellipse(0, bodyH * 0.55, o.width * 0.5, bodyH * 0.62, 14));
  }

  // 2. Les langues. Chacune part de la masse et monte, plus ou moins haut.
  const tips: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const grow = 0.55 + 0.45 * randN(seed, i, 1);
    const rise = Math.min(1, phase * 0.6 + 0.5 + 0.5 * randN(seed, i, 2));
    const len = (o.height - bodyH * (shape === 'column' ? 0.85 : 0.4)) * grow * rise;
    const baseU = t * spread + (randN(seed, i, 3) - 0.5) * o.width * 0.22;
    const hookDir = randN(seed, i, 4) > 0.5 ? 1 : -1;
    const hook = curl * hookDir * o.width * 0.75;
    const wBase =
      (o.width / Math.max(1, count * (shape === 'column' ? 0.9 : 0.62))) *
      (0.85 + 0.35 * randN(seed, i, 5)) *
      (shape === 'column' ? 1.5 : 1);

    const steps = 6;
    const center: P[] = [];
    const widths: number[] = [];
    for (let s = 0; s <= steps; s++) {
      const k = s / steps;
      center.push({
        u: baseU + hook * k * k + t * spread * 0.4 * k,
        v: (shape === 'column' ? bodyH * 0.9 : bodyH * 0.3) + len * k,
      });
      // Épaisse à la racine, pointue au bout, avec une seule inflexion : une
      // langue dessinée, pas une dentelure aléatoire.
      widths.push(wBase * (1 - k) ** 0.62 * (1 + 0.22 * Math.sin(k * 2.4 + i)));
    }
    push(ribbon(center, widths));
    tips.push(project(center[steps] as P));
  }

  const mask = ctx.mask(all, 2);
  for (const poly of polys) mask.addPolygon(poly);

  // 3. Les vides. Ils sont placés dans la moitié haute, là où la matière
  //    s'ouvre réellement quand elle monte.
  const holes = o.holes ?? 0;
  if (holes > 0) {
    const cut = new ShapeMask(mask.x0, mask.y0, mask.w, mask.h);
    for (let i = 0; i < holes; i++) {
      const u = (randN(seed, i, 11) - 0.5) * o.width * 0.6;
      const v = o.height * (0.35 + 0.42 * randN(seed, i, 12));
      const c = project({ u, v });
      const r = 1 + 1.6 * randN(seed, i, 13);
      cut.addEllipse(c.x, c.y, r * 1.1, r);
    }
    mask.subtract(cut);
  }

  let apex = tips[0] ?? project({ u: 0, v: o.height });
  for (const t of tips) if (t.y < apex.y) apex = t;
  return { mask, tips, apex };
}

/**
 * Pétales d'ouverture : la conséquence d'un contact.
 *
 * Un pétale est large en son milieu et pointu aux deux bouts — pas un secteur
 * angulaire, qui donne des planches. Trois lobes qui s'ouvrent entre les
 * fragments valent mieux qu'un disque qui grossit (§3).
 */
export function openLobes(
  ctx: FrameContext,
  o: {
    id: string;
    center: Vec3;
    radius: number;
    lobes?: number;
    /** 0 = fermé, 1 = ouvert. */
    opening: number;
    seed: number;
    /** Largeur d'un pétale, en fraction de sa longueur. */
    thickness?: number;
    /** Orientation générale des pétales, en radians dans le plan écran. */
    rotation?: number;
  },
): ShapeMask {
  const plane = cameraPlane(ctx.projection);
  const lobes = Math.max(2, Math.round(o.lobes ?? 3));
  const seed = o.seed ^ hashId(o.id);
  const thickness = o.thickness ?? 0.42;
  const rotation = o.rotation ?? Math.PI / 2;
  const polys: Vec2[][] = [];
  const all: Vec2[] = [];

  const project = (p: P): Vec2 =>
    ctx.p(add3(o.center, add3(scale3(plane.right, p.u), scale3(plane.up, p.v))));

  for (let i = 0; i < lobes; i++) {
    // Les pétales s'ouvrent vers le haut et sur les côtés, jamais vers le bas :
    // une masse en feu monte.
    const spread = Math.PI * 0.86;
    const a = rotation - spread / 2 + (spread * (i + 0.5)) / lobes + (randN(seed, i, 1) - 0.5) * 0.25;
    const len = o.radius * (0.55 + 0.8 * randN(seed, i, 2)) * (0.35 + 0.65 * o.opening);
    const steps = 5;
    const center: P[] = [];
    const widths: number[] = [];
    const bend = (randN(seed, i, 3) - 0.5) * 0.7;
    for (let s = 0; s <= steps; s++) {
      const k = s / steps;
      const angle = a + bend * k * k;
      center.push({ u: Math.cos(angle) * len * k, v: Math.sin(angle) * len * k * 1.08 });
      // Profil de pétale : nul au centre, maximal vers 45 %, pointu au bout.
      widths.push(len * thickness * Math.sin(Math.PI * Math.min(1, k * 1.15)) ** 0.8);
    }
    const poly = ribbon(center, widths).map(project);
    polys.push(poly);
    all.push(...poly);
  }
  // Cœur : il relie les pétales entre eux, sinon l'ouverture se lit comme
  // trois objets indépendants.
  const heart = ellipse(0, 0, o.radius * 0.16, o.radius * 0.14, 10).map(project);
  polys.push(heart);
  all.push(...heart);

  const mask = ctx.mask(all, 2);
  for (const p of polys) mask.addPolygon(p);
  return mask;
}

/**
 * Angle d'inclinaison à donner à une masse de feu pour qu'elle pointe dans
 * une direction **écran** donnée. Sert aux traînées : la flamme d'un
 * projectile fuit vers l'arrière de son mouvement, quel que soit le cap.
 */
export function leanToward(ctx: FrameContext, anchor: Vec3, dirScreen: Vec2): number {
  const plane = cameraPlane(ctx.projection);
  const o = ctx.p(anchor);
  const r = ctx.p(add3(anchor, plane.right));
  const u = ctx.p(add3(anchor, plane.up));
  const rx = { x: r.x - o.x, y: r.y - o.y };
  const ux = { x: u.x - o.x, y: u.y - o.y };
  const det = rx.x * ux.y - rx.y * ux.x;
  if (Math.abs(det) < 1e-9) return 0;
  const a = (dirScreen.x * ux.y - dirScreen.y * ux.x) / det;
  const b = (rx.x * dirScreen.y - rx.y * dirScreen.x) / det;
  return Math.atan2(-a, b);
}

/**
 * Veines chaudes : quelques traits qui courent dans une masse, depuis un
 * centre. Ce sont des **lignes**, pas une moucheture : du bruit semé sur une
 * roche ne fait pas une croûte fissurée, il fait des confettis.
 */
export function veinMask(
  ctx: FrameContext,
  host: ShapeMask,
  o: { id: string; center: Vec3; count: number; length: number; seed: number; width?: number },
): ShapeMask {
  const plane = cameraPlane(ctx.projection);
  const seed = o.seed ^ hashId(o.id);
  const width = o.width ?? 1;
  const lines: Vec2[][] = [];
  const all: Vec2[] = [];
  for (let i = 0; i < o.count; i++) {
    const a = randN(seed, i, 1) * Math.PI * 2;
    const len = o.length * (0.45 + 0.75 * randN(seed, i, 2));
    const line: Vec2[] = [];
    for (let s = 0; s <= 3; s++) {
      const k = s / 3;
      const bend = (randN(seed, i * 4 + s, 3) - 0.5) * 0.8;
      const u = Math.cos(a + bend) * len * k;
      const v = Math.sin(a + bend) * len * k;
      line.push(ctx.p(add3(o.center, add3(scale3(plane.right, u), scale3(plane.up, v)))));
    }
    lines.push(line);
    all.push(...line);
  }
  const mask = ctx.mask(all, width + 1);
  for (const line of lines) mask.addPolyline(line, width);
  mask.intersectWith(host);
  return mask;
}
