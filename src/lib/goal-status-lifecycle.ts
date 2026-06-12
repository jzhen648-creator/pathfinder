/**
 * Pure goal status lifecycle rules (no Prisma). Shared by server recomputation.
 *
 * Continuations (`parentGoalId` / successors) do **not** affect lifecycle — only planning + achievement do.
 */

import type { BloomStatus } from "@prisma/client";
import {
  milestoneDoneForSemantics,
  type MilestoneSemanticsInput,
} from "@/lib/milestone-semantics";

export type BloomBadgeBucket = "active" | "complete" | "on_hold";

/** User-facing pursuit status label. */
export function formatBloomStatusLabel(status: BloomStatus | string): string {
  switch (status) {
    case "ACTIVE":
      return "Active";
    case "PAUSED":
    case "ON_HOLD":
      return "Paused";
    case "COMPLETE":
      return "Complete";
    case "MAINTAINING":
      return "Maintaining";
    case "ABANDONED":
      return "Abandoned";
    default:
      return String(status).replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export function badgeBucketFromBloom(status: BloomStatus | string): BloomBadgeBucket {
  if (status === "PAUSED" || status === "ON_HOLD") return "on_hold";
  if (status === "COMPLETE") return "complete";
  return "active";
}

/** Map legacy persisted values during transition (pre-migration rows and inbound JSON). */
export function normalizeLegacyBloomStatus(status: string): BloomStatus | null {
  if (status === "ON_HOLD") return "PAUSED";
  if (
    status === "ACTIVE" ||
    status === "PAUSED" ||
    status === "COMPLETE" ||
    status === "MAINTAINING" ||
    status === "ABANDONED"
  ) {
    return status;
  }
  if (status === "ENDED") return "PAUSED";
  if (status === "BLOOMED") return "COMPLETE";
  if (status === "BUD" || status === "GROWING" || status === "BRANCHED") return "ACTIVE";
  return null;
}

/** Input shape for lifecycle normalization (includes explicit milestone completion). */
export type MilestoneLifecycleInput = MilestoneSemanticsInput;

/** @deprecated Prefer {@link milestoneDoneForSemantics}; kept for call-site churn control. */
export function milestoneIsFullyCompleted(milestone: MilestoneLifecycleInput): boolean {
  return milestoneDoneForSemantics(milestone);
}

/** Goal is achieved for lifecycle → COMPLETE (roadmap goals vs moment/event without milestones). */
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

export type GoalLifecycleBloom = "ACTIVE" | "COMPLETE";

/** Canonical lifecycle states for an active (non-paused) goal. */
export function computeGoalLifecycleBloom(
  goal: { goalType: string; future: boolean; year: number | null },
  milestones: MilestoneLifecycleInput[],
  nowYear: number,
): GoalLifecycleBloom {
  if (goalAchievedForBloomLifecycle(goal, milestones, nowYear)) return "COMPLETE";
  return "ACTIVE";
}
