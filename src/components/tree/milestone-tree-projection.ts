/**
 * Tree hex “orbitals” are a **projection** of canonical relational milestones.
 * Roadmap UI and Prisma `Milestone` / `Subtask` rows are the only source of truth.
 *
 * @see `docs/STABILIZATION.md`
 */

import { milestoneDoneForSemantics } from "@/lib/milestone-semantics";
import type { TreeOrbitalMilestone } from "./tree-types";

/** Matches hex rendering cap (`tree-render-goals-subtree`, max 6 vertices). */
export const TREE_ORBITAL_MAX_VISIBLE = 6;

export type MilestoneProjectionInput = {
  id: string;
  title: string;
  position: number;
  completedAt?: Date | string | null;
  subtasks: { isCompleted: boolean; title?: string | null }[];
};

/** Same rule as bloom lifecycle (`milestoneDoneForSemantics`). */
function milestoneCompletionForProjection(m: MilestoneProjectionInput): boolean {
  return milestoneDoneForSemantics({
    completedAt: m.completedAt ?? null,
    subtasks: m.subtasks.map((s) => ({ isCompleted: s.isCompleted, title: s.title })),
  });
}

/**
 * Ordered by `position`, capped for hex layout — one orbital dot per relational milestone.
 */
export function projectRelationalMilestonesToOrbitals(
  milestones: MilestoneProjectionInput[],
): TreeOrbitalMilestone[] {
  const sorted = [...milestones].sort((a, b) => a.position - b.position);
  return sorted.slice(0, TREE_ORBITAL_MAX_VISIBLE).map((m) => ({
    id: m.id,
    title: m.title,
    completed: milestoneCompletionForProjection(m),
  }));
}

export type ResolveOrbitalMilestonesArgs = {
  relationalMilestones: MilestoneProjectionInput[];
};

/** Relational milestones → hex dot projection; empty when none exist. */
export function resolveOrbitalMilestonesForTreeGoal({
  relationalMilestones,
}: ResolveOrbitalMilestonesArgs): TreeOrbitalMilestone[] {
  if (relationalMilestones.length === 0) return [];
  return projectRelationalMilestonesToOrbitals(relationalMilestones);
}
