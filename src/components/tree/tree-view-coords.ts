import { TREE_TRUNK_MIRROR_X } from "./tree-geometry";
import { TRUNK_BASE_Y, TRUNK_CROWN_Y } from "./tree-trunk-geometry";
import type { Point } from "./tree-types";
import { TREE_LAYOUT_SCALE_ORIGIN_Y, TREE_LAYOUT_WORLD_SCALE } from "./tree-view-constants";

/** Matches the inner `<g>` compose transform in `tree-svg.tsx` (world scale + slight tilt). */
const TREE_COMPOSE_ROTATE_DEG = -1.35;
const TREE_COMPOSE_TRANSLATE_X = -28;
const TREE_COMPOSE_TRANSLATE_Y = 20;
const TREE_COMPOSE_ROTATE_CY =
  TRUNK_CROWN_Y + (TRUNK_BASE_Y - TRUNK_CROWN_Y) * 0.4;

export function panViewportToStoredTreeCoords(p: Point): Point {
  const cx = TREE_TRUNK_MIRROR_X;
  const cy = TREE_LAYOUT_SCALE_ORIGIN_Y;
  const s = TREE_LAYOUT_WORLD_SCALE;
  if (Math.abs(s - 1) < 1e-9) return p;
  return { x: cx + (p.x - cx) / s, y: cy + (p.y - cy) / s };
}

/** Inverse of `panViewportToStoredTreeCoords` — stored tree coords → pan-viewport tree coords. */
export function storedTreeToPanViewport(p: Point): Point {
  const cx = TREE_TRUNK_MIRROR_X;
  const cy = TREE_LAYOUT_SCALE_ORIGIN_Y;
  const s = TREE_LAYOUT_WORLD_SCALE;
  if (Math.abs(s - 1) < 1e-9) return { ...p };
  return { x: cx + (p.x - cx) * s, y: cy + (p.y - cy) * s };
}

/** Stored tree coords → coordinates seen by the outer pan/zoom transform (after compose `<g>`). */
export function storedTreeToComposeViewport(p: Point): Point {
  const scaled = storedTreeToPanViewport(p);
  let x = scaled.x;
  let y = scaled.y;
  const rotCx = TREE_TRUNK_MIRROR_X;
  const rotCy = TREE_COMPOSE_ROTATE_CY;
  const rad = (TREE_COMPOSE_ROTATE_DEG * Math.PI) / 180;
  const dx = x - rotCx;
  const dy = y - rotCy;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  x = rotCx + dx * cos - dy * sin + TREE_COMPOSE_TRANSLATE_X;
  y = rotCy + dx * sin + dy * cos + TREE_COMPOSE_TRANSLATE_Y;
  return { x, y };
}

/** Maps a point in stored tree SVG space (same as `clientToWorldSvg` output) to viewport client pixels. */
export function storedTreePointToClientSvg(
  svg: SVGSVGElement,
  stored: Point,
  viewWidth: number,
  viewHeight: number,
  pan: { x: number; y: number; scale: number },
): Point {
  const innerPan = storedTreeToPanViewport(stored);
  const vx = innerPan.x * pan.scale + pan.x;
  const vy = innerPan.y * pan.scale + pan.y;
  const rect = svg.getBoundingClientRect();
  return {
    x: rect.left + (vx / Math.max(viewWidth, 1)) * Math.max(rect.width, 1),
    y: rect.top + (vy / Math.max(viewHeight, 1)) * Math.max(rect.height, 1),
  };
}

export function clientToWorldSvg(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  viewWidth: number,
  viewHeight: number,
  pan: { x: number; y: number; scale: number },
): Point {
  const rect = svg.getBoundingClientRect();
  const vx = ((clientX - rect.left) / Math.max(rect.width, 1)) * viewWidth;
  const vy = ((clientY - rect.top) / Math.max(rect.height, 1)) * viewHeight;
  return panViewportToStoredTreeCoords({
    x: (vx - pan.x) / pan.scale,
    y: (vy - pan.y) / pan.scale,
  });
}

/** Inverse of {@link storedTreeToComposeViewport} — pan-inner (post-compose) → compose-local stored. */
export function composeViewportToStoredTree(p: Point): Point {
  const rotCx = TREE_TRUNK_MIRROR_X;
  const rotCy = TREE_COMPOSE_ROTATE_CY;
  const rad = (TREE_COMPOSE_ROTATE_DEG * Math.PI) / 180;
  let x = p.x - TREE_COMPOSE_TRANSLATE_X;
  let y = p.y - TREE_COMPOSE_TRANSLATE_Y;
  const dx = x - rotCx;
  const dy = y - rotCy;
  const cos = Math.cos(-rad);
  const sin = Math.sin(-rad);
  const scaledX = rotCx + dx * cos - dy * sin;
  const scaledY = rotCy + dx * sin + dy * cos;
  const cx = TREE_TRUNK_MIRROR_X;
  const cy = TREE_LAYOUT_SCALE_ORIGIN_Y;
  const s = TREE_LAYOUT_WORLD_SCALE;
  if (Math.abs(s - 1) < 1e-9) return { x: scaledX, y: scaledY };
  return { x: cx + (scaledX - cx) / s, y: cy + (scaledY - cy) / s };
}

/**
 * Client pointer → compose-local coordinates (same space as goal nodes and edit-map drop targets).
 * Use inside the inner compose `<g>` in `tree-svg.tsx`, not {@link clientToWorldSvg} alone.
 */
export function clientToComposeLocalSvg(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  viewWidth: number,
  viewHeight: number,
  pan: { x: number; y: number; scale: number },
): Point {
  const rect = svg.getBoundingClientRect();
  const vx = ((clientX - rect.left) / Math.max(rect.width, 1)) * viewWidth;
  const vy = ((clientY - rect.top) / Math.max(rect.height, 1)) * viewHeight;
  return composeViewportToStoredTree({
    x: (vx - pan.x) / pan.scale,
    y: (vy - pan.y) / pan.scale,
  });
}
