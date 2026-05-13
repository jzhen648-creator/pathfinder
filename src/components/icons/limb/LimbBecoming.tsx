import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const OUTER = 1.5;
const CURVE = 1.3;
const SMALL = 1.1;

export function LimbBecoming({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <circle cx={0} cy={0} r={12} fill="none" stroke={color} strokeWidth={scaleStroke(OUTER, size)} />
      <path
        d="M0,-12 A6,6 0 0,1 0,0 A6,6 0 0,0 0,12"
        fill="none"
        stroke={color}
        strokeWidth={scaleStroke(CURVE, size)}
        strokeLinecap="round"
      />
      <circle cx={0} cy={-6} r={2} fill={color} />
      <circle
        cx={0}
        cy={6}
        r={2}
        fill="none"
        stroke={color}
        strokeWidth={scaleStroke(SMALL, size)}
      />
    </g>
  );
}
