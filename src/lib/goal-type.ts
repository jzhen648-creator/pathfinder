/** Canonical pursuit kinds (user + API). */
export const GOAL_TYPE_VALUES = ["project", "identity"] as const;
export type GoalType = (typeof GOAL_TYPE_VALUES)[number];

/** Stream ingest may still emit legacy `practice` until models fully adapt. */
export const STREAM_INGEST_GOAL_TYPE_VALUES = ["project", "practice", "identity"] as const;
export type StreamIngestGoalType = (typeof STREAM_INGEST_GOAL_TYPE_VALUES)[number];

export type PursuitBloomForMilestones = {
  goalType: string;
  bloomStatus?: string | null;
};

/**
 * Stream and manual milestone append — identity and maintaining pursuits have no milestone ladder.
 * Legacy `practice` rows are excluded until backfill runs.
 */
export function goalAllowsStreamMilestones(goal: PursuitBloomForMilestones): boolean {
  if (goal.goalType === "moment" || goal.goalType === "event") return false;
  if (goal.goalType === "identity" || goal.goalType === "practice") return false;
  if (goal.bloomStatus === "MAINTAINING") return false;
  return true;
}

/** Map legacy practice + Stream bloom to persisted goalType / bloomStatus. */
export function normalizeIngestedPursuitType(input: {
  goalType: string;
  bloomStatus?: string | null;
}): { goalType: GoalType; bloomStatus: string } {
  if (input.goalType === "identity") {
    return { goalType: "identity", bloomStatus: input.bloomStatus ?? "ACTIVE" };
  }
  if (input.goalType === "practice") {
    const status = input.bloomStatus ?? "ACTIVE";
    if (status === "COMPLETE" || status === "ON_HOLD") {
      return { goalType: "project", bloomStatus: status };
    }
    return { goalType: "project", bloomStatus: "MAINTAINING" };
  }
  return { goalType: "project", bloomStatus: input.bloomStatus ?? "ACTIVE" };
}
