import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const MAIN = 1.3;

export function BranchIncome({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  const w = scaleStroke(MAIN, size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <circle cx={0} cy={4} r={8} fill="none" stroke={color} strokeWidth={w} />
      <line x1={0} y1={-11} x2={0} y2={-3} stroke={color} strokeWidth={w} strokeLinecap="round" />
      <polyline
        points="-3.5,-6 0,-2 3.5,-6"
        fill="none"
        stroke={color}
        strokeWidth={w}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}
