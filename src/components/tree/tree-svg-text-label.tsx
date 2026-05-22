import { memo, type CSSProperties, type MouseEvent } from "react";
import { splitCanvasLabelLines } from "./tree-canvas-label";
import { snapTreeSvgScalar } from "./tree-view-constants";
import { treeLabelPillWidth } from "./tree-label-lod";

export type TreeSvgTextLabelProps = {
  x: number;
  y: number;
  text: string;
  /** Limb accent — used for stroke when `ink` is omitted. */
  color: string;
  fontSize: number;
  fontWeight?: number;
  textAnchor?: "start" | "end" | "middle";
  dominantBaseline?: "middle" | "hanging" | "alphabetic";
  opacity?: number;
  /** Override fill/stroke (e.g. {@link treeMapLimbHueReadableInk} from `./tree-canvas-label`). */
  ink?: { fill: string; fillOpacity: number; stroke: string; strokeOpacity: number; strokeWidth: number };
  /** Word-wrap to at most this many lines (no ellipsis). */
  maxLines?: number;
  /** Max pill width in SVG px before wrapping. */
  maxWidthPx?: number;
  /** Dark rounded backing for legibility on busy limbs. */
  pill?: boolean;
  pillFill?: string;
  pillFillOpacity?: number;
  letterSpacing?: string;
  /** Override canvas label font (e.g. Lora for theme gateways). */
  fontFamily?: string;
  fontStyle?: CSSProperties["fontStyle"];
  pointerEvents?: "none" | "visiblePainted";
  onClick?: (e: MouseEvent<SVGElement>) => void;
  style?: CSSProperties;
  "data-tree-export-skip"?: string;
};

const LINE_HEIGHT_MUL = 1.22;

/**
 * Consistent tree label: optional pill + stroked fill text (readable on branch color).
 */
export const TreeSvgTextLabel = memo(function TreeSvgTextLabel({
  x,
  y,
  text,
  color,
  fontSize,
  fontWeight = 600,
  textAnchor = "middle",
  dominantBaseline = "middle",
  opacity = 1,
  ink,
  maxLines = 1,
  maxWidthPx,
  pill = true,
  pillFill = "#0C0A09",
  pillFillOpacity = 0.62,
  letterSpacing = "0.03em",
  fontFamily,
  fontStyle,
  pointerEvents = "none",
  onClick,
  style,
  "data-tree-export-skip": exportSkip,
}: TreeSvgTextLabelProps) {
  if (opacity < 0.04 || !text) return null;

  const lines =
    maxLines > 1 ? splitCanvasLabelLines(text, fontSize, maxLines, maxWidthPx) : [text.trim() || "Pursuit"];

  const fill = ink?.fill ?? color;
  /** Opacity is applied on the wrapping `<g>` only — do not multiply here or text reads ~quadratically dim. */
  const fillOpacity = ink?.fillOpacity ?? 1;
  const stroke = ink?.stroke ?? color;
  const strokeOpacity = ink?.strokeOpacity ?? 0.35;
  const strokeWidth = ink?.strokeWidth ?? (fontWeight >= 700 ? 0.75 : 0.65);

  const sx = snapTreeSvgScalar(x);
  const sy = snapTreeSvgScalar(y);
  const lineHeight = fontSize * LINE_HEIGHT_MUL;
  const pillW = Math.max(...lines.map((line) => treeLabelPillWidth(line, fontSize)));
  const pillH = lineHeight * lines.length + fontSize * 0.28;
  let pillX = sx;
  if (textAnchor === "middle") pillX = sx - pillW / 2;
  else if (textAnchor === "end") pillX = sx - pillW;
  const pillY =
    dominantBaseline === "hanging" ? sy - fontSize * 0.12 : sy - pillH * 0.52;

  const textStyle: CSSProperties = {
    fontFamily: fontFamily ?? "ui-sans-serif, system-ui, sans-serif",
    fontStyle,
    letterSpacing,
    cursor: onClick ? "pointer" : undefined,
    ...style,
  };

  const interactive = Boolean(onClick);
  const groupPointerEvents = interactive ? "visiblePainted" : pointerEvents;
  const rectPointerEvents = interactive && pill ? "visiblePainted" : "none";
  const textPointerEvents = interactive ? (pill ? "none" : "visiblePainted") : pointerEvents;

  return (
    <g
      opacity={opacity}
      pointerEvents={groupPointerEvents}
      data-tree-export-skip={exportSkip}
      onClick={onClick}
    >
      {pill ? (
        <rect
          x={pillX}
          y={pillY}
          width={pillW}
          height={pillH}
          rx={pillH * 0.28}
          fill={pillFill}
          fillOpacity={pillFillOpacity}
          pointerEvents={rectPointerEvents}
        />
      ) : null}
      <text
        textAnchor={textAnchor}
        dominantBaseline={dominantBaseline}
        fontSize={fontSize}
        fontWeight={fontWeight}
        fill={fill}
        fillOpacity={fillOpacity}
        stroke={stroke}
        strokeOpacity={strokeOpacity}
        strokeWidth={strokeWidth}
        paintOrder="stroke fill"
        pointerEvents={textPointerEvents}
        style={textStyle}
      >
        {lines.map((line, i) => (
          <tspan key={i} x={sx} y={i === 0 ? sy : undefined} dy={i === 0 ? 0 : lineHeight}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
});
