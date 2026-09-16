/** Catalogue des recettes. Un sort de base par élément. */

import type { ElementId } from '../style/palette.js';
import type { SpellRecipe } from '../sim/types.js';
import { iceFrostLance } from './iceFrostLance.js';
import { lightningRuptureArc } from './lightningRuptureArc.js';
import { fireBall } from './fireBall.js';
import { waterBreakingWave } from './waterBreakingWave.js';
import { earthStoneHammer } from './earthStoneHammer.js';
import { windCuttingSpiral } from './windCuttingSpiral.js';

export const SPELLS: readonly SpellRecipe[] = [iceFrostLance, lightningRuptureArc, fireBall, waterBreakingWave, earthStoneHammer, windCuttingSpiral];

export function spellById(id: string): SpellRecipe {
  const found = SPELLS.find((s) => s.id === id);
  if (!found) {
    throw new Error(
      `Recette inconnue: "${id}". Disponibles: ${SPELLS.map((s) => s.id).join(', ')}`,
    );
  }
  return found;
}

export function spellsByElement(element: ElementId): SpellRecipe[] {
  return SPELLS.filter((s) => s.element === element);
}
