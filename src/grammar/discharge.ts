/**
 * Reseaux de décharge. Le trace est calcule une fois par décharge, a partir
 * d'une seed de décharge : la géométrie reste identique pendant toute la
 * durée du maintien, et seule l'intensité varie. Renouveler un bruit complet
 * a chaque image ferait perdre la lecture de la forme.
 *
 * Les points d'ancrage sont fournis par l'appelant : le reseau ne suppose
 * aucun système de combat particulier.
 */

import { type Vec3, add3, cross3, norm3, scale3, sub3 } from '../core/math.js';
import { randN, randRange } from '../core/rng.js';

export type DischargeSegment = {
  readonly pts: readonly Vec3[];
  /** 0 = tronc, 1 = branche, 2 = ramille. */
  readonly rank: number;
};

/** Base orthonormee perpendiculaire à un axe. */
function perpBasis(axis: Vec3): { a: Vec3; b: Vec3 } {
  const w = norm3(axis);
  const helper: Vec3 = Math.abs(w.z) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
  const a = norm3(cross3(helper, w));
  return { a, b: cross3(w, a) };
}

/**
 * Deplacement du point median, récursif. L'amplitude decroit d'un niveau au
 * suivant : grandes cassures d'abord, détail ensuite.
 */
export function dischargePath(
  from: Vec3,
  to: Vec3,
  seed: number,
  levels: number,
  amplitude: number,
): Vec3[] {
  const axis = sub3(to, from);
  const { a, b } = perpBasis(axis);
  let pts: Vec3[] = [from, to];
  let amp = amplitude;
  let counter = 0;
  for (let level = 0; level < levels; level++) {
    const next: Vec3[] = [pts[0]!];
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i]!;
      const q = pts[i + 1]!;
      const mid = scale3(add3(p, q), 0.5);
      counter++;
      const ua = (randN(seed, counter, 41) * 2 - 1) * amp;
      const ub = (randN(seed, counter, 42) * 2 - 1) * amp;
      next.push(add3(mid, add3(scale3(a, ua), scale3(b, ub))));
      next.push(q);
    }
    pts = next;
    amp *= 0.52;
  }
  return pts;
}

export type NetworkOptions = {
  readonly seed: number;
  readonly levels?: number;
  readonly amplitude?: number;
  readonly branchCount?: number;
  readonly branchLength?: number;
  readonly branchDepth?: number;
};

/**
 * Reseau complet entre une suite de points d'ancrage. Deux ancres donnent un
 * arc simple ; trois ou plus donnent une chaine. La même fonction sert donc a
 * l'arc directionnel et à la chaine entre cibles.
 */
export function dischargeNetwork(anchors: readonly Vec3[], o: NetworkOptions): DischargeSegment[] {
  if (anchors.length < 2) return [];
  const levels = o.levels ?? 5;
  const amplitude = o.amplitude ?? 0.35;
  const branchCount = o.branchCount ?? 4;
  const branchLength = o.branchLength ?? 0.45;
  const branchDepth = o.branchDepth ?? 2;
  const out: DischargeSegment[] = [];

  for (let leg = 0; leg + 1 < anchors.length; leg++) {
    const from = anchors[leg]!;
    const to = anchors[leg + 1]!;
    const legSeed = o.seed + leg * 7717;
    const trunk = dischargePath(from, to, legSeed, levels, amplitude);
    out.push({ pts: trunk, rank: 0 });
    growBranches(out, trunk, legSeed, branchCount, branchLength, 1, branchDepth);
  }
  return out;
}

function growBranches(
  out: DischargeSegment[],
  parent: readonly Vec3[],
  seed: number,
  count: number,
  lengthRatio: number,
  rank: number,
  maxRank: number,
): void {
  if (rank > maxRank || parent.length < 3) return;
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(randRange(seed, i + rank * 131, 43, 1, parent.length - 1));
    const at = parent[idx];
    const prev = parent[idx - 1];
    if (!at || !prev) continue;
    const dir = norm3(sub3(at, prev));
    const { a, b } = perpBasis(dir);
    const spreadA = (randN(seed, i + rank * 131, 44) * 2 - 1) * 1.1;
    const spreadB = (randN(seed, i + rank * 131, 45) * 2 - 1) * 1.1;
    const tipDir = norm3(add3(dir, add3(scale3(a, spreadA), scale3(b, spreadB))));
    const parentLen = dist(parent[0]!, parent[parent.length - 1]!);
    const len = parentLen * lengthRatio * randRange(seed, i + rank * 131, 46, 0.45, 1);
    const tip = add3(at, scale3(tipDir, len));
    const pts = dischargePath(at, tip, seed + i * 3313 + rank * 911, 3, len * 0.22);
    out.push({ pts, rank });
    if (rank < maxRank) {
      growBranches(out, pts, seed + i * 977 + rank * 31, Math.max(1, count - 2), lengthRatio * 0.6, rank + 1, maxRank);
    }
  }
}

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

/** Portion visible d'un trace, pour une décharge qui progresse. */
export function pathPrefix(pts: readonly Vec3[], progress: number): Vec3[] {
  if (progress >= 1) return [...pts];
  if (progress <= 0 || pts.length < 2) return [];
  const total = pts.length - 1;
  const exact = total * progress;
  const whole = Math.floor(exact);
  const frac = exact - whole;
  const out = pts.slice(0, whole + 1);
  const a = pts[whole];
  const b = pts[whole + 1];
  if (a && b && frac > 0) {
    out.push({ x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac, z: a.z + (b.z - a.z) * frac });
  }
  return out.length >= 2 ? out : [];
}
