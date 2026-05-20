export type PreviewNodeKind = "hub" | "mark" | "pursuit-peer" | "pursuit-child" | "milestone";

export type PreviewNode = {
  id: string;
  queueId?: string;
  kind: PreviewNodeKind;
  label: string;
  x: number;
  y: number;
  r: number;
};

export type PreviewEdge = {
  id: string;
  from: string;
  to: string;
};

export type StreamPreviewLayout = {
  width: number;
  height: number;
  nodes: PreviewNode[];
  edges: PreviewEdge[];
};

/** Tree canvas — matches roadmap tree viewport (`tree-view` / cutout). */
export const STREAM_PREVIEW_CANVAS_BG = "#0e0f0e";
export const STREAM_PREVIEW_MIN_WIDTH = 600;
export const STREAM_PREVIEW_PAD = 40;

/** Tree label ink (`tree-canvas-label` readable fill). */
export const STREAM_PREVIEW_LABEL_FILL = "#e8e4dc";
export const STREAM_PREVIEW_LABEL_FONT_PX = 11;
export const STREAM_PREVIEW_LABEL_GAP_PX = 10;

/** Branch / pursuit connector — warm limb stroke on tree canvas. */
export const STREAM_PREVIEW_LINE_STROKE = "rgba(255, 200, 80, 0.25)";
export const STREAM_PREVIEW_LINE_WIDTH = 1.5;

/** Mark / milestone chord connectors (`tree-render-goals-subtree` / `tree-svg`). */
export const STREAM_PREVIEW_CHORD_STROKE = "rgba(255, 200, 80, 0.25)";
export const STREAM_PREVIEW_CHORD_WIDTH = 0.75;
export const STREAM_PREVIEW_CHORD_DASH = "3 3";
export const STREAM_PREVIEW_CHORD_OPACITY = 0.42;
