/** Title written by `npm run backfill:rename-legacy-subtasks` for old “Complete this step” rows. */
export const RENAMED_LEGACY_SUBTASK_TITLE = "Optional detail";

export function isRenamedLegacySubtaskTitle(title: string): boolean {
  return title.trim() === RENAMED_LEGACY_SUBTASK_TITLE;
}

/**
 * Subtasks that must not affect milestone rollup or appear as “real” optional depth —
 * legacy auto-rows from before explicit `completedAt` / tap-to-complete.
 */
export function isScaffoldingSubtaskTitle(title: string): boolean {
  if (isRenamedLegacySubtaskTitle(title)) return true;
  const t = title.trim().replace(/\s+/g, " ");
  return /^complete (this|the) step\.?$/i.test(t);
}
