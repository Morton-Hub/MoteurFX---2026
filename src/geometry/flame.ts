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

/**
 * Ruban fermé autour d'une ligne médiane, largeur perpendiculaire à l'axe.
 *
 * Les deux bords sont donnés **séparément**. Un ruban symétrique — même
 * largeur à gauche et à droite — produit un profil en fuseau parfait : c'est
 * exactement ce qui faisait lire les flammes comme des cônes. Une flamme
 * réelle est déséquilibrée : elle gonfle d'un côté pendant qu'elle rentre de
 * l'autre.
 */
function ribbon(
  center: readonly P[],
  widthsL: readonly number[],
  widthsR: readonly number[] = widthsL,
): P[] {
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
    const c = center[i] as P;
    const wl = (widthsL[i] ?? 0) * 0.5;
    const wr = (widthsR[i] ?? widthsL[i] ?? 0) * 0.5;
    left.push({ u: c.u + nu * wl, v: c.v + nv * wl });
    right.push({ u: c.u - nu * wr, v: c.v - nv * wr });
  }
  return [...left, ...right.reverse()];
}

/**
 * Bosses le long d'un bord.
 *
 * Trois sinusoïdes de fréquences non entières entre elles, à phases tirées du
 * germe : le bord avance et recule trois ou quatre fois sur la hauteur, sans
 * jamais repasser par le même motif. C'est ce battement — et non le bruit
 * pixel par pixel — qui fait qu'une silhouette se lit comme de la matière
 * vivante plutôt que comme un solide de révolution.
 */
function lobes(k: number, seed: number, lane: number, amp: number): number {
  const p1 = randN(seed, lane, 31) * Math.PI * 2;
  const p2 = randN(seed, lane, 32) * Math.PI * 2;
  const p3 = randN(seed, lane, 33) * Math.PI * 2;
  const wave =
    0.55 * Math.sin(k * 7.3 + p1) + 0.3 * Math.sin(k * 12.1 + p2) + 0.15 * Math.sin(k * 19.7 + p3);
  // Décalé vers le dehors : les bosses gonflent plus qu'elles ne creusent.
  // Centré sur zéro, le battement amincissait la masse autant qu'il la
  // gonflait, et la colonne finissait en bâton ondulé.
  return 1 + amp * (wave + 0.5);
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
    // Assez de points pour que le contour puisse réellement onduler. Avec six
    // échantillons sur toute la hauteur, les segments sont si longs que le fût
    // se lit comme un tronc de cône, quelle que soit la loi de largeur.
    const steps = 16;
    const center: P[] = [];
    const wl: number[] = [];
    const wr: number[] = [];
    for (let s = 0; s <= steps; s++) {
      const k = s / steps;
      // Le fût serpente : deux vagues lentes, déphasées, plutôt qu'un bruit
      // par échantillon — une colonne de feu se tord, elle ne grésille pas.
      const sway =
        o.width *
        (0.3 * Math.sin(k * 4.1 + phase * 2 + randN(seed, 0, 7) * 6.283) +
          0.16 * Math.sin(k * 9.3 + randN(seed, 1, 7) * 6.283));
      center.push({ u: sway * k, v: bodyH * k });
      // Le rétrécissement reste, mais il est mangé par les bosses : le bord
      // gauche et le bord droit ont leur propre battement.
      const taper = 1 - (1 - (o.topRatio ?? 0.55)) * k ** 0.85;
      // Le feu s'évase là où il touche le sol : la matière s'étale avant de
      // monter. Sans ce pied, la colonne est posée sur rien.
      const flare = 1 + 0.35 * Math.max(0, 1 - k * 5) ** 2;
      const base = o.width * taper * flare;
      wl.push(base * lobes(k, seed, 1, 0.34));
      wr.push(base * lobes(k, seed, 2, 0.34));
    }
    push(ribbon(center, wl, wr));
  } else {
    // La masse basse n'est pas une ellipse : c'est un contour irrégulier qui
    // gonfle et rentre. Une ellipse donne la « boule ronde uniformément
    // orange » que le style refuse (§3).
    const steps = 18;
    const blob: P[] = [];
    for (let s = 0; s < steps; s++) {
      const a = (s / steps) * Math.PI * 2;
      const k = a / (Math.PI * 2);
      const r = lobes(k, seed, 3, 0.3);
      blob.push({
        u: Math.cos(a) * o.width * 0.5 * r,
        v: bodyH * 0.55 + Math.sin(a) * bodyH * 0.62 * r,
      });
    }
    push(blob);
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

    const steps = 12;
    const center: P[] = [];
    const wl: number[] = [];
    const wr: number[] = [];
    for (let s = 0; s <= steps; s++) {
      const k = s / steps;
      // La langue ne monte pas droit : elle ondule avant de se crocher.
      const waver = o.width * 0.14 * Math.sin(k * 5.5 + randN(seed, i, 8) * 6.283);
      center.push({
        u: baseU + hook * k * k + t * spread * 0.4 * k + waver * k,
        v: (shape === 'column' ? bodyH * 0.9 : bodyH * 0.3) + len * k,
      });
      // Épaisse à la racine, pointue au bout — mais le bord gonfle et rentre
      // en chemin, et pas des deux côtés au même endroit. Sans ce déséquilibre
      // la langue redevient un triangle.
      // La langue garde son épaisseur longtemps puis se ferme d'un coup. Une
      // décroissance régulière donne une pointe filiforme — des bois de cerf,
      // pas une flamme.
      const base = wBase * (1 - k ** 1.7) ** 0.5;
      wl.push(base * lobes(k, seed, 10 + i * 2, 0.36));
      wr.push(base * lobes(k, seed, 11 + i * 2, 0.36));
    }
    push(ribbon(center, wl, wr));
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

/*
 * `openLobes` — retiré.
 *
 * Cette fonction ouvrait une masse de feu en trois pétales symétriques posés
 * dans le plan caméra. À cette taille, trois lobes de longueur voisine qui
 * s'ouvrent autour d'un cœur se lisent comme une fleur ou un papillon, pas
 * comme du feu : la lecture est plate et elle est la même dans les huit caps.
 * L'éclatement est maintenant une **gerbe montante** (`flameBody`) — verticale,
 * asymétrique, avec des langues de hauteurs inégales.
 */

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
