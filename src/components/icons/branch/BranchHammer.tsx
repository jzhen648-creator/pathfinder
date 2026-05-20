import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const MAIN = 1.3;
const SECOND = 1.1;

export function BranchHammer({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  const sw = scaleStroke(MAIN, size);
  const sw2 = scaleStroke(SECOND, size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <path
        d="M-9,-7 L3,-7 L3,-3 L-9,-3 Z"
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
      <line x1={3} y1={-7} x2={6} y2={-11} stroke={color} strokeWidth={sw2} strokeLinecap="round" />
      <line x1={-2} y1={-3} x2={7} y2={10} stroke={color} strokeWidth={sw} strokeLinecap="round" />
    </g>
  );
}
