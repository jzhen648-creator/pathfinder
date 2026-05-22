"use client";

import { memo } from "react";
import type { AreaData, MomentNode } from "./tree-types";
import {
  MARK_DIAMOND_HALF_PX,
  MARK_NODE_HIT_PADDING_PX,
  MARK_TREE_AMBER,
  MARK_VISIBILITY_FULL_ZOOM,
  MARK_VISIBILITY_MIN_ZOOM,
  snapTreeSvgScalar,
} from "./tree-view-constants";

function markDiamondPathD(half: number): string {
  const h = snapTreeSvgScalar(half);
  return `M 0 ${-h} L ${h} 0 L 0 ${h} L ${-h} 0 Z`;
}

export type TreeMarkNodeProps = {
  moment: MomentNode;
  area: AreaData;
  x: number;
  y: number;
  zoomRatio?: number;
  isSelected: boolean;
  shouldSuppressClick: () => boolean;
  onMarkClick: (moment: MomentNode, area: AreaData, clientX: number, clientY: number) => void;
  onMarkPointerEnter?: (moment: MomentNode, area: AreaData, clientX: number, clientY: number) => void;
  onMarkPointerLeave?: (momentId: string) => void;
};

function markZoomOpacityMul(zoomRatio: number): number {
  if (zoomRatio <= MARK_VISIBILITY_MIN_ZOOM) return 0;
  if (zoomRatio >= MARK_VISIBILITY_FULL_ZOOM) return 1;
  return (zoomRatio - MARK_VISIBILITY_MIN_ZOOM) / (MARK_VISIBILITY_FULL_ZOOM - MARK_VISIBILITY_MIN_ZOOM);
}

/** Hub-branch mark: amber diamond beside the branch ray; detail lives in the hover card. */
export const TreeMarkNode = memo(function TreeMarkNode({
  moment,
  area,
  x,
  y,
  zoomRatio = MARK_VISIBILITY_FULL_ZOOM,
  isSelected,
  shouldSuppressClick,
  onMarkClick,
  onMarkPointerEnter,
  onMarkPointerLeave,
}: TreeMarkNodeProps) {
  const sx = snapTreeSvgScalar(x);
  const sy = snapTreeSvgScalar(y);
  const unresolved = moment.needsResolution === true;
  const half = unresolved ? MARK_DIAMOND_HALF_PX + 1 : MARK_DIAMOND_HALF_PX;
  const hitR = half + MARK_NODE_HIT_PADDING_PX + 6;
  const markOpacityMul = markZoomOpacityMul(zoomRatio);

  return (
    <g style={{ cursor: "pointer" }}>
      <g transform={`translate(${sx},${sy})`} opacity={markOpacityMul} pointerEvents="none">
        {unresolved ? (
          <circle
            cx={0}
            cy={0}
            r={half + 5}
            fill="none"
            stroke={area.color}
            strokeWidth={1.2}
            strokeDasharray="3 3"
            opacity={0.75}
          />
        ) : null}
        <path
          d={markDiamondPathD(half)}
          fill={MARK_TREE_AMBER}
          stroke={
            unresolved
              ? area.color
              : moment.isTurningPoint
                ? area.color
                : "rgba(0,0,0,0.35)"
          }
          strokeWidth={unresolved ? 1.2 : moment.isTurningPoint ? 1.4 : 0.6}
          opacity={unresolved ? 0.5 : moment.future ? 0.72 : 0.94}
        />
        {unresolved ? (
          <text
            x={0}
            y={0}
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--color-text-primary, #f0ede6)"
            fontSize={9}
            fontWeight={700}
            opacity={0.9}
          >
            ?
          </text>
        ) : null}
        {isSelected ? (
          <circle
            cx={0}
            cy={0}
            r={hitR - 2}
            fill="none"
            stroke="#D1CEC4"
            strokeWidth={1}
            opacity={0.35}
          />
        ) : null}
      </g>
      <circle
        cx={sx}
        cy={sy}
        r={hitR}
        fill="transparent"
        pointerEvents="all"
        onPointerEnter={(e) => {
          onMarkPointerEnter?.(moment, area, e.clientX, e.clientY);
        }}
        onPointerLeave={() => {
          onMarkPointerLeave?.(moment.id);
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (shouldSuppressClick()) return;
          onMarkClick(moment, area, e.clientX, e.clientY);
        }}
      />
    </g>
  );
});
