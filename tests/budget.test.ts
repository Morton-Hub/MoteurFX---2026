import { describe, expect, it } from 'vitest';
import {
  FRAME_COUNT,
  frameAtMs,
  frameStartMs,
  makeBudget,
  partition,
  totalDurationMs,
  uniformBudget,
  validateBudget,
} from '../src/animation/budget.js';

const clips = partition([
  { role: 'cast', frames: 3, anchor: 'source' },
  { role: 'fly', frames: 3, anchor: 'projectile', playback: 'loop' },
  { role: 'hit', frames: 4, anchor: 'target', trigger: 'contact' },
  { role: 'residue', frames: 2, anchor: 'ground-target' },
]);

const durations = [70, 70, 80, 90, 60, 40, 35, 35, 55, 75, 95, 115];

describe('contrat des douze frames', () => {
  it('accepte un budget conforme', () => {
    const b = makeBudget({ frameDurationsMs: durations, clips });
    expect(validateBudget(b)).toEqual([]);
    expect(b.frameCount).toBe(FRAME_COUNT);
    expect(totalDurationMs(b)).toBe(820);
  });

  it('refuse une exposition nulle ou négative', () => {
    const bad = [...durations];
    bad[4] = 0;
    const codes = validateBudget(makeBudget({ frameDurationsMs: bad, clips })).map((d) => d.code);
    expect(codes).toContain('duration-positive');
  });

  it('refuse un nombre de durées différent de douze', () => {
    const codes = validateBudget(makeBudget({ frameDurationsMs: durations.slice(0, 11), clips })).map((d) => d.code);
    expect(codes).toContain('duration-count');
  });

  it('refuse un trou dans la couverture des rôles', () => {
    const holed = clips.filter((c) => c.role !== 'fly');
    const codes = validateBudget(makeBudget({ frameDurationsMs: durations, clips: holed })).map((d) => d.code);
    expect(codes).toContain('clip-gap');
  });

  it('refuse un chevauchement de rôles', () => {
    const overlap = [
      { role: 'cast' as const, range: [0, 5] as const, anchor: 'source' as const },
      { role: 'hit' as const, range: [4, 11] as const, anchor: 'target' as const },
    ];
    const codes = validateBudget(makeBudget({ frameDurationsMs: durations, clips: overlap })).map((d) => d.code);
    expect(codes).toContain('clip-overlap');
  });

  it('choisit la frame par cumul des expositions, pas par un FPS supposé', () => {
    const b = makeBudget({ frameDurationsMs: durations, clips });
    expect(frameAtMs(b, 0)).toBe(0);
    expect(frameAtMs(b, 69)).toBe(0);
    expect(frameAtMs(b, 70)).toBe(1);
    expect(frameAtMs(b, 219)).toBe(2);
    expect(frameAtMs(b, 220)).toBe(3);
    // La dernière frame est affichée pendant toute son exposition.
    expect(frameAtMs(b, totalDurationMs(b) - 1)).toBe(11);
    expect(frameStartMs(b, 11)).toBe(705);
  });

  it('le mode uniforme garde douze cellules', () => {
    const u = uniformBudget(600, clips);
    expect(u.frameDurationsMs).toHaveLength(FRAME_COUNT);
    expect(new Set(u.frameDurationsMs).size).toBe(1);
    expect(validateBudget(u)).toEqual([]);
  });

  it('refuse une partition qui ne couvre pas exactement douze frames', () => {
    expect(() =>
      partition([
        { role: 'cast', frames: 3, anchor: 'source' },
        { role: 'hit', frames: 4, anchor: 'target' },
      ]),
    ).toThrow(/12/);
  });
});
