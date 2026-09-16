/**
 * Contrat des tampons dessines.
 *
 * Le passage au pixel art dessine ne vaut que si les dessins tiennent les
 * proprietes que la projection ne savait pas tenir. Ces tests les mesurent
 * plutot que de les supposer : irregularite du contour, connexite, et
 * preservation exacte des pixels au placement.
 */

import { describe, expect, it } from 'vitest';
import { FIRE_STAMPS } from '../src/art/fireStamps.js';
import { forEachStampPixel, mirrorPairs, placementBounds, type Stamp } from '../src/art/stamp.js';

/** Longueurs de marche des deux contours lateraux, separement. */
function contourRuns(s: Stamp): number[][] {
  const left: number[] = [];
  const right: number[] = [];
  for (let y = 0; y < s.height; y++) {
    let a = -1;
    let b = -1;
    for (let x = 0; x < s.width; x++) {
      if ((s.pixels[y * s.width + x] ?? 0) !== 0) {
        if (a < 0) a = x;
        b = x;
      }
    }
    if (a < 0) continue;
    left.push(a);
    right.push(b);
  }
  return [left, right].map((side) => {
    const runs: number[] = [];
    let run = 1;
    for (let i = 1; i < side.length; i++) {
      if (side[i] === side[i - 1]) run++;
      else {
        runs.push(run);
        run = 1;
      }
    }
    runs.push(run);
    return runs;
  });
}

/**
 * Inversions de sens dans la suite des longueurs de marche.
 *
 * Mesurer simplement le changement de longueur serait faux : un cercle
 * dessine a la main avance en 1,1,1,5,1,1,1 — la longueur change partout,
 * et c'est la courbure, pas du bruit. Ce qui distingue une arete projetee
 * d'un trait dessine, c'est qu'elle **oscille** : 4,2,3,1,3. On compte donc
 * les inversions de sens. Une silhouette fermee en impose une par cote
 * (elle s'elargit puis se retrecit) : c'est le plancher, pas un defaut.
 */
function excessReversals(runs: number[]): { rev: number; cmp: number } {
  let rev = 0;
  let cmp = 0;
  let last = 0;
  for (let i = 1; i < runs.length; i++) {
    const sign = Math.sign((runs[i] ?? 0) - (runs[i - 1] ?? 0));
    if (sign === 0) continue;
    cmp++;
    if (last !== 0 && sign !== last) rev++;
    last = sign;
  }
  return { rev, cmp };
}

function componentCount(s: Stamp): number {
  const seen = new Uint8Array(s.width * s.height);
  let count = 0;
  for (let i = 0; i < seen.length; i++) {
    if ((s.pixels[i] ?? 0) === 0 || seen[i]) continue;
    count++;
    const stack = [i];
    seen[i] = 1;
    while (stack.length > 0) {
      const p = stack.pop() as number;
      const x = p % s.width;
      const y = (p / s.width) | 0;
      const neighbours: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dy] of neighbours) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= s.width || ny >= s.height) continue;
        const q = ny * s.width + nx;
        if (seen[q] || (s.pixels[q] ?? 0) === 0) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
  }
  return count;
}

describe('tampons', () => {
  it('ont des rangees de largeur uniforme et une ancre dans la grille', () => {
    for (const s of FIRE_STAMPS) {
      expect(s.pixels.length).toBe(s.width * s.height);
      expect(s.anchor.x).toBeGreaterThanOrEqual(0);
      expect(s.anchor.x).toBeLessThan(s.width);
      expect(s.anchor.y).toBeGreaterThanOrEqual(0);
      expect(s.anchor.y).toBeLessThan(s.height);
    }
  });

  it('sont d\'un seul tenant', () => {
    for (const s of FIRE_STAMPS) {
      expect(`${s.id}:${componentCount(s)}`).toBe(`${s.id}:1`);
    }
  });

  it('ont un contour qui n\'oscille pas', () => {
    // Une silhouette fermee inverse au moins une fois par cote ; on mesure
    // donc l'exces. Mesures faites avec la meme fonction :
    //
    //   rendus projetes, six sorts x quatre instants : 0,57 a 0,82
    //   tampons dessines                             : 0,00 a 0,11
    //
    // Le seuil est pose dans l'ecart, loin des deux groupes. Il n'est pas
    // ramene a zero : une langue de feu a une pointe effilee puis un ventre,
    // ce qui fait legitimement une inversion de plus qu'une masse ronde.
    // Serrer le seuil reviendrait a tordre le dessin pour la mesure.
    for (const s of FIRE_STAMPS) {
      if (s.height < 5) continue;
      let rev = 0;
      let cmp = 0;
      for (const runs of contourRuns(s)) {
        const m = excessReversals(runs);
        rev += m.rev;
        cmp += m.cmp;
      }
      const excess = Math.max(0, rev - 2) / Math.max(1, cmp);
      expect(`${s.id}:${excess <= 0.2}`).toBe(`${s.id}:true`);
    }
  });

  it('preservent exactement les pixels au placement entier', () => {
    for (const s of FIRE_STAMPS) {
      for (const scale of [1, 2, 3]) {
        let n = 0;
        forEachStampPixel({ stamp: s, x: 40, y: 40, scale }, () => n++);
        let filled = 0;
        for (let i = 0; i < s.pixels.length; i++) if ((s.pixels[i] ?? 0) !== 0) filled++;
        expect(n).toBe(filled * scale * scale);
      }
    }
  });

  it('miroitent sans perdre ni dupliquer de pixel', () => {
    for (const s of FIRE_STAMPS) {
      const direct = new Set<string>();
      forEachStampPixel({ stamp: s, x: 40, y: 40 }, (x, y) => direct.add(`${x},${y}`));
      const flipped = new Set<string>();
      forEachStampPixel({ stamp: s, x: 40, y: 40, flipX: true }, (x, y) => flipped.add(`${x},${y}`));
      expect(flipped.size).toBe(direct.size);
      // L'ancre est le point fixe du miroir : elle appartient aux deux, ou a
      // aucun des deux.
      const b = placementBounds({ stamp: s, x: 40, y: 40 });
      expect(b.x1 - b.x0).toBe(s.width - 1);
    }
  });

  it('ramenent huit caps a cinq dessins', () => {
    const pairs = mirrorPairs(8);
    expect(pairs.length).toBe(8);
    const drawn = new Set(pairs.filter((p) => !p.flip).map((p) => p.source));
    expect(drawn.size).toBe(5);
    // Un cap miroir renvoie bien vers un cap dessine.
    for (const p of pairs) expect(drawn.has(p.source)).toBe(true);
  });
});
