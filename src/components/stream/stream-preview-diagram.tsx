"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { StreamPreviewLayout } from "@/components/stream/stream-preview-types";
import {
  STREAM_PREVIEW_CANVAS_BG,
  STREAM_PREVIEW_CHORD_DASH,
  STREAM_PREVIEW_CHORD_OPACITY,
  STREAM_PREVIEW_CHORD_STROKE,
  STREAM_PREVIEW_CHORD_WIDTH,
  STREAM_PREVIEW_LABEL_FILL,
  STREAM_PREVIEW_LABEL_FONT_PX,
  STREAM_PREVIEW_LABEL_GAP_PX,
  STREAM_PREVIEW_LINE_STROKE,
  STREAM_PREVIEW_LINE_WIDTH,
  STREAM_PREVIEW_MIN_WIDTH,
} from "@/components/stream/stream-preview-types";
import {
  PreviewGoalNode,
  PreviewHubMedallion,
  PreviewMarkDot,
  PreviewMilestoneOrbital,
  StreamPreviewTreeDefs,
  previewBranchPathD,
  previewHubDiscR,
  getStreamHubPreviewFilterIds,
} from "@/components/stream/stream-preview-tree-visual";

const TREE_LABEL_FONT =
  'var(--font-geist-sans), "Geist", system-ui, -apple-system, sans-serif';

export type StreamPreviewDiagramProps = {
  layout: StreamPreviewLayout;
  accentColor: string;
  onRemove?: (queueId: string) => void;
  removalFlash?: string | null;
};

function truncateLabel(label: string, max: number): string {
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}

function edgeAnchor(
  layout: StreamPreviewLayout,
  edge: StreamPreviewLayout["edges"][number],
): {
  from: StreamPreviewLayout["nodes"][number];
  to: StreamPreviewLayout["nodes"][number];
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  parentCx?: number;
  parentCy?: number;
} | null {
  const from = layout.nodes.find((n) => n.id === edge.from);
  const to = layout.nodes.find((n) => n.id === edge.to);
  if (!from || !to) return null;

  const hubDisc = previewHubDiscR();
  const fromR = from.kind === "hub" ? hubDisc : from.r;
  const toR = to.r;

  const x1 = from.x + fromR;
  const y1 = from.y;
  const x2 = to.x - toR;
  const y2 = to.y;

  const parentCx = from.kind === "pursuit-peer" || from.kind === "pursuit-child" ? from.x : undefined;
  const parentCy = from.kind === "pursuit-peer" || from.kind === "pursuit-child" ? from.y : undefined;

  return { from, to, x1, y1, x2, y2, parentCx, parentCy };
}

function isChordEdge(toKind: StreamPreviewLayout["nodes"][number]["kind"]): boolean {
  return toKind === "mark" || toKind === "milestone";
}

type DiagramNodeProps = {
  node: StreamPreviewLayout["nodes"][number];
  accentColor: string;
  hubAuraId: string;
  medHaloId: string;
  gradUid: string;
  onRemove?: (queueId: string) => void;
};

function DiagramNode({ node, accentColor, hubAuraId, medHaloId, gradUid, onRemove }: DiagramNodeProps) {
  const canRemove = Boolean(onRemove && node.queueId);
  const displayLabel = truncateLabel(node.label, node.kind === "hub" ? 24 : 22);
  const hubDiscR = previewHubDiscR();
  const labelOffsetR = node.kind === "hub" ? hubDiscR : node.r;

  return (
    <g className="stream-preview-node">
      <title>{node.label}</title>

      {node.kind === "hub" ? (
        <PreviewHubMedallion cx={node.x} cy={node.y} hubAuraId={hubAuraId} medHaloId={medHaloId} />
      ) : null}

      {node.kind === "mark" ? (
        <PreviewMarkDot cx={node.x} cy={node.y} r={node.r} color={accentColor} />
      ) : null}

      {(node.kind === "pursuit-peer" || node.kind === "pursuit-child") && (
        <PreviewGoalNode cx={node.x} cy={node.y} coreR={node.r} color={accentColor} gradUid={gradUid} />
      )}

      {node.kind === "milestone" ? (
        <PreviewMilestoneOrbital cx={node.x} cy={node.y} dotR={node.r} color={accentColor} />
      ) : null}

      {node.kind === "hub" ? (
        <text
          x={node.x}
          y={node.y + labelOffsetR + 8}
          textAnchor="middle"
          dominantBaseline="hanging"
          fill={STREAM_PREVIEW_LABEL_FILL}
          fontSize={STREAM_PREVIEW_LABEL_FONT_PX}
          fontWeight={700}
          fontFamily={TREE_LABEL_FONT}
          letterSpacing="0.04em"
        >
          {displayLabel}
        </text>
      ) : node.kind === "milestone" ? null : (
        <text
          x={node.x + labelOffsetR + STREAM_PREVIEW_LABEL_GAP_PX}
          y={node.y + 4}
          textAnchor="start"
          dominantBaseline="middle"
          fill={STREAM_PREVIEW_LABEL_FILL}
          fontSize={STREAM_PREVIEW_LABEL_FONT_PX}
          fontWeight={node.kind === "pursuit-peer" ? 700 : 600}
          fontFamily={TREE_LABEL_FONT}
          letterSpacing="0.03em"
        >
          {displayLabel}
        </text>
      )}

      {canRemove ? (
        <g
          role="button"
          tabIndex={0}
          style={{ cursor: "pointer" }}
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.(node.queueId!);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onRemove?.(node.queueId!);
            }
          }}
        >
          <circle
            cx={node.x + labelOffsetR + 2}
            cy={node.y - labelOffsetR - 2}
            r={9}
            fill={STREAM_PREVIEW_CANVAS_BG}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={1}
          />
          <text
            x={node.x + labelOffsetR + 2}
            y={node.y - labelOffsetR - 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgba(232,228,220,0.55)"
            fontSize={11}
            fontWeight={600}
            fontFamily={TREE_LABEL_FONT}
          >
            ×
          </text>
        </g>
      ) : null}
    </g>
  );
}

export function StreamPreviewDiagram({
  layout,
  accentColor,
  onRemove,
  removalFlash,
}: StreamPreviewDiagramProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const { prefix, hubAuraId, medHaloId } = getStreamHubPreviewFilterIds();
  const hovered = useMemo(
    () => layout.nodes.find((n) => n.id === hoveredId),
    [hoveredId, layout.nodes],
  );

  return (
    <div
      className="stream-preview-diagram"
      style={
        {
          width: "100%",
          minWidth: STREAM_PREVIEW_MIN_WIDTH,
          maxWidth: "100%",
          margin: "0 auto",
          ["--stream-accent" as string]: accentColor,
        } satisfies CSSProperties
      }
    >
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width="100%"
        height={layout.height}
        style={{
          display: "block",
          minWidth: STREAM_PREVIEW_MIN_WIDTH,
          background: STREAM_PREVIEW_CANVAS_BG,
        }}
        role="img"
        aria-label="Preview of items to add to the hub"
        onMouseLeave={() => setHoveredId(null)}
      >
        <StreamPreviewTreeDefs prefix={prefix} />
        <rect width={layout.width} height={layout.height} fill={STREAM_PREVIEW_CANVAS_BG} />
        {layout.edges.map((edge) => {
          const anchor = edgeAnchor(layout, edge);
          if (!anchor) return null;
          const { to, x1, y1, x2, y2, parentCx, parentCy } = anchor;
          const chord = isChordEdge(to.kind);
          const useCurve =
            to.kind === "pursuit-child" || to.kind === "pursuit-peer" || to.kind === "milestone";
          const d = useCurve
            ? previewBranchPathD(x1, y1, x2, y2, parentCx, parentCy)
            : `M ${x1} ${y1} L ${x2} ${y2}`;

          return (
            <path
              key={edge.id}
              d={d}
              fill="none"
              stroke={chord ? STREAM_PREVIEW_CHORD_STROKE : STREAM_PREVIEW_LINE_STROKE}
              strokeWidth={chord ? STREAM_PREVIEW_CHORD_WIDTH : STREAM_PREVIEW_LINE_WIDTH}
              strokeDasharray={chord ? STREAM_PREVIEW_CHORD_DASH : undefined}
              strokeOpacity={chord ? STREAM_PREVIEW_CHORD_OPACITY : 1}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
              aria-hidden
            />
          );
        })}
        {layout.nodes.map((node) => (
          <g
            key={node.id}
            onMouseEnter={() => setHoveredId(node.id)}
            style={{ pointerEvents: "all" }}
          >
            <DiagramNode
              node={node}
              accentColor={accentColor}
              hubAuraId={hubAuraId}
              medHaloId={medHaloId}
              gradUid={`${prefix}-${node.id}`}
              onRemove={onRemove}
            />
          </g>
        ))}
      </svg>
      {hovered ? (
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 12,
            color: "rgba(232,228,220,0.5)",
            textAlign: "center",
            fontFamily: TREE_LABEL_FONT,
          }}
        >
          {hovered.label}
        </p>
      ) : null}
      {removalFlash ? (
        <p
          className="stream-preview-removal-flash"
          style={{
            margin: "8px 0 0",
            fontSize: 13,
            color: accentColor,
            textAlign: "center",
            fontFamily: TREE_LABEL_FONT,
          }}
        >
          {removalFlash}
        </p>
      ) : null}
      <style>{`
        .stream-preview-removal-flash {
          animation: streamPreviewFlash 1.2s ease-out;
        }
        @keyframes streamPreviewFlash {
          from { opacity: 1; }
          to { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
