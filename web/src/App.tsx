/**
 * Atelier MOTORFX2.
 *
 * Une table de travail : bibliothèque à gauche, scène au centre, propriétés à
 * droite, timeline en bas. La preview utilise **le même rendu que l'export**,
 * et la lecture suit les douze expositions, pas une cadence supposée.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { RECIPES } from '../../src/recipes/catalogue.js';
import { getBuilder } from '../../src/recipes/registry.js';
import { compileRecipe } from '../../src/compiler/compile.js';
import { exportSpell } from '../../src/exporter/pack.js';
import { buildZip } from '../../src/exporter/zip.js';
import { encodePng } from '../../src/exporter/png.js';
import { loadProject, makeProject, saveProject } from '../../src/exporter/project.js';
import { sampleDirections, pickDirection } from '../../src/projection/directions.js';
import { ISO_2_1, withOrigin } from '../../src/projection/projection.js';
import type { Diagnostic } from '../../src/core/diagnostics.js';
import type { GeneratedFrame, GenerateResponse, ViewMode } from '../../src/workers/generate.js';
import type { RecipeDefinition } from '../../src/recipes/types.js';
import { Engine } from './engine.js';
import { downloadFile, loadSession, pickFile, saveSession } from './storage.js';
import { DiagnosticsPanel, DirectionGrid, InspectorPanel, LibraryPanel, TimelinePanel } from './panels.js';
import { SceneCanvas } from './scene.js';
import { initialState, reducer, selectedRecipe } from './state.js';

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: 'color', label: 'Couleur' },
  { id: 'mono', label: 'Monochrome' },
  { id: 'silhouette', label: 'Silhouette' },
  { id: 'body', label: 'Corps seul' },
  { id: 'emission', label: 'Émission' },
  { id: 'mask', label: 'Masque' },
];

export function App(): JSX.Element {
  const [state, dispatch] = useReducer(reducer, RECIPES, initialState);
  const [sceneFrames, setSceneFrames] = useState<GeneratedFrame[]>([]);
  const [capFrames, setCapFrames] = useState<GeneratedFrame[]>([]);
  const [diagnostics, setDiagnostics] = useState<readonly Diagnostic[]>([]);
  const [status, setStatus] = useState<{ text: string; kind: 'info' | 'error' }>({ text: 'Prêt', kind: 'info' });
  const [busy, setBusy] = useState(0);
  const engineRef = useRef<Engine | null>(null);
  const capRequest = useRef(0);

  const recipe = selectedRecipe(state);
  const builder = useMemo(() => getBuilder(recipe.builder), [recipe.builder]);

  // Index logique du cap courant : les retouches se rangent par cap exporté.
  const directionIndex = useMemo(() => {
    const dirs = sampleDirections(state.directions, 0);
    return pickDirection(dirs, state.heading);
  }, [state.directions, state.heading]);

  const pivot = useMemo(() => {
    const at = recipe.stage.targetAt ?? { x: 0.5, y: 0.62 };
    const projection = withOrigin(
      ISO_2_1,
      Math.round(recipe.stage.width * at.x),
      Math.round(recipe.stage.height * at.y),
    );
    return { x: projection.originX, y: projection.originY };
  }, [recipe.stage]);

  // --- Moteur ---------------------------------------------------------------

  useEffect(() => {
    const engine = new Engine();
    engineRef.current = engine;
    engine.onResult((response: GenerateResponse) => {
      if (response.frames.length > 0 && response.frames[0]!.frame === -1) return;
      if (response.requestId === capRequest.current) {
        setCapFrames([...response.frames]);
        return;
      }
      setSceneFrames([...response.frames]);
      setDiagnostics(response.diagnostics);
    });
    engine.onStatus((_s, pending) => setBusy(pending));
    if (!engine.usesWorker) {
      setStatus({ text: 'Worker indisponible : rendu synchrone', kind: 'info' });
    }
    return () => engine.dispose();
  }, []);

  // Scène : les douze frames du cap courant. Une requête chasse la précédente.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const handle = setTimeout(() => {
      engine.request({
        recipe,
        patches: state.doc.patches,
        directions: 1,
        startHeading: state.heading,
        directionIndexBase: directionIndex,
        frames: [],
        view: state.view,
        styleId: 'arcane-miniature',
        includeInks: true,
      });
    }, 40);
    return () => clearTimeout(handle);
  }, [recipe, state.doc.patches, state.heading, state.view, directionIndex]);

  // Comparaison des caps : un seul instant, tous les caps.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !state.compare) return;
    const handle = setTimeout(() => {
      capRequest.current = engine.request({
        recipe,
        patches: state.doc.patches,
        directions: state.directions,
        startHeading: 0,
        frames: [state.frame],
        view: state.view,
        styleId: 'arcane-miniature',
      });
    }, 60);
    return () => clearTimeout(handle);
  }, [recipe, state.doc.patches, state.compare, state.directions, state.frame, state.view]);

  // --- Lecture --------------------------------------------------------------

  useEffect(() => {
    if (!state.playing) return;
    const duration = recipe.animation.frameDurationsMs[state.frame] ?? 80;
    // La frame suivante arrive au bout de **son** exposition : la lecture ne
    // suppose aucune cadence fixe.
    const handle = setTimeout(
      () => dispatch({ type: 'frame', index: (state.frame + 1) % 12 }),
      Math.max(16, duration / state.speed),
    );
    return () => clearTimeout(handle);
  }, [state.playing, state.frame, state.speed, recipe.animation.frameDurationsMs]);

  // --- Sauvegarde de session ------------------------------------------------

  useEffect(() => {
    void (async () => {
      const session = await loadSession().catch(() => null);
      if (session && session.recipes.length > 0) {
        dispatch({
          type: 'loadDoc',
          doc: { recipes: session.recipes as RecipeDefinition[], patches: session.patches },
        });
        setStatus({ text: 'Session précédente restaurée', kind: 'info' });
      }
    })();
  }, []);

  useEffect(() => {
    if (!state.dirty) return;
    const handle = setTimeout(() => {
      void saveSession(makeProject({ recipes: state.doc.recipes, patches: state.doc.patches }))
        .then(() => {
          dispatch({ type: 'saved' });
          setStatus({ text: 'Session enregistrée', kind: 'info' });
        })
        .catch((error: Error) => setStatus({ text: `Enregistrement impossible : ${error.message}`, kind: 'error' }));
    }, 1200);
    return () => clearTimeout(handle);
  }, [state.dirty, state.doc]);

  // --- Raccourcis -----------------------------------------------------------

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (event.key === ' ') {
        event.preventDefault();
        dispatch({ type: 'play', playing: !state.playing });
      } else if (event.key === 'ArrowRight') dispatch({ type: 'step', delta: 1 });
      else if (event.key === 'ArrowLeft') dispatch({ type: 'step', delta: -1 });
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.playing]);

  // --- Retouches ------------------------------------------------------------

  const current = sceneFrames.find((f) => f.frame === state.frame);
  const palette = useMemo(() => {
    const entries = new Map<string, string>();
    for (const frame of sceneFrames) {
      for (const entry of frame.palette ?? []) entries.set(entry.key, entry.hex);
    }
    return [...entries.entries()].map(([key, hex]) => ({ key, hex }));
  }, [sceneFrames]);

  const paint = useCallback(
    (x: number, y: number) => {
      if (!current) return;
      if (state.tool === 'picker') {
        const index = current.indices?.[y * current.width + x] ?? 0;
        const hit = current.palette?.find((p) => p.index === index);
        if (hit) dispatch({ type: 'ink', value: hit.key });
        return;
      }
      dispatch({
        type: 'paint',
        direction: directionIndex,
        baseSignature: current.signature,
        pixels: [{ x, y, ink: state.tool === 'eraser' ? null : state.ink }],
      });
    },
    [current, state.tool, state.ink, directionIndex],
  );

  // --- Exports --------------------------------------------------------------

  const exportPack = useCallback(() => {
    try {
      const compiled = compileRecipe(recipe, { probeParams: false });
      const result = exportSpell({
        recipe: compiled,
        directions: state.directions,
        patches: state.doc.patches,
        includeFrames: true,
        includePreview: true,
      });
      const entries = result.files.map((file) => ({
        path: file.path,
        bytes: file.bytes ?? new TextEncoder().encode(file.text ?? ''),
      }));
      downloadFile(`${recipe.id}-pack.zip`, buildZip(entries), 'application/zip');
      setStatus({ text: `Pack exporté : ${entries.length} fichiers, ${state.directions} caps`, kind: 'info' });
    } catch (error) {
      setStatus({ text: `Export impossible : ${(error as Error).message}`, kind: 'error' });
    }
  }, [recipe, state.directions, state.doc.patches]);

  const exportFrame = useCallback(() => {
    if (!current) return;
    const canvas = document.createElement('canvas');
    canvas.width = current.width;
    canvas.height = current.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(current.rgba), current.width, current.height), 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const fb = { width: canvas.width, height: canvas.height, data: data.data } as never;
    downloadFile(`${recipe.id}-f${String(state.frame + 1).padStart(2, '0')}.png`, encodePng(fb), 'image/png');
  }, [current, recipe.id, state.frame]);

  const exportProject = useCallback(() => {
    const project = makeProject({ recipes: state.doc.recipes, patches: state.doc.patches });
    downloadFile('motorfx2-projet.json', saveProject(project), 'application/json');
  }, [state.doc]);

  const importProject = useCallback(() => {
    void (async () => {
      const file = await pickFile('application/json');
      if (!file) return;
      const result = loadProject(await file.text());
      if (!result.project) {
        setDiagnostics(result.diagnostics);
        setStatus({ text: 'Projet refusé : voir les diagnostics', kind: 'error' });
        return;
      }
      dispatch({
        type: 'loadDoc',
        doc: { recipes: result.project.recipes as RecipeDefinition[], patches: result.project.patches },
      });
      setStatus({ text: `Projet chargé : ${result.project.recipes.length} recettes`, kind: 'info' });
    })();
  }, []);

  const duplicate = useCallback(() => {
    const copy: RecipeDefinition = {
      ...recipe,
      id: `${recipe.id}-var${Math.floor(Math.random() * 900 + 100)}`,
      name: `${recipe.name} (variante)`,
      seed: recipe.seed + 17,
    };
    dispatch({ type: 'addRecipe', recipe: copy });
  }, [recipe]);

  // --- Rendu ----------------------------------------------------------------

  const onionBefore = state.onion > 0
    ? sceneFrames.filter((f) => f.frame < state.frame && f.frame >= state.frame - state.onion)
    : [];
  const onionAfter = state.onion > 0
    ? sceneFrames.filter((f) => f.frame > state.frame && f.frame <= state.frame + state.onion)
    : [];

  return (
    <div className="app">
      <header className="bar">
        <h1>MOTORFX2 — atelier de magie en pixel art</h1>
        <div className="bar__tools">
          {VIEWS.map((view) => (
            <button
              key={view.id}
              type="button"
              className={state.view === view.id ? 'on' : ''}
              onClick={() => dispatch({ type: 'view', value: view.id })}
            >
              {view.label}
            </button>
          ))}
          <span className="sep" />
          {[1, 2, 3, 4].map((zoom) => (
            <button
              key={zoom}
              type="button"
              className={state.zoom === zoom ? 'on' : ''}
              onClick={() => dispatch({ type: 'zoom', value: zoom })}
            >
              ×{zoom}
            </button>
          ))}
          <span className="sep" />
          {(['dark', 'light', 'busy'] as const).map((bg) => (
            <button
              key={bg}
              type="button"
              className={state.background === bg ? 'on' : ''}
              onClick={() => dispatch({ type: 'background', value: bg })}
            >
              {bg === 'dark' ? 'Sombre' : bg === 'light' ? 'Clair' : 'Chargé'}
            </button>
          ))}
        </div>
        <div className="bar__status">
          {busy > 0 && <span className="spinner">génération…</span>}
          <span className={status.kind === 'error' ? 'err' : ''}>{status.text}</span>
        </div>
      </header>

      <main>
        <LibraryPanel
          recipes={state.doc.recipes}
          selectedId={state.selectedId}
          onSelect={(id) => dispatch({ type: 'select', id })}
          onNewVariant={duplicate}
        />

        <section className="stage">
          <div className="stage__scene">
            <SceneCanvas
              frame={current}
              onionBefore={onionBefore}
              onionAfter={onionAfter}
              zoom={state.zoom}
              background={state.background}
              showGuides={state.showGuides}
              showCharacter={state.showCharacter}
              pivot={pivot}
              painting={state.tool !== 'none'}
              onPaint={paint}
              onStrokeStart={() => dispatch({ type: 'strokeStart' })}
              onStrokeEnd={() => dispatch({ type: 'strokeEnd' })}
            />
          </div>

          <div className="stage__controls">
            <label>
              Cap
              <input
                type="range"
                min={0}
                max={359}
                step={1}
                value={Math.round((state.heading * 180) / Math.PI)}
                onChange={(e) => dispatch({ type: 'heading', value: (Number(e.target.value) * Math.PI) / 180 })}
              />
              <em>{Math.round((state.heading * 180) / Math.PI)}°</em>
            </label>
            <label>
              <input
                type="checkbox"
                checked={state.compare}
                onChange={(e) => dispatch({ type: 'compare', value: e.target.checked })}
              />
              Comparer les caps
            </label>
            <label>
              <input
                type="checkbox"
                checked={state.showGuides}
                onChange={(e) => dispatch({ type: 'guides', value: e.target.checked })}
              />
              Pivots et limites
            </label>
            <label>
              <input
                type="checkbox"
                checked={state.showCharacter}
                onChange={(e) => dispatch({ type: 'character', value: e.target.checked })}
              />
              Personnage témoin
            </label>
            <span className="sep" />
            {(['none', 'pencil', 'eraser', 'picker'] as const).map((tool) => (
              <button
                key={tool}
                type="button"
                className={state.tool === tool ? 'on' : ''}
                onClick={() => dispatch({ type: 'tool', value: tool })}
              >
                {tool === 'none' ? 'Voir' : tool === 'pencil' ? 'Crayon' : tool === 'eraser' ? 'Gomme' : 'Pipette'}
              </button>
            ))}
            <button type="button" onClick={() => dispatch({ type: 'undo' })} disabled={state.past.length === 0}>
              Annuler
            </button>
            <button type="button" onClick={() => dispatch({ type: 'redo' })} disabled={state.future.length === 0}>
              Rétablir
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'dropPatches', recipeId: recipe.id, frame: state.frame })}
            >
              Effacer les retouches de l’image
            </button>
          </div>

          {state.compare && (
            <DirectionGrid
              frames={capFrames}
              count={state.directions}
              onCount={(count) => dispatch({ type: 'directions', value: count })}
              current={state.heading}
              onPick={(heading) => dispatch({ type: 'heading', value: heading })}
            />
          )}

          <div className="stage__exports">
            <button type="button" onClick={exportPack}>
              Exporter le pack ({state.directions} caps)
            </button>
            <button type="button" onClick={exportFrame}>
              Exporter l’image
            </button>
            <button type="button" onClick={exportProject}>
              Exporter le projet
            </button>
            <button type="button" onClick={importProject}>
              Importer un projet
            </button>
          </div>

          <DiagnosticsPanel diagnostics={diagnostics} />
        </section>

        <InspectorPanel
          recipe={recipe}
          specs={builder.params}
          locks={state.locks}
          onParam={(key, value) => dispatch({ type: 'param', key, value })}
          onSeed={(seed) => dispatch({ type: 'seed', value: seed })}
          onLock={(key, value) => dispatch({ type: 'lock', key, value })}
          palette={palette}
          ink={state.ink}
          onInk={(ink) => dispatch({ type: 'ink', value: ink })}
        />
      </main>

      <TimelinePanel
        recipe={recipe}
        frame={state.frame}
        playing={state.playing}
        speed={state.speed}
        onion={state.onion}
        locked={state.locks.timing}
        onFrame={(index) => dispatch({ type: 'frame', index })}
        onDuration={(frame, value) => dispatch({ type: 'duration', frame, value })}
        onPlay={(playing) => dispatch({ type: 'play', playing })}
        onStep={(delta) => dispatch({ type: 'step', delta })}
        onSpeed={(value) => dispatch({ type: 'speed', value })}
        onOnion={(value) => dispatch({ type: 'onion', value })}
        thumbnails={Array.from({ length: 12 }, (_, i) => sceneFrames.find((f) => f.frame === i))}
      />
    </div>
  );
}
