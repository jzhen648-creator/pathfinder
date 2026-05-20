/**
 * Tree hex “orbitals” are a **projection** of canonical relational milestones on pursuits only.
 * Roadmap UI and Prisma `Milestone` / `Subtask` rows are the only source of truth.
 *
 * Marks (hub-level timeline moments) are never projected here — they render on the branch line
 * in `tree-svg.tsx` via `resolvedChainMomentPos`, separate from `renderGoalsSubtree`.
 *
 * @see `docs/STABILIZATION.md`
 */

import { milestoneDoneForSemantics } from "@/lib/milestone-semantics";
import { preferShortCanvasLabel } from "./tree-canvas-label";
import type { TreeOrbitalMilestone } from "./tree-types";

/** Compact label beside an orbital dot — month abbrev when the title is long. */
export function orbitalMilestoneCanvasLabel(
  title: string,
  completedAt?: string | null,
): string {
  const t = title.trim();
  if (!t) return "·";
  if (t.length <= 5 && !/\s/.test(t)) return t;
  if (completedAt) {
    const d = new Date(completedAt);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, { month: "short" });
    }
  }
  return preferShortCanvasLabel(t);
}

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

/** Ordered by `position` — one orbital dot per relational milestone. */
export function projectRelationalMilestonesToOrbitals(
  milestones: MilestoneProjectionInput[],
): TreeOrbitalMilestone[] {
  const sorted = [...milestones].sort((a, b) => a.position - b.position);
  return sorted.map((m) => {
    const completedAt =
      m.completedAt == null
        ? null
        : typeof m.completedAt === "string"
          ? m.completedAt
          : m.completedAt.toISOString();
    return {
      id: m.id,
      title: m.title,
      position: m.position,
      completed: milestoneCompletionForProjection(m),
      completedAt,
    };
  });
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
