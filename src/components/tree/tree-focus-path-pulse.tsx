"use client";

type TreeFocusPathPulseProps = {
  d: string;
  color: string;
  strokeWidth: number;
  /** Seconds before the loop starts — staggers sibling paths. */
  phaseSec?: number;
  /** Full loop duration in seconds. */
  durSec?: number;
  opacity?: number;
  /** Dash length in SVG px. */
  dashPx?: number;
  /** Gap length in SVG px. */
  gapPx?: number;
  /** Reverse travel along the path `d` was authored. */
  reverse?: boolean;
};

/**
 * Directional energy pulse along an existing conduit path (theme → hub → goal).
 * Render-only overlay; does not affect hit targets or routing geometry.
 */
export function TreeFocusPathPulse({
  d,
  color,
  strokeWidth,
  phaseSec = 0,
  durSec = 2.35,
  opacity = 0.62,
  dashPx = 16,
  gapPx = 26,
  reverse = false,
}: TreeFocusPathPulseProps) {
  if (!d || d.length < 4) return null;
  const period = dashPx + gapPx;
  const from = reverse ? String(-period) : "0";
  const to = reverse ? "0" : String(-period);

  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={`${dashPx} ${gapPx}`}
      opacity={opacity}
      pointerEvents="none"
      filter="url(#treeBranchStrokeEnergyUnderlay)"
    >
      <animate
        attributeName="stroke-dashoffset"
        from={from}
        to={to}
        dur={`${durSec}s`}
        begin={`${phaseSec}s`}
        repeatCount="indefinite"
      />
      <animate
        attributeName="opacity"
        values={`${opacity * 0.72};${Math.min(1, opacity * 1.18)};${opacity * 0.72}`}
        dur={`${durSec * 1.12}s`}
        begin={`${phaseSec}s`}
        repeatCount="indefinite"
      />
    </path>
  );
}
