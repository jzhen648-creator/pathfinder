import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const RING = 1.3;
const HOUR = 1.5;
const MINUTE = 1.2;
const TICK = 1;

export function BranchHabits({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <circle cx={0} cy={0} r={10} fill="none" stroke={color} strokeWidth={scaleStroke(RING, size)} />
      <line x1={0} y1={0} x2={-4} y2={-5} stroke={color} strokeWidth={scaleStroke(HOUR, size)} strokeLinecap="round" />
      <line x1={0} y1={0} x2={0} y2={-7} stroke={color} strokeWidth={scaleStroke(MINUTE, size)} strokeLinecap="round" />
      <circle cx={0} cy={0} r={1.4} fill={color} />
      <line x1={0} y1={-10} x2={0} y2={-8.5} stroke={color} strokeWidth={scaleStroke(TICK, size)} strokeLinecap="round" opacity={0.5} />
      <line x1={10} y1={0} x2={8.5} y2={0} stroke={color} strokeWidth={scaleStroke(TICK, size)} strokeLinecap="round" opacity={0.5} />
      <line x1={0} y1={10} x2={0} y2={8.5} stroke={color} strokeWidth={scaleStroke(TICK, size)} strokeLinecap="round" opacity={0.5} />
      <line x1={-10} y1={0} x2={-8.5} y2={0} stroke={color} strokeWidth={scaleStroke(TICK, size)} strokeLinecap="round" opacity={0.5} />
    </g>
  );
}
