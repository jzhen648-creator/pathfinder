import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const MAIN = 1.3;
const WAVE = 1.1;

export function BranchMind({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <circle cx={0} cy={0} r={10} fill="none" stroke={color} strokeWidth={scaleStroke(MAIN, size)} />
      <path
        d="M-6,0 Q-3,-5 0,0 Q3,5 6,0"
        fill="none"
        stroke={color}
        strokeWidth={scaleStroke(WAVE, size)}
        strokeLinecap="round"
      />
    </g>
  );
}
