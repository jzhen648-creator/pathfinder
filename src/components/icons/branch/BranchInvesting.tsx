import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const AXIS = 1;
const MAIN = 1.3;

export function BranchInvesting({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <line
        x1={-10}
        y1={9}
        x2={-10}
        y2={-9}
        stroke={color}
        strokeWidth={scaleStroke(AXIS, size)}
        strokeLinecap="round"
        opacity={0.4}
      />
      <line
        x1={-10}
        y1={9}
        x2={10}
        y2={9}
        stroke={color}
        strokeWidth={scaleStroke(AXIS, size)}
        strokeLinecap="round"
        opacity={0.4}
      />
      <polyline
        points="-8,7 -4,1 0,4 4,-5 8,-8"
        fill="none"
        stroke={color}
        strokeWidth={scaleStroke(MAIN, size)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="5,-8 8,-8 8,-5"
        fill="none"
        stroke={color}
        strokeWidth={scaleStroke(MAIN, size)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}
