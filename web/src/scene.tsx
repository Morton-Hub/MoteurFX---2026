/**
 * Scène de travail.
 *
 * Affichage à échelle **entière**, sans lissage. La pelure d'oignon a sa
 * propre opacité, qui n'a rien à voir avec l'export. Le personnage témoin est
 * là pour juger l'encombrement réel, pas pour décorer.
 */

import { useEffect, useRef } from 'react';
import type { GeneratedFrame } from '../../src/workers/generate.js';

export type ScenePaint = (x: number, y: number) => void;

export type SceneProps = {
  readonly frame: GeneratedFrame | undefined;
  readonly onionBefore: readonly GeneratedFrame[];
  readonly onionAfter: readonly GeneratedFrame[];
  readonly zoom: number;
  readonly background: 'dark' | 'light' | 'busy';
  readonly showGuides: boolean;
  readonly showCharacter: boolean;
  readonly pivot: { x: number; y: number };
  readonly painting: boolean;
  readonly onPaint?: ScenePaint;
  readonly onStrokeStart?: () => void;
  readonly onStrokeEnd?: () => void;
};

const BACKGROUNDS: Record<SceneProps['background'], string> = {
  dark: '#16141f',
  light: '#d7d4cd',
  busy: '#2f4034',
};

/** Personnage témoin : 32 pixels de haut, la mesure de lisibilité du document. */
function drawCharacter(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number): void {
  const px = (a: number, b: number, w: number, h: number): void => {
    ctx.fillRect((x + a) * zoom, (y + b) * zoom, w * zoom, h * zoom);
  };
  ctx.save();
  ctx.fillStyle = 'rgba(18, 16, 24, 0.85)';
  px(-4, -32, 8, 7); // tête
  px(-6, -25, 12, 13); // torse
  px(-7, -22, 3, 9); // bras
  px(4, -22, 3, 9);
  px(-5, -12, 4, 12); // jambes
  px(1, -12, 4, 12);
  ctx.fillStyle = 'rgba(18, 16, 24, 0.35)';
  ctx.fillRect((x - 7) * zoom, y * zoom, 14 * zoom, 3 * zoom);
  ctx.restore();
}

export function SceneCanvas(props: SceneProps): JSX.Element {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = ref.current;
    const frame = props.frame;
    if (!canvas || !frame) return;
    const zoom = Math.max(1, Math.round(props.zoom));
    canvas.width = frame.width * zoom;
    canvas.height = frame.height * zoom;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = BACKGROUNDS[props.background];
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (props.showCharacter) drawCharacter(ctx, props.pivot.x, props.pivot.y, zoom);

    const blit = (source: GeneratedFrame, alpha: number, tint?: string): void => {
      const image = new ImageData(new Uint8ClampedArray(source.rgba), source.width, source.height);
      const buffer = document.createElement('canvas');
      buffer.width = source.width;
      buffer.height = source.height;
      const bctx = buffer.getContext('2d');
      if (!bctx) return;
      bctx.putImageData(image, 0, 0);
      if (tint) {
        bctx.globalCompositeOperation = 'source-in';
        bctx.fillStyle = tint;
        bctx.fillRect(0, 0, buffer.width, buffer.height);
      }
      ctx.globalAlpha = alpha;
      ctx.drawImage(buffer, 0, 0, buffer.width * zoom, buffer.height * zoom);
      ctx.globalAlpha = 1;
    };

    // Pelure d'oignon : avant en froid, après en chaud. Opacité de
    // visualisation seulement — l'export ne la voit jamais.
    for (const before of props.onionBefore) blit(before, 0.28, '#5f8bd8');
    for (const after of props.onionAfter) blit(after, 0.22, '#d87c5f');
    blit(frame, 1);

    if (props.showGuides) {
      ctx.strokeStyle = 'rgba(255, 120, 190, 0.85)';
      ctx.lineWidth = 1;
      if (frame.bounds) {
        ctx.strokeRect(
          frame.bounds.x0 * zoom + 0.5,
          frame.bounds.y0 * zoom + 0.5,
          (frame.bounds.x1 - frame.bounds.x0 + 1) * zoom - 1,
          (frame.bounds.y1 - frame.bounds.y0 + 1) * zoom - 1,
        );
      }
      ctx.strokeStyle = 'rgba(120, 220, 255, 0.9)';
      ctx.beginPath();
      ctx.moveTo(props.pivot.x * zoom, props.pivot.y * zoom - 6);
      ctx.lineTo(props.pivot.x * zoom, props.pivot.y * zoom + 6);
      ctx.moveTo(props.pivot.x * zoom - 6, props.pivot.y * zoom);
      ctx.lineTo(props.pivot.x * zoom + 6, props.pivot.y * zoom);
      ctx.stroke();
    }
  }, [props.frame, props.onionBefore, props.onionAfter, props.zoom, props.background, props.showGuides, props.showCharacter, props.pivot]);

  const toPixel = (event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    const canvas = ref.current;
    if (!canvas || !props.frame) return null;
    const rect = canvas.getBoundingClientRect();
    const zoom = Math.max(1, Math.round(props.zoom));
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * canvas.width / zoom);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * canvas.height / zoom);
    if (x < 0 || y < 0 || x >= props.frame.width || y >= props.frame.height) return null;
    return { x, y };
  };

  return (
    <canvas
      ref={ref}
      className={`scene-canvas${props.painting ? ' scene-canvas--painting' : ''}`}
      onPointerDown={(event) => {
        if (!props.painting || !props.onPaint) return;
        const p = toPixel(event);
        if (!p) return;
        drawing.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        props.onStrokeStart?.();
        props.onPaint(p.x, p.y);
      }}
      onPointerMove={(event) => {
        if (!drawing.current || !props.onPaint) return;
        const p = toPixel(event);
        if (p) props.onPaint(p.x, p.y);
      }}
      onPointerUp={() => {
        if (!drawing.current) return;
        drawing.current = false;
        props.onStrokeEnd?.();
      }}
      onPointerLeave={() => {
        if (!drawing.current) return;
        drawing.current = false;
        props.onStrokeEnd?.();
      }}
    />
  );
}
