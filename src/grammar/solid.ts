/**
 * Solides a facettes. Les orientations ne sont jamais fabriquees en tournant
 * un bitmap : la géométrie est construite en monde, les faces arrière sont
 * éliminées selon l'axe de vue, puis chaque face est projetée et ombree par
 * sa propre normale.
 */

import { type Vec2, type Vec3, add3, cross3, dot3, norm3, scale3, sub3 } from '../core/math.js';
import { cameraDir, depthOf } from '../space/projection.js';
import type { DrawCmd } from '../render/draw.js';
import { poly } from '../render/draw.js';
import type { Dither, RGBA } from '../raster/framebuffer.js';
import { fade } from '../raster/framebuffer.js';
import type { Palette } from '../style/palette.js';
import { shadeFacet, type StyleProfile } from '../style/styleProfile.js';
import type { SpellContext } from '../sim/types.js';

export type Face = {
  readonly pts: readonly Vec3[];
  readonly normal: Vec3;
  readonly centroid: Vec3;
  /** Decalage sur la rampe : arête vive, face interne, fond de fracture. */
  readonly bias?: number;
};

/** Base orthonormee perpendiculaire à un axe. Stable et sans cas degenere. */
export function orthoBasis(axis: Vec3): { u: Vec3; v: Vec3; w: Vec3 } {
  const w = norm3(axis);
  const helper: Vec3 = Math.abs(w.z) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
  const u = norm3(cross3(helper, w));
  const v = cross3(w, u);
  return { u, v, w };
}

/** Normale d'un polygone gauche (methode de Newell). */
export function faceNormal(pts: readonly Vec3[]): Vec3 {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    nx += (a.y - b.y) * (a.z + b.z);
    ny += (a.z - b.z) * (a.x + b.x);
    nz += (a.x - b.x) * (a.y + b.y);
  }
  return norm3({ x: nx, y: ny, z: nz });
}

export function centroid(pts: readonly Vec3[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
    z += p.z;
  }
  const n = Math.max(1, pts.length);
  return { x: x / n, y: y / n, z: z / n };
}

export function makeFace(pts: readonly Vec3[], bias?: number): Face {
  return { pts, normal: faceNormal(pts), centroid: centroid(pts), bias };
}

/**
 * Section transversale a `sides` côtés autour d'un axe.
 * `jitter` deforme les rayons de manière déterministe : un prisme de glace
 * n'est pas un cylindre régulier.
 */
export function ring(
  center: Vec3,
  axis: Vec3,
  radius: number,
  sides: number,
  roll = 0,
  jitter?: (i: number) => number,
): Vec3[] {
  const { u, v } = orthoBasis(axis);
  const out: Vec3[] = [];
  for (let i = 0; i < sides; i++) {
    const a = roll + (i / sides) * Math.PI * 2;
    const r = radius * (jitter ? jitter(i) : 1);
    out.push(add3(center, add3(scale3(u, Math.cos(a) * r), scale3(v, Math.sin(a) * r))));
  }
  return out;
}

/** Faces latérales entre deux sections de même cardinalite. */
export function bridge(a: readonly Vec3[], b: readonly Vec3[], bias?: number): Face[] {
  const n = Math.min(a.length, b.length);
  const faces: Face[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    faces.push(makeFace([a[i]!, a[j]!, b[j]!, b[i]!], bias));
  }
  return faces;
}

/** Faces triangulaires convergeant vers un sommet : pointe de lance, aiguille. */
export function apex(ringPts: readonly Vec3[], tip: Vec3, bias?: number): Face[] {
  const faces: Face[] = [];
  for (let i = 0; i < ringPts.length; i++) {
    const j = (i + 1) % ringPts.length;
    faces.push(makeFace([ringPts[i]!, ringPts[j]!, tip], bias));
  }
  return faces;
}

export function cap(ringPts: readonly Vec3[], bias?: number): Face {
  return makeFace(ringPts, bias);
}

/** Prisme complet entre deux points, avec sections indépendantes. */
export function prism(
  from: Vec3,
  to: Vec3,
  rFrom: number,
  rTo: number,
  sides: number,
  roll = 0,
  jitter?: (i: number) => number,
): Face[] {
  const axis = sub3(to, from);
  const a = ring(from, axis, rFrom, sides, roll, jitter);
  const b = ring(to, axis, rTo, sides, roll, jitter);
  return [...bridge(a, b), cap([...a].reverse()), cap(b)];
}

/** Prisme termine par une pointe : la lance de glace. */
export function spike(
  from: Vec3,
  to: Vec3,
  radius: number,
  tipRatio: number,
  sides: number,
  roll = 0,
  jitter?: (i: number) => number,
): Face[] {
  const axis = sub3(to, from);
  const shoulder = add3(from, scale3(axis, 1 - tipRatio));
  const base = ring(from, axis, radius * 0.7, sides, roll, jitter);
  const mid = ring(shoulder, axis, radius, sides, roll, jitter);
  return [...bridge(base, mid), ...apex(mid, to, -0.12), cap([...base].reverse(), 0.25)];
}

export type SolidPaint = {
  readonly palette: Palette;
  readonly style: StyleProfile;
  readonly alpha?: number;
  readonly bias?: number;
  readonly layer?: 'ground' | 'main' | 'light';
  readonly dither?: Dither;
  readonly tag?: string;
  readonly depthOffset?: number;
  /** Liseré par face : sépare visuellement les éclats d'un même amas. */
  readonly edge?: RGBA;
};

/** Faces tournees vers la camera, triées du fond vers l'avant. */
export function visibleFaces(faces: readonly Face[], projectionView: Vec3): Face[] {
  return faces
    .filter((f) => dot3(f.normal, projectionView) > 0.0001)
    .sort((a, b) => depthOf(a.centroid) - depthOf(b.centroid));
}

/** Transforme un solide monde en commandes de dessin projetées et ombrees. */
export function emitSolid(ctx: SpellContext, faces: readonly Face[], paint: SolidPaint): DrawCmd[] {
  const view = cameraDir(ctx.projection);
  const vis = visibleFaces(faces, view);
  const alpha = paint.alpha ?? 1;
  const out: DrawCmd[] = [];
  for (const f of vis) {
    const color = shadeFacet(paint.style, paint.palette, f.normal, (f.bias ?? 0) + (paint.bias ?? 0));
    const pts: Vec2[] = f.pts.map((p) => ctx.p(p));
    out.push({
      layer: paint.layer ?? 'main',
      depth: depthOf(f.centroid) + (paint.depthOffset ?? 0),
      shape: poly(pts),
      paint: { color: fade(color, alpha), dither: paint.dither },
      ...(paint.edge ? { outline: { color: fade(paint.edge, alpha) } } : {}),
      ...(paint.tag ? { tag: paint.tag } : {}),
    });
  }
  return out;
}

/** Deplace un solide entier de manière rigide (aucune deformation). */
export function translateFaces(faces: readonly Face[], delta: Vec3): Face[] {
  return faces.map((f) => ({
    pts: f.pts.map((p) => add3(p, delta)),
    normal: f.normal,
    centroid: add3(f.centroid, delta),
    bias: f.bias,
  }));
}

/** Homothetie autour d'un centre : croissance sans rotation. */
export function scaleFacesAbout(faces: readonly Face[], center: Vec3, k: number): Face[] {
  return faces.map((f) => ({
    pts: f.pts.map((p) => add3(center, scale3(sub3(p, center), k))),
    normal: f.normal,
    centroid: add3(center, scale3(sub3(f.centroid, center), k)),
    bias: f.bias,
  }));
}

/** Rotation de Rodrigues autour d'un axe passant par un point. */
export function rotateFacesAbout(
  faces: readonly Face[],
  center: Vec3,
  axis: Vec3,
  angle: number,
): Face[] {
  const k = norm3(axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rot = (p: Vec3): Vec3 => {
    const d = sub3(p, center);
    const kd = dot3(k, d);
    return add3(center, {
      x: d.x * c + (k.y * d.z - k.z * d.y) * s + k.x * kd * (1 - c),
      y: d.y * c + (k.z * d.x - k.x * d.z) * s + k.y * kd * (1 - c),
      z: d.z * c + (k.x * d.y - k.y * d.x) * s + k.z * kd * (1 - c),
    });
  };
  const rotDir = (v: Vec3): Vec3 => {
    const kd = dot3(k, v);
    return {
      x: v.x * c + (k.y * v.z - k.z * v.y) * s + k.x * kd * (1 - c),
      y: v.y * c + (k.z * v.x - k.x * v.z) * s + k.y * kd * (1 - c),
      z: v.z * c + (k.x * v.y - k.y * v.x) * s + k.z * kd * (1 - c),
    };
  };
  return faces.map((f) => ({
    pts: f.pts.map(rot),
    normal: rotDir(f.normal),
    centroid: rot(f.centroid),
    bias: f.bias,
  }));
}

/** Boite orientee : socle des blocs de terre. */
export function box(center: Vec3, right: Vec3, forward: Vec3, up: Vec3): Face[] {
  const r = right;
  const f = forward;
  const u = up;
  const corner = (sr: number, sf: number, su: number): Vec3 => ({
    x: center.x + r.x * sr + f.x * sf + u.x * su,
    y: center.y + r.y * sr + f.y * sf + u.y * su,
    z: center.z + r.z * sr + f.z * sf + u.z * su,
  });
  const p000 = corner(-1, -1, -1);
  const p100 = corner(1, -1, -1);
  const p110 = corner(1, 1, -1);
  const p010 = corner(-1, 1, -1);
  const p001 = corner(-1, -1, 1);
  const p101 = corner(1, -1, 1);
  const p111 = corner(1, 1, 1);
  const p011 = corner(-1, 1, 1);
  return [
    makeFace([p001, p101, p111, p011]),
    makeFace([p000, p010, p110, p100]),
    makeFace([p000, p100, p101, p001]),
    makeFace([p110, p010, p011, p111]),
    makeFace([p100, p110, p111, p101]),
    makeFace([p010, p000, p001, p011]),
  ];
}

/**
 * Strates : bandes fines plaquees sur les faces verticales d'un bloc. Elles
 * suivent la face reelle, donc restent cohérentes quand le bloc bascule.
 */
export function stratify(face: Face, fractions: readonly number[], thickness: number): Face[] {
  if (face.pts.length !== 4) return [];
  const [a, b, cPt, d] = face.pts as [Vec3, Vec3, Vec3, Vec3];
  // Cote a->d et b->c sont les montants verticaux du quad.
  const out: Face[] = [];
  const lerpP = (p: Vec3, q: Vec3, t: number): Vec3 => ({
    x: p.x + (q.x - p.x) * t,
    y: p.y + (q.y - p.y) * t,
    z: p.z + (q.z - p.z) * t,
  });
  for (const t of fractions) {
    const t2 = Math.min(1, t + thickness);
    out.push({
      pts: [lerpP(a, d, t), lerpP(b, cPt, t), lerpP(b, cPt, t2), lerpP(a, d, t2)],
      normal: face.normal,
      centroid: lerpP(face.centroid, face.centroid, 0),
      bias: 0.28,
    });
  }
  return out.map((f) => ({ ...f, centroid: centroid(f.pts) }));
}
