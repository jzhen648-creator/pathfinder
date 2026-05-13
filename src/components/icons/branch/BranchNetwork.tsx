import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const LINE = 1.1;

export function BranchNetwork({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  const wl = scaleStroke(LINE, size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <circle cx={-8} cy={-6} r={2.2} fill={color} />
      <circle cx={8} cy={-6} r={2.2} fill={color} />
      <circle cx={0} cy={8} r={2.2} fill={color} />
      <line x1={-7} y1={-5} x2={-1} y2={7} stroke={color} strokeWidth={wl} strokeLinecap="round" />
      <line x1={7} y1={-5} x2={1} y2={7} stroke={color} strokeWidth={wl} strokeLinecap="round" />
      <line x1={-6} y1={-6} x2={6} y2={-6} stroke={color} strokeWidth={wl} strokeLinecap="round" />
    </g>
  );
}
