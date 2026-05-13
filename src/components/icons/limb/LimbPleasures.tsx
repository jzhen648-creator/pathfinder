import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const BASE = 1.5;

export function LimbPleasures({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  const sw = scaleStroke(BASE, size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <path
        d="M0,-13 Q1.5,-1.5 13,0 Q1.5,1.5 0,13 Q-1.5,1.5 -13,0 Q-1.5,-1.5 0,-13 Z"
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
    </g>
  );
}
