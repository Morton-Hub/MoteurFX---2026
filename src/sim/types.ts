/**
 * Contrat d'une recette. Le temps est échantillonné analytiquement :
 * `sample(t)` ne dépend d'aucun état accumule, donc naviguer directement a
 * un instant donne exactement le même résultat qu'une lecture depuis le
 * debut. Les recettes qui auraient besoin d'integration utiliseraient un
 * replay déterministe ou des points de reprise ; aucune n'en a besoin ici.
 */

import type { Vec2, Vec3 } from '../core/math.js';
import type { LocalFrame, ProjectionProfile } from '../space/projection.js';
import type { ElementId, Palette } from '../style/palette.js';
import type { StyleProfile } from '../style/styleProfile.js';
import type { DrawCmd } from '../render/draw.js';

/** Reperes editoriaux. La simulation FX n'arbitre aucun dégât de gameplay. */
export type EventId = 'cast' | 'release' | 'contact' | 'peak' | 'fracture' | 'settled';

export type SpellEvent = {
  readonly id: EventId;
  /** Instant normalise dans [0,1] de la durée du clip. */
  readonly at: number;
  readonly note?: string;
};

/** Role d'un clip dans le runtime du jeu. */
export type ClipRole = 'cast' | 'fly' | 'hit' | 'residue' | 'oneshot';

export type SpellContext = {
  readonly projection: ProjectionProfile;
  readonly style: StyleProfile;
  readonly palette: Palette;
  /** Seed de projet. Les seeds de noeuds en dérivent par identifiant stable. */
  readonly seed: number;
  readonly source: Vec3;
  readonly target: Vec3;
  readonly heading: number;
  readonly frame: LocalFrame;
  /** Distance au sol source -> cible, en unités monde. */
  readonly distance: number;
  /**
   * Rang du sort, dans [0,1]. Il change le comportement (nombre de pointes,
   * reprises, fracture) et non la résolution des pixels ni la durée de
   * toutes les phases.
   */
  readonly power: number;
  /** Projection monde -> pixels, pre-liée au profil. */
  readonly p: (w: Vec3) => Vec2;
  /** Projection depuis le repère local (avant, côté, haut). */
  readonly pl: (fwd: number, side: number, up: number) => Vec2;
  /** Point monde depuis le repère local. */
  readonly wl: (fwd: number, side: number, up: number) => Vec3;
};

export type SpellRecipe = {
  readonly id: string;
  readonly element: ElementId;
  readonly title: string;
  /** Intention de design, en une phrase. Sert aussi de documentation. */
  readonly concept: string;
  /** Traits de forme qui doivent rester reconnaissables sans couleur. */
  readonly signature: readonly string[];
  readonly role: ClipRole;
  /** Duree du clip en secondes. */
  readonly duration: number;
  /** Cadence d'export conseillee. Le nombre d'images en dérive. */
  readonly fps: number;
  readonly canvas: { readonly width: number; readonly height: number };
  /**
   * Position en pixels de la source dans le canevas. C'est le pivot :
   * identique pour tous les caps, donc stable après rognage.
   */
  readonly pivot: { readonly x: number; readonly y: number };
  /** Distance au sol par défaut entre source et cible, en unités monde. */
  readonly defaultRange: number;
  /** Rang par défaut dans [0,1]. Le rang change le comportement, pas l'échelle. */
  readonly defaultPower: number;
  /**
   * Vrai seulement si l'effet est reellement invariant par rotation.
   * Un rendu partage entre caps doit etre declare ici et vérifie par un test.
   */
  readonly radial: boolean;
  readonly events: readonly SpellEvent[];
  /** Boucle du clip. `none` par défaut : un one-shot ne boucle pas. */
  readonly loop: 'none' | 'seamless';
  sample(t: number, ctx: SpellContext): DrawCmd[];
};

export type ElementGrammarInfo = {
  readonly element: ElementId;
  readonly forms: string;
  readonly behaviour: string;
};

export const ELEMENT_GRAMMAR: Readonly<Record<ElementId, ElementGrammarInfo>> = {
  ice: { element: 'ice', forms: 'Prismes facettes, plaques, aiguilles obliques', behaviour: 'Croissance, maintien rigide, fracture' },
  lightning: { element: 'lightning', forms: 'Lignes brisees, reseaux et ramifications', behaviour: 'Decharge, bref maintien, extinction et reprise' },
  fire: { element: 'fire', forms: 'Langues, lobes asymetriques, vides internes', behaviour: 'Gonflement, ascension et dechirement' },
  water: { element: 'water', forms: 'Cretes, rubans pleins, gouttes', behaviour: 'Deferlement, etirement et retombee' },
  earth: { element: 'earth', forms: 'Blocs, strates et fractures', behaviour: 'Soulevement lourd et gravats' },
  wind: { element: 'wind', forms: 'Arcs ouverts et rubans espaces', behaviour: 'Rotation, acceleration et etirement' },
};
