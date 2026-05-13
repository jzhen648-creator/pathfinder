import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const MAIN = 1.3;

export function BranchRomance({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  const sw = scaleStroke(MAIN, size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <path
        d="M0,9 C-10,2 -12,-7 -6,-9 C-2,-9 0,-6 0,-3 C0,-6 2,-9 6,-9 C12,-7 10,2 0,9 Z"
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
    </g>
  );
}
