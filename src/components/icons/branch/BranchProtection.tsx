import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const MAIN = 1.3;

export function BranchProtection({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  const sw = scaleStroke(MAIN, size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <path
        d="M0,-10 L9,-7 L9,1 Q9,7 0,11 Q-9,7 -9,1 L-9,-7 Z"
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
    </g>
  );
}
