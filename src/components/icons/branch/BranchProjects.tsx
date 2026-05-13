import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const MAIN = 1.3;
const SECOND = 1.1;
const EXHAUST = 1;

export function BranchProjects({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <path
        d="M0,-12 Q7,-12 7,-4 L7,5 Q7,9 0,9 Q-7,9 -7,5 L-7,-4 Q-7,-12 0,-12 Z"
        fill="none"
        stroke={color}
        strokeWidth={scaleStroke(MAIN, size)}
        strokeLinejoin="round"
      />
      <circle cx={0} cy={-1} r={2.5} fill="none" stroke={color} strokeWidth={scaleStroke(SECOND, size)} />
      <line x1={-7} y1={3} x2={-11} y2={9} stroke={color} strokeWidth={scaleStroke(SECOND, size)} strokeLinecap="round" />
      <line x1={7} y1={3} x2={11} y2={9} stroke={color} strokeWidth={scaleStroke(SECOND, size)} strokeLinecap="round" />
      <path
        d="M-3,9 Q0,13 3,9"
        fill="none"
        stroke={color}
        strokeWidth={scaleStroke(EXHAUST, size)}
        strokeLinecap="round"
        opacity={0.55}
      />
    </g>
  );
}
