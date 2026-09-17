import { describe, expect, it } from 'vitest';
import { RECIPES } from '../src/recipes/catalogue.js';
import { compileRecipe } from '../src/compiler/compile.js';
import { exportSpell, renderDirections } from '../src/exporter/pack.js';
import { FRAME_COUNT, totalDurationMs } from '../src/animation/budget.js';
import { loadProject, makeProject, saveProject } from '../src/exporter/project.js';
import { encodePng } from '../src/exporter/png.js';
import { Framebuffer } from '../src/pixels/rgba.js';

const fire = compileRecipe(RECIPES[0]!);

describe('export', () => {
  it('produit exactement douze cellules par direction', () => {
    const result = exportSpell({ recipe: fire, directions: 8 });
    expect(result.manifest.atlas.cells).toHaveLength(8 * FRAME_COUNT);
    expect(result.manifest.animation.framesPerDirection).toBe(FRAME_COUNT);
    expect(result.manifest.directions).toHaveLength(8);
    const cellsPerDirection = new Map<number, number>();
    for (const cell of result.manifest.atlas.cells) {
      cellsPerDirection.set(cell.direction, (cellsPerDirection.get(cell.direction) ?? 0) + 1);
    }
    expect([...cellsPerDirection.values()]).toEqual(new Array(8).fill(FRAME_COUNT));
  });

  it('les douze instants se correspondent entre directions et entre passes', () => {
    const result = exportSpell({ recipe: fire, directions: 8 });
    const byFrame = new Map<number, Set<number>>();
    for (const cell of result.manifest.atlas.cells) {
      const set = byFrame.get(cell.frame) ?? new Set<number>();
      set.add(cell.durationMs);
      byFrame.set(cell.frame, set);
    }
    for (const [frame, durations] of byFrame) {
      expect(durations.size, `frame ${frame}`).toBe(1);
      expect([...durations][0]).toBe(fire.budget.frameDurationsMs[frame]);
    }
    // La passe d'émission partage la grille du corps : elle n'ajoute pas
    // d'instants d'animation.
    const passes = result.manifest.passes.map((p) => p.name);
    expect(passes).toEqual(['body', 'emission']);
  });

  it('le manifeste déclare durées, rôles, événements et pivots', () => {
    const m = exportSpell({ recipe: fire, directions: 8 }).manifest;
    expect(m.animation.frameDurationsMs).toHaveLength(FRAME_COUNT);
    expect(m.animation.totalDurationMs).toBe(totalDurationMs(fire.budget));
    expect(m.animation.frameDurationsMs.every((d) => d > 0)).toBe(true);
    const covered = new Set<number>();
    for (const clip of m.clips) {
      for (let f = clip.range[0]; f <= clip.range[1]; f++) {
        expect(covered.has(f)).toBe(false);
        covered.add(f);
      }
    }
    expect(covered.size).toBe(FRAME_COUNT);
    for (const e of m.events) {
      expect(e.frame).toBeGreaterThanOrEqual(0);
      expect(e.frame).toBeLessThan(FRAME_COUNT);
      expect(e.timeMs).toBeLessThanOrEqual(m.animation.totalDurationMs);
    }
    expect(m.atlas.cells.every((c) => c.pivotX === m.capture.pivot.x)).toBe(true);
    expect(m.palette.length).toBeGreaterThan(0);
    expect(m.limits.length).toBeGreaterThan(0);
  });

  it('la preview et l’export partagent les mêmes pixels', () => {
    const exported = exportSpell({ recipe: fire, directions: 4 });
    const preview = renderDirections(fire, { directions: 4 });
    exported.frames.forEach((row, ri) => {
      row.frames.forEach((frame, fi) => {
        expect(frame.signature).toBe(preview.frames[ri]!.frames[fi]!.signature);
      });
    });
  });

  it('le PNG est un fichier valide, alpha droit', () => {
    const fb = new Framebuffer(4, 4);
    fb.fill([10, 20, 30, 128]);
    const png = encodePng(fb);
    expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const text = new TextDecoder('latin1').decode(png);
    expect(text).toContain('IHDR');
    expect(text).toContain('IDAT');
    expect(text).toContain('IEND');
  });

  it('un export en seize caps ne duplique pas les cellules d’un export en huit', () => {
    const eight = exportSpell({ recipe: fire, directions: 8 }).manifest;
    const sixteen = exportSpell({ recipe: fire, directions: 16 }).manifest;
    expect(sixteen.atlas.cells).toHaveLength(16 * FRAME_COUNT);
    expect(sixteen.animation.frameDurationsMs).toEqual(eight.animation.frameDurationsMs);
  });
});

describe('projet portable', () => {
  it('se sauvegarde et se relit sans perte', () => {
    const project = makeProject({ recipes: RECIPES, notes: 'lot de référence' });
    const loaded = loadProject(saveProject(project));
    expect(loaded.diagnostics).toEqual([]);
    expect(loaded.project?.recipes).toHaveLength(9);
    expect(loaded.project?.notes).toBe('lot de référence');
  });

  it('refuse une clé inconnue au lieu de la perdre en silence', () => {
    const project = makeProject({ recipes: [RECIPES[0]!] });
    const raw = JSON.parse(saveProject(project)) as Record<string, unknown>;
    raw['couleurPreferee'] = 'bleu';
    const loaded = loadProject(JSON.stringify(raw));
    expect(loaded.project).toBeNull();
    expect(loaded.diagnostics.some((d) => d.code === 'project-schema')).toBe(true);
  });

  it('refuse une version future plutôt que de la réinterpréter', () => {
    const project = { ...makeProject({ recipes: [] }), formatVersion: 99 };
    const loaded = loadProject(JSON.stringify(project));
    expect(loaded.project).toBeNull();
    expect(loaded.diagnostics[0]?.code).toBe('project-future');
  });
});
