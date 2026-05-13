import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const POST = 1.3;
const ROPE = 1.1;
const HAMMOCK = 1.6;

export function BranchDowntime({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <line x1={-12} y1={-9} x2={-12} y2={9} stroke={color} strokeWidth={scaleStroke(POST, size)} strokeLinecap="round" />
      <line x1={12} y1={-9} x2={12} y2={9} stroke={color} strokeWidth={scaleStroke(POST, size)} strokeLinecap="round" />
      <line
        x1={-12}
        y1={-7}
        x2={-6}
        y2={0}
        stroke={color}
        strokeWidth={scaleStroke(ROPE, size)}
        strokeLinecap="round"
        opacity={0.8}
      />
      <line
        x1={12}
        y1={-7}
        x2={6}
        y2={0}
        stroke={color}
        strokeWidth={scaleStroke(ROPE, size)}
        strokeLinecap="round"
        opacity={0.8}
      />
      <path
        d="M-6,0 Q0,11 6,0"
        fill="none"
        stroke={color}
        strokeWidth={scaleStroke(HAMMOCK, size)}
        strokeLinecap="round"
      />
    </g>
  );
}
