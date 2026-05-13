import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const MAIN = 1.3;
const LINE = 0.8;

export function BranchCulture({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  const wm = scaleStroke(MAIN, size);
  const wl = scaleStroke(LINE, size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <path
        d="M0,8 L0,-6 Q0,-8 -2,-8 L-10,-8 L-10,8 Z"
        fill="none"
        stroke={color}
        strokeWidth={wm}
        strokeLinejoin="round"
      />
      <path
        d="M0,8 L0,-6 Q0,-8 2,-8 L10,-8 L10,8 Z"
        fill="none"
        stroke={color}
        strokeWidth={wm}
        strokeLinejoin="round"
      />
      <line x1={-7} y1={-4} x2={-2} y2={-4} stroke={color} strokeWidth={wl} opacity={0.4} />
      <line x1={-7} y1={-1} x2={-2} y2={-1} stroke={color} strokeWidth={wl} opacity={0.4} />
      <line x1={-7} y1={2} x2={-2} y2={2} stroke={color} strokeWidth={wl} opacity={0.4} />
      <line x1={2} y1={-4} x2={7} y2={-4} stroke={color} strokeWidth={wl} opacity={0.4} />
      <line x1={2} y1={-1} x2={7} y2={-1} stroke={color} strokeWidth={wl} opacity={0.4} />
      <line x1={2} y1={2} x2={7} y2={2} stroke={color} strokeWidth={wl} opacity={0.4} />
    </g>
  );
}
