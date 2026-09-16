/**
 * Tampons pixel art.
 *
 * Le moteur a longtemps essayé de fabriquer lui-même ses pixels, en projetant
 * de la géométrie. Mesure faite sur le contour supérieur des sprites : près
 * d'une marche d'escalier sur deux changeait de longueur par rapport à la
 * précédente, là où un contour dessiné à la main avance par paliers réguliers
 * et reste sous 20 %. Ce bruit est structurel — une arête projetée à un angle
 * quelconque n'a aucune longueur de marche « voulue » à restituer — et aucun
 * post-traitement ne peut l'inventer.
 *
 * D'où ce module : les silhouettes sont **dessinées**, et le moteur ne fait
 * que les placer. Le procédural reste là où il a de la valeur — trajectoires,
 * cap, rythme, événements, export — et la matière vient du dessin.
 *
 * Règles qui garantissent que les pixels dessinés restent intacts :
 *
 *  - placement à des coordonnées **entières** ;
 *  - agrandissement **entier** uniquement ;
 *  - miroir horizontal autorisé, rotation jamais.
 *
 * Le miroir suffit à couvrir huit caps avec cinq dessins : dans cette
 * projection, les caps θ et π/2 − θ sont exactement symétriques à l'écran
 * (voir `mirrorPairs`).
 */

/** Grille d'un tampon. 0 = vide ; 1 = matière ; 2 et 3 = accents plus chauds. */
export type Stamp = {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  /** Point du tampon posé sur la position demandée. */
  readonly anchor: { readonly x: number; readonly y: number };
  readonly pixels: Uint8Array;
};

/**
 * Lit un tampon écrit en ASCII, une ligne par rangée.
 *
 *   `.` ou espace : vide
 *   `#` : matière
 *   `+` : accent chaud
 *   `*` : accent très chaud
 *
 * L'ancre vaut par défaut le centre de la grille, ce qui convient à un corps
 * posé sur une position ; un objet posé au sol déclare la sienne.
 */
export function stamp(
  id: string,
  rows: readonly string[],
  anchor?: { x: number; y: number },
): Stamp {
  const height = rows.length;
  const width = Math.max(0, ...rows.map((r) => r.length));
  const pixels = new Uint8Array(width * height);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const v = ch === '#' ? 1 : ch === '+' ? 2 : ch === '*' ? 3 : 0;
      pixels[y * width + x] = v;
    }
  });
  // Une ligne plus courte que les autres serait un tampon tronqué en silence.
  for (const row of rows) {
    if (row.length !== width && row.trim().length > 0 && row.length !== 0) {
      if (row.length < width) {
        throw new Error(
          `Tampon "${id}" : une rangée fait ${row.length} caractères au lieu de ${width}.`,
        );
      }
    }
  }
  return {
    id,
    width,
    height,
    anchor: anchor ?? { x: Math.floor(width / 2), y: Math.floor(height / 2) },
    pixels,
  };
}

export type StampPlacement = {
  readonly stamp: Stamp;
  /** Position de l'ancre, en pixels écran. Arrondie au placement. */
  readonly x: number;
  readonly y: number;
  /** Agrandissement entier. Toute autre valeur casserait les pixels. */
  readonly scale?: number;
  readonly flipX?: boolean;
};

/** Rectangle occupé par un placement, sans rastériser. */
export function placementBounds(p: StampPlacement): {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} {
  const s = Math.max(1, Math.round(p.scale ?? 1));
  const ax = p.flipX ? p.stamp.width - 1 - p.stamp.anchor.x : p.stamp.anchor.x;
  const x0 = Math.round(p.x) - ax * s;
  const y0 = Math.round(p.y) - p.stamp.anchor.y * s;
  return { x0, y0, x1: x0 + p.stamp.width * s - 1, y1: y0 + p.stamp.height * s - 1 };
}

/** Parcourt les pixels pleins d'un placement, en coordonnées écran. */
export function forEachStampPixel(
  p: StampPlacement,
  visit: (x: number, y: number, value: number) => void,
): void {
  const s = Math.max(1, Math.round(p.scale ?? 1));
  const { x0, y0 } = placementBounds(p);
  const w = p.stamp.width;
  for (let sy = 0; sy < p.stamp.height; sy++) {
    for (let sx = 0; sx < w; sx++) {
      const src = p.flipX ? w - 1 - sx : sx;
      const v = p.stamp.pixels[sy * w + src] ?? 0;
      if (v === 0) continue;
      for (let dy = 0; dy < s; dy++) {
        for (let dx = 0; dx < s; dx++) {
          visit(x0 + sx * s + dx, y0 + sy * s + dy, v);
        }
      }
    }
  }
}

/**
 * Les huit caps standards se ramènent à cinq dessins.
 *
 * Dans cette projection, `screenX ∝ cos θ − sin θ` et `screenY ∝ cos θ + sin θ`.
 * Pour θ' = π/2 − θ on obtient exactement `screenX' = −screenX` et
 * `screenY' = screenY` : les deux caps sont symétriques par miroir vertical.
 * C'est la raison pour laquelle les jeux 16 bits ne dessinaient que cinq
 * orientations sur huit.
 *
 * Renvoie, pour chaque index de cap, le dessin à utiliser et s'il faut le
 * retourner.
 */
export function mirrorPairs(count: number): { source: number; flip: boolean }[] {
  const out: { source: number; flip: boolean }[] = [];
  const seen = new Map<number, number>();
  for (let i = 0; i < count; i++) {
    // θ = 2πi/N ; le partenaire miroir est π/2 − θ, soit l'index N/4 − i.
    const partner = ((count / 4 - i) % count + count) % count;
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
