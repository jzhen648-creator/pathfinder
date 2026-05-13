import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const MAIN = 1.3;
const GROUND = 0.9;

export function BranchExperiences({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <polyline
        points="-11,9 -4,-4 -1,1 5,-10 11,9"
        fill="none"
        stroke={color}
        strokeWidth={scaleStroke(MAIN, size)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1={-12}
        y1={10}
        x2={12}
        y2={10}
        stroke={color}
        strokeWidth={scaleStroke(GROUND, size)}
        strokeLinecap="round"
        opacity={0.4}
      />
      <circle cx={6} cy={-11} r={1.5} fill={color} opacity={0.7} />
    </g>
  );
}
