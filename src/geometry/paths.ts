/**
 * Trajectoires monde.
 *
 * Le cap horizontal, l'inclinaison et la hauteur sont trois choses
 * distinctes (§7). Une trajectoire ne connaît ni la frame ni l'exposition :
 * elle répond à une progression sur [0,1], ce qui rend le scrubbing exact.
 */

import { add3, bezier3, bezier3Tangent, lerp, lerp3, norm3, type Vec3 } from '../core/math.js';

export type Trajectory = {
  readonly at: (t: number) => Vec3;
  readonly tangent: (t: number) => Vec3;
};

/** Ligne droite, éventuellement cambrée vers le haut. */
export function lineTrajectory(from: Vec3, to: Vec3, arcHeight = 0): Trajectory {
  if (arcHeight === 0) {
    const dir = norm3({ x: to.x - from.x, y: to.y - from.y, z: to.z - from.z });
    return { at: (t) => lerp3(from, to, t), tangent: () => dir };
  }
  const mid: Vec3 = {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
    z: (from.z + to.z) / 2 + arcHeight * 2,
  };
  return {
    at: (t) => bezier3(from, mid, to, t),
    tangent: (t) => norm3(bezier3Tangent(from, mid, to, t)),
  };
}

/** Arrivée du ciel : une masse qui tombe, avec une inclinaison choisie. */
export function skyFall(target: Vec3, height: number, lean: Vec3, leanDistance: number): Trajectory {
  const start: Vec3 = add3(target, {
    x: lean.x * leanDistance,
    y: lean.y * leanDistance,
    z: height,
  });
  const dir = norm3({ x: target.x - start.x, y: target.y - start.y, z: target.z - start.z });
  return {
    at: (t) => {
      // Accélération : les espacements sont petits au début, grands ensuite.
      const k = t * t;
      return lerp3(start, target, k);
    },
    tangent: () => dir,
  };
}

/** Jaillissement : sortie du sol, puis retombée. */
export function riseAndFall(ground: Vec3, height: number, apexAt = 0.55): Trajectory {
  return {
    at: (t) => {
      const k = t <= apexAt ? t / apexAt : 1 - (t - apexAt) / (1 - apexAt);
      const eased = k < 0 ? 0 : k > 1 ? 1 : k;
      return { x: ground.x, y: ground.y, z: ground.z + height * eased * (2 - eased) };
    },
    tangent: (t) => (t <= apexAt ? { x: 0, y: 0, z: 1 } : { x: 0, y: 0, z: -1 }),
  };
}

/** Rebond amorti sur le sol, pour les fragments lourds. */
export function bounce(from: Vec3, dir: Vec3, speed: number, gravity: number, restitution = 0.35) {
  return (t: number): Vec3 => {
    let z = from.z + dir.z * speed * t - 0.5 * gravity * t * t;
    let vx = dir.x * speed;
    let vy = dir.y * speed;
    let x = from.x + vx * t;
    let y = from.y + vy * t;
    if (z < 0) {
      // Rebond : la suite du mouvement est amortie, pas interrompue.
      const tHit = (dir.z * speed + Math.sqrt(Math.max(0, (dir.z * speed) ** 2 + 2 * gravity * from.z))) / gravity;
      const after = Math.max(0, t - tHit);
      const vz = (dir.z * speed - gravity * tHit) * -restitution;
      z = Math.max(0, vz * after - 0.5 * gravity * after * after);
      vx *= restitution + 0.4;
      vy *= restitution + 0.4;
      x = from.x + dir.x * speed * tHit + vx * after;
      y = from.y + dir.y * speed * tHit + vy * after;
    }
    return { x, y, z };
  };
}

/** Interpolation d'un cap : sert au homing sans saut de phase. */
export function blendHeading(from: number, to: number, t: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * lerp(0, 1, t);
}
