/**
 * Atelier de lecture des sorts. La preview utilise exactement le même
 * compilateur et le même moteur que l'export par lots : aucun chemin de rendu
 * parallele, donc aucune divergence possible entre ce qui est vu ici et ce qui
 * est livre.
 *
 * Toute commande visible agit reellement. Les fonctions qui ne peuvent pas
 * exister dans un bac a sable navigateur — l'ecriture de fichiers d'export —
 * ne sont pas affichees du tout plutot que d'etre presentees inertes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SPELLS } from '../../src/spells/index.js';
import {
  captureBounds,
  frameCount,
  frameTime,
  makeContext,
  renderFrame,
  DEFAULT_GROUND_SCALE,
} from '../../src/render/renderer.js';
import { DEFAULT_STYLE, type StyleProfile } from '../../src/style/styleProfile.js';
import { PALETTES } from '../../src/style/palette.js';
import { sampleDirections, pickDirection } from '../../src/space/directions.js';
import { ISO_2_1, project, unprojectGround, withOrigin, withScale } from '../../src/space/projection.js';
import { normAngle, TAU } from '../../src/core/math.js';
import type { SpellRecipe } from '../../src/sim/types.js';
import { paint, useAnimationLoop } from './useEngine.js';

const ELEMENT_LABEL: Record<string, string> = {
  ice: 'Glace',
  lightning: 'Électricité',
  fire: 'Feu',
  water: 'Eau',
  earth: 'Terre',
  wind: 'Vent',
};

const GROUND_TAGS = ['decal', 'crack', 'ring', 'foam', 'dust', 'shadow'];
const DEBRIS_TAGS = [
  'debris', 'shard', 'gravel', 'spark', 'drop', 'spray', 'ember', 'leaf', 'trail',
  'debris-shadow', 'gravel-shadow', 'drop-shadow', 'spray-shadow', 'leaf-shadow',
];

const BACKGROUNDS = [
  { id: 'dark', label: 'Sombre', css: '#12141b' },
  { id: 'light', label: 'Clair', css: '#d6dae2' },
  { id: 'check', label: 'Damier', css: null },
] as const;

type BgId = (typeof BACKGROUNDS)[number]['id'];

function hex(c: readonly number[]): string {
  return `rgb(${c[0] ?? 0}, ${c[1] ?? 0}, ${c[2] ?? 0})`;
}

export function App(): JSX.Element {
  const [spellId, setSpellId] = useState<string>(SPELLS[0]?.id ?? '');
  const recipe = useMemo<SpellRecipe>(
    () => SPELLS.find((s) => s.id === spellId) ?? SPELLS[0]!,
    [spellId],
  );

  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(true);
  const [heading, setHeading] = useState(0);
  const [range, setRange] = useState(recipe.defaultRange);
  const [power, setPower] = useState(recipe.defaultPower);
  const [dirCount, setDirCount] = useState(8);
  const [bg, setBg] = useState<BgId>('dark');
  const [zoom, setZoom] = useState(2);
  const [glow, setGlow] = useState(true);
  const [outline, setOutline] = useState(true);
  const [silhouette, setSilhouette] = useState(false);
  const [showGround, setShowGround] = useState(true);
  const [showDebris, setShowDebris] = useState(true);

  const stageRef = useRef<HTMLCanvasElement>(null);
  const [report, setReport] = useState({ ms: 0, commands: 0 });

  // Changer de recette remet les paramètres semantiques de cette recette.
  useEffect(() => {
    setRange(recipe.defaultRange);
    setPower(recipe.defaultPower);
    setT(0);
  }, [recipe]);

  const frames = frameCount(recipe);
  const frameIndex = Math.min(frames - 1, Math.max(0, Math.round(t * (frames - 1))));

  const style: StyleProfile = useMemo(
    () => ({ ...DEFAULT_STYLE, glow, outline: outline ? 'rim' : 'none' }),
    [glow, outline],
  );

  const hideTags = useMemo(() => {
    const out: string[] = [];
    if (!showGround) out.push(...GROUND_TAGS);
    if (!showDebris) out.push(...DEBRIS_TAGS);
    return out;
  }, [showGround, showDebris]);

  const renderOptions = useMemo(
    () => ({ heading, range, power, style, hideTags, silhouetteOnly: silhouette }),
    [heading, range, power, style, hideTags, silhouette],
  );

  const background = BACKGROUNDS.find((b) => b.id === bg)?.css ?? null;

  // --- Lecture ------------------------------------------------------------
  useAnimationLoop(playing, (dt) => {
    setT((prev) => {
      const next = prev + (dt * speed) / recipe.duration;
      if (next < 1) return next;
      if (loop) return next % 1;
      setPlaying(false);
      return 1;
    });
  });

  // --- Rendu du plateau ---------------------------------------------------
  useEffect(() => {
    const canvas = stageRef.current;
    if (!canvas) return;
    const started = performance.now();
    const result = renderFrame(recipe, frameTime(recipe, frameIndex), renderOptions);
    paint(canvas, result.color, { scale: zoom, background });
    setReport({ ms: performance.now() - started, commands: result.commandCount });
  }, [recipe, frameIndex, renderOptions, zoom, background]);

  const directions = useMemo(
    () => sampleDirections(dirCount, 0, ISO_2_1),
    [dirCount],
  );
  const nearestDir = pickDirection(directions, heading);

  // --- Diagnostics --------------------------------------------------------
  const diagnostics = useMemo(() => {
    const bounds = captureBounds(recipe, directions.map((d) => d.heading), { range, power }, 2);
    const fits =
      bounds.x0 >= 0 &&
      bounds.y0 >= 0 &&
      bounds.x1 < recipe.canvas.width &&
      bounds.y1 < recipe.canvas.height;
    const lastFrame = renderFrame(recipe, 1, { heading, range, power, style: DEFAULT_STYLE });
    return { bounds, fits, endsClean: lastFrame.color.isEmpty() };
  }, [recipe, directions, range, power, heading]);

  const step = useCallback(
    (delta: number) => {
      setPlaying(false);
      const next = (frameIndex + delta + frames) % frames;
      setT(frames <= 1 ? 0 : next / (frames - 1));
    },
    [frameIndex, frames],
  );

  const palette = PALETTES[recipe.element];

  return (
    <div className="shell">
      <header className="masthead">
        <div>
          <h1>MoteurFX 2026 · catalogue élémentaire</h1>
          <p className="sub">
            Six sorts procéduraux, un par élément de base. Rendus à la volée par le moteur
            déterministe : cap libre sur 360°, projection isométrique 2:1, rastériseur logiciel
            sans anti-crénelage.
          </p>
        </div>
        <div className="stamp">
          moteur 2.0.0-j3
          <br />
          schema 2.0.0 · seed 0x5eed
          <br />
          {DEFAULT_GROUND_SCALE} px / tuile
        </div>
      </header>

      <div className="layout">
        <aside className="panel">
          <div className="panel-head">Éléments</div>
          <div className="spell-list">
            {SPELLS.map((s) => {
              const pal = PALETTES[s.element];
              return (
                <button
                  key={s.id}
                  type="button"
                  className="spell-item"
                  aria-pressed={s.id === recipe.id}
                  onClick={() => setSpellId(s.id)}
                >
                  <span
                    className="swatch"
                    style={{
                      background: `linear-gradient(180deg, ${hex(pal.ramp[0] ?? [0, 0, 0])}, ${hex(
                        pal.ramp[3] ?? [0, 0, 0],
                      )})`,
                    }}
                  />
                  <span>
                    <span className="elm">{ELEMENT_LABEL[s.element] ?? s.element}</span>
                    <br />
                    <span className="ttl">{s.title}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <main style={{ display: 'grid', gap: 12 }}>
          <div className={`stage-wrap ${bg}`}>
            <canvas ref={stageRef} className="pixels" aria-label={`Aperçu de ${recipe.title}`} />
          </div>

          <div className="panel">
            <div className="panel-body">
              <div className="transport">
                <button
                  type="button"
                  className="ctl primary"
                  onClick={() => {
                    if (!playing && t >= 1) setT(0);
                    setPlaying((p) => !p);
                  }}
                >
                  {playing ? 'Pause' : 'Lecture'}
                </button>
                <button type="button" className="ctl" onClick={() => step(-1)}>
                  ◀ image
                </button>
                <button type="button" className="ctl" onClick={() => step(1)}>
                  image ▶
                </button>
                <button
                  type="button"
                  className="ctl"
                  aria-pressed={loop}
                  onClick={() => setLoop((v) => !v)}
                >
                  Boucle
                </button>
                {[0.25, 0.5, 1].map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="ctl"
                    aria-pressed={speed === s}
                    onClick={() => setSpeed(s)}
                  >
                    {s}×
                  </button>
                ))}
                <span className="val" style={{ marginLeft: 'auto' }}>
                  image {String(frameIndex + 1).padStart(2, '0')} / {frames} ·{' '}
                  {(frameTime(recipe, frameIndex) * recipe.duration).toFixed(2)} s /{' '}
                  {recipe.duration.toFixed(2)} s
                </span>
              </div>

              <div className="timeline">
                <div className="events">
                  {recipe.events.map((e, i) => (
                    <button
                      key={`${e.id}-${e.at}`}
                      type="button"
                      className="event-mark"
                      // Deux reperes peuvent tomber au meme instant : on les
                      // decale d'une ligne sur deux pour qu'ils restent lisibles.
                      style={{ left: `${e.at * 100}%`, top: i % 2 === 0 ? 0 : 13 }}
                      data-hot={Math.abs(e.at - t) < 0.02}
                      title={e.note ?? e.id}
                      onClick={() => {
                        setPlaying(false);
                        setT(e.at);
                      }}
                    >
                      {e.id}
                    </button>
                  ))}
                </div>
                <input
                  id="scrub"
                  type="range"
                  min={0}
                  max={frames - 1}
                  step={1}
                  value={frameIndex}
                  onChange={(ev) => {
                    setPlaying(false);
                    setT(frames <= 1 ? 0 : Number(ev.target.value) / (frames - 1));
                  }}
                  aria-label="Position dans le clip"
                />
              </div>

              <div className="row">
                <span className="legend" style={{ alignSelf: 'center' }}>Fond</span>
                {BACKGROUNDS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className="ctl"
                    aria-pressed={bg === b.id}
                    onClick={() => setBg(b.id)}
                  >
                    {b.label}
                  </button>
                ))}
                <span className="legend" style={{ alignSelf: 'center', marginLeft: 8 }}>Zoom</span>
                {[1, 2, 3].map((z) => (
                  <button
                    key={z}
                    type="button"
                    className="ctl"
                    aria-pressed={zoom === z}
                    onClick={() => setZoom(z)}
                  >
                    ×{z}
                  </button>
                ))}
              </div>

              <div className="row">
                <span className="legend" style={{ alignSelf: 'center' }}>Isoler</span>
                <button type="button" className="ctl" aria-pressed={silhouette} onClick={() => setSilhouette((v) => !v)}>
                  Silhouette
                </button>
                <button type="button" className="ctl" aria-pressed={!glow} onClick={() => setGlow((v) => !v)}>
                  Sans lumière
                </button>
                <button type="button" className="ctl" aria-pressed={!outline} onClick={() => setOutline((v) => !v)}>
                  Sans liseré
                </button>
                <button type="button" className="ctl" aria-pressed={!showGround} onClick={() => setShowGround((v) => !v)}>
                  Sans sol
                </button>
                <button type="button" className="ctl" aria-pressed={!showDebris} onClick={() => setShowDebris((v) => !v)}>
                  Sans débris
                </button>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              Comparaison des caps · image {frameIndex + 1} · {dirCount} directions
              échantillonnées dans le repère monde
            </div>
            <div className="panel-body">
              <div className="row">
                {[8, 16].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="ctl"
                    aria-pressed={dirCount === n}
                    onClick={() => setDirCount(n)}
                  >
                    {n} directions
                  </button>
                ))}
                <span className="val" style={{ alignSelf: 'center', marginLeft: 'auto' }}>
                  cap libre {((normAngle(heading) * 180) / Math.PI).toFixed(1)}° · cap exporté le
                  plus proche {directions[nearestDir]?.label ?? '—'}
                </span>
              </div>
              <DirectionGrid
                recipe={recipe}
                t={frameTime(recipe, frameIndex)}
                options={renderOptions}
                directions={directions}
                active={nearestDir}
                background={background}
                onPick={(h) => setHeading(h)}
              />
            </div>
          </div>
        </main>

        <aside style={{ display: 'grid', gap: 12 }}>
          <div className="panel">
            <div className="panel-head">Cap, portée, rang</div>
            <div className="panel-body">
              <HeadingDial
                heading={heading}
                range={range}
                maxRange={5}
                onChange={(h, r) => {
                  setHeading(h);
                  setRange(r);
                }}
                accent={hex(palette.ramp[1] ?? [255, 255, 255])}
              />
              <div className="field">
                <label htmlFor="range-input">
                  Portée <span className="val">{range.toFixed(2)} tuiles</span>
                </label>
                <input
                  id="range-input"
                  type="range"
                  min={0.6}
                  max={5}
                  step={0.05}
                  value={range}
                  onChange={(e) => setRange(Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label htmlFor="power-input">
                  Rang <span className="val">{power.toFixed(2)}</span>
                </label>
                <input
                  id="power-input"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={power}
                  onChange={(e) => setPower(Number(e.target.value))}
                />
                <p className="note">
                  Le rang change le comportement — nombre de lances, de dalles, de langues, de
                  branches — et jamais la résolution des pixels.
                </p>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">{recipe.title}</div>
            <div className="panel-body">
              <p className="concept">{recipe.concept}</p>
              <div>
                <div className="legend" style={{ marginBottom: 6 }}>Signature de forme</div>
                <ul className="signature">
                  {recipe.signature.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">Diagnostics</div>
            <div className="panel-body">
              <div className="diag">
                <div>
                  <span>canevas</span>
                  <b>
                    {recipe.canvas.width}×{recipe.canvas.height}
                  </b>
                </div>
                <div>
                  <span>pivot</span>
                  <b>
                    {recipe.pivot.x}, {recipe.pivot.y}
                  </b>
                </div>
                <div className={diagnostics.fits ? 'good' : 'warn'}>
                  <span>limites de capture</span>
                  <b>
                    {diagnostics.fits ? 'contenues' : 'dépassement'}
                  </b>
                </div>
                <div>
                  <span>rect. {dirCount} caps</span>
                  <b>
                    {diagnostics.bounds.x0},{diagnostics.bounds.y0} →{' '}
                    {diagnostics.bounds.x1},{diagnostics.bounds.y1}
                  </b>
                </div>
                <div className={diagnostics.endsClean ? 'good' : 'warn'}>
                  <span>fin de clip</span>
                  <b>{diagnostics.endsClean ? 'vide' : 'objets restants'}</b>
                </div>
                <div>
                  <span>commandes</span>
                  <b>{report.commands}</b>
                </div>
                <div>
                  <span>rendu image</span>
                  <b>{report.ms.toFixed(1)} ms</b>
                </div>
                <div>
                  <span>cadence / durée</span>
                  <b>
                    {recipe.fps} Hz · {recipe.duration.toFixed(2)} s
                  </b>
                </div>
                <div>
                  <span>rendu partagé entre caps</span>
                  <b>{recipe.radial ? 'oui (radial)' : 'non'}</b>
                </div>
              </div>
              <p className="note">
                Une planche à 8 ou 16 directions est une approximation discrète d'un moteur à
                cap libre : le cadran ci-dessus vise en continu, l'export échantillonne. L'écriture
                de fichiers se fait par la ligne de commande du dépôt — elle n'est pas proposée ici
                plutôt que d'afficher un bouton sans effet.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

type DirectionGridProps = {
  recipe: SpellRecipe;
  t: number;
  options: Parameters<typeof renderFrame>[2];
  directions: ReturnType<typeof sampleDirections>;
  active: number;
  background: string | null;
  onPick: (heading: number) => void;
};

function DirectionGrid(props: DirectionGridProps): JSX.Element {
  const { recipe, t, options, directions, active, background, onPick } = props;
  const refs = useRef<(HTMLCanvasElement | null)[]>([]);

  useEffect(() => {
    directions.forEach((d, i) => {
      const canvas = refs.current[i];
      if (!canvas) return;
      const result = renderFrame(recipe, t, { ...options, heading: d.heading });
      paint(canvas, result.color, { scale: 1, background });
    });
  }, [recipe, t, options, directions, background]);

  return (
    <div className="dirs">
      {directions.map((d, i) => (
        <button
          key={d.index}
          type="button"
          className="dir-cell"
          aria-pressed={i === active}
          onClick={() => onPick(d.heading)}
          title={`${d.label} — ${((d.heading * 180) / Math.PI).toFixed(1)}° monde`}
        >
          <canvas
            ref={(el) => {
              refs.current[i] = el;
            }}
          />
          <span>{d.label}</span>
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

type DialProps = {
  heading: number;
  range: number;
  maxRange: number;
  accent: string;
  onChange: (heading: number, range: number) => void;
};

/**
 * Vue isometrique de visée. On revient du point écran vers le sol avant de
 * calculer la direction : c'est la même conversion que celle qu'un jeu ferait
 * avec la souris. Si la cible rejoint le lanceur, le cap précédent est
 * conserve au lieu de devenir indefini.
 */
function HeadingDial(props: DialProps): JSX.Element {
  const { heading, range, maxRange, accent, onChange } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  const [dragging, setDragging] = useState(false);

  const draw = useCallback(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(160, Math.round(rect.width));
    const h = Math.round(w / 2);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const scale = (w * 0.44) / maxRange;
    const proj = withOrigin(withScale(ISO_2_1, scale, scale), w / 2, h * 0.46);
    ctx.clearRect(0, 0, w, h);

    const css = getComputedStyle(canvas);
    const line = css.getPropertyValue('--line').trim() || '#333';
    const muted = css.getPropertyValue('--muted').trim() || '#888';
    const text = css.getPropertyValue('--text').trim() || '#eee';

    // Tuiles de sol : le repère du jeu, pas un cercle abstrait.
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    const span = Math.ceil(maxRange);
    for (let i = -span; i <= span; i++) {
      const a = project(proj, { x: i, y: -span, z: 0 });
      const b = project(proj, { x: i, y: span, z: 0 });
      const c = project(proj, { x: -span, y: i, z: 0 });
      const d = project(proj, { x: span, y: i, z: 0 });
      ctx.globalAlpha = i === 0 ? 0.55 : 0.2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Lanceur : silhouette de personnage a l'échelle d'une tuile.
    const feet = project(proj, { x: 0, y: 0, z: 0 });
    const head = project(proj, { x: 0, y: 0, z: 1.05 });
    ctx.strokeStyle = muted;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(feet.x, feet.y);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.beginPath();
    ctx.ellipse(feet.x, feet.y, scale * 0.3, scale * 0.15, 0, 0, TAU);
    ctx.fill();

    // Caps exportes : huit repères monde, inegalement espacés a l'écran.
    ctx.fillStyle = line;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const p = project(proj, { x: Math.cos(a) * maxRange * 0.93, y: Math.sin(a) * maxRange * 0.93, z: 0 });
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, TAU);
      ctx.fill();
    }

    // Cible et trait de visée.
    const target = { x: Math.cos(heading) * range, y: Math.sin(heading) * range, z: 0 };
    const tp = project(proj, target);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(feet.x, feet.y);
    ctx.lineTo(tp.x, tp.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.ellipse(tp.x, tp.y, 5, 2.6, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = text;
    ctx.font = '500 10px "IBM Plex Mono", monospace';
    ctx.fillText(`${((normAngle(heading) * 180) / Math.PI).toFixed(0)}°`, tp.x + 8, tp.y - 6);
  }, [heading, range, maxRange, accent]);

  useEffect(() => {
    draw();
    const onResize = (): void => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw]);

  const handle = useCallback(
    (ev: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = ref.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const w = canvas.width;
      const h = canvas.height;
      const scale = (w * 0.44) / maxRange;
      const proj = withOrigin(withScale(ISO_2_1, scale, scale), w / 2, h * 0.46);
      const px = ((ev.clientX - rect.left) / rect.width) * w;
      const py = ((ev.clientY - rect.top) / rect.height) * h;
      const ground = unprojectGround(proj, { x: px, y: py });
      const dist = Math.hypot(ground.x, ground.y);
      // Source et cible confondues : on garde le cap courant, jamais NaN.
      const nextHeading = dist < 1e-3 ? heading : Math.atan2(ground.y, ground.x);
      onChange(normAngle(nextHeading), Math.min(maxRange, Math.max(0.6, dist)));
    },
    [heading, maxRange, onChange],
  );

  return (
    <canvas
      ref={ref}
      className="dial"
      aria-label="Déplacer la cible autour du lanceur"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        handle(e);
      }}
      onPointerMove={(e) => {
        if (dragging) handle(e);
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        setDragging(false);
      }}
    />
  );
}

/** Reexporte pour garder le contexte disponible aux futurs inspecteurs. */
export { makeContext };
