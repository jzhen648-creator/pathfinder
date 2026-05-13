import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const BASE = 1.5;

export function LimbWork({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  const sw = scaleStroke(BASE, size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <rect
        x={-13}
        y={1}
        width={8}
        height={11}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      <rect
        x={-3}
        y={-6}
        width={8}
        height={18}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      <rect
        x={7}
        y={-13}
        width={8}
        height={25}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
    </g>
  );
}
