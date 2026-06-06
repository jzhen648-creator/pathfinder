import { lifeAreaTrunkForkLabelLayout, TREE_TRUNK_MIRROR_X } from "./tree-geometry";
import { deriveTrunkCenterlineX, TRUNK_BASE_Y, TRUNK_CROWN_Y, trunkRootExtentBelowBasePx } from "./tree-trunk-geometry";
import {
  branchOutwardUnitForLongitudinalRay,
  branchTipPointForNodeCount,
  buildRenderedBranchMainPath,
  domainClusterGatewaySpreadNormalForForkSpec,
  domainClusterGoalRingGoalCount,
  domainClusterGoalRingSlotIndex,
  domainClusterHubPointFromCatalog,
  goalScreenPositionForLifeAreaThread,
} from "./tree-branch-geometry";
import { FLAGS } from "@/lib/flags";
import {
  compareBranchIndicesForStemOrder,
  getAreaSlotRender,
  isHubGatewayLayout,
  type AreaForkSpec,
} from "./tree-forks";
import { iconMedallionRadii } from "./tree-icon-medallion";
import type { AreaLayoutOverride } from "./tree-layout-edit";
import { shouldDomainClusterThread } from "./tree-renderer-grammar";
import type { AreaData, Point, TreeGoalNode } from "./tree-types";
import { storedTreeToComposeViewport } from "./tree-view-coords";
import { domainClusterHubRingPx, trunkLayoutEnabled } from "./tree-trunk-slots";
import {
  DOMAIN_CLUSTER_GOAL_RING_MAX_RADIUS_PX,
  TREE_EVOLVED_GOAL_SPAWN_ALONG_BASE_PX,
  TREE_GOAL_RENDER_MAX_DEPTH,
  TREE_LIFE_AREA_TITLE_FONT_PX,
  TREE_THEME_GATEWAY_ICON_PX,
} from "./tree-view-constants";

export type TreePanTransform = { x: number; y: number; scale: number };

export const TREE_FIT_PADDING_PX = 140;
export const TREE_FIT_VIEW_MARGIN = 0.9;
export const TREE_FIT_SCALE_MIN = 0.28;
export const TREE_FIT_SCALE_MAX = 3;

const TRUNK_HALO_X_PX = 72;
const GOAL_NODE_HALO_PX = 88;

function pushStored(acc: Point[], p: Point) {
  acc.push(storedTreeToComposeViewport(p));
}

function pushDisc(acc: Point[], center: Point, radius: number) {
  pushStored(acc, center);
  pushStored(acc, { x: center.x - radius, y: center.y });
  pushStored(acc, { x: center.x + radius, y: center.y });
  pushStored(acc, { x: center.x, y: center.y - radius });
  pushStored(acc, { x: center.x, y: center.y + radius });
}

function walkRenderableGoals(
  goals: TreeGoalNode[],
  depth: number,
  visit: (goal: TreeGoalNode, depth: number) => void,
) {
  for (const goal of goals) {
    visit(goal, depth);
    if (depth < TREE_GOAL_RENDER_MAX_DEPTH) {
      walkRenderableGoals(goal.childGoals, depth + 1, visit);
    }
  }
}

/** Sample compose-viewport points for fit-to-view (hubs, trunk, domain hubs, goals). */
export function collectTreeFitSamplePoints(opts: {
  areas: AreaData[];
  forks: Record<string, AreaForkSpec>;
  floatNudges: Record<string, Point>;
  layoutOverrides: Record<string, AreaLayoutOverride>;
  /** When set, only sample points for these life-area ids (limb focus / dev zoom). */
  areaIds?: readonly string[];
  /** Include fork-spec branch tips even when the area has no live branches (onboarding ghost hub fan). */
  includePreviewBranchTips?: boolean;
}): Point[] {
  const { areas, forks, floatNudges, layoutOverrides, areaIds, includePreviewBranchTips = false } = opts;
  const out: Point[] = [];
  const includeTrunk = FLAGS.TREE_TRUNK_VISIBLE && (areaIds == null || areaIds.length !== 1);

  if (includeTrunk) {
  for (const y of [TRUNK_CROWN_Y, TRUNK_BASE_Y, (TRUNK_CROWN_Y + TRUNK_BASE_Y) / 2]) {
    const cx = deriveTrunkCenterlineX(y);
    pushDisc(out, { x: cx, y }, TRUNK_HALO_X_PX);
    pushStored(out, { x: TREE_TRUNK_MIRROR_X, y });
  }
  if (trunkLayoutEnabled()) {
    const rootY = TRUNK_BASE_Y + trunkRootExtentBelowBasePx();
    pushDisc(out, { x: deriveTrunkCenterlineX(rootY), y: rootY }, TRUNK_HALO_X_PX * 0.9);
  }
  }

  for (const area of areas) {
    if (areaIds != null && !areaIds.includes(area.id)) continue;
    const spec = forks[area.id];
    const slots = getAreaSlotRender(area.id, forks);
    if (!spec || !slots) continue;

    const nudge = floatNudges[area.id] ?? { x: 0, y: 0 };
    const hubStored: Point = {
      x: (isHubGatewayLayout(spec) ? spec.limbTip : spec.trunkAttach).x + nudge.x,
      y: (isHubGatewayLayout(spec) ? spec.limbTip : spec.trunkAttach).y + nudge.y,
    };
    pushStored(out, hubStored);

    const { discR } = iconMedallionRadii(TREE_THEME_GATEWAY_ICON_PX, "theme");
    const gatewayPad = discR + TREE_LIFE_AREA_TITLE_FONT_PX + 16;
    pushDisc(out, hubStored, gatewayPad);

    if (trunkLayoutEnabled() && isHubGatewayLayout(spec)) {
      /** Domain hubs orbit the gateway — pad modestly so fit stays theme-centric. */
      pushDisc(out, hubStored, gatewayPad + domainClusterHubRingPx() * 0.38);
    }

    if (includePreviewBranchTips && area.branches.length === 0 && isHubGatewayLayout(spec)) {
      for (const branch of spec.branches) {
        pushDisc(out, branch.tip, GOAL_NODE_HALO_PX * 0.75);
      }
    }

    const label = lifeAreaTrunkForkLabelLayout(
      area.id,
      spec.trunkAttach,
      isHubGatewayLayout(spec) ? { hubGatewayNode: spec.limbTip } : undefined,
    );
    pushStored(out, {
      x: label.x + nudge.x,
      y: label.y + nudge.y,
    });

    const sortedBranchIdx = area.branches
      .map((_, i) => i)
      .sort((a, b) => compareBranchIndicesForStemOrder(spec, a, b));
    const dcGatewaySpreadNormal = domainClusterGatewaySpreadNormalForForkSpec(spec);

    for (let idx = 0; idx < area.branches.length; idx += 1) {
      const thread = area.branches[idx]!;
      const threadSlot = slots.branchStrokes[idx];
      if (!threadSlot) continue;
      const threadSpec = spec.branches[idx];
      const kFork = sortedBranchIdx.indexOf(idx);

      const { catalogFullPath } = buildRenderedBranchMainPath(
        area.id,
        idx,
        thread,
        threadSlot.path,
        threadSpec,
        layoutOverrides[area.id],
        kFork,
        sortedBranchIdx.length,
        dcGatewaySpreadNormal,
      );

      if (shouldDomainClusterThread(area.id, thread) && !trunkLayoutEnabled()) {
        const domainHub = domainClusterHubPointFromCatalog(
          catalogFullPath,
          kFork,
          sortedBranchIdx.length,
          dcGatewaySpreadNormal,
          area.id,
        );
        pushDisc(out, domainHub, DOMAIN_CLUSTER_GOAL_RING_MAX_RADIUS_PX + 24);
      }

      if (FLAGS.BRANCH_LONGITUDINAL_ALL && thread.sequencedNodes.length > 0) {
        /** Sequence-driven branches extend far past the gateway for busy hubs — sample the dynamic tip so viewbox fit accommodates the longest branch. */
        const hubAnchor = domainClusterHubPointFromCatalog(
          catalogFullPath,
          kFork,
          sortedBranchIdx.length,
          dcGatewaySpreadNormal,
          area.id,
        );
        const outward = branchOutwardUnitForLongitudinalRay(catalogFullPath, hubAnchor);
        const tip = branchTipPointForNodeCount(hubAnchor, outward, thread.sequencedNodes.length);
        pushDisc(out, tip, GOAL_NODE_HALO_PX);
      }

      if (!trunkLayoutEnabled()) {
        const threadDcFit = shouldDomainClusterThread(area.id, thread);
        walkRenderableGoals(thread.goals, 0, (goal, depth) => {
          const gi = thread.goals.indexOf(goal);
          if (gi >= 0) {
            const ringN = threadDcFit ? domainClusterGoalRingGoalCount(thread) : thread.goals.length;
            const goalIdx = threadDcFit && depth === 0 ? domainClusterGoalRingSlotIndex(thread, goal.id) : gi;
            const gp = goalScreenPositionForLifeAreaThread(
              area.id,
              thread,
              catalogFullPath,
              goalIdx,
              goal.id,
              kFork,
              sortedBranchIdx.length,
              depth === 0 && threadDcFit ? ringN : thread.goals.length,
              dcGatewaySpreadNormal,
            );
            pushDisc(out, gp, GOAL_NODE_HALO_PX);
            return;
          }
          if (depth > 0) {
            const parentGi = thread.goals.findIndex((g) =>
              g.childGoals.some((c) => c.id === goal.id),
            );
            if (parentGi >= 0) {
              const parentGoal = thread.goals[parentGi]!;
              const parentIdx = threadDcFit
                ? domainClusterGoalRingSlotIndex(thread, parentGoal.id)
                : parentGi;
              const parentCnt = threadDcFit ? domainClusterGoalRingGoalCount(thread) : thread.goals.length;
              const parentPos = goalScreenPositionForLifeAreaThread(
                area.id,
                thread,
                catalogFullPath,
                parentIdx,
                parentGoal.id,
                kFork,
                sortedBranchIdx.length,
                parentCnt,
                dcGatewaySpreadNormal,
              );
              const spawn =
                TREE_EVOLVED_GOAL_SPAWN_ALONG_BASE_PX + depth * 48 + GOAL_NODE_HALO_PX;
              pushDisc(out, parentPos, spawn);
            }
          }
        });
      }
    }
  }

  return out;
}

/** Compose-viewport hub centre for Stream camera pan (matches fit sampling geometry). */
export function resolveHubCenterInComposeViewport(opts: {
  areas: AreaData[];
  forks: Record<string, AreaForkSpec>;
  layoutOverrides: Record<string, AreaLayoutOverride>;
  areaId: string;
  branchId: string;
}): Point | null {
  const { areas, forks, layoutOverrides, areaId, branchId } = opts;
  const area = areas.find((a) => a.id === areaId);
  if (!area) return null;
  const idx = area.branches.findIndex((b) => b.id === branchId);
  if (idx < 0) return null;
  const thread = area.branches[idx]!;
  const spec = forks[areaId];
  const slots = getAreaSlotRender(areaId, forks);
  if (!spec || !slots) return null;

  const threadSlot = slots.branchStrokes[idx];
  if (!threadSlot) return null;
  const threadSpec = spec.branches[idx];
  const sortedBranchIdx = area.branches
    .map((_, i) => i)
    .sort((a, b) => compareBranchIndicesForStemOrder(spec, a, b));
  const kFork = sortedBranchIdx.indexOf(idx);
  const dcGatewaySpreadNormal = domainClusterGatewaySpreadNormalForForkSpec(spec);
  const layoutOv = layoutOverrides[areaId];

  const { catalogFullPath } = buildRenderedBranchMainPath(
    area.id,
    idx,
    thread,
    threadSlot.path,
    threadSpec,
    layoutOv,
    kFork,
    sortedBranchIdx.length,
    dcGatewaySpreadNormal,
  );

  const stored = domainClusterHubPointFromCatalog(
    catalogFullPath,
    kFork,
    sortedBranchIdx.length,
    dcGatewaySpreadNormal,
    area.id,
    layoutOv,
    undefined,
    branchId,
  );

  return storedTreeToComposeViewport(stored);
}

export function computeTreeFitTransform(opts: {
  samplePointsViewport: Point[];
  viewWidth: number;
  viewHeight: number;
  paddingPx?: number;
  fallback?: TreePanTransform;
}): TreePanTransform {
  const {
    samplePointsViewport,
    viewWidth,
    viewHeight,
    paddingPx = TREE_FIT_PADDING_PX,
    fallback,
  } = opts;

  if (samplePointsViewport.length === 0) {
    return (
      fallback ?? {
        x: viewWidth / 2,
        y: viewHeight / 2,
        scale: 1,
      }
    );
  }

  const minX = Math.min(...samplePointsViewport.map((p) => p.x)) - paddingPx;
  const maxX = Math.max(...samplePointsViewport.map((p) => p.x)) + paddingPx;
  const minY = Math.min(...samplePointsViewport.map((p) => p.y)) - paddingPx;
  const maxY = Math.max(...samplePointsViewport.map((p) => p.y)) + paddingPx;
  const contentW = Math.max(1, maxX - minX);
  const contentH = Math.max(1, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const fitScale = Math.min(
    (TREE_FIT_VIEW_MARGIN * viewWidth) / contentW,
    (TREE_FIT_VIEW_MARGIN * viewHeight) / contentH,
  );
  const scale = Math.min(TREE_FIT_SCALE_MAX, Math.max(TREE_FIT_SCALE_MIN, fitScale));

  return {
    scale,
    x: viewWidth / 2 - scale * cx,
    y: viewHeight / 2 - scale * cy,
  };
}

export function computeTreeFitTransformFromLayout(opts: {
  areas: AreaData[];
  forks: Record<string, AreaForkSpec>;
  floatNudges: Record<string, Point>;
  layoutOverrides: Record<string, AreaLayoutOverride>;
  viewWidth: number;
  viewHeight: number;
  paddingPx?: number;
  fallback?: TreePanTransform;
  areaIds?: readonly string[];
  includePreviewBranchTips?: boolean;
}): TreePanTransform {
  const samplePointsViewport = collectTreeFitSamplePoints(opts);
  return computeTreeFitTransform({
    samplePointsViewport,
    viewWidth: opts.viewWidth,
    viewHeight: opts.viewHeight,
    paddingPx: opts.paddingPx,
    fallback: opts.fallback,
  });
}
