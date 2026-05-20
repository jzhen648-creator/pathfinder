import type { AreaData, MomentNode, TreeGoalNode } from "@/components/tree/tree-types";
import { calendarIsoFromApiDate, LIFE_AREA_ORDER, type RawMark, type RawTreeGoalPayload } from "@/components/tree/tree-data";

/** Stable issue categories — one row per failing rule per entity. */
export type MapIssueKind =
  | "mark_needs_resolution"
  | "pursuit_missing_deadline"
  | "mark_missing_date"
  | "pursuit_missing_short_label"
  | "broken_continuation_chain"
  | "continuation_date_order";

export const MAP_ISSUE_LABELS: Record<MapIssueKind, string> = {
  mark_needs_resolution: "AI wasn't sure about this",
  pursuit_missing_deadline: "Missing deadline",
  mark_missing_date: "Missing date",
  pursuit_missing_short_label: "Label not generated",
  broken_continuation_chain: "Broken continuation chain",
  continuation_date_order: "Date order may conflict with continuation chain.",
};

const KIND_SORT_ORDER: MapIssueKind[] = [
  "mark_needs_resolution",
  "pursuit_missing_deadline",
  "mark_missing_date",
  "pursuit_missing_short_label",
  "broken_continuation_chain",
  "continuation_date_order",
];

export type MapIssueTarget =
  | { entity: "goal"; goalId: string; branchId: string; areaId: string }
  | { entity: "mark"; markId: string; branchId: string; areaId: string };

export type MapIssue = {
  id: string;
  kind: MapIssueKind;
  description: string;
  title: string;
  target: MapIssueTarget;
  hubLabel?: string;
  themeLabel?: string;
};

export type MapIssuesSnapshot = {
  issues: MapIssue[];
  total: number;
  byKind: Record<MapIssueKind, number>;
};

export type DeriveMapIssuesInput = {
  areas: AreaData[];
  goals: RawTreeGoalPayload[];
  marks: RawMark[];
};

function emptyByKind(): Record<MapIssueKind, number> {
  return {
    mark_needs_resolution: 0,
    pursuit_missing_deadline: 0,
    mark_missing_date: 0,
    pursuit_missing_short_label: 0,
    broken_continuation_chain: 0,
    continuation_date_order: 0,
  };
}

/** Pursuit has an explicit deadline (`deadlineIso`) or calendar-year target. */
function pursuitHasDeadline(goal: TreeGoalNode): boolean {
  if (goal.deadlineIso) return true;
  if (goal.year != null) return true;
  return false;
}

function pursuitHasMilestones(goal: TreeGoalNode): boolean {
  return goal.milestones.length > 0;
}

function isRoadmapGoal(g: RawTreeGoalPayload): boolean {
  return g.goalType !== "moment" && g.goalType !== "event";
}

function pursuitDeadlineIso(g: RawTreeGoalPayload): string | null {
  return calendarIsoFromApiDate(g.deadline ?? null);
}

function pursuitStartIso(g: RawTreeGoalPayload): string | null {
  return calendarIsoFromApiDate(g.timelineStart ?? null);
}

function childDatePrecedesParent(childIso: string | null, parentIso: string | null): boolean {
  if (!childIso || !parentIso) return false;
  return childIso < parentIso;
}

function continuationDateOrderConflict(child: RawTreeGoalPayload, parent: RawTreeGoalPayload): boolean {
  return (
    childDatePrecedesParent(pursuitDeadlineIso(child), pursuitDeadlineIso(parent)) ||
    childDatePrecedesParent(pursuitStartIso(child), pursuitStartIso(parent))
  );
}

function momentCalendarIso(m: MomentNode): string | null {
  const iso = m.calendarDateIso?.trim();
  return iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

type BranchMeta = { areaId: string; themeLabel: string; hubLabel: string };

function buildBranchMeta(areas: AreaData[]): Map<string, BranchMeta> {
  const out = new Map<string, BranchMeta>();
  for (const area of areas) {
    for (const thread of area.branches) {
      out.set(thread.id, {
        areaId: area.id,
        themeLabel: area.label,
        hubLabel: thread.type,
      });
    }
  }
  return out;
}

function walkGoals(
  goals: TreeGoalNode[],
  branchId: string,
  meta: BranchMeta,
  visit: (goal: TreeGoalNode, branchId: string, meta: BranchMeta) => void,
): void {
  for (const g of goals) {
    visit(g, branchId, meta);
    walkGoals(g.childGoals, branchId, meta, visit);
  }
}

function compareIssues(a: MapIssue, b: MapIssue): number {
  const themeA = LIFE_AREA_ORDER.indexOf(a.target.areaId as (typeof LIFE_AREA_ORDER)[number]);
  const themeB = LIFE_AREA_ORDER.indexOf(b.target.areaId as (typeof LIFE_AREA_ORDER)[number]);
  const tA = themeA >= 0 ? themeA : 99;
  const tB = themeB >= 0 ? themeB : 99;
  if (tA !== tB) return tA - tB;

  const hubCmp = (a.hubLabel ?? "").localeCompare(b.hubLabel ?? "");
  if (hubCmp !== 0) return hubCmp;

  const kindA = KIND_SORT_ORDER.indexOf(a.kind);
  const kindB = KIND_SORT_ORDER.indexOf(b.kind);
  if (kindA !== kindB) return kindA - kindB;

  return a.title.localeCompare(b.title);
}

/**
 * Derive map quality issues from tree-shaped data (no extra API calls).
 */
export function deriveMapIssues(input: DeriveMapIssuesInput): MapIssuesSnapshot {
  const { areas, goals, marks } = input;
  const branchMeta = buildBranchMeta(areas);
  const issues: MapIssue[] = [];
  const activeMarks = marks.filter((m) => !m.archived);

  const push = (issue: Omit<MapIssue, "description"> & { description?: string }) => {
    issues.push({
      ...issue,
      description: issue.description ?? MAP_ISSUE_LABELS[issue.kind],
    });
  };

  for (const m of activeMarks) {
    if (m.archived) continue;
    if (m.needsResolution !== true) continue;
    const meta = branchMeta.get(m.branchId);
    if (!meta) continue;
    push({
      id: `mark_needs_resolution:${m.id}`,
      kind: "mark_needs_resolution",
      title: (m.title ?? "Untitled mark").trim() || "Untitled mark",
      target: { entity: "mark", markId: m.id, branchId: m.branchId, areaId: meta.areaId },
      hubLabel: meta.hubLabel,
      themeLabel: meta.themeLabel,
    });
  }

  for (const area of areas) {
    for (const thread of area.branches) {
      const meta = branchMeta.get(thread.id);
      if (!meta) continue;

      for (const moment of thread.moments) {
        if (moment.synthetic === true) continue;
        if (moment.type !== "mark") continue;
        if (moment.needsResolution === true) continue;
        if (momentCalendarIso(moment)) continue;
        push({
          id: `mark_missing_date:${moment.id}`,
          kind: "mark_missing_date",
          title: moment.label.trim() || "Untitled mark",
          target: {
            entity: "mark",
            markId: moment.id,
            branchId: thread.id,
            areaId: area.id,
          },
          hubLabel: meta.hubLabel,
          themeLabel: meta.themeLabel,
        });
      }

      walkGoals(thread.goals, thread.id, meta, (goal, branchId, hubMeta) => {
        if (!pursuitHasDeadline(goal) && !pursuitHasMilestones(goal)) {
          push({
            id: `pursuit_missing_deadline:${goal.id}`,
            kind: "pursuit_missing_deadline",
            title: goal.title.trim() || "Untitled pursuit",
            target: { entity: "goal", goalId: goal.id, branchId, areaId: hubMeta.areaId },
            hubLabel: hubMeta.hubLabel,
            themeLabel: hubMeta.themeLabel,
          });
        }

        const sl = typeof goal.shortLabel === "string" ? goal.shortLabel.trim() : "";
        if (!sl) {
          push({
            id: `pursuit_missing_short_label:${goal.id}`,
            kind: "pursuit_missing_short_label",
            title: goal.title.trim() || "Untitled pursuit",
            target: { entity: "goal", goalId: goal.id, branchId, areaId: hubMeta.areaId },
            hubLabel: hubMeta.hubLabel,
            themeLabel: hubMeta.themeLabel,
          });
        }
      });
    }
  }

  const goalsById = new Map(goals.map((g) => [g.id, g] as const));
  for (const child of goals) {
    if (!child.parentGoalId) continue;
    if (!isRoadmapGoal(child)) continue;
    const parent = goalsById.get(child.parentGoalId);
    if (!parent) continue;
    if (child.branchId == null || parent.branchId == null) continue;
    if (child.branchId === parent.branchId) continue;

    const meta = branchMeta.get(child.branchId);
    if (!meta) continue;

    push({
      id: `broken_continuation_chain:${child.id}`,
      kind: "broken_continuation_chain",
      title: child.title.trim() || "Untitled pursuit",
      target: {
        entity: "goal",
        goalId: child.id,
        branchId: child.branchId,
        areaId: meta.areaId,
      },
      hubLabel: meta.hubLabel,
      themeLabel: meta.themeLabel,
    });
  }

  for (const child of goals) {
    if (!child.parentGoalId) continue;
    if (!isRoadmapGoal(child)) continue;
    const parent = goalsById.get(child.parentGoalId);
    if (!parent || !isRoadmapGoal(parent)) continue;
    if (child.branchId == null || parent.branchId == null) continue;
    if (child.branchId !== parent.branchId) continue;

    if (!continuationDateOrderConflict(child, parent)) continue;

    const meta = branchMeta.get(child.branchId);
    if (!meta) continue;

    push({
      id: `continuation_date_order:${child.id}`,
      kind: "continuation_date_order",
      title: child.title.trim() || "Untitled pursuit",
      target: {
        entity: "goal",
        goalId: child.id,
        branchId: child.branchId,
        areaId: meta.areaId,
      },
      hubLabel: meta.hubLabel,
      themeLabel: meta.themeLabel,
    });
  }

  issues.sort(compareIssues);

  const byKind = emptyByKind();
  for (const issue of issues) {
    byKind[issue.kind] += 1;
  }

  return { issues, total: issues.length, byKind };
}
