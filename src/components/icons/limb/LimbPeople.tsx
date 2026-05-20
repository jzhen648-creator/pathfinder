import type { IconSvgProps } from "../icon-svg-props";
import { fixedScreenStroke, iconScale } from "../icon-svg-props";

const DEFAULT_STROKE = 1.25;

export function LimbPeople({ size = 24, opacity = 1, color = "currentColor", stroke = DEFAULT_STROKE }: IconSvgProps) {
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
      <circle cx={-3} cy={-2.5} r={1.5} />
      <path d="M-6 4.5 C -6 2, -4.5 1, -3 1 C -1.5 1, 0 2, 0 4.5" />
      <circle cx={3} cy={-2.5} r={1.5} />
      <path d="M0 4.5 C 0 2, 1.5 1, 3 1 C 4.5 1, 6 2, 6 4.5" />
    </g>
  );
}
