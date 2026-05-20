import type { PreviewEdge, PreviewNode, StreamPreviewLayout } from "@/components/stream/stream-preview-types";
import {
  STREAM_PREVIEW_LABEL_FONT_PX,
  STREAM_PREVIEW_LABEL_GAP_PX,
  STREAM_PREVIEW_MIN_WIDTH,
  STREAM_PREVIEW_PAD,
} from "@/components/stream/stream-preview-types";

const HUB_X = 70;
const MARK_X = 160;
const PEER_X = 260;
const CHILD_X = 400;
const MILESTONE_X_OFFSET = 70;

const HUB_R = 18;
const PEER_R = 14;
const CHILD_R = 10;
const MARK_R = 5;
const MILESTONE_R = 4;

const MARK_GAP = 44;
const PEER_GAP = 68;
const CHILD_GAP = 52;
const MILESTONE_OFFSET_Y = 16;

const HUB_LABEL_BELOW_GAP = 8;
const LABEL_CHAR_W = 6.2;

import type { StreamBloomStatus } from "@/types/stream";
import type { CreateGoalGoalType } from "@/lib/validation/create-goal";

export type PreviewPursuitInput = {
  queueId: string;
  title: string;
  clientKey?: string;
  parentQueueId?: string | null;
  /** Parent pursuit already on the hub (committed goal id). */
  parentExistingGoalId?: string;
  bloomStatus?: StreamBloomStatus;
  goalType?: CreateGoalGoalType;
};

export type PreviewMarkInput = {
  queueId: string;
  title: string;
  date?: string | null;
};

export type PreviewMilestoneInput = {
  queueId: string;
  title: string;
  pursuitQueueId: string;
};

export type PreviewLayoutInput = {
  hubLabel: string;
  hubId?: string;
  marks: PreviewMarkInput[];
  pursuits: PreviewPursuitInput[];
  milestones: PreviewMilestoneInput[];
};

function truncate(label: string, max = 28): string {
  const t = label.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function stackCenteredY(count: number, gap: number, centerY = 0): number[] {
  if (count <= 0) return [];
  if (count === 1) return [centerY];
  const span = (count - 1) * gap;
  const start = centerY - span / 2;
  return Array.from({ length: count }, (_, i) => start + i * gap);
}

function milestoneYs(count: number, pursuitY: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [pursuitY];
  const span = (count - 1) * MILESTONE_OFFSET_Y;
  const start = pursuitY - span / 2;
  return Array.from({ length: count }, (_, i) => start + i * MILESTONE_OFFSET_Y);
}

function estimateLabelRight(node: PreviewNode): number {
  if (node.kind === "milestone") {
    return node.x + node.r;
  }
  const maxChars = node.kind === "hub" ? 24 : 22;
  const len = Math.min(node.label.length, maxChars);
  if (node.kind === "hub") {
    return node.x + len * LABEL_CHAR_W;
  }
  return node.x + node.r + STREAM_PREVIEW_LABEL_GAP_PX + len * LABEL_CHAR_W;
}

function estimateHubLabelBottom(node: PreviewNode): number {
  return node.y + node.r + HUB_LABEL_BELOW_GAP + STREAM_PREVIEW_LABEL_FONT_PX * 1.3;
}

export function layoutStreamPreview(input: PreviewLayoutInput): StreamPreviewLayout {
  const hubId = input.hubId ?? "hub";
  const nodes: PreviewNode[] = [];
  const edges: PreviewEdge[] = [];

  const peers = input.pursuits.filter((p) => !p.parentQueueId);
  const children = input.pursuits.filter((p) => p.parentQueueId);

  const peerYs = stackCenteredY(peers.length, PEER_GAP, 0);
  const markYs = stackCenteredY(input.marks.length, MARK_GAP, 0);

  const pursuitCenterByQueueId = new Map<string, { x: number; y: number }>();

  input.marks.forEach((m, i) => {
    const y = markYs[i] ?? 0;
    const nodeId = `mark-${m.queueId}`;
    nodes.push({
      id: nodeId,
      queueId: m.queueId,
      kind: "mark",
      label: truncate(m.title),
      x: MARK_X,
      y,
      r: MARK_R,
    });
    edges.push({ id: `e-hub-${nodeId}`, from: hubId, to: nodeId });
  });

  peers.forEach((p, i) => {
    const y = peerYs[i] ?? 0;
    const nodeId = `pursuit-${p.queueId}`;
    nodes.push({
      id: nodeId,
      queueId: p.queueId,
      kind: "pursuit-peer",
      label: truncate(p.title),
      x: PEER_X,
      y,
      r: PEER_R,
    });
    pursuitCenterByQueueId.set(p.queueId, { x: PEER_X, y });
    edges.push({ id: `e-hub-${nodeId}`, from: hubId, to: nodeId });
  });

  const childrenByParent = new Map<string, PreviewPursuitInput[]>();
  for (const c of children) {
    const pid = c.parentQueueId!;
    const list = childrenByParent.get(pid) ?? [];
    list.push(c);
    childrenByParent.set(pid, list);
  }

  childrenByParent.forEach((kids, parentQueueId) => {
    const parentCenter = pursuitCenterByQueueId.get(parentQueueId);
    if (!parentCenter) return;

    const childYs = stackCenteredY(kids.length, CHILD_GAP, parentCenter.y);

    kids.forEach((c, i) => {
      const y = childYs[i] ?? parentCenter.y;
      const nodeId = `pursuit-${c.queueId}`;
      nodes.push({
        id: nodeId,
        queueId: c.queueId,
        kind: "pursuit-child",
        label: truncate(c.title),
        x: CHILD_X,
        y,
        r: CHILD_R,
      });
      pursuitCenterByQueueId.set(c.queueId, { x: CHILD_X, y });
      edges.push({
        id: `e-${parentQueueId}-${nodeId}`,
        from: `pursuit-${parentQueueId}`,
        to: nodeId,
      });
    });
  });

  const milestonesByPursuit = new Map<string, PreviewMilestoneInput[]>();
  for (const ms of input.milestones) {
    const list = milestonesByPursuit.get(ms.pursuitQueueId) ?? [];
    list.push(ms);
    milestonesByPursuit.set(ms.pursuitQueueId, list);
  }

  milestonesByPursuit.forEach((list, pursuitQueueId) => {
    const center = pursuitCenterByQueueId.get(pursuitQueueId);
    if (!center) return;

    const ys = milestoneYs(list.length, center.y);
    list.forEach((ms, i) => {
      const y = ys[i] ?? center.y;
      const nodeId = `milestone-${ms.queueId}`;
      nodes.push({
        id: nodeId,
        queueId: ms.queueId,
        kind: "milestone",
        label: truncate(ms.title, 22),
        x: center.x + MILESTONE_X_OFFSET,
        y,
        r: MILESTONE_R,
      });
      edges.push({
        id: `e-${pursuitQueueId}-${nodeId}`,
        from: `pursuit-${pursuitQueueId}`,
        to: nodeId,
      });
    });
  });

  let minY = 0;
  let maxY = 0;
  let maxRight = HUB_X + HUB_R;

  if (nodes.length > 0) {
    minY = Math.min(...nodes.map((n) => n.y - n.r));
    maxY = Math.max(...nodes.map((n) => n.y + n.r));
    maxRight = Math.max(...nodes.map(estimateLabelRight));
  }

  const hubY = nodes.length > 0 ? (minY + maxY) / 2 : 0;

  nodes.push({
    id: hubId,
    kind: "hub",
    label: truncate(input.hubLabel, 24),
    x: HUB_X,
    y: hubY,
    r: HUB_R,
  });

  minY = Math.min(minY, hubY - HUB_R);
  maxY = Math.max(maxY, hubY + HUB_R, estimateHubLabelBottom({ id: hubId, kind: "hub", label: input.hubLabel, x: HUB_X, y: hubY, r: HUB_R }));
  maxRight = Math.max(maxRight, estimateLabelRight({ id: hubId, kind: "hub", label: input.hubLabel, x: HUB_X, y: hubY, r: HUB_R }));

  const shiftY = STREAM_PREVIEW_PAD - minY;
  for (const n of nodes) {
    n.y += shiftY;
  }

  const width = Math.max(STREAM_PREVIEW_MIN_WIDTH, maxRight + STREAM_PREVIEW_PAD);
  const height = maxY + shiftY + STREAM_PREVIEW_PAD;

  return {
    width,
    height,
    nodes,
    edges,
  };
}
