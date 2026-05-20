import type { IconSvgProps } from "../icon-svg-props";
import { fixedScreenStroke, iconScale } from "../icon-svg-props";

const DEFAULT_STROKE = 1.25;

export function LimbWork({ size = 24, opacity = 1, color = "currentColor", stroke = DEFAULT_STROKE }: IconSvgProps) {
  const s = iconScale(size);
  const sw = fixedScreenStroke(stroke, size);
  return (
    <g
      opacity={opacity}
      transform={`scale(${s})`}
      fill="none"
      stroke={color}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx={0} cy={0} r={10} />
      <line x1={-3} y1={-6.5} x2={-3} y2={6.5} />
      <line x1={3} y1={-6.5} x2={3} y2={6.5} />
      <line x1={-3} y1={-3.5} x2={3} y2={-3.5} />
      <line x1={-3} y1={0} x2={3} y2={0} />
      <line x1={-3} y1={3.5} x2={3} y2={3.5} />
    </g>
  );
}
