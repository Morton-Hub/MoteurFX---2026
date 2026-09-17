/** Primitives géométriques. Unites monde: 1 unité = 1 tuile de sol. */

export type Vec2 = { x: number; y: number };
export type Vec3 = { x: number; y: number; z: number };

export const TAU = Math.PI * 2;

export const v2 = (x: number, y: number): Vec2 => ({ x, y });
export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const add3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale3 = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const len3 = (a: Vec3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export function norm3(a: Vec3): Vec3 {
  const l = len3(a);
  return l < 1e-9 ? { x: 0, y: 0, z: 0 } : { x: a.x / l, y: a.y / l, z: a.z / l };
}

export function cross3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

/** Rampe 0..1 sur [a,b], bornee. Renvoie 0 si b<=a. */
export function ramp(v: number, a: number, b: number): number {
  if (b <= a) return v >= b ? 1 : 0;
  return clamp01((v - a) / (b - a));
}

/** Fenetre 0->1->0 : montee sur [a,b], plateau [b,c], descente [c,d]. */
export function window4(v: number, a: number, b: number, c: number, d: number): number {
  if (v <= a || v >= d) return 0;
  if (v < b) return ramp(v, a, b);
  if (v <= c) return 1;
  return 1 - ramp(v, c, d);
}

// --- Courbes d'interpolation. Nommees par intention, pas par formule. ---
export const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
export const easeIn = (t: number): number => t * t;
export const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
/** Depart très sec puis arret long : arrivees de glace, décharges. */
export const easeOutExpo = (t: number): number => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
/** Inertie lourde : blocs de terre. */
export const easeOutHeavy = (t: number): number => 1 - (1 - t) ** 3;
export const easeInHeavy = (t: number): number => t * t * t;
/** Depassement puis retour, pour les surgissements. */
export function easeBack(t: number, amount = 1.7): number {
  const c = amount + 1;
  return 1 + c * (t - 1) ** 3 + amount * (t - 1) ** 2;
}

/** Angle signe le plus court entre deux caps (radians). */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Normalise un angle dans [0, TAU). */
export function normAngle(a: number): number {
  const r = a % TAU;
  return r < 0 ? r + TAU : r;
}

/** Plus proche entier, en s'éloignant de zéro sur .5 (stable en miroir). */
export function snap(v: number): number {
  return v < 0 ? -Math.round(-v) : Math.round(v);
}

/** Interpolation lisse sans dépassement, utile aux poses tenues. */
export function smoothstep(a: number, b: number, v: number): number {
  const t = ramp(v, a, b);
  return t * t * (3 - 2 * t);
}

/** Point d'une Bézier quadratique. */
export function bezier3(a: Vec3, b: Vec3, c: Vec3, t: number): Vec3 {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * b.x + t * t * c.x,
    y: u * u * a.y + 2 * u * t * b.y + t * t * c.y,
    z: u * u * a.z + 2 * u * t * b.z + t * t * c.z,
  };
}

/** Tangente d'une Bézier quadratique (non normalisée). */
export function bezier3Tangent(a: Vec3, b: Vec3, c: Vec3, t: number): Vec3 {
  const u = 1 - t;
  return {
    x: 2 * (u * (b.x - a.x) + t * (c.x - b.x)),
    y: 2 * (u * (b.y - a.y) + t * (c.y - b.y)),
    z: 2 * (u * (b.z - a.z) + t * (c.z - b.z)),
  };
}
