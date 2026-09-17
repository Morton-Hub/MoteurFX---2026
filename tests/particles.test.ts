import { describe, expect, it } from 'vitest';
import { emitParticles, clusterMask } from '../src/geometry/particles.js';
import { makeFrameContext } from '../src/renderer/context.js';
import { makeStage } from '../src/renderer/stage.js';
import { makeBudget, partition } from '../src/animation/budget.js';
import { RECIPES } from '../src/recipes/catalogue.js';
import { clipOf } from './helpers.js';
import type { IndexedCanvas } from '../src/pixels/canvas.js';

const stage = makeStage({ width: 128, height: 128, distance: 2, heading: 0.7, seed: 99 });
const budget = makeBudget({
  frameDurationsMs: new Array(12).fill(60),
  clips: partition([{ role: 'hit', frames: 12, anchor: 'target' }]),
});
const ctx = makeFrameContext(stage, budget, 5);

const emitter = {
  id: 'test/spray',
  at: { x: 0, y: 0, z: 0.5 },
  count: 12,
  life: 0.8,
  speed: [1, 3] as const,
  spread: 1.2,
  gravity: 2,
  drag: 1.5,
};

describe('particules', () => {
  it('sont déterministes : même instant, mêmes positions', () => {
    const a = emitParticles(ctx, emitter, 0.4);
    const b = emitParticles(ctx, emitter, 0.4);
    expect(b.map((p) => [p.position.x, p.position.y, p.position.z])).toEqual(
      a.map((p) => [p.position.x, p.position.y, p.position.z]),
    );
  });

  it('sont analytiques : sauter à un instant donne le même état qu’y arriver', () => {
    // Aucune accumulation : l'état à t ne dépend d'aucun appel précédent.
    const direct = emitParticles(ctx, emitter, 0.62);
    for (const t of [0.1, 0.2, 0.3, 0.4, 0.5]) emitParticles(ctx, emitter, t);
    const after = emitParticles(ctx, emitter, 0.62);
    expect(after.map((p) => p.position.z)).toEqual(direct.map((p) => p.position.z));
  });

  it('naissent et meurent : rien avant la fenêtre, rien après la vie', () => {
    const withBirth = { ...emitter, birth: [0.3, 0.6] as const, life: 0.2 };
    expect(emitParticles(ctx, withBirth, 0.1)).toHaveLength(0);
    expect(emitParticles(ctx, withBirth, 0.45).length).toBeGreaterThan(0);
    expect(emitParticles(ctx, withBirth, 0.95)).toHaveLength(0);
  });

  it('ajouter une particule ne déplace pas les autres', () => {
    const before = emitParticles(ctx, { ...emitter, count: 6 }, 0.4);
    const after = emitParticles(ctx, { ...emitter, count: 7 }, 0.4);
    // Les tirages sont indexés : les six premières gardent leur trajectoire.
    for (let i = 0; i < before.length; i++) {
      expect(after[i]?.variation).toBe(before[i]?.variation);
    }
  });

  it('un amas fait au moins quatre pixels contigus', () => {
    for (const radius of [0, 1, 2, 3]) {
      const mask = clusterMask(ctx, { x: 40, y: 40 }, radius);
      expect(mask.count()).toBeGreaterThanOrEqual(4);
    }
  });
});

/**
 * Matières posées au sol : elles sont **tramées par construction**, faute
 * d'alpha partiel dans un sprite indexé. Les compter reviendrait à mesurer le
 * damier, pas la matière volante, qui est le sujet de la règle.
 */
const GROUND_MATERIALS = new Set([
  'shared.shadow',
  'fire.scorch',
  'lightning.scorch',
  'ice.frost',
  'fire.smoke',
  'ice.mist',
]);

/**
 * Composantes connexes de la matière non tramée, en voisinage **8**.
 *
 * Le voisinage compte : une diagonale d'un pixel — une fissure, une branche de
 * décharge, une traînée d'étincelle — est une forme continue pour l'œil, mais
 * une suite de points isolés en voisinage 4. Mesurée ainsi, la règle
 * condamnerait précisément les traits que le pixel art dessine à la main.
 */
function components(canvas: IndexedCanvas): number[] {
  const solid = new Uint8Array(canvas.data.length);
  for (let i = 0; i < canvas.data.length; i++) {
    const ink = canvas.data[i] ?? 0;
    if (ink === 0) continue;
    const entry = canvas.table.entryAt(ink);
    if (!entry || GROUND_MATERIALS.has(entry.materialId)) continue;
    solid[i] = 1;
  }
  return componentsOf(solid, canvas.width, canvas.height);
}

function componentsOf(data: Uint8Array, width: number, height: number): number[] {
  const seen = new Uint8Array(width * height);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (seen[start] === 1 || data[start] === 0) continue;
      let size = 0;
      stack.push(start);
      seen[start] = 1;
      while (stack.length > 0) {
        const index = stack.pop() as number;
        size++;
        const cx = index % width;
        const cy = (index - cx) / width;
        const neighbours: number[] = [];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            neighbours.push(nx < 0 || ny < 0 || nx >= width || ny >= height ? -1 : ny * width + nx);
          }
        }
        for (const n of neighbours) {
          if (n < 0 || seen[n] === 1 || data[n] === 0) continue;
          seen[n] = 1;
          stack.push(n);
        }
      }
      sizes.push(size);
    }
  }
  return sizes;
}

describe('règle des formes épaisses', () => {
  it('aucune image ne se disperse en poussière d’un pixel', () => {
    for (const def of RECIPES) {
      for (const frame of clipOf(def.id)) {
        const sizes = components(frame.body);
        if (sizes.length === 0) continue;
        const dust = sizes.filter((s) => s <= 1).length;
        // Un pixel **isolé** disparaît à la lecture et grésille en mouvement.
        // La règle porte sur leur nombre absolu : une image clairsemée a le
        // droit d'avoir trois formes dont un accent, une image chargée n'a pas
        // le droit de se dissoudre en poussière.
        // Plafonds mesurés sur le catalogue d'aujourd'hui, avec un peu de
        // marge. Ils servent de garde-fou contre une dérive — une image qui se
        // dissoudrait en centaines de points — pas de norme absolue.
        expect(dust, `${def.id} image ${frame.index}`).toBeLessThanOrEqual(32);
      }
    }
  });

  it('aucune image ne dépasse un nombre de formes lisible', () => {
    // Le plafond est celui que le catalogue tient aujourd'hui, avec un peu de
    // marge : il sert de garde-fou contre une dérive, pas de norme absolue.
    // Il tient compte des motifs volontairement rayonnants — un éventail de
    // fracture est fait de branches séparées, c'est son dessin.
    for (const def of RECIPES) {
      for (const frame of clipOf(def.id)) {
        const sizes = components(frame.body);
        expect(sizes.length, `${def.id} image ${frame.index}`).toBeLessThanOrEqual(56);
      }
    }
  });
});
