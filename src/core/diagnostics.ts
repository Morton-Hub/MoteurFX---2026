/**
 * Diagnostics.
 *
 * Une erreur doit pointer vers la recette, le nœud et le champ (§9). Un
 * contrôle silencieux — un paramètre ignoré, un cap manquant, un patch
 * devenu obsolète — est un défaut du produit, pas un détail.
 */

export type DiagnosticLevel = 'error' | 'warning' | 'info';

export type Diagnostic = {
  readonly level: DiagnosticLevel;
  /** Code court et stable, pour les tests et l'interface. */
  readonly code: string;
  readonly message: string;
  /** Chemin : `recette.animation.frameDurationsMs[3]`. */
  readonly path?: string;
};

export function diag(
  level: DiagnosticLevel,
  code: string,
  message: string,
  path?: string,
): Diagnostic {
  return path === undefined ? { level, code, message } : { level, code, message, path };
}

export const isError = (d: Diagnostic): boolean => d.level === 'error';

export function hasErrors(list: readonly Diagnostic[]): boolean {
  return list.some(isError);
}

/** Lève si la liste contient une erreur. Utilisé par le CLI et les tests. */
export function throwOnError(list: readonly Diagnostic[], context: string): void {
  const errors = list.filter(isError);
  if (errors.length === 0) return;
  const lines = errors.map((e) => `  [${e.code}] ${e.path ?? ''} ${e.message}`.trimEnd());
  throw new Error(`${context} :\n${lines.join('\n')}`);
}
