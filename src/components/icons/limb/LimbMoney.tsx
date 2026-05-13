import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const BASE = 1.5;
const INNER = 1.2;
const HAIR = 0.9;

export function LimbMoney({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <rect
        x={-14}
        y={-8}
        width={28}
        height={16}
        rx={1.5}
        fill="none"
        stroke={color}
        strokeWidth={scaleStroke(BASE, size)}
      />
      <circle cx={0} cy={0} r={4.5} fill="none" stroke={color} strokeWidth={scaleStroke(INNER, size)} />
      <line
        x1={-10}
        y1={-4}
        x2={-10}
        y2={4}
        stroke={color}
        strokeWidth={scaleStroke(HAIR, size)}
        opacity={0.4}
      />
      <line
        x1={10}
        y1={-4}
        x2={10}
        y2={4}
        stroke={color}
        strokeWidth={scaleStroke(HAIR, size)}
        opacity={0.4}
      />
    </g>
  );
}
