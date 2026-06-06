import { formatDistanceToNow } from "date-fns";
import { LIFE_AREAS } from "@/lib/life-areas";
import { isScaffoldingSubtaskTitle } from "@/lib/legacy-subtask-placeholder-title";
import { coerceRoadmapLifeAreaId } from "@/lib/roadmap/roadmap-data";
import type { LimbId } from "@/lib/types";

const KNOWN = new Set(LIFE_AREAS.map((l) => l.id));

export function goalLifeAreaToLimbId(lifeArea: string): LimbId {
  const t = lifeArea.trim();
  if (t === "Personal Growth" || t === "Mind & Spirit" || t === "Who I'm Becoming") return "becoming";
  if (t === "Money") return "finance";
  if (t === "Relationships") return "people";
  if (t === "Health") return "health";
  const hit = LIFE_AREAS.find((l) => l.label === t);
  if (hit) return hit.id as LimbId;
  return KNOWN.has(t as LimbId) ? (t as LimbId) : "work";
}

export type NextStepsStepDTO = {
  id: string;
  title: string;
  isCompleted: boolean;
  milestoneTitle: string;
  /** Shown on the first incomplete step only (goal-level deadline). */
  dueLabel: string | null;
};

export type NextStepsGoalDTO = {
  id: string;
  title: string;
  lifeArea: string;
  limbId: LimbId;
  progressPct: number;
  completedSubtasks: number;
  totalSubtasks: number;
  statusTag: "in progress" | "just started" | "complete";
  steps: NextStepsStepDTO[];
  lastMarkSummary: { title: string; relative: string } | null;
};

type SubtaskRow = { id: string; title: string; isCompleted: boolean; position: number };
type MilestoneRow = {
  id: string;
  title: string;
  position: number;
  subtasks: SubtaskRow[];
};

type GoalRow = {
  id: string;
  title: string;
  lifeArea: string;
  deadline: Date | null;
  bloomStatus: string;
  milestones: MilestoneRow[];
};

type MarkRow = { limbId: string; title: string; date: Date; archived?: boolean };

function goalStatus(
  progressPct: number,
  completed: number,
  total: number,
): "in progress" | "just started" | "complete" {
  if (total > 0 && completed === total) return "complete";
  if (progressPct === 0) return "just started";
  return "in progress";
}

function formatDeadlineShort(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { month: "short", day: "numeric" }).format(d);
}

/** Shape returned by `getGoalWithProgress` (PATCH /api/subtasks/.../complete). */
export type ApiGoalProgressShape = {
  id: string;
  title: string;
  lifeArea: string;
  deadline: string | null;
  progress: number;
  bloomStatus?: string;
  milestones: Array<{
    id: string;
    title: string;
    subtasks: Array<{ id: string; title: string; isCompleted: boolean }>;
  }>;
};

export function nextStepsGoalFromApi(
  api: ApiGoalProgressShape,
  lastMarkSummary: NextStepsGoalDTO["lastMarkSummary"],
): NextStepsGoalDTO | null {
  if (api.bloomStatus === "COMPLETE" || api.bloomStatus === "ON_HOLD") {
    return null;
  }
  const limbId = goalLifeAreaToLimbId(api.lifeArea);
  const steps: NextStepsStepDTO[] = [];
  let firstIncompleteAssignedDue = false;
  const dueStr = api.deadline ? `due ${formatDeadlineShort(new Date(api.deadline))}` : null;

  for (const ms of api.milestones) {
    for (const s of ms.subtasks) {
      if (isScaffoldingSubtaskTitle(s.title)) continue;
      let dueLabel: string | null = null;
      if (!s.isCompleted && !firstIncompleteAssignedDue && dueStr) {
        dueLabel = dueStr;
        firstIncompleteAssignedDue = true;
      }
      steps.push({
        id: s.id,
        title: s.title,
        isCompleted: s.isCompleted,
        milestoneTitle: ms.title,
        dueLabel,
      });
    }
  }

  const totalSubtasks = steps.length;
  const completedSubtasks = steps.filter((s) => s.isCompleted).length;

  return {
    id: api.id,
    title: api.title,
    lifeArea: api.lifeArea,
    limbId,
    progressPct: api.progress,
    completedSubtasks,
    totalSubtasks,
    statusTag: goalStatus(api.progress, completedSubtasks, totalSubtasks),
    steps,
    lastMarkSummary,
  };
}

export function buildNextStepsGoals(goals: GoalRow[], marks: MarkRow[]): NextStepsGoalDTO[] {
  const lastByLimb = new Map<LimbId, { title: string; date: Date }>();
  const sortedMarks = [...marks].filter((m) => !m.archived).sort((a, b) => b.date.getTime() - a.date.getTime());
  for (const m of sortedMarks) {
    const limb = coerceRoadmapLifeAreaId(m.limbId);
    if (!lastByLimb.has(limb)) {
      lastByLimb.set(limb, { title: m.title, date: m.date });
    }
  }

  const active = goals.filter((g) => g.bloomStatus !== "COMPLETE" && g.bloomStatus !== "ON_HOLD");
  const ordered = [...active].sort((a, b) => {
    const at = a.deadline?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bt = b.deadline?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const d = at - bt;
    if (d !== 0) return d;
    return a.title.localeCompare(b.title);
  });

  return ordered.map((goal) => {
    const limbId = goalLifeAreaToLimbId(goal.lifeArea);
    const milestones = [...goal.milestones].sort((a, b) => a.position - b.position);
    const steps: NextStepsStepDTO[] = [];
    let firstIncompleteAssignedDue = false;
    const dueStr = goal.deadline ? `due ${formatDeadlineShort(goal.deadline)}` : null;

    for (const ms of milestones) {
      const subs = [...ms.subtasks].sort((a, b) => a.position - b.position);
      for (const s of subs) {
        if (isScaffoldingSubtaskTitle(s.title)) continue;
        let dueLabel: string | null = null;
        if (!s.isCompleted && !firstIncompleteAssignedDue && dueStr) {
          dueLabel = dueStr;
          firstIncompleteAssignedDue = true;
        }
        steps.push({
          id: s.id,
          title: s.title,
          isCompleted: s.isCompleted,
          milestoneTitle: ms.title,
          dueLabel,
        });
      }
    }

    const totalSubtasks = steps.length;
    const completedSubtasks = steps.filter((s) => s.isCompleted).length;
    const progressPct = totalSubtasks ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;
    const last = lastByLimb.get(limbId);

    return {
      id: goal.id,
      title: goal.title,
      lifeArea: goal.lifeArea,
      limbId,
      progressPct,
      completedSubtasks,
      totalSubtasks,
      statusTag: goalStatus(progressPct, completedSubtasks, totalSubtasks),
      steps,
      lastMarkSummary: last
        ? {
            title: last.title,
            relative: formatDistanceToNow(last.date, { addSuffix: true }),
          }
        : null,
    };
  });
}
