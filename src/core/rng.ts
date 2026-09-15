/**
 * Aleatoire déterministe. Aucune seed ne dérive de l'horloge ni d'un index
 * de tableau : toujours de (seed projet, identifiant stable de noeud, index
 * semantique). Ajouter un élément decoratif ne doit pas decaler les tirages
 * des autres objets.
 */

/** Hash de chaine 32 bits (FNV-1a). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Melange entier 32 bits (splitmix32). */
export function mix32(x: number): number {
  let z = (x + 0x9e3779b9) | 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  return (z ^ (z >>> 15)) >>> 0;
}

/** Combine une seed de projet et un chemin de noeud en une seed stable. */
export function deriveSeed(projectSeed: number, path: string): number {
  return mix32(mix32(projectSeed) ^ hashString(path));
}

/** Generateur sequentiel. Reproductible a partir de la même seed. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  /** Flottant dans [0,1). */
  next(): number {
    this.state = mix32(this.state);
    return this.state / 4294967296;
  }

  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  /** Entier dans [lo, hi]. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  /** Bruit centre dans [-amp, amp]. */
  signed(amp: number): number {
    return (this.next() * 2 - 1) * amp;
  }

  bool(p = 0.5): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    const item = items[Math.floor(this.next() * items.length)];
    if (item === undefined) throw new Error('Rng.pick sur une liste vide');
    return item;
  }
}

/**
 * Tirage sans état : la valeur ne dépend que de (seed, index).
 * Indispensable pour l'evaluation analytique — un même grain garde ses
 * propriétés quel que soit l'instant échantillonné ou l'ordre de parcours.
 */
export function rand1(seed: number, index: number): number {
  return mix32(seed ^ mix32(index * 0x27d4eb2d)) / 4294967296;
}

/** Plusieurs canaux indépendants pour un même grain. */
export function randN(seed: number, index: number, channel: number): number {
  return mix32(mix32(seed ^ mix32(index * 0x27d4eb2d)) ^ mix32(channel * 0x165667b1)) / 4294967296;
}

/** Canal signe dans [-amp, amp]. */
export function randSigned(seed: number, index: number, channel: number, amp: number): number {
  return (randN(seed, index, channel) * 2 - 1) * amp;
}

/** Canal borne dans [lo, hi]. */
export function randRange(seed: number, index: number, channel: number, lo: number, hi: number): number {
  return lo + (hi - lo) * randN(seed, index, channel);
}
