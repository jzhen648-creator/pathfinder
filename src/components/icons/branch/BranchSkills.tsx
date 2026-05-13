import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const MAIN = 1.3;
const FAINT = 1.1;

export function BranchSkills({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <polyline
        points="-8,-2 0,-11 8,-2"
        fill="none"
        stroke={color}
        strokeWidth={scaleStroke(MAIN, size)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="-8,7 0,-2 8,7"
        fill="none"
        stroke={color}
        strokeWidth={scaleStroke(FAINT, size)}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.5}
      />
    </g>
  );
}
