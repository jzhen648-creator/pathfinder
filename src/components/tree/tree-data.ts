import { normalizeGoalBloomForDisplay } from "@/lib/goal-bloom-lifecycle";
import { resolveOrbitalMilestonesForTreeGoal } from "./milestone-tree-projection";
import type { AreaData, DomainHubData, GoalBloomStatus, MomentNode, TreeGoalNode, TreeMilestoneNode } from "./tree-types";

export type RawBranch = {
  id: string;
  limbId: string;
  parentBranchId?: string | null;
  turningPointId?: string | null;
  /** Legacy / explicit API alias for taxonomy thread title. */
  threadType?: string | null;
  /** Prisma: canonical thread / taxonomy label (matches `NEW_PROFILE_ROOT_BRANCH_TEMPLATES`). */
  label?: string | null;
  name?: string | null;
  bloomStatus?: string | null;
  createdAt?: string | Date | null;
};

/** Display title for a branch thread: prefer explicit `threadType`, then Prisma `label`, then `name`. */
function branchThreadTitle(b: RawBranch): string {
  const raw = (b.threadType ?? b.label ?? b.name ?? "").trim();
  return raw.length > 0 ? raw : "Branch";
}

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
  /** 1–5 life-importance (DB); mapped to {@link TreeGoalNode.significanceTier} for render authority. */
  significance?: number | null;
  isTurningPoint?: boolean | null;
  future?: boolean | null;
  milestones: Array<{
    id: string;
    title: string;
    position: number;
    completedAt?: string | Date | null;
    subtasks: Array<{ id: string; title?: string | null; position?: number | null; isCompleted: boolean }>;
  }>;
  forkedGoals: { id: string }[];
};

function isRoadmapTreeGoal(g: RawTreeGoalPayload): boolean {
  return g.goalType !== "moment" && g.goalType !== "event";
}

/** Milestone payload shape for {@link normalizeGoalBloomForDisplay} (legacy BRANCHED → lifecycle). */
function milestonesLifecycleFromRaw(g: RawTreeGoalPayload) {
  const milestoneRows = Array.isArray(g.milestones) ? g.milestones : [];
  return milestoneRows.map((m) => ({
    completedAt: m.completedAt ?? null,
    subtasks: (Array.isArray(m.subtasks) ? m.subtasks : []).map((s) => ({
      isCompleted: Boolean(s.isCompleted),
      title: typeof s.title === "string" ? s.title : null,
    })),
  }));
}

function nestTreeGoalsForBranch(branchId: string, flat: RawTreeGoalPayload[]): TreeGoalNode[] {
  const onBranch = flat.filter((g) => g.branchId === branchId && isRoadmapTreeGoal(g));
  const nodes: TreeGoalNode[] = onBranch.map((g) => {
    const milestoneRows = Array.isArray(g.milestones) ? g.milestones : [];
    const roadmapMs = milestoneRows.map((m) => {
      const subRows = Array.isArray(m.subtasks) ? m.subtasks : [];
      const completedAtIso =
        m.completedAt == null
          ? null
          : typeof m.completedAt === "string"
            ? m.completedAt
            : m.completedAt.toISOString();
      return {
        id: m.id,
        title: m.title,
        position: m.position,
        completedAt: completedAtIso,
        subtasks: subRows.map((s, si) => ({
          id: s.id,
          title: typeof s.title === "string" && s.title.trim().length > 0 ? s.title : `Subtask ${si + 1}`,
          position: typeof s.position === "number" ? s.position : si,
          isCompleted: s.isCompleted,
        })),
      };
    });
    const bloomStatus = normalizeGoalBloomForDisplay(
      {
        goalType: g.goalType,
        future: Boolean(g.future),
        year: g.year ?? null,
        bloomStatus: typeof g.bloomStatus === "string" ? g.bloomStatus : "BUD",
      },
      milestonesLifecycleFromRaw(g),
      { goalId: g.id },
    ) as GoalBloomStatus;
    return {
      id: g.id,
      branchId: g.branchId ?? branchId,
      title: g.title,
      description: g.description ?? null,
      bloomStatus,
      positionAngle: g.positionAngle,
      parentGoalId: g.parentGoalId,
      forkedGoalIds: (Array.isArray(g.forkedGoals) ? g.forkedGoals : []).map((f) => f.id),
      milestones: roadmapMs,
      orbitalMilestones: resolveOrbitalMilestonesForTreeGoal({
        relationalMilestones: roadmapMs.map((m) => ({
          id: m.id,
          title: m.title,
          position: m.position,
          completedAt: m.completedAt ?? null,
          subtasks: m.subtasks.map((s) => ({
            isCompleted: s.isCompleted,
            title: s.title,
          })),
        })),
      }),
      significanceTier:
        typeof g.significance === "number" && Number.isFinite(g.significance)
          ? Math.max(1, Math.min(5, Math.round(g.significance)))
          : null,
      childGoals: [],
    };
  });
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
  pleasures: { label: "Pleasures", color: "#38BDF8" },
};

/** @deprecated Use `LIFE_AREA_CONFIG`. */
export const LIMB_CONFIG = LIFE_AREA_CONFIG;

export const LIFE_AREA_ORDER = ["finance", "work", "becoming", "people", "health", "pleasures"] as const;

/** `limbId`s omitted from the life-tree SVG (`mapToTreeData`). API/DB branches unchanged. */
export const TREE_DISABLED_LIFE_AREA_IDS: ReadonlySet<string> = new Set(["pleasures"]);

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

const HUBS_PER_ENABLED_LIFE_AREA = 4;

/** Life-area + domain hub rows only; fork SVG geometry is derived from this data in `tree-forks`. */
export function mapToTreeData(
  branches: RawBranch[],
  marks: RawMark[],
  goals: RawTreeGoalPayload[] = [],
): AreaData[] {
  return LIFE_AREA_ORDER.filter((lifeAreaId) => !TREE_DISABLED_LIFE_AREA_IDS.has(lifeAreaId)).map((lifeAreaId) => {
    const config = LIFE_AREA_CONFIG[lifeAreaId];

    const rootBranches = branches
      .filter((b) => b.limbId === lifeAreaId && !b.parentBranchId)
      .sort((a, b) => asDateMs(a.createdAt) - asDateMs(b.createdAt));

    const areaBranches: DomainHubData[] = rootBranches.map((branch) => {
      const timelineFromGoals: MomentNode[] = goals
        .filter((g) => g.branchId === branch.id && (g.goalType === "moment" || g.goalType === "event"))
        .map((g) => ({
          id: g.id,
          branchId: branch.id,
          label: g.title ?? "Untitled",
          description: g.description ?? null,
          year: g.year ?? null,
          significance: Math.min(3, Math.max(1, g.significance ?? 1)),
          bloomStatus: normalizeGoalBloomForDisplay(
            {
              goalType: g.goalType,
              future: Boolean(g.future),
              year: g.year ?? null,
              bloomStatus: typeof g.bloomStatus === "string" ? g.bloomStatus : "BUD",
            },
            milestonesLifecycleFromRaw(g),
            { goalId: g.id },
          ) as MomentNode["bloomStatus"],
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

      const goalRoots = nestTreeGoalsForBranch(branch.id, goals);

      return {
        id: branch.id,
        type: branchThreadTitle(branch),
        moments: branchMarks,
        goals: goalRoots,
      };
    });
    let hubs: DomainHubData[] = areaBranches;
    if (hubs.length > HUBS_PER_ENABLED_LIFE_AREA) {
      hubs = hubs.slice(0, HUBS_PER_ENABLED_LIFE_AREA);
    }
    while (hubs.length < HUBS_PER_ENABLED_LIFE_AREA) {
      const slot = hubs.length;
      hubs = [
        ...hubs,
        {
          id: `tree-hub-pad-${lifeAreaId}-${slot}`,
          type: "—",
          moments: [],
          goals: [],
        },
      ];
    }

    if (process.env.NODE_ENV === "development") {
      if (rootBranches.length !== HUBS_PER_ENABLED_LIFE_AREA) {
        // eslint-disable-next-line no-console -- dev invariant for anchor-first tree (four root branches per area)
        console.warn(
          `[tree-data] theme "${lifeAreaId}" has ${rootBranches.length} root branches; expected ${HUBS_PER_ENABLED_LIFE_AREA}. Padded/truncated for fork geometry.`,
        );
      }
    }

    return {
      id: lifeAreaId,
      label: config?.label ?? lifeAreaId,
      color: config?.color ?? "#94A3B8",
      summary: null,
      branches: hubs,
    };
  });
}
