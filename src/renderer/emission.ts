/**
 * Passe lumineuse.
 *
 * Elle accompagne les mêmes douze instants ; elle n'ajoute pas d'instants
 * d'animation et ne modifie pas le nombre de couleurs du corps (§2, §4).
 * Elle est **déduite** du corps : seuls les pixels de matière émissive déjà
 * clairs rayonnent, avec un débord d'un pixel. Aucun flou : un halo flou
 * indispensable pour qu'un sort paraisse fini est un défaut, pas une passe.
 */

import { IndexedCanvas } from '../pixels/canvas.js';
import { getMaterial } from '../pixels/palette.js';
import type { StyleProfile } from '../pixels/style.js';

export function deriveEmission(body: IndexedCanvas, style: StyleProfile): IndexedCanvas {
  const out = new IndexedCanvas(body.width, body.height);
  if (style.bodyProfile === 'pixel-strict') return out;
  const emissiveInk = new Map<number, { core: number; bleed: number }>();
  for (const entry of body.table.entries()) {
    const material = getMaterial(entry.materialId as never);
    if (!material.emissive) continue;
    if (entry.role !== 'light' && entry.role !== 'accent') continue;
    emissiveInk.set(entry.index, {
      core: out.ink(material, entry.role),
      bleed: out.ink(material, 'body'),
    });
  }
  if (emissiveInk.size === 0) return out;
  for (let y = 0; y < body.height; y++) {
    for (let x = 0; x < body.width; x++) {
      const v = body.get(x, y);
      const hit = emissiveInk.get(v);
      if (!hit) continue;
      out.setBehind(x - 1, y, hit.bleed);
      out.setBehind(x + 1, y, hit.bleed);
      out.setBehind(x, y - 1, hit.bleed);
      out.setBehind(x, y + 1, hit.bleed);
    }
  }
  for (let y = 0; y < body.height; y++) {
    for (let x = 0; x < body.width; x++) {
      const hit = emissiveInk.get(body.get(x, y));
      if (hit) out.set(x, y, hit.core);
    }
  }
  return out;
}
