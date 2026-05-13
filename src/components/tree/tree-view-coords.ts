import { TREE_TRUNK_MIRROR_X } from "./tree-geometry";
import type { Point } from "./tree-types";
import { TREE_LAYOUT_SCALE_ORIGIN_Y, TREE_LAYOUT_WORLD_SCALE } from "./tree-view-constants";

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
