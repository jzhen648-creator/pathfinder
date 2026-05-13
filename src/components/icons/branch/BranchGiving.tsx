import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const MAIN = 1.3;

export function BranchGiving({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  const sw = scaleStroke(MAIN, size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <path
        d="M-8,6 Q-9,0 -3,0 L3,0 Q9,0 8,6"
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1={-8} y1={6} x2={-8} y2={10} stroke={color} strokeWidth={sw} strokeLinecap="round" />
      <line x1={8} y1={6} x2={8} y2={10} stroke={color} strokeWidth={sw} strokeLinecap="round" />
      <line x1={-8} y1={10} x2={8} y2={10} stroke={color} strokeWidth={sw} strokeLinecap="round" />
      <circle cx={-3} cy={-5} r={1.5} fill={color} opacity={0.65} />
      <circle cx={0} cy={-8} r={1.5} fill={color} opacity={0.45} />
      <circle cx={3} cy={-5} r={1.5} fill={color} opacity={0.65} />
    </g>
  );
}
