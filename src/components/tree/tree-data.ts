import { normalizeGoalBloomForDisplay } from "@/lib/goal-bloom-lifecycle";
import { canonicalHubDisplayLabel, hubMatchKey } from "@/lib/hub-catalog";
import { LOCKED_HUB_TEMPLATES } from "@/lib/taxonomy";
import { resolveOrbitalMilestonesForTreeGoal } from "./milestone-tree-projection";
import type {
  AreaData,
  DomainHubData,
  GoalBloomStatus,
  MomentNode,
  SequencedBranchNode,
  TreeGoalNode,
} from "./tree-types";

export function branchIsActiveOnTree(branch: Pick<RawBranch, "isActive">): boolean {
  return branch.isActive === true;
}

export type RawBranch = {
  id: string;
  limbId: string;
  isActive?: boolean | null;
  isSystemHub?: boolean | null;
  parentBranchId?: string | null;
  turningPointId?: string | null;
  /** Legacy / explicit API alias for taxonomy thread title. */
  threadType?: string | null;
  /** Prisma: canonical thread / taxonomy label (matches `LOCKED_HUB_TEMPLATES`). */
  label?: string | null;
  name?: string | null;
  bloomStatus?: string | null;
  createdAt?: string | Date | null;
};

/** Raw label from API row (before catalog canonicalization). */
function branchThreadRawTitle(b: RawBranch): string {
  const raw = (b.threadType ?? b.label ?? b.name ?? "").trim();
  return raw.length > 0 ? raw : "Branch";
}

function branchThreadTitle(b: RawBranch, lifeAreaId: string): string {
  return canonicalHubDisplayLabel(lifeAreaId, branchThreadRawTitle(b));
}

export type RawTreeGoalPayload = {
  id: string;
  branchId: string | null;
  title: string;
  shortLabel?: string | null;
  description?: string | null;
  goalType: string;
  bloomStatus: string;
  positionAngle: number | null;
  parentGoalId: string | null;
  year?: number | null;
  createdAt?: string | Date | null;
  timelineStart?: string | Date | null;
  deadline?: string | Date | null;
  /** Explicit branch-line ordering (`Goal.sequencePosition`). Co-sorted with `Mark.sequencePosition`. */
  sequencePosition?: number | null;
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

/**
 * Comparator for sequence-position ordering with a deterministic fallback when rows are missing
 * `sequencePosition` (legacy data, or new rows created before anchor support landed in every API).
 *
 * Order: explicit `sequencePosition` ASC (nulls last), then `(year, month, createdAt)` ASC. The
 * fallback mirrors the backfill script (`scripts/backfill-node-sequence.ts`) so a later backfill
 * pass produces the same visual order the renderer was already using.
 */
type SequencedSortInput = {
  sequencePosition: number | null;
  year: number | null;
  month: number | null;
  createdAtMs: number;
};

/** UTC calendar day `YYYY-MM-DD` from API date value. */
export function calendarIsoFromApiDate(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function compareSequencedNodes(a: SequencedSortInput, b: SequencedSortInput): number {
  const ap = a.sequencePosition;
  const bp = b.sequencePosition;
  if (ap != null && bp != null) {
    if (ap !== bp) return ap - bp;
  } else if (ap != null) {
    return -1;
  } else if (bp != null) {
    return 1;
  }
  const ay = a.year ?? Number.POSITIVE_INFINITY;
  const by = b.year ?? Number.POSITIVE_INFINITY;
  if (ay !== by) return ay - by;
  const am = a.month ?? 0;
  const bm = b.month ?? 0;
  if (am !== bm) return am - bm;
  return a.createdAtMs - b.createdAtMs;
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
        status: typeof g.bloomStatus === "string" ? g.bloomStatus : "ACTIVE",
      },
      milestonesLifecycleFromRaw(g),
      { goalId: g.id },
    ) as GoalBloomStatus;
    return {
      id: g.id,
      branchId: g.branchId ?? branchId,
      title: g.title,
      shortLabel: g.shortLabel ?? null,
      description: g.description ?? null,
      year: g.year ?? null,
      createdAtIso: calendarIsoFromApiDate(g.createdAt ?? null),
      timelineStartIso: calendarIsoFromApiDate(g.timelineStart ?? null),
      deadlineIso: calendarIsoFromApiDate(g.deadline ?? null),
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
  const rawById = new Map(onBranch.map((g) => [g.id, g] as const));
  const roots: TreeGoalNode[] = [];
  for (const n of nodes) {
    if (n.parentGoalId && byId[n.parentGoalId]) {
      byId[n.parentGoalId].childGoals.push(n);
    } else if (!n.parentGoalId) {
      roots.push(n);
    }
  }
  /** Sort root goals by explicit `sequencePosition` (nulls last) with deterministic fallback, so the renderer iterates in the same order it positions nodes. */
  roots.sort((a, b) => {
    const ra = rawById.get(a.id);
    const rb = rawById.get(b.id);
    return compareSequencedNodes(
      { sequencePosition: ra?.sequencePosition ?? null, year: ra?.year ?? null, month: null, createdAtMs: 0 },
      { sequencePosition: rb?.sequencePosition ?? null, year: rb?.year ?? null, month: null, createdAtMs: 0 },
    );
  });
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
  /** Explicit branch-line ordering (`Mark.sequencePosition`). Co-sorted with `Goal.sequencePosition`. */
  sequencePosition?: number | null;
  /** Provenance tag: `mark` (user/manual or legacy), `stream` (AI Stream). */
  kind?: string | null;
  archived?: boolean;
  needsResolution?: boolean;
  streamAmbiguousId?: string | null;
};

export const LIFE_AREA_CONFIG: Record<string, { label: string; color: string }> = {
  finance: { label: "Money & Finance", color: "#1D9E75" },
  work: { label: "Work & Career", color: "#EF9F27" },
  becoming: { label: "Self & Mind", color: "#7F77DD" },
  people: { label: "People & Relationships", color: "#D4537E" },
  health: { label: "Health & Body", color: "#D85A30" },
};

/** @deprecated Use `LIFE_AREA_CONFIG`. */
export const LIMB_CONFIG = LIFE_AREA_CONFIG;

export const LIFE_AREA_ORDER = [
  "becoming",
  "pleasures",
  "finance",
  "health",
  "work",
  "people",
] as const;

/** `limbId`s omitted from the life-tree SVG (`mapToTreeData`). API/DB branches unchanged. */
export const TREE_DISABLED_LIFE_AREA_IDS: ReadonlySet<string> = new Set();

function asDateMs(input: string | Date | null | undefined): number {
  if (!input) return 0;
  const ms = new Date(input).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Build the unified `sequencedNodes` list for one branch. Combines:
 *
 *   - Root roadmap goals (`parentGoalId === null`, `goalType` not in `{moment, event}`) — passed through
 *     as already-nested {@link TreeGoalNode}s.
 *   - Marks (timeline notes) on this branch.
 *   - **Transitional**: `Goal{goalType: moment|event}` rows on this branch, surfaced as moment-kind
 *     entries until those rows are migrated to `Mark` in the separately-scoped retirement sprint.
 *
 * Sort is by {@link compareSequencedNodes}: explicit `sequencePosition` first (nulls last), then
 * `(year, month, createdAt)` tiebreak. Continuation children (`Goal.parentGoalId !== null`) are
 * **excluded** — they keep the parent-anchored satellite layout from `continuationChildScreenPosition`.
 */
function buildSequencedNodesForBranch(
  branchId: string,
  goalRoots: TreeGoalNode[],
  flatGoals: RawTreeGoalPayload[],
  marks: RawMark[],
): SequencedBranchNode[] {
  const goalById = new Map(flatGoals.map((g) => [g.id, g] as const));

  const rootGoalNodes = goalRoots.map((node) => {
    const raw = goalById.get(node.id);
    const seq = typeof raw?.sequencePosition === "number" ? raw.sequencePosition : null;
    const year = node.year ?? null;
    const createdAtMs = 0;
    return {
      sortInput: { sequencePosition: seq, year, month: null, createdAtMs } satisfies SequencedSortInput,
      entry: {
        kind: "goal" as const,
        id: node.id,
        sequencePosition: seq ?? Number.POSITIVE_INFINITY,
        goal: node,
      } satisfies SequencedBranchNode,
    };
  });

  const markEntries = marks
    .filter((m) => m.branchId === branchId)
    .map((m) => {
      const date = m.date ? new Date(m.date) : null;
      const seq = typeof m.sequencePosition === "number" ? m.sequencePosition : null;
      const moment: MomentNode = {
        id: m.id,
        branchId: m.branchId,
        label: m.title ?? "Untitled mark",
        description: m.description ?? null,
        year: m.year ?? (date ? date.getFullYear() : null),
        significance: Math.min(3, Math.max(1, m.significance ?? 1)),
        bloomStatus: "ACTIVE",
        isTurningPoint: Boolean(m.isTurningPoint),
        future: Boolean(m.future),
        value: m.value ?? null,
        type: "mark",
        calendarDateIso:
          date && !Number.isNaN(date.getTime())
            ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`
            : null,
      };
      return {
        sortInput: {
          sequencePosition: seq,
          year: m.year ?? (date ? date.getFullYear() : null),
          month: date ? date.getMonth() + 1 : null,
          createdAtMs: date ? date.getTime() : 0,
        } satisfies SequencedSortInput,
        entry: {
          kind: "moment" as const,
          id: m.id,
          sequencePosition: seq ?? Number.POSITIVE_INFINITY,
          moment,
        } satisfies SequencedBranchNode,
      };
    });

  /** Transitional: include legacy `Goal{goalType: moment|event}` rows. Retirement sprint converts to Marks. */
  const legacyGoalMomentEntries = flatGoals
    .filter(
      (g) =>
        g.branchId === branchId &&
        (g.goalType === "moment" || g.goalType === "event") &&
        !g.parentGoalId,
    )
    .map((g) => {
      const seq = typeof g.sequencePosition === "number" ? g.sequencePosition : null;
      const moment: MomentNode = {
        id: g.id,
        branchId,
        label: g.title ?? "Untitled mark",
        description: g.description ?? null,
        year: g.year ?? null,
        significance: Math.min(3, Math.max(1, g.significance ?? 1)),
        bloomStatus: "ACTIVE",
        isTurningPoint: Boolean(g.isTurningPoint),
        future: Boolean(g.future),
        value: null,
        type: "mark",
      };
      return {
        sortInput: { sequencePosition: seq, year: g.year ?? null, month: null, createdAtMs: 0 } satisfies SequencedSortInput,
        entry: {
          kind: "moment" as const,
          id: g.id,
          sequencePosition: seq ?? Number.POSITIVE_INFINITY,
          moment,
        } satisfies SequencedBranchNode,
      };
    });

  const merged = [...rootGoalNodes, ...markEntries, ...legacyGoalMomentEntries];
  merged.sort((a, b) => compareSequencedNodes(a.sortInput, b.sortInput));
  return merged.map((m) => m.entry);
}

function templateHubsForLifeArea(lifeAreaId: string) {
  return LOCKED_HUB_TEMPLATES.filter((t) => t.limbId === lifeAreaId);
}

/** Canonical template order — legacy/extra DB roots are ignored, not sliced by `createdAt`. */
function orderRootBranchesForArea(lifeAreaId: string, rootBranches: RawBranch[]): RawBranch[] {
  const templates = templateHubsForLifeArea(lifeAreaId);
  const byHubKey = new Map<string, RawBranch>();
  for (const branch of rootBranches) {
    const key = hubMatchKey(branchThreadRawTitle(branch));
    const existing = byHubKey.get(key);
    if (!existing || asDateMs(branch.createdAt) < asDateMs(existing.createdAt)) {
      byHubKey.set(key, branch);
    }
  }
  const ordered: RawBranch[] = [];
  for (const template of templates) {
    const hit = byHubKey.get(hubMatchKey(template.threadType));
    if (hit) ordered.push(hit);
  }
  return ordered;
}

/** Life-area + domain hub rows only; fork SVG geometry is derived from this data in `tree-forks`. */
export function mapToTreeData(
  branches: RawBranch[],
  marks: RawMark[],
  goals: RawTreeGoalPayload[] = [],
): AreaData[] {
  const visibleRoots = branches.filter(
    (b) => !b.parentBranchId && branchIsActiveOnTree(b),
  );

  return LIFE_AREA_ORDER.filter((lifeAreaId) => !TREE_DISABLED_LIFE_AREA_IDS.has(lifeAreaId)).map(
    (lifeAreaId) => {
    const config = LIFE_AREA_CONFIG[lifeAreaId];

    const rootBranches = orderRootBranchesForArea(
      lifeAreaId,
      visibleRoots.filter((b) => b.limbId === lifeAreaId),
    );

    const areaBranches: DomainHubData[] = rootBranches.map((branch) => {
      const timelineFromGoals: MomentNode[] = goals
        .filter((g) => g.branchId === branch.id && (g.goalType === "moment" || g.goalType === "event"))
        .map((g) => ({
          id: g.id,
          branchId: branch.id,
          label: g.title ?? "Untitled mark",
          description: g.description ?? null,
          year: g.year ?? null,
          significance: Math.min(3, Math.max(1, g.significance ?? 1)),
          bloomStatus: normalizeGoalBloomForDisplay(
            {
              goalType: g.goalType,
              future: Boolean(g.future),
              year: g.year ?? null,
              status: typeof g.bloomStatus === "string" ? g.bloomStatus : "ACTIVE",
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
        .map((m) => {
          const date = m.date ? new Date(m.date as string) : null;
          const calendarDateIso =
            date && !Number.isNaN(date.getTime())
              ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`
              : null;
          return {
            id: m.id,
            branchId: m.branchId,
            label: m.title ?? "Untitled mark",
            description: m.description ?? null,
            year: m.year ?? (date ? date.getFullYear() : null),
            significance: Math.min(3, Math.max(1, m.significance ?? 1)),
            bloomStatus: "ACTIVE",
            isTurningPoint: Boolean(m.isTurningPoint),
            future: Boolean(m.future),
            value: m.value ?? null,
            type: "mark",
            calendarDateIso,
            needsResolution: Boolean(m.needsResolution),
          };
        });

      const rawMarkById = new Map(marks.map((m) => [m.id, m] as const));
      const rawGoalById = new Map(goals.map((g) => [g.id, g] as const));
      const mergedTimeline = [...timelineFromGoals, ...fromMarks].sort((a, b) => {
        const rawA = rawMarkById.get(a.id) ?? rawGoalById.get(a.id);
        const rawB = rawMarkById.get(b.id) ?? rawGoalById.get(b.id);
        return compareSequencedNodes(
          {
            sequencePosition: rawA && "sequencePosition" in rawA ? rawA.sequencePosition ?? null : null,
            year: a.year ?? null,
            month: null,
            createdAtMs: 0,
          },
          {
            sequencePosition: rawB && "sequencePosition" in rawB ? rawB.sequencePosition ?? null : null,
            year: b.year ?? null,
            month: null,
            createdAtMs: 0,
          },
        );
      });

      const branchMarks: MomentNode[] = mergedTimeline;

      const goalRoots = nestTreeGoalsForBranch(branch.id, goals);

      const sequencedNodes = buildSequencedNodesForBranch(branch.id, goalRoots, goals, marks);

      return {
        id: branch.id,
        type: branchThreadTitle(branch, lifeAreaId),
        moments: branchMarks,
        goals: goalRoots,
        sequencedNodes,
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
