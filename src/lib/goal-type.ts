/** Canonical pursuit kinds (user + API). */
export const GOAL_TYPE_VALUES = ["project", "identity"] as const;
export type GoalType = (typeof GOAL_TYPE_VALUES)[number];

/** Stream ingest may still emit legacy `practice` until models fully adapt. */
export const STREAM_INGEST_GOAL_TYPE_VALUES = ["project", "practice", "identity"] as const;
export type StreamIngestGoalType = (typeof STREAM_INGEST_GOAL_TYPE_VALUES)[number];

export type PursuitBloomForMilestones = {
  goalType: string;
  status?: string | null;
  bloomStatus?: string | null;
};

/**
 * Stream and manual milestone append — identity and maintaining pursuits have no milestone ladder.
 * Legacy `practice` rows are excluded until backfill runs.
 */
export function goalAllowsStreamMilestones(goal: PursuitBloomForMilestones): boolean {
  if (goal.goalType === "moment" || goal.goalType === "event") return false;
  if (goal.goalType === "identity" || goal.goalType === "practice") return false;
  if ((goal.status ?? goal.bloomStatus) === "MAINTAINING") return false;
  return true;
}

/** Map legacy practice + Stream status to persisted goalType / status. */
export function normalizeIngestedPursuitType(input: {
  goalType: string;
  status?: string | null;
  bloomStatus?: string | null;
}): { goalType: GoalType; status: string } {
  const rawStatus = input.status ?? input.bloomStatus ?? "ACTIVE";
  if (input.goalType === "identity") {
    return { goalType: "identity", status: rawStatus };
  }
  if (input.goalType === "practice") {
    if (rawStatus === "COMPLETE" || rawStatus === "PAUSED" || rawStatus === "ON_HOLD") {
      const status = rawStatus === "ON_HOLD" ? "PAUSED" : rawStatus;
      return { goalType: "project", status };
    }
    return { goalType: "project", status: "MAINTAINING" };
  }
  return { goalType: "project", status: rawStatus };
}
