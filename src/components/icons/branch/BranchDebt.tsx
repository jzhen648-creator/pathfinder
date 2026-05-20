import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const AXIS = 1;
const MAIN = 1.3;

/** Liabilities / obligations — downward trend, paired with BranchInvesting. */
export function BranchDebt({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
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
        points="-8,-8 -4,-2 0,-5 4,2 8,7"
        fill="none"
        stroke={color}
        strokeWidth={scaleStroke(MAIN, size)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="5,7 8,7 8,4"
        fill="none"
        stroke={color}
        strokeWidth={scaleStroke(MAIN, size)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}
