import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const BOLT = 1.5;

export function BranchMovement({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  const sw = scaleStroke(BOLT, size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <path
        d="M4,-12 L-3,0 L2,0 L-4,12"
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}
