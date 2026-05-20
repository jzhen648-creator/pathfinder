import type { IconSvgProps } from "../icon-svg-props";
import { fixedScreenStroke, iconScale } from "../icon-svg-props";

const DEFAULT_STROKE = 1.25;

export function LimbBecoming({ size = 24, opacity = 1, color = "currentColor", stroke = DEFAULT_STROKE }: IconSvgProps) {
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
      <path
        d="M0 -10 A5 5 0 0 0 0 0 A5 5 0 0 1 0 10"
      />
      <circle cx={0} cy={-5} r={0.8} fill={color} stroke="none" />
      <circle cx={0} cy={5} r={0.8} fill={color} stroke="none" />
    </g>
  );
}
