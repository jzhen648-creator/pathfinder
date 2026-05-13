import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const MAIN = 1.3;

export function BranchFriendships({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  const sw = scaleStroke(MAIN, size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <circle cx={-4} cy={0} r={7} fill="none" stroke={color} strokeWidth={sw} />
      <circle cx={4} cy={0} r={7} fill="none" stroke={color} strokeWidth={sw} />
    </g>
  );
}
