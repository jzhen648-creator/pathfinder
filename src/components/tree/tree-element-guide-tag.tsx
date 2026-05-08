export function TreeElementGuideTag({
  x,
  y,
  text,
  anchor = "middle",
}: {
  x: number;
  y: number;
  text: string;
  anchor?: "start" | "middle" | "end";
}) {
  return (
    <text
      textAnchor={anchor}
      x={x}
      y={y}
      fontSize={7}
      fontFamily="ui-monospace, monospace"
      fill="#F5F5F4"
      fillOpacity={0.94}
      stroke="#0C0A09"
      strokeWidth={0.45}
      paintOrder="stroke fill"
    >
      {text}
    </text>
  );
}
