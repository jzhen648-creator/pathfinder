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
