"use client";

import { useMemo, useRef, type MutableRefObject } from "react";
import {
  isPreviewMoment,
  isPreviewTreeGoal,
  type PreviewMomentNode,
  type PreviewTreeGoalNode,
} from "@/components/stream/stream-hub-preview-data";
import { TreeMarkNode } from "@/components/tree/tree-mark-node";
import { renderGoalsSubtree } from "@/components/tree/tree-render-goals-subtree";
import {
  buildRenderedBranchMainPath,
  domainClusterGatewaySpreadNormalForForkSpec,
  domainClusterGoalFlowSegments,
  domainClusterGoalRingGoalCount,
  domainClusterGoalRingSlotIndex,
  domainClusterHubPointFromCatalog,
  domainClusterFlowSegmentPathD,
  continuationChildScreenPosition,
  goalHexRotationRadFromTangentOut,
  goalMarkerTangentOutForPlacement,
  goalScreenPositionForLifeAreaThread,
  pickThreadMomentsForTree,
  resolvedChainMomentPos,
  type DomainClusterMomentChainContext,
} from "@/components/tree/tree-branch-geometry";
import {
  flattenGoalsById,
  goalPursuitDepth,
  pursuitConnectorStrokeWidth,
} from "@/components/tree/tree-connector-strokes";
import {
  buildAreaForksRecord,
  compareBranchIndicesForStemOrder,
  getAreaSlotRender,
} from "@/components/tree/tree-forks";
import { shouldDomainClusterThread } from "@/components/tree/tree-renderer-grammar";
import type { AreaData, TreeGoalNode } from "@/components/tree/tree-types";
import type { AreaLayoutOverride } from "@/components/tree/tree-layout-edit";
import { getTreeRenderQualityFactors } from "@/components/tree/tree-render-quality";
import type { PanelState } from "@/components/tree/tree-view-types";
import {
  snapTreeSvgScalar,
  TREE_THREAD_MARKER_VISUALS_ENABLED,
  TREE_THREAD_VISIBLE_MOMENTS,
} from "@/components/tree/tree-view-constants";
import { PREVIEW_PENDING_NODE_ID } from "@/contexts/stream-preview-context";

const PREVIEW_CONNECTOR_OPACITY = 0.4;
const PREVIEW_PENDING_CONNECTOR_OPACITY = 0.92;
const PREVIEW_PENDING_LAYER_OPACITY = 0.92;

function isPendingPreviewId(id: string): boolean {
  return id === PREVIEW_PENDING_NODE_ID;
}

type Props = {
  previewAreas: AreaData[];
  allAreasForForkGeometry: AreaData[];
  resolvedForks: ReturnType<typeof buildAreaForksRecord>;
  layoutOverrides: Record<string, AreaLayoutOverride | undefined>;
  panel: PanelState;
  bloomPlayingIds: Set<string>;
  zoomRatio: number;
  onGoalClick: (goal: TreeGoalNode, area: AreaData) => void;
};

function walkGoals(goals: TreeGoalNode[]): TreeGoalNode[] {
  const out: TreeGoalNode[] = [];
  const visit = (list: TreeGoalNode[]) => {
    for (const g of list) {
      out.push(g);
      visit(g.childGoals);
    }
  };
  visit(goals);
  return out;
}

export function StreamPreviewMarkersLayer({
  previewAreas,
  allAreasForForkGeometry,
  resolvedForks,
  layoutOverrides,
  panel,
  bloomPlayingIds,
  zoomRatio,
  onGoalClick,
}: Props) {
  const panMoved = useRef(false) as MutableRefObject<boolean>;
  const treeRenderQuality = getTreeRenderQualityFactors();

  const areasRenderOrder = useMemo(() => {
    const order = allAreasForForkGeometry.map((a) => a.id);
    return [...previewAreas].sort(
      (a, b) => order.indexOf(a.id) - order.indexOf(b.id),
    );
  }, [allAreasForForkGeometry, previewAreas]);

  if (!TREE_THREAD_MARKER_VISUALS_ENABLED) return null;

  return (
  <>
    <style
      dangerouslySetInnerHTML={{
        __html: `
@keyframes previewPulse {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 0.7; }
}
@keyframes previewPendingPulse {
  0%, 100% { opacity: 0.82; filter: drop-shadow(0 0 6px rgba(255, 200, 120, 0.55)); }
  50% { opacity: 1; filter: drop-shadow(0 0 14px rgba(255, 200, 120, 0.85)); }
}
.stream-preview-layer {
  animation: previewPulse 2s ease-in-out infinite;
}
.stream-preview-pending {
  animation: previewPendingPulse 1.4s ease-in-out infinite;
}
`,
      }}
    />
    <g className="stream-preview-layer" opacity={0.45} pointerEvents="none">
      {areasRenderOrder.map((area) => {
        const slots = getAreaSlotRender(area.id, resolvedForks);
        const forkSpec = resolvedForks[area.id];
        if (!slots || !forkSpec) return null;

        const sortedBranchIdx = area.branches
          .map((_, i) => i)
          .sort((a, b) =>
            forkSpec != null ? compareBranchIndicesForStemOrder(forkSpec, a, b) : a - b,
          );
        const dcGatewaySpreadNormal = domainClusterGatewaySpreadNormalForForkSpec(forkSpec);
        const hubLayoutAnchors = {
          trunkAttach: forkSpec.trunkAttach,
          gateway: forkSpec.limbTip,
        };

        return area.branches.map((thread, idx) => {
          const threadSlot = slots.branchStrokes[idx];
          if (!threadSlot) return null;
          const threadSpec = forkSpec.branches[idx];
          const kFork = sortedBranchIdx.indexOf(idx);
          const momentsForTreeNav = shouldDomainClusterThread(area.id, thread)
            ? thread.moments.filter((m) => m.synthetic !== true)
            : thread.moments;
          const treeMoments = pickThreadMomentsForTree(momentsForTreeNav, TREE_THREAD_VISIBLE_MOMENTS);
          const threadForTree = { ...thread, moments: treeMoments };
          const {
            strokePath: threadMainDraw,
            catalogFullPath: threadCatalogFull,
            momentChordTEnd,
          } = buildRenderedBranchMainPath(
            area.id,
            idx,
            threadForTree,
            threadSlot.path,
            threadSpec,
            layoutOverrides[area.id],
            kFork,
            sortedBranchIdx.length,
            dcGatewaySpreadNormal,
            hubLayoutAnchors,
            thread.id,
          );
          const threadDc = shouldDomainClusterThread(area.id, thread);
          const domainHubPt = threadDc
            ? domainClusterHubPointFromCatalog(
                threadCatalogFull,
                kFork,
                sortedBranchIdx.length,
                dcGatewaySpreadNormal,
                area.id,
                layoutOverrides[area.id],
                hubLayoutAnchors,
                thread.id,
              )
            : null;
          const goalsOnThread = thread.goals;
          const goalsById = flattenGoalsById(goalsOnThread);
          const limbLabelCtx = {
            zoomRatio,
            limbFocused: false,
            limbDeemphasized: false,
          };

          const previewRoots = goalsOnThread.filter(
            (g) => !g.parentGoalId && isPreviewTreeGoal(g),
          );
          const allGoals = walkGoals(goalsOnThread);
          const previewChildren = allGoals.filter(
            (g) =>
              isPreviewTreeGoal(g) &&
              g.parentGoalId != null &&
              !isPreviewTreeGoal(goalsById.get(g.parentGoalId) ?? g),
          );

          return (
            <g key={`stream-preview-${area.id}-${thread.id}`}>
              {previewRoots.map((g, gi) => {
                const pending = isPendingPreviewId(g.id);
                const ringGoalCount = threadDc
                  ? domainClusterGoalRingGoalCount(thread)
                  : goalsOnThread.length;
                const ringGi = threadDc
                  ? domainClusterGoalRingSlotIndex(thread, g.id)
                  : gi;
                const pos = goalScreenPositionForLifeAreaThread(
                  area.id,
                  thread,
                  threadCatalogFull,
                  ringGi,
                  g.id,
                  kFork,
                  sortedBranchIdx.length,
                  ringGoalCount,
                  dcGatewaySpreadNormal,
                  layoutOverrides[area.id],
                  hubLayoutAnchors,
                  thread.id,
                );
                const tangOut = goalMarkerTangentOutForPlacement(
                  threadDc,
                  threadCatalogFull,
                  ringGi,
                  pos,
                  kFork,
                  sortedBranchIdx.length,
                  dcGatewaySpreadNormal,
                  area.id,
                  layoutOverrides[area.id],
                  hubLayoutAnchors,
                  thread.id,
                );
                const hexRotationRad = goalHexRotationRadFromTangentOut(tangOut);
                return (
                  <g
                    key={g.id}
                    className={pending ? "stream-preview-pending" : undefined}
                    opacity={pending ? PREVIEW_PENDING_LAYER_OPACITY : undefined}
                  >
                    {threadDc && domainHubPt
                      ? domainClusterGoalFlowSegments(domainHubPt, pos, g).map((seg, si) => (
                          <path
                            key={`preview-spoke-${g.id}-${si}`}
                            d={domainClusterFlowSegmentPathD(
                              seg.from,
                              seg.to,
                              area.id,
                              snapTreeSvgScalar,
                            )}
                            fill="none"
                            stroke={area.color}
                            strokeWidth={pursuitConnectorStrokeWidth(
                              goalPursuitDepth(seg.targetGoalId, goalsById),
                            )}
                            strokeOpacity={
                              pending ? PREVIEW_PENDING_CONNECTOR_OPACITY : PREVIEW_CONNECTOR_OPACITY
                            }
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                            pointerEvents="none"
                            aria-hidden
                          />
                        ))
                      : null}
                    {renderGoalsSubtree(
                      g,
                      pos,
                      area,
                      area.color,
                      panel,
                      bloomPlayingIds,
                      onGoalClick,
                      panMoved,
                      0,
                      idx,
                      false,
                      hexRotationRad,
                      zoomRatio,
                      treeRenderQuality,
                      domainHubPt,
                      limbLabelCtx,
                      goalsById,
                    )}
                  </g>
                );
              })}

              {previewChildren.map((child) => {
                const pending = isPendingPreviewId(child.id);
                const parent = child.parentGoalId ? goalsById.get(child.parentGoalId) : null;
                if (!parent) return null;
                const parentIsDc = threadDc;
                const parentRingN = parentIsDc
                  ? domainClusterGoalRingGoalCount(thread)
                  : goalsOnThread.length;
                const parentRingGi = parentIsDc
                  ? domainClusterGoalRingSlotIndex(thread, parent.id)
                  : goalsOnThread.findIndex((x) => x.id === parent.id);
                const parentPos = goalScreenPositionForLifeAreaThread(
                  area.id,
                  thread,
                  threadCatalogFull,
                  parentRingGi,
                  parent.id,
                  kFork,
                  sortedBranchIdx.length,
                  parentRingN,
                  dcGatewaySpreadNormal,
                  layoutOverrides[area.id],
                  hubLayoutAnchors,
                  thread.id,
                );
                const childIndex = parent.childGoals.findIndex((c) => c.id === child.id);
                const childPos = continuationChildScreenPosition(
                  parentPos,
                  domainHubPt ?? parentPos,
                  childIndex >= 0 ? childIndex : 0,
                  child.id,
                  0,
                );
                const tangOut = goalMarkerTangentOutForPlacement(
                  false,
                  threadCatalogFull,
                  0,
                  childPos,
                  kFork,
                  sortedBranchIdx.length,
                  dcGatewaySpreadNormal,
                  area.id,
                  layoutOverrides[area.id],
                  hubLayoutAnchors,
                  thread.id,
                );
                const hexRotationRad = goalHexRotationRadFromTangentOut(tangOut);
                return (
                  <g
                    key={child.id}
                    className={pending ? "stream-preview-pending" : undefined}
                    opacity={pending ? PREVIEW_PENDING_LAYER_OPACITY : undefined}
                  >
                    {renderGoalsSubtree(
                      child,
                      childPos,
                      area,
                      area.color,
                      panel,
                      bloomPlayingIds,
                      onGoalClick,
                      panMoved,
                      1,
                      idx,
                      false,
                      hexRotationRad,
                      zoomRatio,
                      treeRenderQuality,
                      domainHubPt,
                      limbLabelCtx,
                      goalsById,
                    )}
                  </g>
                );
              })}

              {threadForTree.moments.map((moment, momentIdx) => {
                if (!isPreviewMoment(moment as PreviewMomentNode)) return null;
                const pending = isPendingPreviewId(moment.id);
                const goalsOnThreadCount = goalsOnThread.length;
                const momentLayoutCtx: DomainClusterMomentChainContext = {
                  catalogFullPath: threadCatalogFull,
                  kFork,
                  branchCountOnLimb: sortedBranchIdx.length,
                  goalsOnThread,
                  domainClusterGatewaySpreadNormal: dcGatewaySpreadNormal,
                  layoutOv: layoutOverrides[area.id],
                  layoutAnchors: hubLayoutAnchors,
                  branchId: thread.id,
                };
                const pos = resolvedChainMomentPos(
                  area.id,
                  idx,
                  threadForTree,
                  momentIdx,
                  threadCatalogFull,
                  layoutOverrides[area.id]?.momentPositions,
                  momentChordTEnd,
                  threadMainDraw,
                  momentLayoutCtx,
                );
                return (
                  <g
                    key={moment.id}
                    className={pending ? "stream-preview-pending" : undefined}
                    opacity={pending ? PREVIEW_PENDING_LAYER_OPACITY : undefined}
                    pointerEvents="none"
                  >
                    <TreeMarkNode
                      moment={moment}
                      area={area}
                      x={pos.x}
                      y={pos.y}
                      isSelected={false}
                      panMoved={panMoved}
                      onMarkClick={() => {}}
                    />
                  </g>
                );
              })}
            </g>
          );
        });
      })}
    </g>
  </>
  );
}
