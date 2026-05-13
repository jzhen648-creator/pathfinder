/**
 * Pure goal bloom lifecycle rules (no Prisma). Shared by server recomputation and client tree normalization.
 *
 * Continuations (`parentGoalId` / successors) do **not** affect lifecycle — only planning + achievement do.
 */

import {
  milestoneDoneForSemantics,
  type MilestoneSemanticsInput,
} from "@/lib/milestone-semantics";

/** Input shape for lifecycle / display normalization (includes explicit milestone completion). */
export type MilestoneLifecycleInput = MilestoneSemanticsInput;

/** @deprecated Prefer {@link milestoneDoneForSemantics}; kept for call-site churn control. */
export function milestoneIsFullyCompleted(milestone: MilestoneLifecycleInput): boolean {
  return milestoneDoneForSemantics(milestone);
}

/** Goal is achieved for lifecycle → BLOOMED (roadmap goals vs moment/event without milestones). */
export function goalAchievedForBloomLifecycle(
  goal: { goalType: string; future: boolean; year: number | null },
  milestones: MilestoneLifecycleInput[],
  nowYear: number,
): boolean {
  if (milestones.length === 0) {
    if (goal.goalType === "moment" || goal.goalType === "event") {
      return !goal.future && !(goal.year != null && goal.year > nowYear);
    }
    return false;
  }
  return milestones.every(milestoneDoneForSemantics);
}

export type GoalLifecycleBloom = "BUD" | "GROWING" | "BLOOMED";

/** Canonical lifecycle states for an active (non-ENDED) goal — excludes BRANCHED and ENDED. */
export function computeGoalLifecycleBloom(
  goal: { goalType: string; future: boolean; year: number | null },
  milestones: MilestoneLifecycleInput[],
  nowYear: number,
): GoalLifecycleBloom {
  if (goalAchievedForBloomLifecycle(goal, milestones, nowYear)) return "BLOOMED";
  if (milestones.length > 0) return "GROWING";
  return "BUD";
}

export type NormalizeGoalBloomDisplayOptions = {
  /** When set, dev-only diagnostics include this id for stale-BUD logs. */
  goalId?: string;
};

/**
 * Maps persisted bloom to tree/UI semantics.
 *
 * - Legacy **BRANCHED** is remapped via `computeGoalLifecycleBloom` until DB backfill (`npm run backfill:goal-bloom`).
 * - **Stale BUD:** if the DB still says `BUD` but relational milestone rows exist, derive lifecycle from
 *   `computeGoalLifecycleBloom` so the tree matches milestone ontology without trusting stale persistence.
 *   (`Goal.treeMilestones` JSON is **not** passed here — only relational milestone payloads.)
 */
export function normalizeGoalBloomForDisplay(
  goal: { goalType: string; future: boolean; year: number | null; bloomStatus: string },
  milestones: MilestoneLifecycleInput[],
  options?: NormalizeGoalBloomDisplayOptions,
): "BUD" | "GROWING" | "BLOOMED" | "ENDED" {
  if (goal.bloomStatus === "ENDED") return "ENDED";
  if (goal.bloomStatus === "BRANCHED") {
    return computeGoalLifecycleBloom(goal, milestones, new Date().getFullYear());
  }

  const nowYear = new Date().getFullYear();
  if (goal.bloomStatus === "BUD" && milestones.length > 0) {
    const computed = computeGoalLifecycleBloom(goal, milestones, nowYear);
    if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
      console.warn("[pathfinder/bloom] stale BUD with relational milestones", {
        goalId: options?.goalId ?? "(unknown)",
        persistedBloom: "BUD",
        computedBloom: computed,
        milestoneCount: milestones.length,
      });
    }
    return computed;
  }

  if (goal.bloomStatus === "BUD" || goal.bloomStatus === "GROWING" || goal.bloomStatus === "BLOOMED") {
    return goal.bloomStatus;
  }
  return "BUD";
}
