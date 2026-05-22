"use client";

import type { ReactNode } from "react";
import {
  DORMANT_OPACITY_MIN,
  DORMANT_OPACITY_MAX,
  DORMANT_PULSE_DURATION_MS,
  GHOST_OPACITY_MIN,
  GHOST_OPACITY_MAX,
  GHOST_PULSE_DURATION_MS,
} from "./tree-view-constants";

/** Cubic ease-in-out control points for a symmetric breathing spline. */
const BREATHING_SPLINE = "0.45 0 0.55 1";

type PulseProps = {
  children: ReactNode;
  /**
   * Whether the pulse animation is active. Pass `false` to render a transparent passthrough
   * `<g>` with no animation or filter — flag-off behaviour is visually identical to no wrapper.
   */
  active?: boolean;
};

/**
 * SVG `<g>` wrapper for **dormant** nodes: slow breathing opacity (20 % → 30 %, 3 s) with a
 * desaturating CSS filter (`saturate(0.4)`). Signals "locked / not yet opened".
 *
 * SMIL `<animate>` targets the wrapper `<g>`'s own `opacity` presentation attribute, so
 * the animation multiplies cleanly with any CSS `opacity` set on inner elements.
 * Modern browsers pause SMIL animations when the document is hidden, same as CSS animations.
 */
export function DormantPulse({ children, active = true }: PulseProps) {
  const dur = `${DORMANT_PULSE_DURATION_MS}ms`;
  const values = `${DORMANT_OPACITY_MIN};${DORMANT_OPACITY_MAX};${DORMANT_OPACITY_MIN}`;
  return (
    <g style={active ? { filter: "saturate(0.4)" } : undefined}>
      {active ? (
        <animate
          attributeName="opacity"
          values={values}
          dur={dur}
          repeatCount="indefinite"
          calcMode="spline"
          keyTimes="0;0.5;1"
          keySplines={`${BREATHING_SPLINE};${BREATHING_SPLINE}`}
        />
      ) : null}
      {children}
    </g>
  );
}

/**
 * SVG `<g>` wrapper for **ghost** nodes: gentle breathing opacity (35 % → 50 %, 2.5 s) at
 * full theme colour (no desaturation). Signals "unlocked but not yet activated individually".
 *
 * Same SMIL targeting strategy as {@link DormantPulse}.
 */
export function GhostPulse({ children, active = true }: PulseProps) {
  const dur = `${GHOST_PULSE_DURATION_MS}ms`;
  const values = `${GHOST_OPACITY_MIN};${GHOST_OPACITY_MAX};${GHOST_OPACITY_MIN}`;
  return (
    <g>
      {active ? (
        <animate
          attributeName="opacity"
          values={values}
          dur={dur}
          repeatCount="indefinite"
          calcMode="spline"
          keyTimes="0;0.5;1"
          keySplines={`${BREATHING_SPLINE};${BREATHING_SPLINE}`}
        />
      ) : null}
      {children}
    </g>
  );
}
