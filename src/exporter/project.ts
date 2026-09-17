/**
 * Projet portable (§14).
 *
 * Le fichier exporté est la sauvegarde transportable ; IndexedDB ne sert qu'à
 * reprendre une session. Le format est versionné.
 *
 * **Politique de migration, explicite :** une clé inconnue n'est jamais
 * transformée en valeur par défaut ni supprimée en silence. Elle fait échouer
 * le chargement avec un diagnostic qui la nomme. Une version plus ancienne
 * est migrée par une fonction dédiée, déclarée ici.
 */

import { diag, type Diagnostic } from '../core/diagnostics.js';
import type { FramePatch } from '../patches/patch.js';
import type { RecipeDefinition } from '../recipes/types.js';
import { ENGINE_VERSION } from './manifest.js';
import { projectSchema } from '../compiler/schema.js';

export const PROJECT_FORMAT_VERSION = 1;

export type Project = {
  readonly formatVersion: number;
  readonly engineVersion: string;
  readonly savedAt: string;
  readonly styleProfile: string;
  readonly recipes: readonly RecipeDefinition[];
  readonly patches: readonly FramePatch[];
  /** Motifs importés, avec leur provenance. Les motifs internes ne sont pas copiés. */
  readonly importedMotifs?: readonly Record<string, unknown>[];
  readonly notes?: string;
};

export function makeProject(o: {
  recipes: readonly RecipeDefinition[];
  patches?: readonly FramePatch[];
  styleProfile?: string;
  notes?: string;
  now?: Date;
}): Project {
  return {
    formatVersion: PROJECT_FORMAT_VERSION,
    engineVersion: ENGINE_VERSION,
    savedAt: (o.now ?? new Date()).toISOString(),
    styleProfile: o.styleProfile ?? 'arcane-miniature',
    recipes: o.recipes,
    patches: o.patches ?? [],
    ...(o.notes ? { notes: o.notes } : {}),
  };
}

export function saveProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}

export type LoadResult = {
  readonly project: Project | null;
  readonly diagnostics: readonly Diagnostic[];
};

/** Migrations connues, de la version n vers n+1. */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {};

export function loadProject(text: string): LoadResult {
  const diagnostics: Diagnostic[] = [];
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch (err) {
    return {
      project: null,
      diagnostics: [diag('error', 'project-json', `Fichier illisible : ${(err as Error).message}`, 'project')],
    };
  }

  let version = typeof raw['formatVersion'] === 'number' ? (raw['formatVersion'] as number) : 0;
  while (version < PROJECT_FORMAT_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) {
      diagnostics.push(
        diag('error', 'project-migration', `Aucune migration connue de la version ${version} vers ${version + 1} : le fichier n'est pas chargé plutôt que d'être réinterprété au hasard`, 'project.formatVersion'),
      );
      return { project: null, diagnostics };
    }
    raw = migrate(raw);
    version += 1;
  }
  if (version > PROJECT_FORMAT_VERSION) {
    diagnostics.push(
      diag('error', 'project-future', `Le fichier est en version ${version}, ce moteur lit la version ${PROJECT_FORMAT_VERSION}`, 'project.formatVersion'),
    );
    return { project: null, diagnostics };
  }

  const parsed = projectSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      diagnostics.push(diag('error', 'project-schema', issue.message, `project.${issue.path.join('.')}`));
    }
    return { project: null, diagnostics };
  }
  return { project: parsed.data as unknown as Project, diagnostics };
}
