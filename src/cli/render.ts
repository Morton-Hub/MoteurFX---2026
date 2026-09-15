/**
 * CLI d'export par lots. Preview et export passent par le même compilateur
 * et le même moteur : ce fichier ne contient aucune logique de rendu.
 *
 *   npm run render -- --all --gif --sheet
 *   npm run render -- --spell ice-frost-lance --dirs 16 --frames
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SPELLS, spellById } from '../spells/index.js';
import { captureBounds, frameCount, frameTime, renderFrame } from '../render/renderer.js';
import { DEFAULT_STYLE, RAW_STYLE } from '../style/styleProfile.js';
import { sampleDirections } from '../space/directions.js';
import { encodePng, upscale } from '../export/png.js';
import { encodeGif } from '../export/gif.js';
import { makeSheet, onBackground } from '../export/sheet.js';
import { buildManifest } from '../export/manifest.js';
import type { RGBA } from '../raster/framebuffer.js';
import type { SpellRecipe } from '../sim/types.js';

const DARK: RGBA = [26, 29, 38, 255];
const LIGHT: RGBA = [214, 218, 226, 255];

type Args = {
  spells: SpellRecipe[];
  dirs: number;
  scale: number;
  frames: boolean;
  gif: boolean;
  sheet: boolean;
  raw: boolean;
  outDir: string;
  /** Instants normalises a inspecter en grand, separes par des virgules. */
  inspect: number[] | null;
  inspectScale: number;
  heading: number;
};

function parseArgs(argv: readonly string[]): Args {
  const get = (name: string, fallback?: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1]!.startsWith('--') ? argv[i + 1] : fallback;
  };
  const has = (name: string): boolean => argv.includes(`--${name}`);
  const id = get('spell');
  return {
    spells: has('all') || !id ? [...SPELLS] : [spellById(id)],
    dirs: Number(get('dirs', '8')),
    scale: Number(get('scale', '3')),
    frames: has('frames'),
    gif: has('gif'),
    sheet: has('sheet'),
    raw: has('raw'),
    outDir: get('out', 'out') ?? 'out',
    inspect: get('inspect') ? get('inspect')!.split(',').map(Number) : null,
    inspectScale: Number(get('inspectScale', '4')),
    heading: (Number(get('heading', '0')) * Math.PI) / 180,
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const started = Date.now();

  for (const recipe of args.spells) {
    const dir = join(args.outDir, recipe.id);
    mkdirSync(dir, { recursive: true });
    const dirs = sampleDirections(args.dirs, 0);
    const headings = dirs.map((d) => d.heading);
    const bounds = captureBounds(recipe, headings);
    const n = frameCount(recipe);

    const perDirection = dirs.map((d) =>
      Array.from({ length: n }, (_, i) =>
        renderFrame(recipe, frameTime(recipe, i), {
          heading: d.heading,
          style: args.raw ? RAW_STYLE : DEFAULT_STYLE,
        }).color,
      ),
    );

    if (args.frames) {
      for (let di = 0; di < dirs.length; di++) {
        const dd = dirs[di]!;
        const sub = join(dir, `dir-${String(di).padStart(2, '0')}-${dd.label}`);
        mkdirSync(sub, { recursive: true });
        perDirection[di]!.forEach((fb, i) => {
          writeFileSync(join(sub, `${String(i).padStart(3, '0')}.png`), encodePng(fb));
        });
      }
    }

    if (args.gif) {
      const delay = Math.max(2, Math.round(100 / recipe.fps));
      // Cap 0 sur fond sombre : lecture de l'animation complète.
      const front = perDirection[0]!.map((fb) => upscale(onBackground(fb, DARK), args.scale));
      writeFileSync(join(dir, 'anim-dark.gif'), encodeGif(front, { delayCs: delay, background: [DARK[0], DARK[1], DARK[2]] }));
      const light = perDirection[0]!.map((fb) => upscale(onBackground(fb, LIGHT), args.scale));
      writeFileSync(join(dir, 'anim-light.gif'), encodeGif(light, { delayCs: delay, background: [LIGHT[0], LIGHT[1], LIGHT[2]] }));
    }

    if (args.sheet) {
      // Planche 1 : toutes les images du cap 0.
      writeFileSync(
        join(dir, 'sheet-frames.png'),
        encodePng(
          upscale(
            makeSheet(perDirection[0]!.map((fb) => onBackground(fb, DARK)), {
              cols: 8,
              pad: 2,
              background: [12, 14, 20, 255],
              gridColor: [46, 52, 66, 255],
            }),
            2,
          ),
        ),
      );
      // Planche 2 : un instant clé pour chaque cap.
      const keyT = recipe.events.find((e) => e.id === 'contact')?.at ?? 0.5;
      const keyIndex = Math.min(n - 1, Math.round(keyT * (n - 1)));
      writeFileSync(
        join(dir, 'sheet-directions.png'),
        encodePng(
          upscale(
            makeSheet(
              perDirection.map((f) => onBackground(f[keyIndex]!, DARK)),
              { cols: 4, pad: 2, background: [12, 14, 20, 255], gridColor: [46, 52, 66, 255] },
            ),
            2,
          ),
        ),
      );
    }

    if (args.inspect) {
      const shots = args.inspect.map(
        (t) =>
          renderFrame(recipe, t, {
            heading: args.heading,
            style: args.raw ? RAW_STYLE : DEFAULT_STYLE,
          }).color,
      );
      writeFileSync(
        join(dir, 'inspect.png'),
        encodePng(
          upscale(
            makeSheet(shots.map((fb) => onBackground(fb, DARK)), {
              cols: Math.min(4, shots.length),
              pad: 3,
              background: [12, 14, 20, 255],
              gridColor: [56, 62, 78, 255],
            }),
            args.inspectScale,
          ),
        ),
      );
    }

    const manifest = buildManifest(recipe, dirs, bounds);
    writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    process.stdout.write(
      `${recipe.id.padEnd(24)} ${n} images x ${dirs.length} caps  ` +
        `capture [${bounds.x0},${bounds.y0} -> ${bounds.x1},${bounds.y1}] ` +
        `canvas ${recipe.canvas.width}x${recipe.canvas.height}\n`,
    );
  }
  process.stdout.write(`termine en ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
}

main();
