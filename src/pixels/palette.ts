/**
 * Palettes par rôles.
 *
 * Le moteur ne manipule pas des RGB dispersés dans les recettes : il manipule
 * des **rôles** (§2 du document directeur). Une recette demande « le corps de
 * la flamme » ou « la lumière du cristal » ; la traduction en couleur est
 * faite ici, une seule fois, pour tout le catalogue.
 *
 * Une matière déclare 4 à 7 couleurs. Ce n'est pas une limite technique mais
 * une contrainte de lecture : au-delà, les valeurs se rapprochent et la masse
 * principale cesse d'être identifiable à résolution native.
 */

import { hex, type RGBA } from './rgba.js';

/** Les douze éléments du catalogue. Tous n'ont pas de recette livrée. */
export type ElementId =
  | 'fire' | 'ice' | 'lightning' | 'water' | 'earth' | 'wind'
  | 'poison' | 'magma' | 'light' | 'dark' | 'metal' | 'nature';

/**
 * Rôles d'une palette. L'ordre de la liste est l'ordre de valeur, du plus
 * sombre au plus clair : c'est lui que l'ombrage parcourt.
 */
export const ROLE_IDS = ['outline', 'deep', 'shadow', 'body', 'light', 'accent'] as const;
export type RoleId = (typeof ROLE_IDS)[number];

/** Ordre de valeur utilisé par l'ombrage (sombre -> clair). */
export const VALUE_ORDER: readonly RoleId[] = ['deep', 'shadow', 'body', 'light', 'accent'];

export type Material = {
  readonly id: string;
  readonly label: string;
  readonly element: ElementId;
  /**
   * Une matière émissive est éclairée par son **épaisseur** (cœur clair, bord
   * saturé) et non par la lumière monde : un éclair n'a pas le modelé d'une
   * roche (§2).
   */
  readonly emissive: boolean;
  readonly roles: Readonly<Partial<Record<RoleId, RGBA>>>;
  /** Rampe effective, du plus sombre au plus clair. */
  readonly ramp: readonly RoleId[];
  /** Contour sélectif. `null` = aucun contour, cas d'une flamme. */
  readonly outline: RoleId | null;
};

type MaterialSpec = {
  label: string;
  element: ElementId;
  emissive?: boolean;
  outline?: RoleId | null;
  colors: Partial<Record<RoleId, string>>;
};

function material(id: string, spec: MaterialSpec): Material {
  const roles: Partial<Record<RoleId, RGBA>> = {};
  for (const role of ROLE_IDS) {
    const value = spec.colors[role];
    if (value !== undefined) roles[role] = hex(value);
  }
  const ramp = VALUE_ORDER.filter((r) => roles[r] !== undefined);
  if (ramp.length < 2) throw new Error(`Matière "${id}" : au moins deux valeurs sont nécessaires`);
  const count = Object.keys(roles).length;
  if (count > 7) throw new Error(`Matière "${id}" : ${count} couleurs, la limite de lecture est 7`);
  return {
    id,
    label: spec.label,
    element: spec.element,
    emissive: spec.emissive ?? false,
    roles,
    ramp,
    outline: spec.outline === undefined ? 'outline' : spec.outline,
  };
}

/**
 * Matières livrées.
 *
 * Feu, glace et foudre sont le premier lot (§11). Les matières partagées —
 * ombre au sol, fumée, roche — servent plusieurs éléments sans les confondre :
 * c'est la forme, pas la couleur, qui distingue les familles.
 */
export const MATERIALS = {
  // --- Feu -----------------------------------------------------------------
  'fire.flame': material('fire.flame', {
    label: 'Flamme',
    element: 'fire',
    emissive: true,
    // Une flamme dessinée n'a pas de contour noir : son bord est sa couleur
    // la plus saturée, et c'est le fond qui fait le contraste.
    outline: null,
    colors: { deep: '#592A4A', shadow: '#A13B45', body: '#E86D3C', light: '#F7B85C', accent: '#FFF0BA' },
  }),
  'fire.ember': material('fire.ember', {
    label: 'Braise',
    element: 'fire',
    emissive: true,
    outline: null,
    colors: { shadow: '#A13B45', body: '#E86D3C', light: '#F7B85C', accent: '#FFF0BA' },
  }),
  'fire.smoke': material('fire.smoke', {
    label: 'Fumée',
    element: 'fire',
    outline: null,
    colors: { deep: '#2B2330', shadow: '#453A45', body: '#5E5059', light: '#7C6C72' },
  }),
  'fire.crust': material('fire.crust', {
    label: 'Croûte rocheuse',
    element: 'fire',
    outline: 'outline',
    colors: { outline: '#150E12', deep: '#241A1C', shadow: '#3E2E2E', body: '#5A4442', light: '#7A5B50' },
  }),
  'fire.vein': material('fire.vein', {
    label: 'Veine chaude',
    element: 'fire',
    emissive: true,
    outline: null,
    colors: { shadow: '#A13B45', body: '#E86D3C', light: '#F7B85C' },
  }),
  'fire.scorch': material('fire.scorch', {
    label: 'Brûlure au sol',
    element: 'fire',
    outline: null,
    colors: { deep: '#221216', shadow: '#3C2020', body: '#61301F' },
  }),

  // --- Glace ---------------------------------------------------------------
  'ice.crystal': material('ice.crystal', {
    label: 'Cristal',
    element: 'ice',
    outline: 'outline',
    colors: {
      outline: '#16223F', deep: '#25345B', shadow: '#3F6F98',
      body: '#68B7CA', light: '#ABE4DC', accent: '#EFFAE8',
    },
  }),
  'ice.frost': material('ice.frost', {
    label: 'Givre',
    element: 'ice',
    outline: null,
    colors: { deep: '#25345B', shadow: '#3F6F98', body: '#68B7CA', light: '#ABE4DC' },
  }),
  'ice.mist': material('ice.mist', {
    label: 'Poudrin',
    element: 'ice',
    outline: null,
    colors: { shadow: '#3F6F98', body: '#68B7CA', light: '#ABE4DC', accent: '#EFFAE8' },
  }),

  // --- Foudre --------------------------------------------------------------
  'lightning.bolt': material('lightning.bolt', {
    label: 'Décharge',
    element: 'lightning',
    emissive: true,
    outline: null,
    colors: { deep: '#352D61', shadow: '#6456A4', body: '#9B8DE0', light: '#D3C6F2', accent: '#FFF4C9' },
  }),
  'lightning.ion': material('lightning.ion', {
    label: 'Ionisation',
    element: 'lightning',
    emissive: true,
    outline: null,
    colors: { deep: '#352D61', shadow: '#6456A4', body: '#9B8DE0' },
  }),
  'lightning.scorch': material('lightning.scorch', {
    label: 'Marque au sol',
    element: 'lightning',
    outline: null,
    colors: { deep: '#241E44', shadow: '#3B3272', body: '#6456A4' },
  }),

  // --- Partagé -------------------------------------------------------------
  /**
   * Ombre au sol. Une seule valeur, tramée : un sprite indexé n'a pas d'alpha
   * partiel, et une ombre pleine trouerait le décor. Le damier est la
   * solution pixel art historique, et elle est déclarée dans le manifeste.
   */
  'shared.shadow': material('shared.shadow', {
    label: 'Ombre portée',
    element: 'earth',
    outline: null,
    colors: { deep: '#1B1730', shadow: '#2A2445' },
  }),
} as const;

export type MaterialId = keyof typeof MATERIALS;

export function getMaterial(id: MaterialId): Material {
  return MATERIALS[id];
}

/** Couleur d'un rôle, en repliant vers le rôle disponible le plus proche. */
export function roleColor(m: Material, role: RoleId): RGBA {
  const direct = m.roles[role];
  if (direct) return direct;
  const wanted = VALUE_ORDER.indexOf(role);
  if (wanted < 0) {
    // 'outline' absent : on retombe sur la valeur la plus sombre.
    return m.roles[m.ramp[0] as RoleId] as RGBA;
  }
  let best: RoleId = m.ramp[0] as RoleId;
  let bestDist = Infinity;
  for (const r of m.ramp) {
    const d = Math.abs(VALUE_ORDER.indexOf(r) - wanted);
    if (d < bestDist) {
      bestDist = d;
      best = r;
    }
  }
  return m.roles[best] as RGBA;
}

/** Rôle de la rampe à une position continue 0 (sombre) -> 1 (clair). */
export function rampRole(m: Material, t: number): RoleId {
  const n = m.ramp.length;
  const i = Math.max(0, Math.min(n - 1, Math.round(t * (n - 1))));
  return m.ramp[i] as RoleId;
}

/** Nombre de couleurs distinctes d'une matière. */
export function colorCount(m: Material): number {
  return Object.keys(m.roles).length;
}
