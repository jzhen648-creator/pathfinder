import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const RAIL = 1.3;
const RUNG = 1.1;

export function BranchCareer({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  const wRail = scaleStroke(RAIL, size);
  const wRung = scaleStroke(RUNG, size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <line x1={-6} y1={-11} x2={-6} y2={11} stroke={color} strokeWidth={wRail} strokeLinecap="round" />
      <line x1={6} y1={-11} x2={6} y2={11} stroke={color} strokeWidth={wRail} strokeLinecap="round" />
      <line x1={-6} y1={-7} x2={6} y2={-7} stroke={color} strokeWidth={wRung} strokeLinecap="round" />
      <line x1={-6} y1={0} x2={6} y2={0} stroke={color} strokeWidth={wRung} strokeLinecap="round" />
      <line x1={-6} y1={7} x2={6} y2={7} stroke={color} strokeWidth={wRung} strokeLinecap="round" />
    </g>
  );
}
