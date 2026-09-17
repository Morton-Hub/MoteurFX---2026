/**
 * Paramètres sémantiques.
 *
 * « Facettes », « élancement », « propagation du givre », « reprise de
 * décharge » : l'éditeur doit montrer des réglages qui veulent dire quelque
 * chose, et **aucun contrôle ne doit être présenté comme fonctionnel si le
 * moteur ignore sa valeur** (§13).
 *
 * D'où la lecture tracée : chaque accès est enregistré, et le compilateur
 * peut dire quels paramètres déclarés ne sont jamais consommés.
 */

import { diag, type Diagnostic } from '../core/diagnostics.js';

export type ParamSpec = {
  readonly key: string;
  readonly label: string;
  readonly kind: 'number' | 'integer' | 'boolean' | 'choice';
  readonly default: number | boolean | string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly choices?: readonly string[];
  readonly unit?: string;
  /** Regroupement dans l'inspecteur. */
  readonly group?: string;
  readonly help?: string;
};

export type ParamValues = Readonly<Record<string, number | boolean | string>>;

export class ParamBag {
  private readonly specs: Map<string, ParamSpec>;
  private readonly values: ParamValues;
  private readonly read = new Set<string>();

  constructor(specs: readonly ParamSpec[], values: ParamValues) {
    this.specs = new Map(specs.map((s) => [s.key, s]));
    this.values = values;
  }

  private raw(key: string): number | boolean | string {
    const spec = this.specs.get(key);
    if (!spec) throw new Error(`Paramètre non déclaré : "${key}"`);
    this.read.add(key);
    const v = this.values[key];
    return v === undefined ? spec.default : v;
  }

  num(key: string): number {
    const v = this.raw(key);
    if (typeof v !== 'number') throw new Error(`Paramètre "${key}" : nombre attendu`);
    const spec = this.specs.get(key) as ParamSpec;
    const lo = spec.min ?? -Infinity;
    const hi = spec.max ?? Infinity;
    return Math.min(hi, Math.max(lo, v));
  }

  int(key: string): number {
    return Math.round(this.num(key));
  }

  bool(key: string): boolean {
    const v = this.raw(key);
    if (typeof v !== 'boolean') throw new Error(`Paramètre "${key}" : booléen attendu`);
    return v;
  }

  choice(key: string): string {
    const v = this.raw(key);
    if (typeof v !== 'string') throw new Error(`Paramètre "${key}" : choix attendu`);
    return v;
  }

  /** Clés réellement lues pendant la construction des frames. */
  consumed(): readonly string[] {
    return [...this.read];
  }

  /** Diagnostics : clés inconnues, hors bornes, déclarées mais jamais lues. */
  audit(path = 'parameters'): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const key of Object.keys(this.values)) {
      if (!this.specs.has(key)) {
        out.push(diag('error', 'param-unknown', `Paramètre inconnu "${key}"`, `${path}.${key}`));
      }
    }
    for (const [key, spec] of this.specs) {
      const v = this.values[key];
      if (v === undefined) continue;
      if (spec.kind === 'number' || spec.kind === 'integer') {
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          out.push(diag('error', 'param-type', `"${key}" doit être un nombre`, `${path}.${key}`));
          continue;
        }
        if ((spec.min !== undefined && v < spec.min) || (spec.max !== undefined && v > spec.max)) {
          out.push(
            diag('warning', 'param-range', `"${key}" = ${v} sort de [${spec.min ?? '-∞'}, ${spec.max ?? '+∞'}] : la valeur est ramenée aux bornes`, `${path}.${key}`),
          );
        }
      }
      if (spec.kind === 'choice' && spec.choices && typeof v === 'string' && !spec.choices.includes(v)) {
        out.push(diag('error', 'param-choice', `"${key}" = "${v}" n'est pas un choix valide`, `${path}.${key}`));
      }
    }
    for (const [key] of this.specs) {
      if (!this.read.has(key)) {
        out.push(
          diag('warning', 'param-unused', `Le paramètre "${key}" est déclaré mais n'a été lu par aucune frame : le contrôle serait inactif dans l'éditeur`, `${path}.${key}`),
        );
      }
    }
    return out;
  }
}

export function defaultsOf(specs: readonly ParamSpec[]): ParamValues {
  const out: Record<string, number | boolean | string> = {};
  for (const s of specs) out[s.key] = s.default;
  return out;
}
