import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const MAIN = 1.3;
const POLY = 1.1;
const TICK = 1;

export function BranchPurpose({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <circle cx={0} cy={0} r={10} fill="none" stroke={color} strokeWidth={scaleStroke(MAIN, size)} />
      <polygon
        points="0,-7 2.5,0 0,3 -2.5,0"
        fill="none"
        stroke={color}
        strokeWidth={scaleStroke(POLY, size)}
        strokeLinejoin="round"
      />
      <circle cx={0} cy={0} r={1.5} fill={color} />
      <line x1={0} y1={-10} x2={0} y2={-8} stroke={color} strokeWidth={scaleStroke(TICK, size)} opacity={0.4} />
      <line x1={10} y1={0} x2={8} y2={0} stroke={color} strokeWidth={scaleStroke(TICK, size)} opacity={0.4} />
      <line x1={-10} y1={0} x2={-8} y2={0} stroke={color} strokeWidth={scaleStroke(TICK, size)} opacity={0.4} />
      <line x1={0} y1={10} x2={0} y2={8} stroke={color} strokeWidth={scaleStroke(TICK, size)} opacity={0.4} />
    </g>
  );
}
