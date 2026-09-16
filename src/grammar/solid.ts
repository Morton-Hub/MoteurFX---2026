/**
 * Solides a facettes. Les orientations ne sont jamais fabriquees en tournant
 * un bitmap : la géométrie est construite en monde, les faces arrière sont
 * éliminées selon l'axe de vue, puis chaque face est projetée et ombree par
 * sa propre normale.
 */

import { type Vec2, type Vec3, add3, cross3, dot3, len3, norm3, scale3, sub3 } from '../core/math.js';
import { randSigned } from '../core/rng.js';
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
  /**
   * Profondeur commune a toutes les faces du solide. A utiliser des qu'une
   * scene contient plusieurs solides convexes voisins : sans elle, le tri
   * global face par face entrelace deux objets qui ne se croisent pourtant
   * jamais. Une dalle de terre inclinee couvre a elle seule une centaine
   * d'unites de profondeur, la ou deux dalles voisines n'en separent qu'une
   * vingtaine — l'ordre interne des faces reste correct, mais l'ordre entre
   * objets devient faux.
   *
   * Avec `groupDepth`, l'objet est peint d'un bloc, ses faces conservant leur
   * ordre relatif a un epsilon pres.
   */
  readonly groupDepth?: number;
  /** Liseré par face : sépare visuellement les éclats d'un même amas. */
  readonly edge?: RGBA;
  /**
   * Couleur imposée, qui court-circuite l'ombrage par normale. Sert aux
   * éléments qui émettent leur propre lumière : une fissure incandescente ne
   * s'assombrit pas parce que sa face est tournée loin de la lumière.
   */
  readonly flatColor?: RGBA;
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
  // Ecart entre deux faces d'un meme objet groupe. Assez petit pour ne jamais
  // franchir la distance qui separe deux objets voisins.
  const FACE_STEP = 0.001;
  vis.forEach((f, index) => {
    const color =
      paint.flatColor ??
      shadeFacet(paint.style, paint.palette, f.normal, (f.bias ?? 0) + (paint.bias ?? 0));
    const pts: Vec2[] = f.pts.map((p) => ctx.p(p));
    const depth =
      paint.groupDepth === undefined
        ? depthOf(f.centroid)
        : paint.groupDepth + index * FACE_STEP;
    out.push({
      layer: paint.layer ?? 'main',
      depth: depth + (paint.depthOffset ?? 0),
      shape: poly(pts),
      paint: { color: fade(color, alpha), dither: paint.dither },
      ...(paint.edge ? { outline: { color: fade(paint.edge, alpha) } } : {}),
      ...(paint.tag ? { tag: paint.tag } : {}),
    });
  });
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

/**
 * Plaques inserees dans une face quadrilaterale, en coordonnees
 * parametriques `[u0, v0, u1, v1]` de la face. Sert a poser des eclats et des
 * cassures sur une grande face plane : sans elles, une face superieure de
 * dalle est un aplat, et la pierre se lit comme du carton.
 */
export function patches(
  face: Face,
  rects: readonly (readonly [number, number, number, number])[],
  bias = 0.3,
): Face[] {
  if (face.pts.length !== 4) return [];
  const [a, b, c, d] = face.pts as [Vec3, Vec3, Vec3, Vec3];
  // Repere de la face : u le long de a->b, v le long de a->d.
  const at = (u: number, v: number): Vec3 => ({
    x: a.x + (b.x - a.x) * u + (d.x - a.x) * v,
    y: a.y + (b.y - a.y) * u + (d.y - a.y) * v,
    z: a.z + (b.z - a.z) * u + (d.z - a.z) * v,
  });
  void c;
  return rects.map(([u0, v0, u1, v1]) => ({
    pts: [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)],
    normal: face.normal,
    centroid: at((u0 + u1) / 2, (v0 + v1) / 2),
    bias,
  }));
}


export type Chunk = {
  readonly faces: Face[];
  readonly centre: Vec3;
  /** Position du morceau dans la grille de decoupe, dans [-1, 1]. */
  readonly offset: Vec3;
};

/**
 * Découpe une masse en morceaux selon une grille régulière.
 *
 * Les fragments sont donc réellement **dérivés de l'objet existant** : ils
 * occupent son volume, héritent de son orientation et de son matériau, et se
 * recollent exactement à l'instant de la rupture. Remplacer la masse par des
 * cailloux générés indépendamment donnerait un saut visible au moment du choc.
 *
 * Chaque morceau est lui-même un bloc irrégulier : découpés en boîtes, les
 * fragments formaient à l'atterrissage un pavage de tuiles plates dont toutes
 * les arêtes restaient parallèles.
 */
export function shatterVolume(
  center: Vec3,
  right: Vec3,
  forward: Vec3,
  up: Vec3,
  nx: number,
  ny: number,
  nz: number,
  seed: number,
  roughness = 0.3,
): Chunk[] {
  const out: Chunk[] = [];
  const half = Math.min(len3(right) / nx, len3(forward) / ny, len3(up) / nz);
  let index = 0;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      for (let k = 0; k < nz; k++) {
        const ox = (2 * i + 1) / nx - 1;
        const oy = (2 * j + 1) / ny - 1;
        const oz = (2 * k + 1) / nz - 1;
        const centre = add3(
          center,
          add3(scale3(right, ox), add3(scale3(forward, oy), scale3(up, oz))),
        );
        out.push({
          faces: rockLump(centre, half * 1.3, 5, seed + index * 601, 0.9, roughness),
          centre,
          offset: { x: ox, y: oy, z: oz },
        });
        index++;
      }
    }
  }
  return out;
}

/**
 * Bloc rocheux irrégulier : quatre couronnes bruitées, tronquées en haut et
 * en bas.
 *
 * Deux écueils à éviter, tous deux constatés à l'écran. Une boîte à six faces
 * se lit toujours comme une boîte : ses trois directions d'arêtes restent
 * parallèles et l'œil les reconstruit. Et un éventail de triangles convergeant
 * vers un sommet unique dessine un parasol — la régularité du faisceau est
 * immédiatement visible.
 *
 * D'où la troncature : des faces franches au sommet et à la base, des
 * couronnes décalées latéralement les unes par rapport aux autres et des
 * roulis différents, de sorte qu'aucune arête n'en prolonge une autre.
 *
 * `squash` < 1 aplatit le bloc, `sides` règle le nombre de facettes par
 * couronne : 6 donne un éclat anguleux, 9 un galet.
 */
export function rockLump(
  center: Vec3,
  radius: number,
  sides: number,
  seed: number,
  squash = 1,
  roughness = 0.34,
): Face[] {
  const axis: Vec3 = { x: 0, y: 0, z: 1 };
  const height = radius * squash;
  const band = (index: number, z: number, r: number): Vec3[] => {
    // Chaque couronne dérive un peu sur le côté : le bloc devient bancal.
    const centre = add3(center, {
      x: randSigned(seed, index, 88, radius * 0.16),
      y: randSigned(seed, index, 89, radius * 0.16),
      z: height * (z + randSigned(seed, index, 90, 0.08)),
    });
    return ring(
      centre,
      axis,
      radius * r,
      sides,
      randSigned(seed, index, 91, Math.PI),
      (i) => 1 + randSigned(seed, i + index * 41, 92, roughness),
    );
  };
  const top = band(0, 0.96, 0.36);
  const upper = band(1, 0.4, 0.88);
  const lower = band(2, -0.42, 0.8);
  const bottom = band(3, -0.96, 0.32);
  return [
    cap(top),
    ...bridge(top, upper),
    ...bridge(upper, lower),
    ...bridge(lower, bottom),
    cap([...bottom].reverse(), 0.2),
  ];
}
