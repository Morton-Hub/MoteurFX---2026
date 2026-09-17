/**
 * Corrections artistiques non destructives (§5.C).
 *
 * Une retouche ne modifie jamais la génération : elle s'applique **après**,
 * sur une frame, une direction et une base identifiées. Elle conserve la
 * signature du rendu sur lequel elle a été faite. Si la géométrie ou la
 * capture change, le logiciel la signale comme potentiellement obsolète au
 * lieu de l'appliquer silencieusement au mauvais endroit.
 */

import { diag, type Diagnostic } from '../core/diagnostics.js';
import type { IndexedCanvas } from '../pixels/canvas.js';
import { getMaterial, ROLE_IDS, type MaterialId, type RoleId } from '../pixels/palette.js';

export type PixelPatch = {
  readonly x: number;
  readonly y: number;
  /** `matiere:role`, ou `null` pour effacer le pixel. */
  readonly ink: string | null;
};

export type FramePatch = {
  readonly id: string;
  readonly recipeId: string;
  readonly frame: number;
  /** Index du cap concerné, ou `null` si la retouche vaut pour tous. */
  readonly direction: number | null;
  /** Signature du rendu de base au moment de la retouche. */
  readonly baseSignature: string;
  readonly pixels: readonly PixelPatch[];
  readonly note?: string;
};

export type PatchApplication = {
  readonly applied: readonly FramePatch[];
  readonly stale: readonly FramePatch[];
  readonly diagnostics: readonly Diagnostic[];
};

function parseInk(value: string): { material: MaterialId; role: RoleId } | null {
  const [material, role] = value.split(':');
  if (!material || !role) return null;
  if (!(ROLE_IDS as readonly string[]).includes(role)) return null;
  return { material: material as MaterialId, role: role as RoleId };
}

export function patchesFor(
  patches: readonly FramePatch[],
  recipeId: string,
  frame: number,
  direction: number,
): FramePatch[] {
  return patches.filter(
    (p) => p.recipeId === recipeId && p.frame === frame && (p.direction === null || p.direction === direction),
  );
}

/**
 * Applique les retouches à un canevas. Une retouche dont la base a changé
 * n'est **pas** appliquée : elle est rapportée comme obsolète.
 */
export function applyPatches(
  canvas: IndexedCanvas,
  patches: readonly FramePatch[],
  options: { force?: boolean } = {},
): PatchApplication {
  const signature = canvas.signature();
  const applied: FramePatch[] = [];
  const stale: FramePatch[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const patch of patches) {
    if (patch.baseSignature !== signature && !options.force) {
      stale.push(patch);
      diagnostics.push(
        diag('warning', 'patch-stale', `La retouche ${patch.id} a été faite sur un rendu de signature ${patch.baseSignature}, la base vaut maintenant ${signature} : elle n'est pas appliquée`, `${patch.recipeId}.frame[${patch.frame}]`),
      );
      continue;
    }
    for (const px of patch.pixels) {
      if (px.ink === null) {
        canvas.set(px.x, px.y, 0);
        continue;
      }
      const parsed = parseInk(px.ink);
      if (!parsed) {
        diagnostics.push(
          diag('error', 'patch-ink', `Encre inconnue "${px.ink}" dans la retouche ${patch.id}`, `${patch.recipeId}.frame[${patch.frame}]`),
        );
        continue;
      }
      try {
        canvas.set(px.x, px.y, canvas.ink(getMaterial(parsed.material), parsed.role));
      } catch {
        diagnostics.push(
          diag('error', 'patch-material', `Matière inconnue "${parsed.material}" dans la retouche ${patch.id}`, `${patch.recipeId}.frame[${patch.frame}]`),
        );
      }
    }
    applied.push(patch);
  }
  return { applied, stale, diagnostics };
}

/** Construit une retouche à partir de pixels modifiés dans l'éditeur. */
export function makePatch(o: {
  id: string;
  recipeId: string;
  frame: number;
  direction: number | null;
  baseSignature: string;
  pixels: readonly PixelPatch[];
  note?: string;
}): FramePatch {
  return {
    id: o.id,
    recipeId: o.recipeId,
    frame: o.frame,
    direction: o.direction,
    baseSignature: o.baseSignature,
    pixels: [...o.pixels],
    ...(o.note ? { note: o.note } : {}),
  };
}

/**
 * Réaccroche une retouche à une nouvelle base. C'est un geste **explicite** :
 * l'utilisateur déclare que la correction reste valable.
 */
export function revalidate(patch: FramePatch, newSignature: string): FramePatch {
  return { ...patch, baseSignature: newSignature };
}
