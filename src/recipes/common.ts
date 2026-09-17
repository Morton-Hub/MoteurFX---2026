/**
 * Fabriques d'objets partagées entre recettes.
 *
 * Partager les outils et les petits motifs, sans forcer la même forme
 * principale : les trois sorts de feu peuvent partager une braise, mais le
 * météore a une masse rocheuse et la colonne une structure verticale qui lui
 * sont propres (§11).
 */

import type { Vec3 } from '../core/math.js';
import { getMaterial, type MaterialId, type RoleId } from '../pixels/palette.js';
import type { ShapeMask } from '../pixels/mask.js';
import { paintEmissive, paintOutline, paintRole } from '../pixels/shade.js';
import { drawMotif, type PixelMotif } from '../motifs/index.js';
import { paintGroundShadow } from '../geometry/ground.js';
import type { FrameContext } from '../renderer/context.js';
import type { Piece } from '../renderer/piece.js';

/** Objet libre : le rendu est décrit par une fonction, la profondeur par le monde. */
export function piece(
  id: string,
  depth: number,
  paint: Piece['paint'],
  layer?: Piece['layer'],
): Piece {
  return layer ? { id, depth, paint, layer } : { id, depth, paint };
}

/** Ombre portée au sol, tramée. Elle dit la hauteur du projectile. */
export function shadowPiece(ctx: FrameContext, id: string, at: Vec3, radius: number, density = 0.5): Piece {
  return {
    id,
    // L'ombre est au sol : sa profondeur est celle du sol, pas celle de l'objet.
    depth: ctx.depth({ x: at.x, y: at.y, z: 0 }) - 0.5,
    paint: (canvas) => {
      paintGroundShadow(canvas, ctx, at, radius, { id, density });
    },
  };
}

/** Motif dessiné posé à une position monde. */
export function motifPiece(
  ctx: FrameContext,
  o: {
    id: string;
    motif: PixelMotif;
    at: Vec3;
    frame?: number;
    scale?: number;
    flipX?: boolean;
    material?: MaterialId;
    roleShift?: number;
    depthBias?: number;
  },
): Piece {
  const screen = ctx.p(o.at);
  return {
    id: o.id,
    depth: ctx.depth(o.at) + (o.depthBias ?? 0),
    paint: (canvas) => {
      drawMotif(
        canvas,
        o.motif,
        {
          x: screen.x,
          y: screen.y,
          frame: o.frame ?? 0,
          scale: o.scale ?? 1,
          flipX: o.flipX ?? false,
        },
        {
          ...(o.material ? { material: o.material } : {}),
          ...(o.roleShift ? { roleShift: o.roleShift } : {}),
        },
      );
    },
  };
}

/** Masse émissive : flamme, décharge. L'épaisseur porte la couleur. */
export function emissivePiece(
  ctx: FrameContext,
  o: {
    id: string;
    mask: ShapeMask;
    at: Vec3;
    material: MaterialId;
    core?: number;
    coreRatio?: number;
    turbulence?: number;
    grain?: number;
    bias?: number;
    ceiling?: number;
    depthBias?: number;
  },
): Piece {
  const material = getMaterial(o.material);
  return {
    id: o.id,
    depth: ctx.depth(o.at) + (o.depthBias ?? 0),
    paint: (canvas) => {
      paintEmissive(canvas, o.mask, material, {
        style: ctx.style,
        seed: ctx.seed,
        ...(o.core !== undefined ? { core: o.core } : {}),
        ...(o.coreRatio !== undefined ? { coreRatio: o.coreRatio } : {}),
        ...(o.turbulence !== undefined ? { turbulence: o.turbulence } : {}),
        ...(o.grain !== undefined ? { grain: o.grain } : {}),
        ...(o.bias !== undefined ? { bias: o.bias } : {}),
        ...(o.ceiling !== undefined ? { ceiling: o.ceiling } : {}),
      });
    },
  };
}

/** Masse opaque d'une seule valeur, avec contour éventuel : fumée, poudrin. */
export function flatPiece(
  ctx: FrameContext,
  o: {
    id: string;
    mask: ShapeMask;
    at: Vec3;
    material: MaterialId;
    role: RoleId;
    dither?: number;
    ditherMatrix?: 2 | 4;
    outline?: boolean;
    depthBias?: number;
  },
): Piece {
  const material = getMaterial(o.material);
  return {
    id: o.id,
    depth: ctx.depth(o.at) + (o.depthBias ?? 0),
    paint: (canvas) => {
      paintRole(
        canvas,
        o.mask,
        material,
        o.role,
        o.dither !== undefined ? { level: o.dither, matrix: o.ditherMatrix ?? 4 } : undefined,
      );
      if (o.outline) paintOutline(canvas, o.mask, material, ctx.style);
    },
  };
}

/**
 * Semis de motifs autour d'un point. Les positions dérivent de l'identifiant
 * du grain : ajouter une braise ne déplace pas les autres (§10).
 */
export function scatterMotifs(
  ctx: FrameContext,
  o: {
    id: string;
    motif: PixelMotif;
    center: Vec3;
    count: number;
    radius: number;
    lift?: number;
    /** Avancement de la dispersion, sur [0,1]. */
    spread: number;
    frame?: (index: number) => number;
    scale?: number;
    gravity?: number;
    material?: MaterialId;
  },
): Piece[] {
  const out: Piece[] = [];
  const gravity = o.gravity ?? 1.6;
  for (let i = 0; i < o.count; i++) {
    const gid = `${o.id}#${i}`;
    // L'angle part du cap : le semis tourne avec le sort au lieu d'être
    // identique dans les huit directions.
    const angle = ctx.heading + ctx.rnd(gid, 1) * Math.PI * 2;
    const speed = 0.45 + ctx.rnd(gid, 2);
    const lift = (o.lift ?? 0.7) * (0.4 + ctx.rnd(gid, 3));
    const k = o.spread * speed;
    const at: Vec3 = {
      x: o.center.x + Math.cos(angle) * o.radius * k,
      y: o.center.y + Math.sin(angle) * o.radius * k,
      z: Math.max(0, o.center.z + lift * o.spread - gravity * o.spread * o.spread),
    };
    out.push(
      motifPiece(ctx, {
        id: gid,
        motif: o.motif,
        at,
        frame: o.frame ? o.frame(i) : 0,
        ...(o.scale ? { scale: o.scale } : {}),
        ...(o.material ? { material: o.material } : {}),
      }),
    );
  }
  return out;
}
