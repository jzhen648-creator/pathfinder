import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const MAIN = 1.3;
const VEIN_A = 0.9;
const VEIN_B = 0.7;

export function BranchNutrition({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <path
        d="M0,-11 Q10,-6 9,4 Q6,10 0,11 Q-6,10 -9,4 Q-10,-6 0,-11 Z"
        fill="none"
        stroke={color}
        strokeWidth={scaleStroke(MAIN, size)}
        strokeLinejoin="round"
      />
      <line x1={0} y1={-5} x2={0} y2={9} stroke={color} strokeWidth={scaleStroke(VEIN_A, size)} strokeLinecap="round" opacity={0.5} />
      <line x1={0} y1={1} x2={5} y2={-3} stroke={color} strokeWidth={scaleStroke(VEIN_B, size)} strokeLinecap="round" opacity={0.4} />
      <line x1={0} y1={5} x2={-4} y2={2} stroke={color} strokeWidth={scaleStroke(VEIN_B, size)} strokeLinecap="round" opacity={0.4} />
    </g>
  );
}
