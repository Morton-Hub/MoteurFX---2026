/**
 * Masque de couverture binaire. Toute primitive composee (ruban, reseau de
 * traits, amas de facettes) est d'abord accumulee ici puis melangee une seule
 * fois : sans cela, deux quads voisins d'un même ruban semi-transparent se
 * melangeraient deux fois sur leur recouvrement.
 */

import type { Vec2 } from '../core/math.js';

export class ShapeMask {
  readonly x0: number;
  readonly y0: number;
  readonly w: number;
  readonly h: number;
  readonly bits: Uint8Array;
  private touched = false;

  constructor(x0: number, y0: number, w: number, h: number) {
    this.x0 = x0;
    this.y0 = y0;
    this.w = Math.max(0, w);
    this.h = Math.max(0, h);
    this.bits = new Uint8Array(this.w * this.h);
  }

  get isEmpty(): boolean {
    return !this.touched;
  }

  /** Masque borne aux points fournis, avec marge, et coupe au cadre. */
  static forPoints(pts: readonly Vec2[], pad: number, clipW: number, clipH: number): ShapeMask {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    if (!Number.isFinite(minX)) return new ShapeMask(0, 0, 0, 0);
    const x0 = Math.max(0, Math.floor(minX - pad));
    const y0 = Math.max(0, Math.floor(minY - pad));
    const x1 = Math.min(clipW - 1, Math.ceil(maxX + pad));
    const y1 = Math.min(clipH - 1, Math.ceil(maxY + pad));
    return new ShapeMask(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  }

  set(x: number, y: number): void {
    const lx = x - this.x0;
    const ly = y - this.y0;
    if (lx < 0 || ly < 0 || lx >= this.w || ly >= this.h) return;
    this.bits[ly * this.w + lx] = 1;
    this.touched = true;
  }

  get(x: number, y: number): boolean {
    const lx = x - this.x0;
    const ly = y - this.y0;
    if (lx < 0 || ly < 0 || lx >= this.w || ly >= this.h) return false;
    return this.bits[ly * this.w + lx] === 1;
  }

  /** Remplissage par balayage, règle pair-impair, échantillonné au centre du pixel. */
  addPolygon(pts: readonly Vec2[]): void {
    const n = pts.length;
    if (n < 3) return;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const yStart = Math.max(this.y0, Math.round(minY - 0.5));
    const yEnd = Math.min(this.y0 + this.h - 1, Math.round(maxY + 0.5));
    const xs: number[] = [];
    for (let y = yStart; y <= yEnd; y++) {
      const sy = y + 0.5;
      xs.length = 0;
      for (let i = 0; i < n; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % n]!;
        if (a.y === b.y) continue;
        const lo = Math.min(a.y, b.y);
        const hi = Math.max(a.y, b.y);
        if (sy < lo || sy >= hi) continue;
        xs.push(a.x + ((sy - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
      if (xs.length < 2) continue;
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const sxa = xs[k]!;
        const sxb = xs[k + 1]!;
        const xStart = Math.max(this.x0, Math.round(sxa - 0.5));
        const xEnd = Math.min(this.x0 + this.w - 1, Math.round(sxb + 0.5) - 1);
        for (let x = xStart; x <= xEnd; x++) {
          const cx = x + 0.5;
          if (cx >= sxa && cx < sxb) this.set(x, y);
        }
      }
    }
  }

  addDisc(cx: number, cy: number, r: number): void {
    if (r <= 0) return;
    const r2 = r * r;
    const yStart = Math.max(this.y0, Math.floor(cy - r));
    const yEnd = Math.min(this.y0 + this.h - 1, Math.ceil(cy + r));
    for (let y = yStart; y <= yEnd; y++) {
      const dy = y + 0.5 - cy;
      const span = r2 - dy * dy;
      if (span < 0) continue;
      const half = Math.sqrt(span);
      const xStart = Math.max(this.x0, Math.floor(cx - half));
      const xEnd = Math.min(this.x0 + this.w - 1, Math.ceil(cx + half));
      for (let x = xStart; x <= xEnd; x++) {
        const dx = x + 0.5 - cx;
        if (dx * dx + dy * dy <= r2) this.set(x, y);
      }
    }
  }

  addEllipse(cx: number, cy: number, rx: number, ry: number): void {
    if (rx <= 0 || ry <= 0) return;
    const yStart = Math.max(this.y0, Math.floor(cy - ry));
    const yEnd = Math.min(this.y0 + this.h - 1, Math.ceil(cy + ry));
    for (let y = yStart; y <= yEnd; y++) {
      const dy = (y + 0.5 - cy) / ry;
      if (dy * dy > 1) continue;
      const half = rx * Math.sqrt(1 - dy * dy);
      const xStart = Math.max(this.x0, Math.floor(cx - half));
      const xEnd = Math.min(this.x0 + this.w - 1, Math.ceil(cx + half));
      for (let x = xStart; x <= xEnd; x++) this.set(x, y);
    }
  }

  /** Anneau elliptique, pour les ondes de sol et les arcs de vent. */
  addEllipseRing(cx: number, cy: number, rx: number, ry: number, thickness: number): void {
    const inner = Math.max(0, 1 - thickness / Math.max(rx, 1e-6));
    const yStart = Math.max(this.y0, Math.floor(cy - ry));
    const yEnd = Math.min(this.y0 + this.h - 1, Math.ceil(cy + ry));
    for (let y = yStart; y <= yEnd; y++) {
      const dy = (y + 0.5 - cy) / ry;
      if (dy * dy > 1) continue;
      const xStart = Math.max(this.x0, Math.floor(cx - rx));
      const xEnd = Math.min(this.x0 + this.w - 1, Math.ceil(cx + rx));
      for (let x = xStart; x <= xEnd; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const d = dx * dx + dy * dy;
        if (d <= 1 && d >= inner * inner) this.set(x, y);
      }
    }
  }

  /** Segment epais : brosse carree le long d'un trace de Bresenham flottant. */
  addSegment(a: Vec2, b: Vec2, width: number): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 2));
    const half = Math.max(0, (width - 1) / 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      if (width <= 1) {
        this.set(Math.floor(px), Math.floor(py));
      } else {
        const x0 = Math.floor(px - half);
        const x1 = Math.floor(px + half);
        const y0 = Math.floor(py - half);
        const y1 = Math.floor(py + half);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y);
      }
    }
  }

  addPolyline(pts: readonly Vec2[], width: number): void {
    for (let i = 0; i + 1 < pts.length; i++) this.addSegment(pts[i]!, pts[i + 1]!, width);
  }

  /** Ruban a largeur variable : un quad par segment, sans double melange. */
  addRibbon(pts: readonly Vec2[], widths: readonly number[]): void {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const wa = Math.max(0, widths[i] ?? widths[widths.length - 1] ?? 1);
      const wb = Math.max(0, widths[i + 1] ?? wa);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const nx = -dy / len;
      const ny = dx / len;
      this.addPolygon([
        { x: a.x + nx * wa * 0.5, y: a.y + ny * wa * 0.5 },
        { x: b.x + nx * wb * 0.5, y: b.y + ny * wb * 0.5 },
        { x: b.x - nx * wb * 0.5, y: b.y - ny * wb * 0.5 },
        { x: a.x - nx * wa * 0.5, y: a.y - ny * wa * 0.5 },
      ]);
      // Jonction : evite les encoches sur les angles vifs.
      if (i > 0 && wa > 1.5) this.addDisc(a.x, a.y, wa * 0.5);
    }
  }

  /** Retire du masque les pixels d'un autre masque (vides internes). */
  subtract(other: ShapeMask): void {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.bits[y * this.w + x] === 1 && other.get(x + this.x0, y + this.y0)) {
          this.bits[y * this.w + x] = 0;
        }
      }
    }
  }

  /** Contour intérieur : pixels du masque ayant un voisin vide. */
  edge(): ShapeMask {
    const out = new ShapeMask(this.x0, this.y0, this.w, this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.bits[y * this.w + x] !== 1) continue;
        const l = x > 0 ? this.bits[y * this.w + x - 1] : 0;
        const r = x < this.w - 1 ? this.bits[y * this.w + x + 1] : 0;
        const u = y > 0 ? this.bits[(y - 1) * this.w + x] : 0;
        const d = y < this.h - 1 ? this.bits[(y + 1) * this.w + x] : 0;
        if (!l || !r || !u || !d) out.set(x + this.x0, y + this.y0);
      }
    }
    return out;
  }
}
