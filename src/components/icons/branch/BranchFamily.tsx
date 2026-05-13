import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const MAIN = 1.3;
const DOOR = 1.1;

export function BranchFamily({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  const wm = scaleStroke(MAIN, size);
  const wd = scaleStroke(DOOR, size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <polyline
        points="-10,0 0,-10 10,0"
        fill="none"
        stroke={color}
        strokeWidth={wm}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1={-8} y1={0} x2={-8} y2={10} stroke={color} strokeWidth={wm} strokeLinecap="round" />
      <line x1={8} y1={0} x2={8} y2={10} stroke={color} strokeWidth={wm} strokeLinecap="round" />
      <line x1={-8} y1={10} x2={8} y2={10} stroke={color} strokeWidth={wm} strokeLinecap="round" />
      <rect x={-3} y={3} width={6} height={7} fill="none" stroke={color} strokeWidth={wd} />
    </g>
  );
}
