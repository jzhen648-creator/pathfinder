import type { IconSvgProps } from "../icon-svg-props";
import { iconScale } from "../icon-svg-props";

export function BranchCommunity({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <circle cx={0} cy={-8} r={2.2} fill={color} />
      <circle cx={-7} cy={2} r={2.2} fill={color} />
      <circle cx={7} cy={2} r={2.2} fill={color} />
      <circle cx={-3} cy={9} r={1.8} fill={color} opacity={0.55} />
      <circle cx={3} cy={9} r={1.8} fill={color} opacity={0.55} />
    </g>
  );
}
