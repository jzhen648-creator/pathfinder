import type { AreaForkSpec } from "./tree-forks";

import { compareBranchIndicesForStemOrder, getAreaSlotRender } from "./tree-forks";

import {

  buildRenderedBranchMainPath,

  continuationChildScreenPosition,

  domainClusterGatewaySpreadNormalForForkSpec,

  domainClusterGoalRingGoalCount,

  domainClusterGoalRingSlotIndex,

  domainClusterHubPointFromCatalog,

  goalScreenPositionForLifeAreaThread,

  pickThreadMomentsForTree,

} from "./tree-branch-geometry";

import { shouldDomainClusterThread } from "./tree-renderer-grammar";

import type { AreaLayoutOverride } from "./tree-layout-edit";

import type { AreaData, Point, TreeGoalNode } from "./tree-types";

import { TREE_THREAD_VISIBLE_MOMENTS } from "./tree-view-constants";



function findGoalInThread(

  thread: AreaData["branches"][number],

  goalId: string,

): { goal: TreeGoalNode; parent: TreeGoalNode | null; childIndex: number; depth: number } | null {

  const walk = (

    goals: TreeGoalNode[],

    parent: TreeGoalNode | null,

    depth: number,

  ): { goal: TreeGoalNode; parent: TreeGoalNode | null; childIndex: number; depth: number } | null => {

    for (let i = 0; i < goals.length; i += 1) {

      const g = goals[i]!;

      if (g.id === goalId) return { goal: g, parent, childIndex: i, depth };

      const nested = walk(g.childGoals, g, depth + 1);

      if (nested) return nested;

    }

    return null;

  };

  return walk(thread.goals, null, 0);

}



/**

 * Screen position for a dragged pursuit in {@link previewAreas} — same geometry as committed tree render.

 * Supports roots on the branch sequence and continuation children nested under a parent.

 */

export function getDraggedGoalPreviewPosition(

  previewAreas: AreaData[],

  goalId: string,

  resolvedForks: Record<string, AreaForkSpec>,

  layoutOverrides: Record<string, AreaLayoutOverride>,

): Point | null {

  for (const area of previewAreas) {

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

      const placement = findGoalInThread(thread, goalId);

      if (!placement) continue;



      const threadSlot = slots.branchStrokes[idx];

      if (!threadSlot) return null;



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

      const ringGoalCount = threadDc ? domainClusterGoalRingGoalCount(thread) : thread.goals.length;



      const inSequence = thread.sequencedNodes.some((n) => n.kind === "goal" && n.goal.id === goalId);

      if (inSequence) {

        const ringGi = threadDc

          ? domainClusterGoalRingSlotIndex(thread, goalId)

          : thread.goals.findIndex((g) => g.id === goalId);

        return goalScreenPositionForLifeAreaThread(

          area.id,

          thread,

          threadCatalogFull,

          ringGi >= 0 ? ringGi : 0,

          goalId,

          kFork,

          branchCount,

          ringGoalCount,

          dcGatewaySpreadNormal,

          layoutOv,

          hubLayoutAnchors,

          thread.id,

        );

      }



      if (placement.parent && threadDc) {

        const parentRootIdx = thread.goals.findIndex((g) => g.id === placement.parent!.id);

        const parentRingGi =

          parentRootIdx >= 0

            ? threadDc

              ? domainClusterGoalRingSlotIndex(thread, placement.parent.id)

              : parentRootIdx

            : 0;

        const parentPt = goalScreenPositionForLifeAreaThread(

          area.id,

          thread,

          threadCatalogFull,

          parentRingGi,

          placement.parent.id,

          kFork,

          branchCount,

          ringGoalCount,

          dcGatewaySpreadNormal,

          layoutOv,

          hubLayoutAnchors,

          thread.id,

        );

        const hubPt = domainClusterHubPointFromCatalog(

          threadCatalogFull,

          kFork,

          branchCount,

          dcGatewaySpreadNormal,

          area.id,

          layoutOv,

          hubLayoutAnchors,

          thread.id,

        );

        return continuationChildScreenPosition(

          parentPt,

          hubPt,

          placement.childIndex,

          goalId,

          placement.depth - 1,

        );

      }



      const rootIndex = thread.goals.findIndex((g) => g.id === goalId);

      if (rootIndex < 0) return null;

      const ringGi = threadDc ? domainClusterGoalRingSlotIndex(thread, goalId) : rootIndex;

      return goalScreenPositionForLifeAreaThread(

        area.id,

        thread,

        threadCatalogFull,

        ringGi,

        goalId,

        kFork,

        branchCount,

        ringGoalCount,

        dcGatewaySpreadNormal,

        layoutOv,

        hubLayoutAnchors,

        thread.id,

      );

    }

  }

  return null;

}


