import type { IconSvgProps } from "../icon-svg-props";
import { fixedScreenStroke, iconScale } from "../icon-svg-props";

const DEFAULT_STROKE = 1.25;

export function LimbHealth({ size = 24, opacity = 1, color = "currentColor", stroke = DEFAULT_STROKE }: IconSvgProps) {
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
        d="M-7.5 0 L-3.5 0 L-2.25 -2.5 L-1 2.5 L0.5 -3.5 L1.75 0 L7.5 0"
        fill="none"
      />
    </g>
  );
}
