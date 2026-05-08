import { SPINE_ORIGIN, BRANCH_SLOTS } from "./tree-geometry";
import type { AreaBranchData, AreaData, GoalBloomStatus, MomentNode, TreeGoalNode } from "./tree-types";

export type RawBranch = {
  id: string;
  limbId: string;
  parentBranchId?: string | null;
  turningPointId?: string | null;
  threadType?: string | null;
  name?: string | null;
  bloomStatus?: string | null;
  createdAt?: string | Date | null;
};

export type RawTreeGoalPayload = {
  id: string;
  branchId: string | null;
  title: string;
  description?: string | null;
  goalType: string;
  bloomStatus: string;
  positionAngle: number | null;
  parentGoalId: string | null;
  year?: number | null;
  significance?: number | null;
  isTurningPoint?: boolean | null;
  future?: boolean | null;
  milestones: Array<{
    id: string;
    title: string;
    position: number;
    subtasks: Array<{ id: string; title?: string | null; position?: number | null; isCompleted: boolean }>;
  }>;
  forkedGoals: { id: string }[];
};

function isRoadmapTreeGoal(g: RawTreeGoalPayload): boolean {
  return g.goalType !== "moment" && g.goalType !== "event";
}

function nestTreeGoalsForBranch(branchId: string, flat: RawTreeGoalPayload[]): TreeGoalNode[] {
  const onBranch = flat.filter((g) => g.branchId === branchId && isRoadmapTreeGoal(g));
  const nodes: TreeGoalNode[] = onBranch.map((g) => ({
    id: g.id,
    branchId: g.branchId ?? branchId,
    title: g.title,
    bloomStatus: (["BUD", "GROWING", "BLOOMED", "BRANCHED", "ENDED"].includes(g.bloomStatus)
      ? g.bloomStatus
      : "BUD") as GoalBloomStatus,
    positionAngle: g.positionAngle,
    parentGoalId: g.parentGoalId,
    forkedGoalIds: g.forkedGoals.map((f) => f.id),
    milestones: g.milestones.map((m) => ({
      id: m.id,
      title: m.title,
      position: m.position,
      subtasks: m.subtasks.map((s, si) => ({
        id: s.id,
        title: typeof s.title === "string" && s.title.trim().length > 0 ? s.title : `Subtask ${si + 1}`,
        position: typeof s.position === "number" ? s.position : si,
        isCompleted: s.isCompleted,
      })),
    })),
    childGoals: [],
  }));
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n] as const));
  const roots: TreeGoalNode[] = [];
  for (const n of nodes) {
    if (n.parentGoalId && byId[n.parentGoalId]) {
      byId[n.parentGoalId].childGoals.push(n);
    } else if (!n.parentGoalId) {
      roots.push(n);
    }
  }
  return roots;
}

export type RawMark = {
  id: string;
  branchId: string;
  title?: string | null;
  description?: string | null;
  year?: number | null;
  significance?: number | null;
  isTurningPoint?: boolean | null;
  future?: boolean | null;
  value?: number | null;
  type?: string | null;
  date?: string | Date | null;
};

export const LIFE_AREA_CONFIG: Record<string, { label: string; color: string }> = {
  finance: { label: "Money & Finance", color: "#1D9E75" },
  work: { label: "Work & Learning", color: "#EF9F27" },
  becoming: { label: "Who I'm Becoming", color: "#7F77DD" },
  people: { label: "People & Relationships", color: "#D4537E" },
  health: { label: "Health & Body", color: "#D85A30" },
};

/** @deprecated Use `LIFE_AREA_CONFIG`. */
export const LIMB_CONFIG = LIFE_AREA_CONFIG;

export const LIFE_AREA_ORDER = ["finance", "work", "becoming", "people", "health"] as const;

function deriveBloomStatus(mark: RawMark, branch: RawBranch): MomentNode["bloomStatus"] {
  if (mark.future) return "GROWING";
  if (branch.bloomStatus === "ENDED") return "ENDED";
  if (mark.isTurningPoint && branch.bloomStatus === "BLOOMED") return "BRANCHED";
  if (branch.bloomStatus === "GROWING") return "GROWING";
  return "BLOOMED";
}

function asDateMs(input: string | Date | null | undefined): number {
  if (!input) return 0;
  const ms = new Date(input).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function seededUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function seededSigned(seed: string): number {
  return seededUnit(seed) * 2 - 1;
}

/** Single tree-only bud when a thread has no real marks (avoids empty branches without stacking five fillers). */
const SYNTHETIC_MOMENTS_WHEN_THREAD_EMPTY = 1;

function syntheticBloomForBranch(branch: RawBranch): MomentNode["bloomStatus"] {
  if (branch.bloomStatus === "ENDED") return "ENDED";
  if (branch.bloomStatus === "GROWING") return "GROWING";
  return "BLOOMED";
}

function padThreadMoments(branch: RawBranch, realMoments: MomentNode[]): MomentNode[] {
  if (realMoments.length > 0) return realMoments;
  const n = SYNTHETIC_MOMENTS_WHEN_THREAD_EMPTY;
  if (n <= 0) return realMoments;
  const baseYear = new Date().getFullYear();
  const synth: MomentNode[] = [];
  for (let i = 0; i < n; i += 1) {
    synth.push({
      id: `tree-pad-${branch.id}-${i}`,
      branchId: branch.id,
      label: "Along the way",
      description: null,
      year: baseYear,
      significance: 1,
      bloomStatus: syntheticBloomForBranch(branch),
      isTurningPoint: false,
      future: false,
      value: null,
      type: "milestone",
      synthetic: true,
    });
  }
  return [...realMoments, ...synth].sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
}

/** Life-area + branch-line records only; fork SVG geometry is derived from this data in `tree-forks` (straight layout). */
export function mapToTreeData(
  branches: RawBranch[],
  marks: RawMark[],
  goals: RawTreeGoalPayload[] = [],
): AreaData[] {
  return LIFE_AREA_ORDER.map((lifeAreaId) => {
    const config = LIFE_AREA_CONFIG[lifeAreaId];
    const origin = SPINE_ORIGIN[lifeAreaId];

    const rootBranches = branches
      .filter((b) => b.limbId === lifeAreaId && !b.parentBranchId)
      .sort((a, b) => asDateMs(a.createdAt) - asDateMs(b.createdAt));
    const slots = BRANCH_SLOTS[lifeAreaId] ?? [];

    const areaBranches: AreaBranchData[] = rootBranches.map((branch, idx) => {
      const slot = slots[idx] ?? slots[slots.length - 1];
      const fallbackSlot = {
        defaultFromT: 0.1,
        p1: origin.p0,
        p2: origin.p0,
        sw: 2,
      };
      const safeSlot = slot ?? fallbackSlot;

      const fromT = safeSlot.defaultFromT;

      const timelineFromGoals: MomentNode[] = goals
        .filter((g) => g.branchId === branch.id && (g.goalType === "moment" || g.goalType === "event"))
        .map((g) => ({
          id: g.id,
          branchId: branch.id,
          label: g.title ?? "Untitled",
          description: g.description ?? null,
          year: g.year ?? null,
          significance: Math.min(3, Math.max(1, g.significance ?? 1)),
          bloomStatus: (["BUD", "GROWING", "BLOOMED", "BRANCHED", "ENDED"].includes(g.bloomStatus)
            ? g.bloomStatus
            : "BUD") as MomentNode["bloomStatus"],
          isTurningPoint: Boolean(g.isTurningPoint),
          future: Boolean(g.future),
          value: null,
          type: "milestone",
        }));

      const fromMarks: MomentNode[] = marks
        .filter((m) => m.branchId === branch.id)
        .map((m) => ({
          id: m.id,
          branchId: m.branchId,
          label: m.title ?? "Untitled goal",
          description: m.description ?? null,
          year: m.year ?? (m.date ? new Date(m.date).getFullYear() : null),
          significance: Math.min(3, Math.max(1, m.significance ?? 1)),
          bloomStatus: deriveBloomStatus(m, branch),
          isTurningPoint: Boolean(m.isTurningPoint),
          future: Boolean(m.future),
          value: m.value ?? null,
          type: m.type ?? "milestone",
        }));

      const mergedTimeline = [...timelineFromGoals, ...fromMarks].sort((a, b) => (a.year ?? 0) - (b.year ?? 0));

      const branchMarks: MomentNode[] = padThreadMoments(branch, mergedTimeline);
      const childBranches = branches
        .filter((b) => b.parentBranchId === branch.id)
        .sort((a, b) => asDateMs(a.createdAt) - asDateMs(b.createdAt));
      const siblings = childBranches.map((b) => ({
        id: b.id,
        label: b.threadType ?? b.name ?? "Branch",
      }));
      const childCount = childBranches.length;
      const splitMomentIndex = (() => {
        if (childCount === 0 || branchMarks.length === 0) return -1;
        const turningMarkId = childBranches.find((b) => b.turningPointId)?.turningPointId ?? null;
        if (turningMarkId) {
          const idx = branchMarks.findIndex((m) => m.id === turningMarkId);
          if (idx >= 0) return idx;
        }
        const firstChildYear = (() => {
          const ms = asDateMs(childBranches[0]?.createdAt);
          if (ms <= 0) return null;
          return new Date(ms).getFullYear();
        })();
        if (firstChildYear !== null) {
          const idx = branchMarks.findIndex((m) => m.year !== null && m.year >= firstChildYear);
          if (idx >= 0) return idx;
        }
        return Math.max(0, Math.floor(branchMarks.length * 0.6));
      })();
      const splitT = (() => {
        if (childCount === 0) return undefined;
        const spacingVariance = seededSigned(`${branch.id}:split-t`) * 0.06;
        if (branchMarks.length <= 1 || splitMomentIndex < 0) return 0.55;
        const progress = splitMomentIndex / Math.max(1, branchMarks.length - 1);
        return Math.min(0.74, Math.max(0.28, 0.24 + progress * 0.5 + spacingVariance));
      })();
      const growthTransfer = Math.min(0.5, Math.max(0.12, childCount * 0.16 + seededSigned(`${branch.id}:flow`) * 0.06));
      const postSplitStrokeWidth =
        childCount > 0 ? Math.max(1, Number((safeSlot.sw * (1 - growthTransfer)).toFixed(2))) : undefined;
      const postSplitP1 =
        childCount > 0
          ? {
              x:
                safeSlot.p1.x +
                (safeSlot.p2.x >= safeSlot.p1.x ? 1 : -1) * (10 + childCount * 5 + seededSigned(`${branch.id}:p1x`) * 7),
              y: safeSlot.p1.y - (8 + childCount * 2 + seededUnit(`${branch.id}:p1y`) * 5),
            }
          : undefined;

      const goalRoots = nestTreeGoalsForBranch(branch.id, goals);

      return {
        id: branch.id,
        type: branch.threadType ?? branch.name ?? "Branch",
        fromT,
        p1: safeSlot.p1,
        p2: safeSlot.p2,
        strokeWidth: safeSlot.sw,
        moments: branchMarks,
        goals: goalRoots,
        siblings,
        splitT,
        postSplitP1,
        postSplitStrokeWidth,
      };
    });
    return {
      id: lifeAreaId,
      label: config?.label ?? lifeAreaId,
      color: config?.color ?? "#94A3B8",
      summary: null,
      branches: areaBranches,
    };
  });
}
