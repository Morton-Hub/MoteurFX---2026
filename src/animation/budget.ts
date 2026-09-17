/**
 * Le contrat ferme : **douze images par sort et par direction** (§4).
 *
 * Douze images, pas une consigne de lecture à douze images par seconde. La
 * durée d'un clip est la somme de douze expositions positives, et aucun rang
 * — petit, moyen ou grand — ne reçoit d'images supplémentaires.
 *
 * Ce module ne dessine rien. Il dit seulement ce que le budget autorise, et
 * refuse les contournements : un quatrième clip de douze frames, une cellule
 * transparente imposée en fin de budget, une plage de rôle qui déborde.
 */

import { diag, type Diagnostic } from '../core/diagnostics.js';

/** Le nombre est un contrat, pas un réglage. */
export const FRAME_COUNT = 12;

export type ClipRole = 'cast' | 'fly' | 'hit' | 'residue';

export const CLIP_ROLES: readonly ClipRole[] = ['cast', 'fly', 'hit', 'residue'];

/** Où une plage est ancrée dans le monde. */
export type AnchorId =
  | 'source'
  | 'projectile'
  | 'target'
  | 'ground-source'
  | 'ground-target'
  | 'sky';

export type ClipSpec = {
  readonly role: ClipRole;
  /** Indices de frames inclus, base 0. */
  readonly range: readonly [number, number];
  readonly anchor: AnchorId;
  /**
   * `loop` : le runtime peut répéter ces dessins sans ajouter de cellules
   * d'atlas — un vol long ne coûte pas une image de plus (§7).
   */
  readonly playback?: 'once' | 'loop';
  /** Ce qui déclenche la plage côté jeu. */
  readonly trigger?: 'start' | 'contact' | 'chain';
  readonly note?: string;
};

export type SpellEventId =
  | 'cast'
  | 'release'
  | 'contact'
  | 'peak'
  | 'fracture'
  | 'settle'
  | 'clear';

export type EventSpec = {
  readonly id: SpellEventId;
  /** Frame porteuse de l'événement, base 0. Un événement n'est jamais « entre ». */
  readonly frame: number;
  readonly note?: string;
};

/** Ce que devient le sprite après la dernière exposition. */
export type EndBehavior = 'clear' | 'handoff';

export type AnimationBudget = {
  readonly frameCount: number;
  readonly frameDurationsMs: readonly number[];
  readonly clips: readonly ClipSpec[];
  readonly events: readonly EventSpec[];
  readonly endBehavior: EndBehavior;
  readonly frameIndexBase: 0;
};

export type BudgetInput = {
  readonly frameDurationsMs: readonly number[];
  readonly clips: readonly ClipSpec[];
  readonly events?: readonly EventSpec[];
  readonly endBehavior?: EndBehavior;
};

export function makeBudget(input: BudgetInput): AnimationBudget {
  return {
    frameCount: FRAME_COUNT,
    frameDurationsMs: [...input.frameDurationsMs],
    clips: [...input.clips],
    events: [...(input.events ?? [])],
    endBehavior: input.endBehavior ?? 'clear',
    frameIndexBase: 0,
  };
}

/**
 * Mode uniforme : douze frames de même durée. Il reste disponible pour les
 * moteurs cibles qui ne savent lire qu'une cadence fixe — et il a le droit
 * d'avoir un rythme différent du mode expressif (§4).
 */
export function uniformBudget(totalMs: number, clips: readonly ClipSpec[]): AnimationBudget {
  const each = Math.max(1, Math.round(totalMs / FRAME_COUNT));
  return makeBudget({ frameDurationsMs: new Array(FRAME_COUNT).fill(each), clips });
}

export function totalDurationMs(b: AnimationBudget): number {
  return b.frameDurationsMs.reduce((a, d) => a + d, 0);
}

/** Instant de début d'une frame, en millisecondes depuis le début du clip. */
export function frameStartMs(b: AnimationBudget, frame: number): number {
  let t = 0;
  for (let i = 0; i < frame && i < b.frameDurationsMs.length; i++) t += b.frameDurationsMs[i] ?? 0;
  return t;
}

/**
 * Frame affichée à un instant donné. Le choix se fait par **cumul des douze
 * expositions**, jamais par une hypothèse de FPS fixe (§15).
 */
export function frameAtMs(b: AnimationBudget, ms: number): number {
  const total = totalDurationMs(b);
  if (total <= 0) return 0;
  let t = ms;
  if (t < 0) t = 0;
  if (t >= total) return b.frameCount - 1;
  let acc = 0;
  for (let i = 0; i < b.frameCount; i++) {
    acc += b.frameDurationsMs[i] ?? 0;
    if (t < acc) return i;
  }
  return b.frameCount - 1;
}

/** Rôle porteur d'une frame, s'il y en a un. */
export function roleOfFrame(b: AnimationBudget, frame: number): ClipRole | undefined {
  return b.clips.find((c) => frame >= c.range[0] && frame <= c.range[1])?.role;
}

export function clipOfRole(b: AnimationBudget, role: ClipRole): ClipSpec | undefined {
  return b.clips.find((c) => c.role === role);
}

/** Instant d'un événement, en millisecondes depuis le début du clip. */
export function eventTimeMs(b: AnimationBudget, id: SpellEventId): number | undefined {
  const e = b.events.find((x) => x.id === id);
  return e === undefined ? undefined : frameStartMs(b, e.frame);
}

/**
 * Validation du contrat. Elle refuse notamment :
 *  - un nombre de frames différent de douze ;
 *  - une exposition nulle ou négative ;
 *  - des plages qui se chevauchent ou laissent un trou ;
 *  - un événement hors des douze cellules.
 */
export function validateBudget(b: AnimationBudget, path = 'animation'): Diagnostic[] {
  const out: Diagnostic[] = [];
  if (b.frameCount !== FRAME_COUNT) {
    out.push(
      diag('error', 'frame-count', `Le budget doit contenir exactement ${FRAME_COUNT} frames, reçu ${b.frameCount}`, `${path}.frameCount`),
    );
  }
  if (b.frameDurationsMs.length !== FRAME_COUNT) {
    out.push(
      diag('error', 'duration-count', `Il faut ${FRAME_COUNT} durées, reçu ${b.frameDurationsMs.length}`, `${path}.frameDurationsMs`),
    );
  }
  b.frameDurationsMs.forEach((d, i) => {
    if (!Number.isFinite(d) || d <= 0) {
      out.push(diag('error', 'duration-positive', `L'exposition ${i} vaut ${d} : elle doit être strictement positive`, `${path}.frameDurationsMs[${i}]`));
    }
  });

  const covered = new Array<number>(FRAME_COUNT).fill(0);
  b.clips.forEach((c, i) => {
    const [a, z] = c.range;
    if (!Number.isInteger(a) || !Number.isInteger(z) || a < 0 || z >= FRAME_COUNT || a > z) {
      out.push(diag('error', 'clip-range', `La plage ${c.role} [${a},${z}] sort des douze cellules`, `${path}.clips[${i}].range`));
      return;
    }
    for (let f = a; f <= z; f++) covered[f] = (covered[f] ?? 0) + 1;
  });
  const seen = new Set<ClipRole>();
  b.clips.forEach((c, i) => {
    if (seen.has(c.role)) {
      out.push(diag('error', 'clip-duplicate', `Le rôle ${c.role} est défini deux fois`, `${path}.clips[${i}].role`));
    }
    seen.add(c.role);
  });
  covered.forEach((n, f) => {
    if (n === 0) {
      out.push(diag('error', 'clip-gap', `La frame ${f} n'appartient à aucun rôle : le partitionnement doit couvrir les douze frames`, `${path}.clips`));
    } else if (n > 1) {
      out.push(diag('error', 'clip-overlap', `La frame ${f} est revendiquée par ${n} rôles`, `${path}.clips`));
    }
  });

  b.events.forEach((e, i) => {
    if (!Number.isInteger(e.frame) || e.frame < 0 || e.frame >= FRAME_COUNT) {
      out.push(diag('error', 'event-frame', `L'événement ${e.id} pointe la frame ${e.frame}, hors des douze cellules`, `${path}.events[${i}].frame`));
    }
  });
  const contact = b.events.find((e) => e.id === 'contact');
  if (contact) {
    const hit = clipOfRole(b, 'hit');
    if (hit && (contact.frame < hit.range[0] || contact.frame > hit.range[1])) {
      out.push(
        diag('warning', 'contact-outside-hit', `Le contact tombe sur la frame ${contact.frame}, hors de la plage d'impact [${hit.range[0]},${hit.range[1]}]`, `${path}.events`),
      );
    }
  }
  return out;
}

/** Partition simple : tailles successives des rôles, dans l'ordre donné. */
export function partition(
  parts: readonly { role: ClipRole; frames: number; anchor: AnchorId; playback?: 'once' | 'loop'; trigger?: 'start' | 'contact' | 'chain' }[],
): ClipSpec[] {
  const out: ClipSpec[] = [];
  let cursor = 0;
  for (const p of parts) {
    if (p.frames <= 0) continue;
    const range: [number, number] = [cursor, cursor + p.frames - 1];
    const spec: ClipSpec = {
      role: p.role,
      range,
      anchor: p.anchor,
      ...(p.playback ? { playback: p.playback } : {}),
      ...(p.trigger ? { trigger: p.trigger } : {}),
    };
    out.push(spec);
    cursor += p.frames;
  }
  if (cursor !== FRAME_COUNT) {
    throw new Error(`partition: les plages couvrent ${cursor} frames au lieu de ${FRAME_COUNT}`);
  }
  return out;
}
