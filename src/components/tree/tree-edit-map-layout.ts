import { FLAGS } from "@/lib/flags";
import type { AreaForkSpec } from "./tree-forks";
import { compareBranchIndicesForStemOrder, getAreaSlotRender } from "./tree-forks";
import type { EditDropTarget, PursuitDropIntent } from "./tree-edit-drag";
import { pursuitRingRadius } from "./tree-edit-drag";
import {
  branchMarkScreenPosition,
  branchOutwardUnitForLongitudinalRay,
  buildRenderedBranchMainPath,
  continuationChildScreenPosition,
  domainClusterGatewaySpreadNormalForForkSpec,
  domainClusterGoalRingGoalCount,
  domainClusterGoalRingSlotIndex,
  domainClusterHubPointFromCatalog,
  goalScreenPositionForLifeAreaThread,
  pathPointAtT,
  pickThreadMomentsForTree,
  resolvedChainMomentPos,
  type DomainClusterMomentChainContext,
} from "./tree-branch-geometry";
import { shouldDomainClusterThread } from "./tree-renderer-grammar";
import type { AreaLayoutOverride } from "./tree-layout-edit";
import type { AreaData, DomainHubData, Point, TreeGoalNode } from "./tree-types";
import { TREE_THREAD_VISIBLE_MOMENTS } from "./tree-view-constants";

export type { EditDropTarget };

type ThreadDropLayoutCtx = {
  areaId: string;
  thread: DomainHubData;
  threadCatalogFull: string;
  kFork: number;
  branchCount: number;
  dcGatewaySpreadNormal: ReturnType<typeof domainClusterGatewaySpreadNormalForForkSpec>;
  layoutOv: AreaLayoutOverride | undefined;
  hubLayoutAnchors: { trunkAttach: Point; gateway: Point };
  threadDc: boolean;
  hubPt: Point | null;
};

/** Screen positions for every `sequencedNodes` entry — same rank-based APIs as tree render. */
export function buildSequencedNodePositionMap(ctx: ThreadDropLayoutCtx): Map<string, Point> {
  const {
    areaId,
    thread,
    threadCatalogFull,
    kFork,
    branchCount,
    dcGatewaySpreadNormal,
    layoutOv,
    hubLayoutAnchors,
    threadDc,
  } = ctx;
  const positions = new Map<string, Point>();
  const ringGoalCount = threadDc ? domainClusterGoalRingGoalCount(thread) : thread.goals.length;

  const dcChainCtx: DomainClusterMomentChainContext | null = threadDc
    ? {
        catalogFullPath: threadCatalogFull,
        kFork,
        branchCountOnLimb: branchCount,
        goalsOnThread: thread.goals,
        domainClusterGatewaySpreadNormal: dcGatewaySpreadNormal,
        layoutOv,
        layoutAnchors: hubLayoutAnchors,
        branchId: thread.id,
      }
    : null;

  let longitudinalHub: Point | null = null;
  let longitudinalOutward: Point | null = null;
  if (FLAGS.BRANCH_LONGITUDINAL_ALL && threadCatalogFull.length > 5) {
    longitudinalHub = pathPointAtT(threadCatalogFull, 0);
    longitudinalOutward = branchOutwardUnitForLongitudinalRay(threadCatalogFull, longitudinalHub);
  }

  for (let rank = 0; rank < thread.sequencedNodes.length; rank += 1) {
    const node = thread.sequencedNodes[rank]!;
    if (node.kind === "goal") {
      const ringGi = threadDc
        ? domainClusterGoalRingSlotIndex(thread, node.goal.id)
        : thread.goals.findIndex((g) => g.id === node.goal.id);
      const goalIndex = ringGi >= 0 ? ringGi : rank;
      positions.set(
        node.id,
        goalScreenPositionForLifeAreaThread(
          areaId,
          thread,
          threadCatalogFull,
          goalIndex,
          node.goal.id,
          kFork,
          branchCount,
          ringGoalCount,
          dcGatewaySpreadNormal,
          layoutOv,
          hubLayoutAnchors,
          thread.id,
        ),
      );
      continue;
    }
    if (node.kind === "moment") {
      if (FLAGS.BRANCH_LONGITUDINAL_ALL && longitudinalHub && longitudinalOutward) {
        positions.set(
          node.id,
          branchMarkScreenPosition(rank, longitudinalHub, longitudinalOutward, node.id),
        );
        continue;
      }
      const momentIdx = thread.moments.findIndex((m) => m.id === node.id);
      if (momentIdx >= 0) {
        positions.set(
          node.id,
          resolvedChainMomentPos(
            areaId,
            0,
            thread,
            momentIdx,
            threadCatalogFull,
            undefined,
            1,
            threadCatalogFull,
            dcChainCtx,
          ),
        );
      }
    }
  }
  return positions;
}

function continuationChainTail(goal: TreeGoalNode): TreeGoalNode {
  let cur = goal;
  while (cur.childGoals.length > 0) {
    cur = cur.childGoals[cur.childGoals.length - 1]!;
  }
  return cur;
}

function rootGoalScreenPosition(
  ctx: ThreadDropLayoutCtx,
  goal: TreeGoalNode,
  rootIndex: number,
): Point {
  const goalsOnThread = ctx.thread.goals;
  const ringGoalCount = ctx.threadDc
    ? domainClusterGoalRingGoalCount(ctx.thread)
    : goalsOnThread.length;
  const ringGi = ctx.threadDc ? domainClusterGoalRingSlotIndex(ctx.thread, goal.id) : rootIndex;
  return goalScreenPositionForLifeAreaThread(
    ctx.areaId,
    ctx.thread,
    ctx.threadCatalogFull,
    ringGi,
    goal.id,
    ctx.kFork,
    ctx.branchCount,
    ringGoalCount,
    ctx.dcGatewaySpreadNormal,
    ctx.layoutOv,
    ctx.hubLayoutAnchors,
    ctx.thread.id,
  );
}

function resolveGoalDropPosition(
  ctx: ThreadDropLayoutCtx,
  nodePos: Map<string, Point>,
  goalId: string,
): Point | null {
  const fromSeq = nodePos.get(goalId);
  if (fromSeq) return fromSeq;

  const findPath = (
    goals: TreeGoalNode[],
    parentPt: Point | null,
    depth: number,
  ): Point | null => {
    for (let ri = 0; ri < goals.length; ri += 1) {
      const g = goals[ri]!;
      const pt =
        parentPt == null
          ? rootGoalScreenPosition(ctx, g, ri)
          : ctx.hubPt
            ? continuationChildScreenPosition(parentPt, ctx.hubPt, ri, g.id, depth)
            : null;
      if (!pt) continue;
      if (g.id === goalId) return pt;
      const nested = findPath(g.childGoals, pt, depth + 1);
      if (nested) return nested;
    }
    return null;
  };

  return findPath(ctx.thread.goals, null, 0);
}

function pushPursuitRing(
  targets: EditDropTarget[],
  ctx: ThreadDropLayoutCtx,
  goalId: string,
  pt: Point,
  intent: PursuitDropIntent,
): void {
  targets.push({
    kind: "pursuit",
    goalId,
    branchId: ctx.thread.id,
    areaId: ctx.areaId,
    x: pt.x,
    y: pt.y,
    radius: pursuitRingRadius(intent),
    intent,
  });
}

/** Collect hub rings and pursuit rings (sequence, nest, continuation-chain append) for edit-map drag. */
export function buildEditMapDropTargets(
  areas: AreaData[],
  resolvedForks: Record<string, AreaForkSpec>,
  layoutOverrides: Record<string, AreaLayoutOverride>,
): EditDropTarget[] {
  const targets: EditDropTarget[] = [];

  for (const area of areas) {
    const forkSpec = resolvedForks[area.id];
    const slots = getAreaSlotRender(area.id, resolvedForks);
    if (!slots || !forkSpec) continue;

    const sortedBranchIdx = area.branches
      .map((_, i) => i)
      .sort((a, b) => compareBranchIndicesForStemOrder(forkSpec, a, b));
    const dcGatewaySpreadNormal = domainClusterGatewaySpreadNormalForForkSpec(forkSpec);
    const hubLayoutAnchors = { trunkAttach: forkSpec.trunkAttach, gateway: forkSpec.limbTip };
    const layoutOv = layoutOverrides[area.id];

    for (let idx = 0; idx < area.branches.length; idx += 1) {
      const thread = area.branches[idx]!;
      const threadSlot = slots.branchStrokes[idx];
      if (!threadSlot) continue;

      const momentsForTreeNav = shouldDomainClusterThread(area.id, thread)
        ? thread.moments.filter((m) => m.synthetic !== true)
        : thread.moments;
      const treeMoments = pickThreadMomentsForTree(momentsForTreeNav, TREE_THREAD_VISIBLE_MOMENTS);
      const threadForTree = { ...thread, moments: treeMoments };
      const threadSpec = forkSpec.branches[idx];
      const kFork = sortedBranchIdx.indexOf(idx);
      const branchCount = sortedBranchIdx.length;

      const { catalogFullPath: threadCatalogFull } = buildRenderedBranchMainPath(
        area.id,
        idx,
        threadForTree,
        threadSlot.path,
        threadSpec,
        layoutOv,
        kFork,
        branchCount,
        dcGatewaySpreadNormal,
        hubLayoutAnchors,
        thread.id,
      );

      const threadDc = shouldDomainClusterThread(area.id, thread);
      let hubPt: Point | null = null;
      if (threadDc) {
        hubPt = domainClusterHubPointFromCatalog(
          threadCatalogFull,
          kFork,
          branchCount,
          dcGatewaySpreadNormal,
          area.id,
          layoutOv,
          hubLayoutAnchors,
          thread.id,
        );
        targets.push({
          kind: "hub",
          branchId: thread.id,
          areaId: area.id,
          x: hubPt.x,
          y: hubPt.y,
          radius: 52,
        });
      }

      const layoutCtx: ThreadDropLayoutCtx = {
        areaId: area.id,
        thread,
        threadCatalogFull,
        kFork,
        branchCount,
        dcGatewaySpreadNormal,
        layoutOv,
        hubLayoutAnchors,
        threadDc,
        hubPt,
      };
      const nodePos = buildSequencedNodePositionMap(layoutCtx);

      let lastSequencedGoalId: string | null = null;
      for (const node of thread.sequencedNodes) {
        if (node.kind !== "goal") continue;
        const pt = nodePos.get(node.id) ?? resolveGoalDropPosition(layoutCtx, nodePos, node.goal.id);
        if (!pt) continue;

        pushPursuitRing(targets, layoutCtx, node.goal.id, pt, {
          type: "insertBefore",
          anchor: { kind: "before", nodeId: node.id },
        });

        lastSequencedGoalId = node.goal.id;
      }

      if (lastSequencedGoalId) {
        const pt =
          nodePos.get(lastSequencedGoalId) ??
          resolveGoalDropPosition(layoutCtx, nodePos, lastSequencedGoalId);
        if (pt) {
          pushPursuitRing(targets, layoutCtx, lastSequencedGoalId, pt, {
            type: "insertAfter",
            anchor: { kind: "after", nodeId: lastSequencedGoalId },
          });
        }
      }

      const walkNestRings = (goals: TreeGoalNode[], parentPt: Point | null, depth: number) => {
        for (let ri = 0; ri < goals.length; ri += 1) {
          const g = goals[ri]!;
          const pt =
            parentPt == null
              ? rootGoalScreenPosition(layoutCtx, g, ri)
              : resolveGoalDropPosition(layoutCtx, nodePos, g.id);
          if (!pt) continue;

          pushPursuitRing(targets, layoutCtx, g.id, pt, {
            type: "nestUnder",
            parentGoalId: g.id,
          });

          g.childGoals.forEach((c, ci) => {
            const childPt =
              layoutCtx.hubPt && pt
                ? continuationChildScreenPosition(pt, layoutCtx.hubPt, ci, c.id, depth)
                : pt;
            walkNestRings([c], childPt, depth + 1);
          });
        }
      };
      walkNestRings(thread.goals, null, 0);

      for (const root of thread.goals) {
        const tail = continuationChainTail(root);
        const tailPt = resolveGoalDropPosition(layoutCtx, nodePos, tail.id);
        if (!tailPt) continue;
        pushPursuitRing(targets, layoutCtx, tail.id, tailPt, {
          type: "appendContinuationChain",
          parentGoalId: tail.id,
        });
      }
    }
  }

  return targets;
}
