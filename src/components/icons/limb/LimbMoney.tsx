import type { IconSvgProps } from "../icon-svg-props";
import { fixedScreenStroke, iconScale } from "../icon-svg-props";

const DEFAULT_STROKE = 1.25;

export function LimbMoney({ size = 24, opacity = 1, color = "currentColor", stroke = DEFAULT_STROKE }: IconSvgProps) {
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
      <rect x={-6.5} y={-3.5} width={13} height={7} rx={0.75} />
      <circle cx={0} cy={0} r={1.3} />
      <line x1={-4.75} y1={-1.75} x2={-4.25} y2={-1.75} />
      <line x1={4.25} y1={1.75} x2={4.75} y2={1.75} />
    </g>
  );
}
