/**
 * Single authority for “is this milestone done?” across bloom, tree projection, roadmap, and UI.
 *
 * - Explicit `completedAt` is the primary symbolic truth.
 * - Transitional: when unset, rollup uses **meaningful** subtasks only (excludes scaffolding titles —
 *   see `isScaffoldingSubtaskTitle`). If none remain, the milestone is **not** done via rollup.
 * - Vacuous “0 meaningful subtasks ⇒ complete” is intentionally **not** used.
 */

import { isScaffoldingSubtaskTitle } from "@/lib/legacy-subtask-placeholder-title";

export type MilestoneSemanticsInput = {
  completedAt?: Date | string | null;
  subtasks: { isCompleted: boolean; title?: string | null }[];
};

function meaningfulSubtasksForRollup(subtasks: MilestoneSemanticsInput["subtasks"]) {
  return subtasks.filter((s) => !isScaffoldingSubtaskTitle(s.title ?? ""));
}

export function milestoneDoneForSemantics(m: MilestoneSemanticsInput): boolean {
  if (m.completedAt != null) return true;
  const rollup = meaningfulSubtasksForRollup(m.subtasks);
  if (rollup.length === 0) return false;
  return rollup.every((s) => s.isCompleted);
}
