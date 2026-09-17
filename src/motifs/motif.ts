/**
 * `PixelMotif` — motif pixel art **dessiné** (§5.B).
 *
 * Un motif n'est pas une image d'animation : c'est un mot du vocabulaire.
 * Dessiner chaque image de chaque cap donnerait douze images × huit caps ×
 * neuf sorts ≈ 864 dessins ; c'est la composition qui anime.
 *
 * Un motif est écrit en ASCII, une ligne par rangée, et chaque caractère
 * désigne un **rôle** de palette — pas une couleur. Le même dessin sert donc
 * à plusieurs matières, et une correction de palette ne demande pas de
 * redessiner.
 *
 *     '.' ou ' '  vide          'd'  ombre profonde
 *     '-'  contour              's'  ombre
 *     'b'  corps                'l'  lumière
 *     'a'  accent
 *
 * Un motif déclare aussi sa **capacité directionnelle** (§6) : le moteur ne
 * fabrique pas magiquement des caps qu'un dessin ne possède pas.
 */

import type { MaterialId, RoleId } from '../pixels/palette.js';

/** Ce qu'un motif sait faire quand on lui demande un cap. */
export type DirectionalCapability =
  /** La structure est reconstruite et rastérisée pour chaque cap. */
  | 'procedural'
  /** Le motif possède 8 jeux de dessins. */
  | 'drawn-8'
  /** Le motif possède 16 jeux de dessins. */
  | 'drawn-16'
  /** Le dessin fait face à la caméra, son point d'attache vit dans le monde. */
  | 'billboard'
  /** Rendu partageable entre caps, invariance réelle et vérifiée. */
  | 'radial';

export type MotifInk = {
  readonly role: RoleId;
  /** Matière de ce caractère. Absente = matière par défaut du motif. */
  readonly material?: MaterialId;
};

export type MotifFrame = {
  readonly width: number;
  readonly height: number;
  /** Code par pixel : 0 = vide, sinon index+1 dans `inks`. */
  readonly cells: Uint8Array;
  /** Exposition propre au motif, si le motif s'anime seul. */
  readonly durationMs?: number;
};

export type PixelMotif = {
  readonly id: string;
  readonly version: number;
  readonly label: string;
  readonly material: MaterialId;
  readonly inks: readonly MotifInk[];
  readonly frames: readonly MotifFrame[];
  /** Point du dessin posé sur la position demandée. */
  readonly pivot: { readonly x: number; readonly y: number };
  /** Points d'attache nommés, en pixels du dessin. */
  readonly attach: Readonly<Record<string, { readonly x: number; readonly y: number }>>;
  readonly directional: DirectionalCapability;
  /** Transformations autorisées. La rotation libre ne l'est jamais. */
  readonly transforms: { readonly flipX: boolean; readonly flipY: boolean; readonly scale: boolean };
  /** Origine et droits. Tous les motifs livrés sont originaux. */
  readonly provenance: string;
};

const DEFAULT_CHARS: Readonly<Record<string, RoleId>> = {
  '-': 'outline',
  d: 'deep',
  s: 'shadow',
  b: 'body',
  l: 'light',
  a: 'accent',
};

export type MotifSpec = {
  readonly label: string;
  readonly material: MaterialId;
  readonly frames: readonly (readonly string[])[];
  readonly pivot?: { x: number; y: number };
  readonly attach?: Record<string, { x: number; y: number }>;
  readonly directional?: DirectionalCapability;
  readonly transforms?: { flipX?: boolean; flipY?: boolean; scale?: boolean };
  /** Caractères supplémentaires : matière ou rôle particulier. */
  readonly ink?: Readonly<Record<string, MotifInk>>;
  readonly durationsMs?: readonly number[];
  readonly provenance?: string;
  readonly version?: number;
};

/** Compile un motif écrit en ASCII. Toute incohérence est une erreur. */
export function motif(id: string, spec: MotifSpec): PixelMotif {
  const inks: MotifInk[] = [];
  const codeOf = new Map<string, number>();
  const resolve = (ch: string): number => {
    const known = codeOf.get(ch);
    if (known !== undefined) return known;
    const custom = spec.ink?.[ch];
    const role = custom?.role ?? DEFAULT_CHARS[ch];
    if (!role) throw new Error(`Motif "${id}" : caractère inconnu "${ch}"`);
    const ink: MotifInk = custom ?? { role };
    inks.push(ink);
    const code = inks.length;
    codeOf.set(ch, code);
    return code;
  };

  const frames: MotifFrame[] = spec.frames.map((rows, fi) => {
    const height = rows.length;
    if (height === 0) throw new Error(`Motif "${id}" : image ${fi} vide`);
    const width = rows[0]?.length ?? 0;
    const cells = new Uint8Array(width * height);
    rows.forEach((row, y) => {
      if (row.length !== width) {
        throw new Error(
          `Motif "${id}" image ${fi} : la rangée ${y} fait ${row.length} caractères au lieu de ${width}`,
        );
      }
      for (let x = 0; x < width; x++) {
        const ch = row[x] as string;
        if (ch === '.' || ch === ' ') continue;
        cells[y * width + x] = resolve(ch);
      }
    });
    const duration = spec.durationsMs?.[fi];
    return duration === undefined ? { width, height, cells } : { width, height, cells, durationMs: duration };
  });

  const first = frames[0] as MotifFrame;
  return {
    id,
    version: spec.version ?? 1,
    label: spec.label,
    material: spec.material,
    inks,
    frames,
    pivot: spec.pivot ?? { x: Math.floor(first.width / 2), y: Math.floor(first.height / 2) },
    attach: spec.attach ?? {},
    directional: spec.directional ?? 'billboard',
    transforms: {
      flipX: spec.transforms?.flipX ?? true,
      flipY: spec.transforms?.flipY ?? false,
      scale: spec.transforms?.scale ?? true,
    },
    provenance: spec.provenance ?? 'Original MOTORFX2 — dessiné pour ce dépôt',
  };
}

export type MotifPlacement = {
  /** Position de l'ancre, en pixels écran. Arrondie au placement. */
  readonly x: number;
  readonly y: number;
  readonly frame?: number;
  /** Agrandissement entier. Toute autre valeur casserait les pixels. */
  readonly scale?: number;
  readonly flipX?: boolean;
  readonly flipY?: boolean;
};

export function frameOf(m: PixelMotif, index = 0): MotifFrame {
  const n = m.frames.length;
  const i = Math.max(0, Math.min(n - 1, Math.round(index)));
  return m.frames[i] as MotifFrame;
}

/** Rectangle occupé par un placement, sans rastériser. */
export function motifBounds(
  m: PixelMotif,
  p: MotifPlacement,
): { x0: number; y0: number; x1: number; y1: number } {
  const f = frameOf(m, p.frame ?? 0);
  const s = Math.max(1, Math.round(p.scale ?? 1));
  const ax = p.flipX ? f.width - 1 - m.pivot.x : m.pivot.x;
  const ay = p.flipY ? f.height - 1 - m.pivot.y : m.pivot.y;
  const x0 = Math.round(p.x) - ax * s;
  const y0 = Math.round(p.y) - ay * s;
  return { x0, y0, x1: x0 + f.width * s - 1, y1: y0 + f.height * s - 1 };
}

/** Parcourt les pixels pleins d'un placement, en coordonnées écran. */
export function forEachMotifPixel(
  m: PixelMotif,
  p: MotifPlacement,
  visit: (x: number, y: number, ink: MotifInk) => void,
): void {
  const f = frameOf(m, p.frame ?? 0);
  const s = Math.max(1, Math.round(p.scale ?? 1));
  const { x0, y0 } = motifBounds(m, p);
  if (p.flipX && !m.transforms.flipX) throw new Error(`Motif "${m.id}" : miroir horizontal non autorisé`);
  if (p.flipY && !m.transforms.flipY) throw new Error(`Motif "${m.id}" : miroir vertical non autorisé`);
  if (s > 1 && !m.transforms.scale) throw new Error(`Motif "${m.id}" : agrandissement non autorisé`);
  for (let sy = 0; sy < f.height; sy++) {
    for (let sx = 0; sx < f.width; sx++) {
      const srcX = p.flipX ? f.width - 1 - sx : sx;
      const srcY = p.flipY ? f.height - 1 - sy : sy;
      const code = f.cells[srcY * f.width + srcX] ?? 0;
      if (code === 0) continue;
      const ink = m.inks[code - 1] as MotifInk;
      for (let dy = 0; dy < s; dy++) {
        for (let dx = 0; dx < s; dx++) {
          visit(x0 + sx * s + dx, y0 + sy * s + dy, ink);
        }
      }
    }
  }
}

/**
 * Les huit caps standards se ramènent à cinq dessins.
 *
 * Dans cette projection, `screenX ∝ cos θ − sin θ` et `screenY ∝ cos θ + sin θ`.
 * Pour θ' = π/2 − θ on obtient `screenX' = −screenX` et `screenY' = screenY` :
 * les deux caps sont symétriques par miroir vertical. Le miroir n'est
 * autorisé que si la ressource le déclare et si lumière, asymétrie et
 * attaches restent correctes (§6).
 */
export function mirrorPairs(count: number): { source: number; flip: boolean }[] {
  const out: { source: number; flip: boolean }[] = [];
  const seen = new Map<number, number>();
  for (let i = 0; i < count; i++) {
    const partner = (((count / 4 - i) % count) + count) % count;
    const known = seen.get(partner);
    if (known !== undefined && partner !== i) {
      out.push({ source: known, flip: true });
    } else {
      seen.set(i, i);
      out.push({ source: i, flip: false });
    }
  }
  return out;
}
