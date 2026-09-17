/**
 * Canevas de pixels **indexés**.
 *
 * Le corps d'un sprite est un tableau d'index, pas de RGBA : c'est ce qui
 * rend vérifiable la règle « palette du corps respectée en mode strict »
 * (§17). La conversion en couleurs n'a lieu qu'à l'affichage ou à l'export.
 *
 * L'index 0 est la transparence franche. Il n'existe pas d'alpha partiel :
 * une silhouette de pixel art a un bord, pas un dégradé.
 */

import { Framebuffer, luma, type RGBA } from './rgba.js';
import { getMaterial, roleColor, type Material, type MaterialId, type RoleId } from './palette.js';
import type { ShapeMask } from './mask.js';

export type InkEntry = {
  readonly index: number;
  readonly key: string;
  readonly materialId: string;
  readonly role: RoleId;
  readonly rgba: RGBA;
};

/** Table des encres d'un canevas. Une entrée = une couleur du sprite. */
export class InkTable {
  private readonly byKey = new Map<string, InkEntry>();
  private readonly byIndex: InkEntry[] = [];

  get size(): number {
    return this.byIndex.length;
  }

  entries(): readonly InkEntry[] {
    return this.byIndex;
  }

  /** Index de l'encre (matière, rôle), créée à la demande. */
  inkOf(material: Material, role: RoleId): number {
    const key = `${material.id}:${role}`;
    const hit = this.byKey.get(key);
    if (hit) return hit.index;
    if (this.byIndex.length >= 255) {
      throw new Error('InkTable: 255 encres atteintes, la palette du sprite déborde');
    }
    const entry: InkEntry = {
      index: this.byIndex.length + 1,
      key,
      materialId: material.id,
      role,
      rgba: roleColor(material, role),
    };
    this.byKey.set(key, entry);
    this.byIndex.push(entry);
    return entry.index;
  }

  entryAt(index: number): InkEntry | undefined {
    return index <= 0 ? undefined : this.byIndex[index - 1];
  }

  colorAt(index: number): RGBA {
    return this.byIndex[index - 1]?.rgba ?? [0, 0, 0, 0];
  }

  /** Nombre de couleurs distinctes, doublons de valeur compris. */
  distinctColors(): number {
    return new Set(this.byIndex.map((e) => e.rgba.join(','))).size;
  }

  clone(): InkTable {
    const out = new InkTable();
    for (const e of this.byIndex) {
      out.byKey.set(e.key, e);
      out.byIndex.push(e);
    }
    return out;
  }
}

export type Rect = { x0: number; y0: number; x1: number; y1: number };

export class IndexedCanvas {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
  readonly table: InkTable;

  constructor(width: number, height: number, table?: InkTable, data?: Uint8Array) {
    if (width <= 0 || height <= 0) throw new Error('IndexedCanvas: dimensions invalides');
    this.width = width;
    this.height = height;
    this.table = table ?? new InkTable();
    this.data = data ?? new Uint8Array(width * height);
  }

  clear(): void {
    this.data.fill(0);
  }

  ink(material: Material | MaterialId, role: RoleId): number {
    const m = typeof material === 'string' ? getMaterial(material) : material;
    return this.table.inkOf(m, role);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  set(x: number, y: number, ink: number): void {
    if (!this.inside(x, y)) return;
    this.data[y * this.width + x] = ink;
  }

  /** Pose une encre seulement si le pixel est encore vide. */
  setBehind(x: number, y: number, ink: number): void {
    if (!this.inside(x, y)) return;
    const i = y * this.width + x;
    if (this.data[i] === 0) this.data[i] = ink;
  }

  get(x: number, y: number): number {
    if (!this.inside(x, y)) return 0;
    return this.data[y * this.width + x] ?? 0;
  }

  isEmpty(): boolean {
    for (let i = 0; i < this.data.length; i++) if (this.data[i] !== 0) return false;
    return true;
  }

  /** Nombre de pixels non transparents. */
  coverage(): number {
    let n = 0;
    for (let i = 0; i < this.data.length; i++) if (this.data[i] !== 0) n++;
    return n;
  }

  bounds(): Rect | null {
    let x0 = this.width;
    let y0 = this.height;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < this.height; y++) {
      const row = y * this.width;
      for (let x = 0; x < this.width; x++) {
        if ((this.data[row + x] ?? 0) === 0) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    return x1 < 0 ? null : { x0, y0, x1, y1 };
  }

  clone(): IndexedCanvas {
    return new IndexedCanvas(this.width, this.height, this.table.clone(), new Uint8Array(this.data));
  }

  /** Copie les pixels non vides de `src` par-dessus. */
  paste(src: IndexedCanvas, dx = 0, dy = 0): void {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const v = src.data[y * src.width + x] ?? 0;
        if (v !== 0) this.set(dx + x, dy + y, v);
      }
    }
  }

  /** Remplit un masque avec une encre constante ou choisie pixel par pixel. */
  fillMask(mask: ShapeMask, ink: number | ((x: number, y: number) => number)): void {
    const pick = typeof ink === 'number' ? () => ink : ink;
    for (let y = 0; y < mask.h; y++) {
      for (let x = 0; x < mask.w; x++) {
        if (mask.bits[y * mask.w + x] !== 1) continue;
        const px = x + mask.x0;
        const py = y + mask.y0;
        const v = pick(px, py);
        if (v !== 0) this.set(px, py, v);
      }
    }
  }

  /** Conversion RGBA pour l'affichage et l'export. */
  toRgba(background?: RGBA): Framebuffer {
    const fb = new Framebuffer(this.width, this.height);
    if (background) fb.fill(background);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const v = this.data[y * this.width + x] ?? 0;
        if (v === 0) continue;
        const c = this.table.colorAt(v);
        const i = (y * this.width + x) * 4;
        fb.data[i] = c[0];
        fb.data[i + 1] = c[1];
        fb.data[i + 2] = c[2];
        fb.data[i + 3] = c[3];
      }
    }
    return fb;
  }

  /** Silhouette pleine : contrôle « la forme se lit sans sa palette ». */
  toSilhouette(color: RGBA = [20, 18, 28, 255]): Framebuffer {
    const fb = new Framebuffer(this.width, this.height);
    for (let i = 0; i < this.data.length; i++) {
      if ((this.data[i] ?? 0) === 0) continue;
      const o = i * 4;
      fb.data[o] = color[0];
      fb.data[o + 1] = color[1];
      fb.data[o + 2] = color[2];
      fb.data[o + 3] = color[3];
    }
    return fb;
  }

  /** Rendu monochrome : contrôle « les éléments restent différents sans couleur ». */
  toMono(): Framebuffer {
    const fb = new Framebuffer(this.width, this.height);
    for (let i = 0; i < this.data.length; i++) {
      const v = this.data[i] ?? 0;
      if (v === 0) continue;
      const g = Math.round(luma(this.table.colorAt(v)));
      const o = i * 4;
      fb.data[o] = g;
      fb.data[o + 1] = g;
      fb.data[o + 2] = g;
      fb.data[o + 3] = 255;
    }
    return fb;
  }

  /** Index réellement présents dans l'image. */
  usedInks(): number[] {
    const seen = new Set<number>();
    for (let i = 0; i < this.data.length; i++) {
      const v = this.data[i] ?? 0;
      if (v !== 0) seen.add(v);
    }
    return [...seen].sort((a, b) => a - b);
  }

  /** Couleurs distinctes réellement présentes dans l'image. */
  usedColorCount(): number {
    const seen = new Set<string>();
    for (const i of this.usedInks()) seen.add(this.table.colorAt(i).join(','));
    return seen.size;
  }

  /** Signature stable du contenu : sert aux patches et au déterminisme. */
  signature(): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < this.data.length; i++) {
      h ^= this.data[i] ?? 0;
      h = Math.imul(h, 0x01000193);
    }
    h ^= this.width * 73856093;
    h = Math.imul(h, 0x01000193);
    h ^= this.height * 19349663;
    return (h >>> 0).toString(16).padStart(8, '0');
  }
}
