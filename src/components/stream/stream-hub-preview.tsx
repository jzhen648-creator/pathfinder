"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  domainClusterFlowSegmentPathD,
  domainClusterGoalFlowSegments,
  domainClusterGoalRingGoalCount,
  domainClusterGoalRingSlotIndex,
  continuationChildScreenPosition,
  goalHexRotationRadFromTangentOut,
  goalMarkerTangentOutForPlacement,
  goalScreenPositionForLifeAreaThread,
  resolvedChainMomentPos,
  type DomainClusterMomentChainContext,
} from "@/components/tree/tree-branch-geometry";
import { TreeMarkNode } from "@/components/tree/tree-mark-node";
import {
  flattenGoalsById,
  goalPursuitDepth,
  pursuitConnectorStrokeWidth,
} from "@/components/tree/tree-connector-strokes";
import { renderGoalsSubtree } from "@/components/tree/tree-render-goals-subtree";
import { shouldDomainClusterThread } from "@/components/tree/tree-renderer-grammar";
import { domainClusterGoalRingMaxPx } from "@/components/tree/tree-trunk-slots";
import type { MomentNode, TreeGoalNode } from "@/components/tree/tree-types";
import {
  snapTreeSvgScalar,
  TREE_GOAL_HEX_VERTEX_RADIUS_PX,
  TREE_THREAD_MARKER_VISUALS_ENABLED,
} from "@/components/tree/tree-view-constants";
import type { PanelState } from "@/components/tree/tree-view-types";
import {
  PreviewHubMedallion,
  STREAM_HUB_PREVIEW_ARTWORK_SPAN_PX,
  StreamPreviewTreeDefs,
  getStreamHubPreviewFilterIds,
} from "@/components/stream/stream-preview-tree-visual";
import { iconMedallionRadii } from "@/components/tree/tree-icon-medallion";
import {
  isPreviewNodeId,
  PREVIEW_BOUNDS_PAD_PX,
  previewPointHubLocal,
  type PreviewHubBundle,
} from "@/components/stream/stream-hub-preview-data";
import type { Point } from "@/components/tree/tree-types";
import {
  STREAM_PREVIEW_CANVAS_BG,
  STREAM_PREVIEW_CHORD_DASH,
  STREAM_PREVIEW_CHORD_OPACITY,
  STREAM_PREVIEW_CHORD_STROKE,
  STREAM_PREVIEW_CHORD_WIDTH,
  STREAM_PREVIEW_LINE_STROKE,
  STREAM_PREVIEW_LINE_WIDTH,
} from "@/components/stream/stream-preview-types";

const PREVIEW_ZOOM_RATIO = 2.2;
/** Uniform scale on preview SVG content (not viewBox). */
export const PREVIEW_CONTENT_SCALE = 0.6;
const GOAL_HALO_R = 70;
const PREVIEW_CONTAINER_MAX_HEIGHT_PX = 400;

export type StreamHubPreviewProps = {
  bundle: PreviewHubBundle;
  areaColor: string;
};

function PreviewWrap({
  isPreview,
  children,
}: {
  isPreview: boolean;
  children: ReactNode;
}) {
  if (!isPreview) return <>{children}</>;
  return <g className="stream-hub-preview-node-pulse">{children}</g>;
}

function collectLayoutBounds(
  goal: TreeGoalNode,
  pos: Point,
  depth: number,
  hubPt: Point | null,
  out: Point[],
): void {
  out.push(pos);
  const childHub = hubPt ?? pos;
  const childPad = Math.max(GOAL_HALO_R, domainClusterGoalRingMaxPx() + 24);
  goal.childGoals.forEach((child, ci) => {
    const childPos =
      hubPt && child.parentGoalId
        ? continuationChildScreenPosition(pos, childHub, ci, child.id, depth)
        : {
            x: pos.x + Math.cos((ci / Math.max(1, goal.childGoals.length)) * Math.PI * 2) * 54,
            y: pos.y + Math.sin((ci / Math.max(1, goal.childGoals.length)) * Math.PI * 2) * 54,
          };
    out.push(childPos);
    out.push({ x: childPos.x - childPad, y: childPos.y });
    out.push({ x: childPos.x + childPad, y: childPos.y });
    out.push({ x: childPos.x, y: childPos.y - childPad });
    out.push({ x: childPos.x, y: childPos.y + childPad });
    collectLayoutBounds(child, childPos, depth + 1, hubPt, out);
  });
}

type PreviewViewport = {
  viewBox: string;
  contentTransform: string;
  width: number;
  height: number;
};

/** Fit scaled content: hub left, pursuits right, vertically centred in the viewBox. */
function computePreviewViewport(
  hubPt: Point,
  points: Point[],
  scale: number,
  pad: number,
  branchTip: Point,
): PreviewViewport {
  const hubRadii = iconMedallionRadii(STREAM_HUB_PREVIEW_ARTWORK_SPAN_PX, "domainHub");
  const hubR = Math.max(hubRadii.discR, hubRadii.bloomR);
  const goalPad = Math.max(GOAL_HALO_R, domainClusterGoalRingMaxPx() + 32);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const include = (p: Point, r: number) => {
    minX = Math.min(minX, p.x - r);
    maxX = Math.max(maxX, p.x + r);
    minY = Math.min(minY, p.y - r);
    maxY = Math.max(maxY, p.y + r);
  };

  include(hubPt, hubR);
  include(branchTip, 12);
  include({ x: 0, y: 0 }, 8);
  for (const p of points) {
    include(p, goalPad);
  }

  if (!Number.isFinite(minX)) {
    minX = 0;
    maxX = 400;
    minY = -100;
    maxY = 100;
  }

  const contentW = maxX - minX;
  const contentH = maxY - minY;
  const width = contentW * scale + 2 * pad;
  const height = contentH * scale + 2 * pad;
  const tx = pad - minX * scale;
  const ty = (height - contentH * scale) / 2 - minY * scale;
  const contentTransform = `translate(${snapTreeSvgScalar(tx)},${snapTreeSvgScalar(ty)}) scale(${scale}) translate(${snapTreeSvgScalar(-minX)},${snapTreeSvgScalar(-minY)})`;

  return {
    viewBox: `0 0 ${width} ${height}`,
    contentTransform,
    width,
    height,
  };
}

export function StreamHubPreview(props: StreamHubPreviewProps) {
  const [svgReady, setSvgReady] = useState(false);
  useEffect(() => {
    setSvgReady(true);
  }, []);

  if (!svgReady) {
    return (
      <div
        className="stream-hub-preview"
        style={{
          width: "100%",
          maxHeight: PREVIEW_CONTAINER_MAX_HEIGHT_PX,
          minHeight: 120,
          background: STREAM_PREVIEW_CANVAS_BG,
        }}
        aria-busy="true"
        aria-label="Loading hub preview"
      />
    );
  }

  return <StreamHubPreviewSvg {...props} />;
}

function StreamHubPreviewSvg({ bundle, areaColor }: StreamHubPreviewProps) {
  const { area, thread, geometry, previewIds } = bundle;
  const areaId = area.id;
  const hubPt = geometry.domainHubPt;
  const panMoved = useRef(false);
  const { prefix, hubAuraId, medHaloId } = getStreamHubPreviewFilterIds();
  const panel: PanelState = { type: "none" };
  const bloomPlayingIds = useMemo(() => new Set<string>(), []);

  const goalsOnThread = useMemo(
    () => thread.goals.filter((g) => !g.parentGoalId),
    [thread.goals],
  );
  const goalsById = useMemo(() => flattenGoalsById(thread.goals), [thread.goals]);
  const threadDc = shouldDomainClusterThread(areaId, thread);

  const dcChainCtx: DomainClusterMomentChainContext = useMemo(
    () => ({
      catalogFullPath: geometry.threadCatalogFull,
      kFork: geometry.threadIndexAlongLimb,
      branchCountOnLimb: geometry.branchCountOnLimb,
      goalsOnThread: thread.goals,
      domainClusterGatewaySpreadNormal: geometry.dcGatewaySpreadNormal,
      branchId: thread.id,
    }),
    [
      geometry.branchCountOnLimb,
      geometry.dcGatewaySpreadNormal,
      geometry.threadCatalogFull,
      geometry.threadIndexAlongLimb,
      thread.goals,
      thread.id,
    ],
  );

  const layout = useMemo(() => {
    const samplePoints: { x: number; y: number }[] = [];
    const goalLayouts: {
      goal: TreeGoalNode;
      pos: { x: number; y: number };
      hexRotationRad: number;
    }[] = [];

    const ringCount = threadDc ? domainClusterGoalRingGoalCount(thread) : goalsOnThread.length;

    goalsOnThread.forEach((g, gi) => {
      const ringGi = threadDc ? domainClusterGoalRingSlotIndex(thread, g.id) : gi;
      const pos = goalScreenPositionForLifeAreaThread(
        areaId,
        thread,
        geometry.threadCatalogFull,
        ringGi,
        g.id,
        geometry.threadIndexAlongLimb,
        geometry.branchCountOnLimb,
        ringCount,
        geometry.dcGatewaySpreadNormal,
        undefined,
        undefined,
        thread.id,
      );
      const tangOut = goalMarkerTangentOutForPlacement(
        threadDc,
        geometry.threadCatalogFull,
        ringGi,
        pos,
        geometry.threadIndexAlongLimb,
        geometry.branchCountOnLimb,
        geometry.dcGatewaySpreadNormal,
        areaId,
        undefined,
        undefined,
        thread.id,
      );
      const hexRotationRad = goalHexRotationRadFromTangentOut(tangOut);
      goalLayouts.push({ goal: g, pos, hexRotationRad });
      collectLayoutBounds(g, pos, 0, hubPt, samplePoints);
    });

    const momentLayouts: { moment: MomentNode; pos: { x: number; y: number } }[] = [];
    const displayMoments = thread.moments.filter((m) => m.synthetic !== true);
    displayMoments.forEach((moment, momentIdx) => {
      const idxInThread = thread.moments.indexOf(moment);
      const pos = resolvedChainMomentPos(
        areaId,
        geometry.threadIndexAlongLimb,
        thread,
        idxInThread >= 0 ? idxInThread : momentIdx,
        geometry.threadCatalogFull,
        undefined,
        geometry.momentChordTEnd,
        geometry.threadMainDraw,
        dcChainCtx,
      );
      momentLayouts.push({ moment, pos });
      samplePoints.push(pos);
    });

    const localPoints = samplePoints.map((p) => previewPointHubLocal(p, hubPt));
    const localTip = previewPointHubLocal(geometry.branchSpec.tip, hubPt);
    const localFork = previewPointHubLocal(geometry.branchSpec.forkPoint, hubPt);

    const viewport = computePreviewViewport(
      { x: 0, y: 0 },
      [...localPoints, localFork],
      PREVIEW_CONTENT_SCALE,
      PREVIEW_BOUNDS_PAD_PX,
      localTip,
    );
    return { goalLayouts, momentLayouts, viewport };
  }, [dcChainCtx, geometry, goalsOnThread, hubPt, thread, threadDc, areaId]);

  const { viewport } = layout;
  /** Hub anchor for continuation-child layout; omit when longitudinal so parent→child spokes draw. */
  const subtreeDomainHubPt = threadDc ? hubPt : null;
  const hubLocalShift = `translate(${snapTreeSvgScalar(-hubPt.x)},${snapTreeSvgScalar(-hubPt.y)})`;

  return (
    <div
      className="stream-hub-preview"
      style={
        {
          width: "100%",
          maxHeight: PREVIEW_CONTAINER_MAX_HEIGHT_PX,
          ["--stream-accent" as string]: areaColor,
        } satisfies CSSProperties
      }
    >
      <svg
        viewBox={viewport.viewBox}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{
          display: "block",
          maxHeight: PREVIEW_CONTAINER_MAX_HEIGHT_PX,
          background: STREAM_PREVIEW_CANVAS_BG,
        }}
        role="img"
        aria-label={`Preview of items to add to ${thread.type}`}
      >
        <StreamPreviewTreeDefs prefix={prefix} />
        <rect
          x={0}
          y={0}
          width={viewport.width}
          height={viewport.height}
          fill={STREAM_PREVIEW_CANVAS_BG}
        />
        <g transform={viewport.contentTransform}>
          <g transform={hubLocalShift}>
          <path
            d={geometry.threadMainDraw}
            fill="none"
            stroke={STREAM_PREVIEW_LINE_STROKE}
            strokeWidth={STREAM_PREVIEW_LINE_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
            aria-hidden
          />

          {TREE_THREAD_MARKER_VISUALS_ENABLED
            ? layout.momentLayouts.map(({ moment, pos }) => {
                const isPreview = isPreviewNodeId(moment.id, previewIds);
                return (
                  <PreviewWrap key={moment.id} isPreview={isPreview}>
                    <g pointerEvents="none">
                      <TreeMarkNode
                        moment={moment}
                        area={{
                          id: areaId,
                          label: thread.type,
                          color: areaColor,
                          summary: null,
                          branches: [],
                        }}
                        x={pos.x}
                        y={pos.y}
                        isSelected={false}
                        panMoved={{ current: false }}
                        onMarkClick={() => {}}
                      />
                    </g>
                  </PreviewWrap>
                );
              })
            : null}

          {layout.goalLayouts.map(({ goal, pos, hexRotationRad }) => {
            const isPreview = isPreviewNodeId(goal.id, previewIds);
            const flowSegments = threadDc
              ? domainClusterGoalFlowSegments(hubPt, pos, goal)
              : [];
            return (
              <PreviewWrap key={goal.id} isPreview={isPreview}>
                <g>
                  {flowSegments.map((seg, si) => (
                        <path
                          key={`spoke-${goal.id}-${si}`}
                          data-tree-domain-spoke="1"
                          d={domainClusterFlowSegmentPathD(
                            seg.from,
                            seg.to,
                            areaId,
                            snapTreeSvgScalar,
                          )}
                          fill="none"
                          stroke={areaColor}
                          strokeWidth={pursuitConnectorStrokeWidth(
                            goalPursuitDepth(seg.targetGoalId, goalsById),
                          )}
                          strokeOpacity={0.5}
                          strokeLinecap="round"
                          vectorEffect="non-scaling-stroke"
                          pointerEvents="none"
                          aria-hidden
                        />
                  ))}
                  {renderGoalsSubtree(
                    goal,
                    pos,
                    area,
                    areaColor,
                    panel,
                    bloomPlayingIds,
                    () => {},
                    panMoved,
                    0,
                    0,
                    false,
                    hexRotationRad,
                    PREVIEW_ZOOM_RATIO,
                    undefined,
                    subtreeDomainHubPt,
                    { zoomRatio: PREVIEW_ZOOM_RATIO, limbFocused: false, limbDeemphasized: false },
                    goalsById,
                  )}
                </g>
              </PreviewWrap>
            );
          })}

          <PreviewHubMedallion
            cx={hubPt.x}
            cy={hubPt.y}
            hubAuraId={hubAuraId}
            medHaloId={medHaloId}
            color={areaColor}
            artworkSpanPx={STREAM_HUB_PREVIEW_ARTWORK_SPAN_PX}
          />
          </g>
        </g>
      </svg>
      <style>{`
        .stream-hub-preview-node-pulse {
          opacity: 0.5;
          animation: streamHubPreviewPulse 2.4s ease-in-out infinite;
        }
        @keyframes streamHubPreviewPulse {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 0.58; }
        }
      `}</style>
    </div>
  );
}
