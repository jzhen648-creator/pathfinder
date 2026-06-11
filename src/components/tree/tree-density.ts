import type {
  AreaData,
  DomainHubData,
  MomentNode,
  SequencedBranchNode,
  TreeGoalNode,
} from "./tree-types";

export type DensityLevel = "MIN" | "MED" | "EXTENSIVE";

const MS_PER_MONTH = 30.4375 * 24 * 60 * 60 * 1000;

function dateMsFromIso(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function dateMsFromYear(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Date.UTC(value, 6, 1);
}

function withinMonths(ms: number | null, months: number, nowMs: number): boolean {
  if (ms == null) return false;
  return Math.abs(nowMs - ms) <= months * MS_PER_MONTH;
}

function goalRecencyMs(goal: TreeGoalNode): number | null {
  const semanticDates = [
    dateMsFromIso(goal.deadlineIso),
    dateMsFromIso(goal.timelineStartIso),
    dateMsFromYear(goal.year),
  ].filter((ms): ms is number => ms != null);
  if (semanticDates.length > 0) return Math.max(...semanticDates);
  return dateMsFromIso(goal.createdAtIso);
}

function momentRecencyMs(moment: MomentNode): number | null {
  return dateMsFromIso(moment.calendarDateIso) ?? dateMsFromYear(moment.year);
}

function goalPassesDensity(goal: TreeGoalNode, level: Exclude<DensityLevel, "EXTENSIVE">, nowMs: number): boolean {
  const milestoneCount = goal.milestones.length;
  const significant = (goal.significanceTier ?? 0) >= 4;
  const recencyMonths = level === "MIN" ? 12 : 36;
  const recent = withinMonths(goalRecencyMs(goal), recencyMonths, nowMs);

  if (level === "MIN") {
    return goal.bloomStatus === "ACTIVE" && (milestoneCount > 0 || significant || recent);
  }

  if (goal.bloomStatus === "ACTIVE") return true;
  return (goal.bloomStatus === "PAUSED" || goal.bloomStatus === "ABANDONED" || goal.bloomStatus === "COMPLETE") && recent;
}

function momentPassesDensity(moment: MomentNode, level: Exclude<DensityLevel, "EXTENSIVE">, nowMs: number): boolean {
  const recencyMonths = level === "MIN" ? 12 : 36;
  const recent = withinMonths(momentRecencyMs(moment), recencyMonths, nowMs);
  if (level === "MIN") {
    return moment.isTurningPoint || Boolean(moment.needsResolution) || moment.significance >= 3 || recent;
  }
  return moment.significance >= 2 || moment.isTurningPoint || recent;
}

function filterGoalSubtree(
  goal: TreeGoalNode,
  level: Exclude<DensityLevel, "EXTENSIVE">,
  nowMs: number,
  rootVisible: boolean,
  promotedRoots: TreeGoalNode[],
): TreeGoalNode | null {
  const selfVisible = rootVisible || goalPassesDensity(goal, level, nowMs);
  const childGoals: TreeGoalNode[] = [];

  for (const child of goal.childGoals) {
    const filteredChild = filterGoalSubtree(child, level, nowMs, selfVisible, promotedRoots);
    if (filteredChild) {
      if (selfVisible) childGoals.push(filteredChild);
      else promotedRoots.push(filteredChild);
    }
  }

  if (!selfVisible) return null;
  return { ...goal, childGoals };
}

function filterGoalRoots(
  goals: TreeGoalNode[],
  level: Exclude<DensityLevel, "EXTENSIVE">,
  nowMs: number,
): TreeGoalNode[] {
  const roots: TreeGoalNode[] = [];
  const promotedRoots: TreeGoalNode[] = [];

  for (const goal of goals) {
    const rootVisible = goalPassesDensity(goal, level, nowMs);
    const filteredRoot = filterGoalSubtree(goal, level, nowMs, rootVisible, promotedRoots);
    if (filteredRoot) roots.push(filteredRoot);
  }

  return [...roots, ...promotedRoots];
}

function rebuildSequencedNodes(
  original: SequencedBranchNode[],
  goals: TreeGoalNode[],
  moments: MomentNode[],
): SequencedBranchNode[] {
  const goalsById = new Map(goals.map((goal) => [goal.id, goal] as const));
  const momentsById = new Map(moments.map((moment) => [moment.id, moment] as const));
  const seenGoalIds = new Set<string>();
  const nextNodes: SequencedBranchNode[] = [];

  for (const node of original) {
    if (node.kind === "goal") {
      const goal = goalsById.get(node.id);
      if (!goal) continue;
      seenGoalIds.add(goal.id);
      nextNodes.push({ ...node, goal });
    } else {
      const moment = momentsById.get(node.id);
      if (!moment) continue;
      nextNodes.push({ ...node, moment });
    }
  }

  for (const goal of goals) {
    if (seenGoalIds.has(goal.id)) continue;
    nextNodes.push({
      kind: "goal",
      id: goal.id,
      sequencePosition: Number.POSITIVE_INFINITY,
      goal,
    });
  }

  return nextNodes;
}

function applyDensityToHub(
  hub: DomainHubData,
  level: Exclude<DensityLevel, "EXTENSIVE">,
  nowMs: number,
): DomainHubData {
  const goals = filterGoalRoots(hub.goals, level, nowMs);
  const moments = hub.moments.filter((moment) => momentPassesDensity(moment, level, nowMs));
  return {
    ...hub,
    goals,
    moments,
    sequencedNodes: rebuildSequencedNodes(hub.sequencedNodes, goals, moments),
  };
}

export function applyTreeDensity(areas: AreaData[], level: DensityLevel): AreaData[] {
  if (level === "EXTENSIVE") return areas;
  const nowMs = Date.now();
  return areas.map((area) => ({
    ...area,
    branches: area.branches.map((hub) => applyDensityToHub(hub, level, nowMs)),
  }));
}
