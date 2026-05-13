import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const BAR = 1.4;

export function BranchSpirituality({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  const sw = scaleStroke(BAR, size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <line x1={0} y1={-11} x2={0} y2={11} stroke={color} strokeWidth={sw} strokeLinecap="round" />
      <line x1={-7} y1={-4} x2={7} y2={-4} stroke={color} strokeWidth={sw} strokeLinecap="round" />
    </g>
  );
}
