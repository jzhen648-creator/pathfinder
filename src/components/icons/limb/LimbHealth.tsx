import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const BASE = 1.5;

export function LimbHealth({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  const sw = scaleStroke(BASE, size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <polyline
        points="-15,0 -4,0 -2,-13 0,8 2,0 15,0"
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}
