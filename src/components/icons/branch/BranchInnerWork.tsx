import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const MAIN = 1.3;
const STEM = 1.5;
const GLARE = 0.8;

export function BranchInnerWork({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <ellipse cx={0} cy={-2} rx={7} ry={9} fill="none" stroke={color} strokeWidth={scaleStroke(MAIN, size)} />
      <line x1={0} y1={7} x2={0} y2={12} stroke={color} strokeWidth={scaleStroke(STEM, size)} strokeLinecap="round" />
      <line x1={-3} y1={10} x2={3} y2={10} stroke={color} strokeWidth={scaleStroke(MAIN, size)} strokeLinecap="round" />
      <line
        x1={-3}
        y1={-6}
        x2={2}
        y2={-2}
        stroke={color}
        strokeWidth={scaleStroke(GLARE, size)}
        strokeLinecap="round"
        opacity={0.35}
      />
    </g>
  );
}
