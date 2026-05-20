"use client";

import { THEME_STAR_CENTER } from "./tree-area-anchors";
import { pentagonAnchorAt } from "./tree-design-visual";
import { snapTreeSvgScalar } from "./tree-view-constants";

/** Subtle pentagon trunk anchor at the theme-star centre (Claude Design grammar §11). */
export function TreePentagonAnchor() {
  const { cx, cy, outerD, innerD } = pentagonAnchorAt(THEME_STAR_CENTER);
  const sx = snapTreeSvgScalar(cx);
  const sy = snapTreeSvgScalar(cy);

  return (
    <g pointerEvents="none" aria-hidden data-tree-pentagon-anchor="1">
      <circle cx={sx} cy={sy} r={28} fill="rgba(255,255,255,0.018)" />
      <path
        d={outerD}
        fill="none"
        stroke="rgba(255,255,255,0.30)"
        strokeWidth={0.9}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={innerD}
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={0.7}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}
