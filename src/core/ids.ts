/**
 * Identifiants stables.
 *
 * Toute variation déterministe dérive d'un identifiant, jamais d'une position
 * dans un tableau : ajouter une braise ne doit pas redistribuer les autres
 * objets de la scène (§10 du document directeur).
 */

/** Identifiant d'un objet dans une recette : `recette/objet[/sous-objet]`. */
export type NodeId = string;

/** Construit un identifiant de nœud à partir de segments non vides. */
export function nodeId(...parts: readonly (string | number)[]): NodeId {
  const clean = parts.map((p) => String(p)).filter((p) => p.length > 0);
  if (clean.length === 0) throw new Error('nodeId: au moins un segment est requis');
  return clean.join('/');
}

/** Identifiant d'un grain : nœud parent + index sémantique stable. */
export function grainId(parent: NodeId, index: number): NodeId {
  return `${parent}#${index}`;
}

/** Vérifie qu'une liste d'identifiants ne contient pas de doublon. */
export function assertUniqueIds(ids: readonly string[], context: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`${context}: identifiant dupliqué "${id}"`);
    seen.add(id);
  }
}
