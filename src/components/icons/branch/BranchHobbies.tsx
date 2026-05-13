import type { IconSvgProps } from "../icon-svg-props";
import { iconScale, scaleStroke } from "../icon-svg-props";

const RECT = 1.3;

export function BranchHobbies({ size = 24, opacity = 1, color = "currentColor" }: IconSvgProps) {
  const s = iconScale(size);
  const sw = scaleStroke(RECT, size);
  return (
    <g opacity={opacity} transform={`scale(${s})`}>
      <rect x={-9} y={-9} width={18} height={18} rx={3} fill="none" stroke={color} strokeWidth={sw} />
      <circle cx={-4.5} cy={-4.5} r={1.5} fill={color} />
      <circle cx={4.5} cy={-4.5} r={1.5} fill={color} />
      <circle cx={0} cy={0} r={1.5} fill={color} />
      <circle cx={-4.5} cy={4.5} r={1.5} fill={color} />
      <circle cx={4.5} cy={4.5} r={1.5} fill={color} />
    </g>
  );
}
