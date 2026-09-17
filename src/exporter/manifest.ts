/**
 * Manifeste d'export (§15).
 *
 * Il déclare tout ce qu'un moteur cible doit savoir **sans deviner** :
 * exactement douze frames par direction, douze durées positives, les plages
 * de rôles, les événements, les directions monde, les rectangles de frames,
 * les pivots, la métrique pixel/monde, le profil de projection, les passes et
 * le mode d'assemblage. Il déclare aussi ses limites.
 */

import { totalDurationMs, type AnimationBudget } from '../animation/budget.js';
import { frameStartMs } from '../animation/budget.js';
import type { InkEntry } from '../pixels/canvas.js';
import { toHex } from '../pixels/rgba.js';
import type { StyleProfile } from '../pixels/style.js';
import type { DirectionSample } from '../projection/directions.js';
import type { ProjectionProfile } from '../projection/projection.js';
import type { CompiledRecipe } from '../recipes/types.js';
import type { Atlas } from './atlas.js';

export const MANIFEST_VERSION = 1;
export const ENGINE_VERSION = '2026.2.0';

export type PassDescriptor = {
  readonly name: 'body' | 'emission';
  readonly file: string;
  readonly blend: 'normal' | 'add';
  readonly alpha: 'straight';
  readonly colors: number;
};

export type AssemblyMode = 'composable' | 'baked-sequence';

export type Manifest = {
  readonly manifestVersion: number;
  readonly engineVersion: string;
  readonly schemaVersion: number;
  readonly recipe: {
    readonly id: string;
    readonly familyId: string;
    readonly rank: string;
    readonly name: string;
    readonly element: string;
    readonly action: string;
    readonly builder: string;
    readonly seed: number;
    readonly style: string;
    readonly silhouette: string;
  };
  readonly animation: {
    readonly frameCount: number;
    readonly framesPerDirection: number;
    readonly frameIndexBase: 0;
    readonly frameDurationsMs: readonly number[];
    readonly totalDurationMs: number;
    readonly endBehavior: string;
    readonly uniformDurationMs: number;
  };
  readonly clips: readonly {
    readonly role: string;
    readonly range: readonly [number, number];
    readonly anchor: string;
    readonly playback: string;
    readonly trigger: string;
  }[];
  readonly events: readonly { readonly id: string; readonly frame: number; readonly timeMs: number }[];
  readonly projection: {
    readonly id: string;
    readonly groundScale: number;
    readonly groundRatio: number;
    readonly heightScale: number;
    readonly pixelsPerTile: number;
    readonly tile: { readonly w: number; readonly h: number };
  };
  readonly directions: readonly {
    readonly index: number;
    readonly headingRad: number;
    readonly vector: { readonly x: number; readonly y: number };
    readonly screenAngleRad: number;
    readonly label: string;
  }[];
  readonly capture: {
    readonly width: number;
    readonly height: number;
    readonly pivot: { readonly x: number; readonly y: number };
    readonly distanceTiles: number;
    readonly casterHeightTiles: number;
  };
  readonly atlas: {
    readonly columns: number;
    readonly rows: number;
    readonly cellWidth: number;
    readonly cellHeight: number;
    readonly padding: number;
    readonly extrude: number;
    readonly cells: readonly {
      readonly direction: number;
      readonly frame: number;
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly pivotX: number;
      readonly pivotY: number;
      readonly durationMs: number;
      readonly role: string | null;
      readonly content: { x0: number; y0: number; x1: number; y1: number } | null;
    }[];
  };
  readonly passes: readonly PassDescriptor[];
  readonly palette: readonly {
    readonly index: number;
    readonly material: string;
    readonly role: string;
    readonly hex: string;
  }[];
  readonly assembly: {
    readonly mode: AssemblyMode;
    readonly flyPlayback: string;
    readonly note: string;
  };
  /** Ce que cet export **ne** garantit pas. Déclaré, pas caché. */
  readonly limits: readonly string[];
};

export type ManifestInput = {
  readonly recipe: CompiledRecipe;
  readonly budget: AnimationBudget;
  readonly style: StyleProfile;
  readonly projection: ProjectionProfile;
  readonly directions: readonly DirectionSample[];
  readonly atlas: Atlas;
  readonly passes: readonly PassDescriptor[];
  readonly palette: readonly InkEntry[];
  readonly capturePivot: { readonly x: number; readonly y: number };
  readonly assembly?: AssemblyMode;
  readonly extraLimits?: readonly string[];
};

export function buildManifest(input: ManifestInput): Manifest {
  const def = input.recipe.definition;
  const budget = input.budget;
  const total = totalDurationMs(budget);
  const fly = budget.clips.find((c) => c.role === 'fly');
  return {
    manifestVersion: MANIFEST_VERSION,
    engineVersion: ENGINE_VERSION,
    schemaVersion: def.schemaVersion,
    recipe: {
      id: def.id,
      familyId: def.familyId,
      rank: def.rank,
      name: def.name,
      element: def.element,
      action: def.action,
      builder: def.builder,
      seed: def.seed,
      style: def.style,
      silhouette: def.silhouette,
    },
    animation: {
      frameCount: budget.frameCount,
      framesPerDirection: budget.frameCount,
      frameIndexBase: 0,
      frameDurationsMs: [...budget.frameDurationsMs],
      totalDurationMs: total,
      endBehavior: budget.endBehavior,
      // Mode uniforme : même nombre de cellules, cadence constante. Aucun
      // export n'ajoute de frames dupliquées pour convertir les durées.
      uniformDurationMs: Math.round(total / budget.frameCount),
    },
    clips: budget.clips.map((c) => ({
      role: c.role,
      range: [c.range[0], c.range[1]] as const,
      anchor: c.anchor,
      playback: c.playback ?? 'once',
      trigger: c.trigger ?? 'start',
    })),
    events: budget.events.map((e) => ({ id: e.id, frame: e.frame, timeMs: frameStartMs(budget, e.frame) })),
    projection: {
      id: input.projection.id,
      groundScale: input.projection.groundScale,
      groundRatio: input.projection.groundRatio,
      heightScale: input.projection.heightScale,
      pixelsPerTile: input.projection.groundScale,
      tile: input.style.tile,
    },
    directions: input.directions.map((d) => ({
      index: d.index,
      headingRad: d.heading,
      vector: d.vector,
      screenAngleRad: d.screenAngle,
      label: d.label,
    })),
    capture: {
      width: def.stage.width,
      height: def.stage.height,
      pivot: input.capturePivot,
      distanceTiles: def.stage.distance,
      casterHeightTiles: def.stage.casterHeight ?? 0,
    },
    atlas: {
      columns: input.atlas.columns,
      rows: input.atlas.rows,
      cellWidth: input.atlas.cellWidth,
      cellHeight: input.atlas.cellHeight,
      padding: input.atlas.padding,
      extrude: input.atlas.extrude,
      cells: input.atlas.cells.map((c) => ({
        direction: c.direction,
        frame: c.frame,
        x: c.x,
        y: c.y,
        w: c.w,
        h: c.h,
        pivotX: c.pivotX,
        pivotY: c.pivotY,
        durationMs: c.durationMs,
        role: c.role ?? null,
        content: c.content,
      })),
    },
    passes: input.passes,
    palette: input.palette.map((e) => ({
      index: e.index,
      material: e.materialId,
      role: e.role,
      hex: toHex(e.rgba),
    })),
    assembly: {
      mode: input.assembly ?? 'composable',
      flyPlayback: fly?.playback ?? 'once',
      note:
        'Les plages se composent au runtime : le vol peut être répété sans ajouter de cellules. ' +
        'Une séquence entièrement précalculée serait déclarée « baked-sequence » et ne doit pas être déplacée une seconde fois par le jeu.',
    },
    limits: [
      'Les caps exportés sont échantillonnés dans le repère monde ; une spritesheet finie n’est pas un rendu continu exact.',
      'L’ombre portée est tramée : un sprite indexé n’a pas d’alpha partiel.',
      'Le tri en profondeur est global par objet ; il ne résout pas deux rubans qui se croisent.',
      ...(input.extraLimits ?? []),
    ],
  };
}
