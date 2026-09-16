/**
 * Passe de matière.
 *
 * Le rasteriseur produit des faces planes projetées. Livrées telles quelles,
 * elles donnent du low-poly à plat : on voit le maillage, les aplats se
 * touchent sans transition, et rien ne dit où est le volume. C'est la
 * différence entre un rendu 3D en basse résolution et du pixel art.
 *
 * Cette passe travaille sur la silhouette déjà peinte, en espace écran, et
 * lui rend les trois choses qui font lire un volume en pixel art :
 *
 *  1. un **liseré clair** sur les bords tournés vers la lumière ;
 *  2. une **ombre de contact** sur les bords opposés, à l'intérieur ;
 *  3. un **contour sélectif** à l'extérieur — franc du côté sombre, atténué
 *     du côté éclairé, au lieu d'un trait noir uniforme qui aplatit tout.
 *
 * Elle ne connaît ni les recettes ni la géométrie : n'importe quel corps peint
 * en bénéficie, qu'il soit fait de facettes, de rubans ou de taches.
 */

import type { Vec2, Vec3 } from '../core/math.js';
import { Framebuffer, type RGBA, mixColor } from '../raster/framebuffer.js';
import type { ProjectionProfile } from '../space/projection.js';
import { randN } from '../core/rng.js';
import type { Palette } from '../style/palette.js';
import { rampAt } from '../style/palette.js';
import type { StyleProfile } from '../style/styleProfile.js';

/** Direction de la lumière une fois projetée à l'écran, normalisée. */
export function lightOnScreen(p: ProjectionProfile, lightDir: Vec3): Vec2 {
  const x = p.groundScale * (lightDir.x - lightDir.y);
  const y = p.groundScale * p.groundRatio * (lightDir.x + lightDir.y) - p.heightScale * lightDir.z;
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

/**
 * Seuils de séparation entre bord éclairé, bord neutre et bord d'ombre.
 *
 * `LIT` est volontairement haut : un seuil bas allume toute la moitié
 * supérieure de la silhouette d'un trait continu, qui se lit comme une
 * bordure dorée et non comme de la lumière. Un liseré doit être **interrompu**
 * — présent sur les segments qui font vraiment face à la source, absent
 * ailleurs.
 */
const LIT = 0.62;
const SHADED = -0.2;

/**
 * Nettoyage morphologique : retire les pixels qui ne tiennent au corps que
 * par un coin et bouche les encoches d'un pixel.
 *
 * Une arête projetée à un angle quelconque produit un escalier irrégulier —
 * des marches de 1, puis 3, puis 2 pixels. Ce bruit est ce qui distingue le
 * plus nettement un rendu géométrique d'un tracé à la main.
 */
function tidyCoverage(cov: Uint8Array, w: number, h: number): void {
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : (cov[y * w + x] ?? 0);
  const next = Uint8Array.from(cov);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = at(x, y - 1) + at(x, y + 1) + at(x - 1, y) + at(x + 1, y);
      if (at(x, y) === 1 && n <= 1) next[y * w + x] = 0;
      else if (at(x, y) === 0 && n >= 3) next[y * w + x] = 1;
    }
  }
  cov.set(next);
}

export type MaterialOptions = {
  readonly palette: Palette;
  readonly style: StyleProfile;
  readonly light: Vec2;
  /** Force du liseré clair, dans [0,1]. */
  readonly rim?: number;
  /** Force de l'ombre de contact, dans [0,1]. */
  readonly contact?: number;
  /** Pixels de matière diffuse, exclus de la passe. */
  readonly soft?: Uint8Array;
};

/**
 * Applique la passe sur un framebuffer déjà peint. Le fond doit être
 * transparent : c'est l'alpha qui définit la silhouette.
 */
export function applyMaterial(fb: Framebuffer, o: MaterialOptions): void {
  const w = fb.width;
  const h = fb.height;
  const cov = new Uint8Array(w * h);
  const soft = o.soft;
  for (let i = 0; i < w * h; i++) {
    cov[i] = (fb.data[i * 4 + 3] ?? 0) > 8 && !(soft && soft[i] === 1) ? 1 : 0;
  }
  tidyCoverage(cov, w, h);

  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : (cov[y * w + x] ?? 0);

  const highlight = mixColor(rampAt(o.palette, 0), o.palette.core, 0.5);
  const shadow = o.palette.rim;
  const rimStrength = o.rim ?? 1;
  const contactStrength = o.contact ?? 1;

  // 0 = rien, 1 = bord éclairé, 2 = bord d'ombre, 3 = contour extérieur.
  const marks = new Uint8Array(w * h);
  // Exposition de chaque pixel de contour, pour moduler son opacité.
  const lit = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inside = at(x, y) === 1;
      let gx = 0;
      let gy = 0;
      let empty = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const solid = at(x + dx, y + dy) === 1;
          if (inside ? !solid : solid) {
            // Vers le vide si l'on est dedans, vers la matière sinon : dans
            // les deux cas le gradient pointe hors du corps.
            gx += inside ? dx : -dx;
            gy += inside ? dy : -dy;
            empty++;
          }
        }
      }
      if (empty === 0) continue;
      const len = Math.hypot(gx, gy) || 1;
      const d = ((gx / len) * o.light.x + (gy / len) * o.light.y);
      if (inside) {
        if (d > LIT) marks[y * w + x] = 1;
        else if (d < SHADED) marks[y * w + x] = 2;
      } else {
        marks[y * w + x] = 3;
      }
      // La valeur du produit scalaire est réutilisée pour moduler le contour.
      if (!inside) lit[y * w + x] = Math.round((d * 0.5 + 0.5) * 255);
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const m = marks[y * w + x];
      if (!m) continue;
      // Un pixel diffus déjà peint n'est pas recouvert par le contour.
      if (m === 3 && soft && soft[y * w + x] === 1) continue;
      const i = (y * w + x) * 4;
      if (m === 1) {
        const base: RGBA = [fb.data[i] ?? 0, fb.data[i + 1] ?? 0, fb.data[i + 2] ?? 0, 255];
        fb.plot(x, y, mixColor(base, highlight, 0.6 * rimStrength));
      } else if (m === 2) {
        const base: RGBA = [fb.data[i] ?? 0, fb.data[i + 1] ?? 0, fb.data[i + 2] ?? 0, 255];
        fb.plot(x, y, mixColor(base, shadow, 0.5 * contactStrength));
      } else if (o.style.outline === 'rim') {
        // Contour sélectif : franc là où le corps se détache de l'ombre,
        // discret là où il est éclairé. Un trait uniforme aplatit la forme.
        const k = (lit[y * w + x] ?? 128) / 255;
        // Contour sélectif, mais jamais absent : un sprite doit rester
        // détaché sur un fond clair comme sur un fond sombre.
        const alpha = o.style.outlineAlpha * (1 - k * 0.5);
        if (alpha > 0.04) {
          fb.plot(x, y, [shadow[0], shadow[1], shadow[2], Math.round(255 * alpha)]);
        }
      }
    }
  }
}

/**
 * Passe émissive — la façon dont le pixel art peint le feu.
 *
 * Une flamme ne s'ombre pas par la lumière extérieure : elle *est* la source.
 * Sa valeur ne dépend pas de l'orientation d'une face mais de l'**épaisseur
 * de matière** : le bord est sombre et rouge, le cœur est blanc, et entre les
 * deux se succèdent des bandes concentriques franches.
 *
 * D'où cette passe : on ne colorie plus chaque lobe séparément — ce qui
 * produit un empilement d'objets orange distincts, l'« amas de briques » —
 * mais on prend la **silhouette réunie** de tout ce qui brûle, on mesure en
 * chaque pixel sa distance au bord, et on en déduit sa couleur. Deux lobes
 * qui se recouvrent fusionnent alors en un seul corps, plus épais donc plus
 * chaud en leur milieu. C'est exactement ce qui fait qu'une boule de feu se
 * lit comme une masse et non comme un tas.
 *
 * Les transitions entre échelons sont tramées, ce qui évite les anneaux trop
 * réguliers tout en gardant des valeurs franches.
 */
export type EmissiveOptions = {
  /** Épaisseur minimale pour parcourir toute la rampe. */
  readonly coreDistance: number;
  /** Opacité du contour. 0 = aucun, ce qui est le cas d'une flamme. */
  readonly rimAlpha: number;
  /**
   * Poids de l'épaisseur dans le choix de la valeur.
   *
   * Seule, elle produit des anneaux concentriques réguliers — une cible, pas
   * un feu. Dans un feu dessiné à la main, le bord est à peine plus chaud que
   * le cœur : ce sont les **amas** d'orange et de rouge dispersés dans la
   * masse qui font la matière.
   */
  readonly edgeBias: number;
  /** Poids de la moucheture. */
  readonly turbulence: number;
  /**
   * Exposant appliqué à la moucheture. Au-dessus de 1 il tire la distribution
   * vers le clair : c'est lui qui décide de la proportion de jaune, et donc de
   * la lecture d'ensemble. Un bruit uniforme donne une masse orange homogène.
   */
  readonly turbulenceBias: number;
  /**
   * Décalage vertical de la moucheture, en pixels. Il avance avec le temps,
   * si bien que la texture **monte** au lieu de grésiller sur place.
   */
  readonly phase: number;
  readonly seed: number;
};

/**
 * Bruit par cellules, échantillonné au plus proche : des amas francs.
 *
 * Les gros amas décident seuls de la valeur ; le détail ne fait que froisser
 * leur bord. Moyenner deux bruits d'égal poids resserrerait la distribution
 * autour de 0,5 — tous les pixels tomberaient alors sur le même échelon de
 * rampe, et la masse virerait à l'orange uniforme quel que soit le réglage.
 */
function mottle(x: number, y: number, phase: number, seed: number): number {
  const coarse = randN(seed, Math.floor(x / 5) * 73 + Math.floor((y + phase) / 5), 1);
  const detail = randN(seed + 977, Math.floor(x / 2) * 73 + Math.floor((y + phase * 1.6) / 2), 2);
  const v = coarse + (detail - 0.5) * 0.35;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function applyEmissive(
  fb: Framebuffer,
  mask: Uint8Array,
  palette: Palette,
  o: EmissiveOptions,
): void {
  const w = fb.width;
  const h = fb.height;
  const INF = 1e6;
  const dist = new Float32Array(w * h);

  // Transformée de distance par chanfrein, deux balayages. Les coûts 1 et
  // 1,414 donnent une distance euclidienne suffisamment fidèle à cette
  // échelle, pour une fraction du prix d'un calcul exact.
  const D1 = 1;
  const D2 = 1.41421356;
  for (let i = 0; i < w * h; i++) dist[i] = mask[i] === 1 ? INF : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (dist[i] === 0) continue;
      let best = dist[i]!;
      if (y > 0) {
        best = Math.min(best, dist[i - w]! + D1);
        if (x > 0) best = Math.min(best, dist[i - w - 1]! + D2);
        if (x < w - 1) best = Math.min(best, dist[i - w + 1]! + D2);
      }
      if (x > 0) best = Math.min(best, dist[i - 1]! + D1);
      dist[i] = best;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (dist[i] === 0) continue;
      let best = dist[i]!;
      if (y < h - 1) {
        best = Math.min(best, dist[i + w]! + D1);
        if (x > 0) best = Math.min(best, dist[i + w - 1]! + D2);
        if (x < w - 1) best = Math.min(best, dist[i + w + 1]! + D2);
      }
      if (x < w - 1) best = Math.min(best, dist[i + 1]! + D1);
      dist[i] = best;
    }
  }

  // Chaque corps est normalisé par sa **propre** épaisseur maximale.
  //
  // Une constante globale ne peut pas servir à la fois une mèche de dix
  // pixels et une explosion de quarante : réglée pour la mèche, l'explosion
  // devient un aplat blanc ; réglée pour l'explosion, la mèche reste dans les
  // rouges sombres. En normalisant par corps, la rampe s'étale toujours du
  // bord au cœur, quelle que soit la taille — ce que fait un dessinateur.
  //
  // Composantes en 8-connexité : deux lobes qui ne se touchent que par un
  // coin appartiennent au même feu et doivent partager leur échelle.
  const label = new Int32Array(w * h).fill(-1);
  const peak: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (mask[start] !== 1 || label[start] !== -1) continue;
    const id = peak.length;
    let best = 0;
    stack.length = 0;
    stack.push(start);
    label[start] = id;
    while (stack.length > 0) {
      const i = stack.pop()!;
      const d = dist[i] ?? 0;
      if (d > best) best = d;
      const x = i % w;
      const y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (mask[j] === 1 && label[j] === -1) {
            label[j] = id;
            stack.push(j);
          }
        }
      }
    }
    peak.push(best);
  }

  const steps = palette.ramp.length;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i] !== 1) continue;
      // 0 au bord, 1 au cœur du corps auquel ce pixel appartient.
      const span = Math.max(o.coreDistance, peak[label[i]!] ?? 1);
      const t = Math.min(1, (dist[i] ?? 0) / span);
      // L'épaisseur ne fait qu'incliner la valeur ; la moucheture porte le
      // reste. Sans elle on obtient des anneaux, avec elle un feu.
      // La moucheture est élevée à une puissance > 1 pour tirer la
      // distribution vers le clair : dans un feu dessiné, le jaune couvre la
      // majorité de la surface et l'orange comme le rouge ne sont que des
      // accents. Un bruit uniforme donnerait une masse orange homogène.
      const n = Math.pow(mottle(x, y, o.phase, o.seed), o.turbulenceBias);
      // L'épaisseur n'agit que sur la frange extérieure : au cube, son effet
      // s'éteint dès qu'on rentre dans le corps. Appliquée linéairement, elle
      // décalait toute la masse d'un échelon — la moyenne de (1 - t) sur un
      // disque vaut déjà un tiers — et le jaune disparaissait.
      const v = Math.min(1, Math.pow(1 - t, 3) * o.edgeBias + n * o.turbulence);
      // Quantification franche, sans tramage : les amas viennent de la
      // moucheture elle-même. Tramer la transition entre deux échelons ajoute
      // un grain parasite et, surtout, déplace la moitié des pixels de la
      // valeur claire vers la suivante — la masse vire à l'orange alors qu'un
      // feu dessiné est majoritairement jaune.
      const idx = Math.min(steps - 1, Math.round(v * (steps - 1)));
      const color = palette.ramp[idx] ?? palette.core;
      const alpha = fb.data[i * 4 + 3] ?? 255;
      fb.data[i * 4] = color[0];
      fb.data[i * 4 + 1] = color[1];
      fb.data[i * 4 + 2] = color[2];
      fb.data[i * 4 + 3] = alpha;
    }
  }

  // Contour optionnel. Une flamme n'en a pas : elle se détache par sa propre
  // clarté, et un trait sombre autour la transforme en objet découpé.
  if (o.rimAlpha <= 0) return;
  const rim: RGBA = [palette.rim[0], palette.rim[1], palette.rim[2], Math.round(255 * o.rimAlpha)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i] === 1) continue;
      const l = x > 0 ? mask[i - 1] : 0;
      const r = x < w - 1 ? mask[i + 1] : 0;
      const u = y > 0 ? mask[i - w] : 0;
      const d = y < h - 1 ? mask[i + w] : 0;
      if (l || r || u || d) fb.plot(x, y, rim, 'over');
    }
  }
}
