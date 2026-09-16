/**
 * Palettes par role. Une palette ne fait pas une identité : elle sert la
 * lecture (contraste, etagement des valeurs), l'identité vient des formes,
 * du rythme et de la matière.
 *
 * `ramp` va du plus eclaire au plus sombre. Les facettes s'y indexent selon
 * l'orientation de leur normale par rapport à la lumière monde.
 */

import type { RGBA } from '../raster/framebuffer.js';

export type ElementId = 'ice' | 'lightning' | 'fire' | 'water' | 'earth' | 'wind';

export type Palette = {
  readonly id: ElementId;
  readonly ramp: readonly RGBA[];
  readonly core: RGBA;
  readonly accent: RGBA;
  readonly rim: RGBA;
  readonly glow: RGBA;
  readonly ground: RGBA;
  readonly shadow: RGBA;
  readonly debris: RGBA;
};

const c = (hex: string, a = 255): RGBA => [
  parseInt(hex.slice(0, 2), 16),
  parseInt(hex.slice(2, 4), 16),
  parseInt(hex.slice(4, 6), 16),
  a,
];

export const PALETTES: Readonly<Record<ElementId, Palette>> = {
  ice: {
    id: 'ice',
    ramp: [c('EAFBFF'), c('A7E6F5'), c('6CC6E8'), c('3C8CC6'), c('24619C'), c('16386B')],
    core: c('FFFFFF'),
    accent: c('CFF6FF'),
    rim: c('0E1E44'),
    glow: c('9FE8FF'),
    ground: c('BFE8F6'),
    shadow: c('0E1E44', 70),
    debris: c('7FD2EC'),
  },
  lightning: {
    id: 'lightning',
    ramp: [c('FFFFFF'), c('EAF4FF'), c('B9D4FF'), c('7E93F0'), c('4B4CC0'), c('2A2570')],
    core: c('FFFFFF'),
    accent: c('FFF4A8'),
    rim: c('141038'),
    glow: c('A8C6FF'),
    ground: c('8FA6F5'),
    shadow: c('141038', 60),
    debris: c('DCE9FF'),
  },
  fire: {
    id: 'fire',
    /**
     * Quatre valeurs, toutes saturées, aucune sombre.
     *
     * Une flamme de pixel art ne descend pas vers le brun ni vers le noir :
     * elle vit entre le jaune et le rouge, et c'est le **fond** qui fait le
     * contraste. La rampe précédente allait du blanc cassé au brun profond,
     * si bien que la moitié de la masse tombait dans des valeurs éteintes et
     * que le bord se lisait comme une croûte.
     *
     * Le jaune est majoritaire ; l'orange et le rouge sont des accents.
     */
    ramp: [c('FFE45E'), c('FFB227'), c('FF6E12'), c('E23C06')],
    core: c('FFFDE8'),
    accent: c('FFF2A8'),
    /** Réservé aux brûlures au sol : jamais au contour d'une flamme. */
    rim: c('2A0C0A'),
    glow: c('FF9A2E'),
    ground: c('C4571C'),
    shadow: c('2A0C0A', 70),
    /** Fumée : la seule matière froide de l'élément. */
    debris: c('55433E'),
  },
  water: {
    id: 'water',
    ramp: [c('EAFBFF'), c('A8E8F6'), c('55BEE2'), c('2483C0'), c('14539A'), c('0C2F63')],
    core: c('FFFFFF'),
    accent: c('E6FDFF'),
    rim: c('081A3C'),
    glow: c('6FD8FF'),
    ground: c('2C7FB8'),
    shadow: c('081A3C', 70),
    debris: c('BFEFFB'),
  },
  earth: {
    id: 'earth',
    ramp: [c('D3B482'), c('B3946A'), c('8C7050'), c('66503A'), c('45351F'), c('261A0E')],
    core: c('E6D0A4'),
    accent: c('8FBF5A'),
    rim: c('160E06'),
    glow: c('C08A3E'),
    ground: c('6B563A'),
    shadow: c('160E06', 80),
    debris: c('7A6144'),
  },
  wind: {
    id: 'wind',
    ramp: [c('F4FFFA'), c('D6F4E6'), c('A8DDD0'), c('72AFAC'), c('4A7B82'), c('2C4E58')],
    core: c('FFFFFF'),
    accent: c('E4FFCB'),
    rim: c('1C333A'),
    glow: c('CFF5E6'),
    ground: c('9FC8C0'),
    shadow: c('1C333A', 50),
    debris: c('C9E6D8'),
  },
};

/** Valeur de la rampe a une position continue, sans interpolation (postérisé). */
export function rampAt(p: Palette, t: number): RGBA {
  const n = p.ramp.length;
  const i = Math.max(0, Math.min(n - 1, Math.round(t * (n - 1))));
  return p.ramp[i] ?? p.ramp[0]!;
}

/** Sous-rampe utilisable comme dégradé postérisé vertical. */
export function rampSlice(p: Palette, from: number, to: number, steps: number): RGBA[] {
  const out: RGBA[] = [];
  for (let i = 0; i < steps; i++) {
    const t = steps === 1 ? from : from + ((to - from) * i) / (steps - 1);
    out.push(rampAt(p, t));
  }
  return out;
}
