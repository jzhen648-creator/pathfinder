import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const STROKE = 1.4;

export function LimbPeople({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  const sw = scaleStroke(STROKE, size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <circle cx={-5} cy={-7} r={3} fill="none" stroke={color} strokeWidth={sw} />
      <path
        d="M-9,6 Q-9,0 -5,-2 Q-1,0 -1,6"
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={5} cy={-7} r={3} fill="none" stroke={color} strokeWidth={sw} />
      <path
        d="M1,6 Q1,0 5,-2 Q9,0 9,6"
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}
