/**
 * Panneaux de l'atelier : bibliothèque, propriétés, timeline, comparaison
 * des caps, diagnostics.
 *
 * L'interface est sobre : elle présente les FX, elle ne s'impose pas. Aucun
 * contrôle n'est affiché s'il n'a pas d'effet — un curseur inactif serait un
 * mensonge (§13).
 */

import { useEffect, useRef } from 'react';
import type { Diagnostic } from '../../src/core/diagnostics.js';
import type { GeneratedFrame } from '../../src/workers/generate.js';
import type { ParamSpec } from '../../src/recipes/params.js';
import type { RecipeDefinition } from '../../src/recipes/types.js';
import { ELEMENT_MATRIX, FAMILIES } from '../../src/recipes/catalogue.js';
import { totalDurationMs } from '../../src/animation/budget.js';

const ROLE_COLORS: Record<string, string> = {
  cast: '#6f7bd8',
  fly: '#4fa3c7',
  hit: '#d8794f',
  residue: '#7f8a6a',
};

// --- Bibliothèque -----------------------------------------------------------

export function LibraryPanel(props: {
  readonly recipes: readonly RecipeDefinition[];
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
  readonly onNewVariant: () => void;
}): JSX.Element {
  const selected = props.recipes.find((r) => r.id === props.selectedId);
  const custom = props.recipes.filter((r) => !FAMILIES.some((f) => Object.values(f.recipes).includes(r.id)));
  return (
    <div className="panel panel--library">
      <h2>Bibliothèque</h2>
      {FAMILIES.map((family) => (
        <section key={family.id} className="family">
          <header>
            <span className={`dot dot--${family.element}`} />
            {family.label}
          </header>
          <div className="ranks">
            {(['S', 'M', 'L'] as const).map((rank) => {
              const id = family.recipes[rank];
              const recipe = props.recipes.find((r) => r.id === id);
              return (
                <button
                  key={rank}
                  type="button"
                  className={`rank${props.selectedId === id ? ' rank--on' : ''}`}
                  onClick={() => props.onSelect(id)}
                  title={family.signature[rank]}
                >
                  <strong>{rank}</strong>
                  <span>{recipe?.name ?? id}</span>
                </button>
              );
            })}
          </div>
          <p className="family__note">
            {/* Le bouton de rang sélectionne une recette sœur, il n'interpole rien. */}
            S · {family.signature.S} — M · {family.signature.M} — L · {family.signature.L}
          </p>
        </section>
      ))}

      {custom.length > 0 && (
        <section className="family">
          <header>Mes recettes</header>
          <div className="ranks ranks--column">
            {custom.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`rank${props.selectedId === r.id ? ' rank--on' : ''}`}
                onClick={() => props.onSelect(r.id)}
              >
                <strong>{r.rank}</strong>
                <span>{r.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <button type="button" className="wide" onClick={props.onNewVariant} disabled={!selected}>
        Dupliquer en nouvelle recette
      </button>

      <details className="matrix">
        <summary>Matrice des douze éléments</summary>
        <table>
          <tbody>
            {ELEMENT_MATRIX.map((entry) => (
              <tr key={entry.element} className={entry.status === 'delivered' ? 'delivered' : 'concept'}>
                <th>{entry.label}</th>
                <td>{entry.ranks.S.name}</td>
                <td>{entry.ranks.M.name}</td>
                <td>{entry.ranks.L.name}</td>
                <td className="status">{entry.status === 'delivered' ? 'livré' : 'concept'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">
          Seules les lignes « livré » correspondent à des recettes réellement jouables. Les autres
          sont des directions de catalogue.
        </p>
      </details>
    </div>
  );
}

// --- Propriétés -------------------------------------------------------------

export function InspectorPanel(props: {
  readonly recipe: RecipeDefinition;
  readonly specs: readonly ParamSpec[];
  readonly locks: { silhouette: boolean; timing: boolean };
  readonly onParam: (key: string, value: number | boolean | string) => void;
  readonly onSeed: (seed: number) => void;
  readonly onLock: (key: 'silhouette' | 'timing', value: boolean) => void;
  readonly palette: readonly { key: string; hex: string }[];
  readonly ink: string;
  readonly onInk: (ink: string) => void;
}): JSX.Element {
  const groups = new Map<string, ParamSpec[]>();
  for (const spec of props.specs) {
    const group = spec.group ?? 'Réglages';
    groups.set(group, [...(groups.get(group) ?? []), spec]);
  }
  return (
    <div className="panel panel--inspector">
      <h2>{props.recipe.name}</h2>
      <p className="silhouette">{props.recipe.silhouette}</p>

      <div className="locks">
        <label>
          <input
            type="checkbox"
            checked={props.locks.silhouette}
            onChange={(e) => props.onLock('silhouette', e.target.checked)}
          />
          Verrouiller la silhouette
        </label>
        <label>
          <input
            type="checkbox"
            checked={props.locks.timing}
            onChange={(e) => props.onLock('timing', e.target.checked)}
          />
          Verrouiller le rythme
        </label>
      </div>

      {[...groups.entries()].map(([group, specs]) => (
        <section key={group}>
          <header>{group}</header>
          {specs.map((spec) => {
            const value = props.recipe.parameters[spec.key] ?? spec.default;
            if (spec.kind === 'boolean') {
              return (
                <label key={spec.key} className="param param--bool">
                  <input
                    type="checkbox"
                    checked={Boolean(value)}
                    disabled={props.locks.silhouette}
                    onChange={(e) => props.onParam(spec.key, e.target.checked)}
                  />
                  {spec.label}
                </label>
              );
            }
            if (spec.kind === 'choice') {
              return (
                <label key={spec.key} className="param">
                  <span>{spec.label}</span>
                  <select
                    value={String(value)}
                    disabled={props.locks.silhouette}
                    onChange={(e) => props.onParam(spec.key, e.target.value)}
                  >
                    {(spec.choices ?? []).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              );
            }
            return (
              <label key={spec.key} className="param" title={spec.help ?? ''}>
                <span>
                  {spec.label}
                  <em>
                    {typeof value === 'number' ? value.toFixed(spec.step && spec.step < 1 ? 2 : 0) : String(value)}
                    {spec.unit ? ` ${spec.unit}` : ''}
                  </em>
                </span>
                <input
                  type="range"
                  min={spec.min ?? 0}
                  max={spec.max ?? 1}
                  step={spec.step ?? 0.01}
                  value={Number(value)}
                  disabled={props.locks.silhouette}
                  onChange={(e) => props.onParam(spec.key, Number(e.target.value))}
                />
              </label>
            );
          })}
        </section>
      ))}

      <section>
        <header>Variation</header>
        <label className="param">
          <span>
            Seed<em>{props.recipe.seed}</em>
          </span>
          <input
            type="range"
            min={1}
            max={9999}
            step={1}
            value={props.recipe.seed}
            onChange={(e) => props.onSeed(Number(e.target.value))}
          />
        </label>
      </section>

      <section>
        <header>Encre de retouche</header>
        <div className="swatches">
          {props.palette.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className={`swatch${props.ink === entry.key ? ' swatch--on' : ''}`}
              style={{ background: entry.hex }}
              title={entry.key}
              onClick={() => props.onInk(entry.key)}
            />
          ))}
        </div>
        <p className="hint">{props.ink}</p>
      </section>
    </div>
  );
}

// --- Timeline ---------------------------------------------------------------

export function TimelinePanel(props: {
  readonly recipe: RecipeDefinition;
  readonly frame: number;
  readonly playing: boolean;
  readonly speed: number;
  readonly onion: number;
  readonly locked: boolean;
  readonly onFrame: (index: number) => void;
  readonly onDuration: (frame: number, value: number) => void;
  readonly onPlay: (playing: boolean) => void;
  readonly onStep: (delta: number) => void;
  readonly onSpeed: (value: number) => void;
  readonly onOnion: (value: number) => void;
  readonly thumbnails: readonly (GeneratedFrame | undefined)[];
}): JSX.Element {
  const durations = props.recipe.animation.frameDurationsMs;
  const events = props.recipe.animation.events ?? [];
  const clips = Object.entries(props.recipe.clips);
  const roleOf = (index: number): string =>
    clips.find(([, clip]) => clip && index >= clip.range[0] && index <= clip.range[1])?.[0] ?? '';
  const total = totalDurationMs({
    frameCount: 12,
    frameDurationsMs: durations,
    clips: [],
    events: [],
    endBehavior: 'clear',
    frameIndexBase: 0,
  });

  return (
    <div className="panel panel--timeline">
      <div className="transport">
        <button type="button" onClick={() => props.onStep(-1)} title="Image précédente">
          ◀|
        </button>
        <button type="button" onClick={() => props.onPlay(!props.playing)}>
          {props.playing ? '❚❚ Pause' : '▶ Lire'}
        </button>
        <button type="button" onClick={() => props.onStep(1)} title="Image suivante">
          |▶
        </button>
        <label>
          Vitesse
          <select value={props.speed} onChange={(e) => props.onSpeed(Number(e.target.value))}>
            <option value={0.25}>0,25×</option>
            <option value={0.5}>0,5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
          </select>
        </label>
        <label>
          Pelure d’oignon
          <select value={props.onion} onChange={(e) => props.onOnion(Number(e.target.value))}>
            <option value={0}>aucune</option>
            <option value={1}>±1</option>
            <option value={2}>±2</option>
          </select>
        </label>
        <span className="total">
          {total} ms · {durations.length} images · {props.recipe.animation.endBehavior === 'clear' ? 'effacement déclaré' : 'relais'}
        </span>
      </div>

      <ol className="cells">
        {durations.map((duration, index) => {
          const role = roleOf(index);
          const frameEvents = events.filter((e) => e.frame === index);
          const thumb = props.thumbnails[index];
          return (
            <li
              key={index}
              className={`cell${index === props.frame ? ' cell--on' : ''}`}
              style={{ borderColor: ROLE_COLORS[role] ?? '#3a3648' }}
            >
              <button type="button" className="cell__pick" onClick={() => props.onFrame(index)}>
                <span className="cell__index">{String(index + 1).padStart(2, '0')}</span>
                <Thumbnail frame={thumb} />
              </button>
              <span className="cell__role" style={{ background: ROLE_COLORS[role] ?? '#3a3648' }}>
                {role || '—'}
              </span>
              <input
                className="cell__duration"
                type="number"
                min={1}
                max={999}
                value={duration}
                disabled={props.locked}
                onChange={(e) => props.onDuration(index, Number(e.target.value))}
              />
              <span className="cell__events">
                {frameEvents.map((e) => (
                  <em key={e.id} title={e.note ?? e.id}>
                    {e.id}
                  </em>
                ))}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Thumbnail(props: { readonly frame: GeneratedFrame | undefined }): JSX.Element {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    const frame = props.frame;
    if (!canvas || !frame) return;
    canvas.width = frame.width;
    canvas.height = frame.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(frame.rgba), frame.width, frame.height), 0, 0);
  }, [props.frame]);
  return <canvas ref={ref} className="thumb" />;
}

// --- Comparaison des caps ---------------------------------------------------

export function DirectionGrid(props: {
  readonly frames: readonly GeneratedFrame[];
  readonly count: number;
  readonly onCount: (count: number) => void;
  readonly current: number;
  readonly onPick: (heading: number) => void;
}): JSX.Element {
  return (
    <div className="panel panel--directions">
      <header>
        <h2>Caps au même instant</h2>
        <div>
          {[8, 16].map((n) => (
            <button
              key={n}
              type="button"
              className={props.count === n ? 'on' : ''}
              onClick={() => props.onCount(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </header>
      <div className="grid">
        {props.frames.map((frame) => (
          <button
            key={frame.direction}
            type="button"
            className={`grid__cell${Math.abs(frame.heading - props.current) < 1e-6 ? ' grid__cell--on' : ''}`}
            onClick={() => props.onPick(frame.heading)}
            title={`cap ${((frame.heading * 180) / Math.PI).toFixed(0)}°`}
          >
            <Thumbnail frame={frame} />
            <span>{((frame.heading * 180) / Math.PI).toFixed(0)}°</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Diagnostics ------------------------------------------------------------

export function DiagnosticsPanel(props: { readonly diagnostics: readonly Diagnostic[] }): JSX.Element {
  if (props.diagnostics.length === 0) {
    return <p className="diagnostics diagnostics--clean">Aucun diagnostic.</p>;
  }
  const seen = new Map<string, Diagnostic & { count: number }>();
  for (const d of props.diagnostics) {
    const key = `${d.code}|${d.path ?? ''}`;
    const hit = seen.get(key);
    seen.set(key, hit ? { ...hit, count: hit.count + 1 } : { ...d, count: 1 });
  }
  return (
    <ul className="diagnostics">
      {[...seen.values()].map((d) => (
        <li key={`${d.code}${d.path ?? ''}`} className={`diag diag--${d.level}`}>
          <strong>{d.code}</strong>
          <span>{d.message}</span>
          {d.count > 1 && <em>×{d.count}</em>}
        </li>
      ))}
    </ul>
  );
}
