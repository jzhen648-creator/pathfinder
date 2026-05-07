"use client";

import type { MouseEvent, PointerEvent, ReactNode } from "react";
import type { GoalBloomStatus } from "./tree-types";

const GOAL_R = 6;

function starPath(cx: number, cy: number, spikes: number, outer: number, inner: number): string {
  let d = "";
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;
  for (let i = 0; i < spikes; i++) {
    const x = cx + Math.cos(rot) * outer;
    const y = cy + Math.sin(rot) * outer;
    d += `${i === 0 ? "M" : "L"}${x.toFixed(3)},${y.toFixed(3)}`;
    rot += step;
    const ix = cx + Math.cos(rot) * inner;
    const iy = cy + Math.sin(rot) * inner;
    d += `L${ix.toFixed(3)},${iy.toFixed(3)}`;
    rot += step;
  }
  return `${d}Z`;
}

/** Reusable bloom / starburst shape for goals (and similar UI). */
export function GoalBloomShape({
  cx,
  cy,
  color,
  outer = 8,
  inner = 3.5,
}: {
  cx: number;
  cy: number;
  color: string;
  outer?: number;
  inner?: number;
}) {
  return <path d={starPath(cx, cy, 6, outer, inner)} fill={color} stroke={color} strokeWidth={0.35} pointerEvents="none" />;
}

type TreeGoalNodeSvgProps = {
  cx: number;
  cy: number;
  color: string;
  status: GoalBloomStatus;
  title: string;
  pulseGrowing: boolean;
  bloomPlaying: boolean;
  onClick: (e: MouseEvent | PointerEvent) => void;
};

export function TreeGoalNodeSvg({
  cx,
  cy,
  color,
  status,
  title,
  pulseGrowing,
  bloomPlaying,
  onClick,
}: TreeGoalNodeSvgProps) {
  const groupClass = bloomPlaying ? "tree-goal-bloom-once" : undefined;
  const pulseClass = pulseGrowing ? "tree-goal-growing-pulse" : undefined;

  let body: ReactNode;
  if (status === "ENDED") {
    body = (
      <>
        <circle cx={cx} cy={cy} r={GOAL_R} fill={color} opacity={0.3} pointerEvents="none" />
        <line x1={cx - 5} y1={cy - 5} x2={cx + 5} y2={cy + 5} stroke={color} strokeWidth={1.2} opacity={0.55} pointerEvents="none" />
        <line x1={cx - 5} y1={cy + 5} x2={cx + 5} y2={cy - 5} stroke={color} strokeWidth={1.2} opacity={0.55} pointerEvents="none" />
      </>
    );
  } else if (status === "BLOOMED") {
    body = <GoalBloomShape cx={cx} cy={cy} color={color} />;
  } else if (status === "BUD") {
    body = (
      <circle
        cx={cx}
        cy={cy}
        r={GOAL_R}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeOpacity={0.5}
        pointerEvents="none"
      />
    );
  } else {
    // GROWING, BRANCHED — filled disc; BRANCHED adds fork lines from parent renderer
    body = (
      <circle
        cx={cx}
        cy={cy}
        r={GOAL_R}
        fill={color}
        opacity={status === "BRANCHED" ? 0.95 : 0.9}
        className={status === "GROWING" ? pulseClass : undefined}
        pointerEvents="none"
      />
    );
  }

  return (
    <g
      className={groupClass}
      style={{ transformOrigin: `${cx}px ${cy}px` }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      role="button"
      tabIndex={0}
      aria-label={`Goal: ${title}`}
    >
      {body}
      <circle cx={cx} cy={cy} r={GOAL_R + 6} fill="transparent" style={{ cursor: "pointer" }} pointerEvents="all" />
    </g>
  );
}

export { GOAL_R };
