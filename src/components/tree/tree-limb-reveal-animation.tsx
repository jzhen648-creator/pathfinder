"use client";

import type { ReactNode } from "react";
import { FLAGS } from "@/lib/flags";

type LimbRevealPathProps = {
  active: boolean;
  begin: string;
  d: string;
  stroke: string;
  strokeWidth: number;
  strokeOpacity?: number;
  strokeLinecap?: "round" | "butt" | "square";
  strokeLinejoin?: "round" | "miter" | "bevel";
  vectorEffect?: "non-scaling-stroke";
  "data-tree-domain-gateway-spoke"?: string;
};

/** One-shot trunk→gateway stem stroke reveal (stage 2). */
export function LimbRevealStem({
  active,
  begin,
  d,
  stroke,
  strokeWidth,
  strokeOpacity = 0.4,
  strokeLinecap = "round",
  strokeLinejoin = "round",
}: LimbRevealPathProps) {
  if (!active || !FLAGS.TREE_THEME_ACTIVATION_ANIM) {
    return (
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeOpacity={strokeOpacity}
        strokeLinecap={strokeLinecap}
        strokeLinejoin={strokeLinejoin}
      />
    );
  }
  return (
    <path
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeOpacity={strokeOpacity}
      strokeLinecap={strokeLinecap}
      strokeLinejoin={strokeLinejoin}
      pathLength={1}
      strokeDasharray="1"
      strokeDashoffset={1}
    >
      <animate
        attributeName="stroke-dashoffset"
        from="1"
        to="0"
        begin={begin}
        dur="0.3s"
        fill="freeze"
        repeatCount="1"
      />
    </path>
  );
}

/** One-shot gateway→hub spoke reveal with stagger (stage 3). */
export function LimbRevealSpoke({
  active,
  begin,
  d,
  stroke,
  strokeWidth,
  strokeOpacity = 1,
  strokeLinecap = "round",
  vectorEffect,
}: LimbRevealPathProps) {
  if (!active || !FLAGS.TREE_THEME_ACTIVATION_ANIM) {
    return (
      <path
        data-tree-domain-gateway-spoke="1"
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeOpacity={strokeOpacity}
        strokeLinecap={strokeLinecap}
        vectorEffect={vectorEffect}
      />
    );
  }
  return (
    <path
      data-tree-domain-gateway-spoke="1"
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeOpacity={strokeOpacity}
      strokeLinecap={strokeLinecap}
      vectorEffect={vectorEffect}
      pathLength={1}
      strokeDasharray="1"
      strokeDashoffset={1}
    >
      <animate
        attributeName="stroke-dashoffset"
        from="1"
        to="0"
        begin={begin}
        dur="0.35s"
        fill="freeze"
        repeatCount="1"
      />
    </path>
  );
}

/** Theme gateway medallion scale + fade (stage 1). */
export function LimbRevealGateway({
  active,
  begin,
  cx,
  cy,
  children,
}: {
  active: boolean;
  begin: string;
  cx: number;
  cy: number;
  children: ReactNode;
}) {
  if (!active || !FLAGS.TREE_THEME_ACTIVATION_ANIM) {
    return <>{children}</>;
  }
  return (
    <g transform={`translate(${cx}, ${cy})`}>
      <g opacity={0}>
        <animate attributeName="opacity" from="0" to="1" begin={begin} dur="0.2s" fill="freeze" repeatCount="1" />
        <animateTransform
          attributeName="transform"
          type="scale"
          from="0.6"
          to="1"
          begin={begin}
          dur="0.2s"
          fill="freeze"
          repeatCount="1"
        />
        <g transform={`translate(${-cx}, ${-cy})`}>{children}</g>
      </g>
    </g>
  );
}

/** Domain hub node + label fade-in (stage 4). */
export function LimbRevealHubNode({
  active,
  begin,
  children,
}: {
  active: boolean;
  begin: string;
  children: ReactNode;
}) {
  if (!active || !FLAGS.TREE_THEME_ACTIVATION_ANIM) {
    return <>{children}</>;
  }
  return (
    <g opacity={0}>
      {children}
      <animate attributeName="opacity" from="0" to="1" begin={begin} dur="0.2s" fill="freeze" repeatCount="1" />
    </g>
  );
}
