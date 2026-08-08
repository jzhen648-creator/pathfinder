import type { Prisma } from "@prisma/client";

export type RevisionFilingDbClient = Pick<Prisma.TransactionClient, "chapterRevision" | "goal">;

export type StoredFiling = { categoryId: string | null; themeId: string | null };

/**
 * Rewrite only the internal filing fields of a stored chapter state.
 * Title, background, status, dates and every other semantic field are untouched.
 */
export function repairedAfterState(
  afterState: Prisma.JsonValue,
  filing: StoredFiling,
): Prisma.InputJsonObject | null {
  if (!afterState || Array.isArray(afterState) || typeof afterState !== "object") return null;
  const state = afterState as Record<string, unknown>;
  const currentCategory = "categoryId" in state ? (state.categoryId ?? null) : undefined;
  const currentTheme = "themeId" in state ? (state.themeId ?? null) : undefined;
  if (currentCategory === undefined && currentTheme === undefined) return null;
  if (currentCategory === filing.categoryId && currentTheme === filing.themeId) return null;

  const next: Record<string, unknown> = { ...state };
  if (currentCategory !== undefined) next.categoryId = filing.categoryId;
  if (currentTheme !== undefined) next.themeId = filing.themeId;
  return next as Prisma.InputJsonObject;
}

/**
 * A merge re-points each moved chapter at the target account's equivalent
 * ThemeCategory. `chapterMatchesState` compares the live chapter against the
 * stored `afterState` of its CREATED revision, including `categoryId`, so an
 * unrepaired revision would make Undo permanently fail as STALE_TARGET.
 *
 * This rewrites the mechanical filing fields only, so an import-created chapter
 * stays reversible after its owner changes.
 */
export async function repairRevisionFiling(
  db: RevisionFilingDbClient,
  targetUserId: string,
): Promise<{ repairedRevisions: number }> {
  const revisions = await db.chapterRevision.findMany({
    where: { userId: targetUserId },
    select: { id: true, goalId: true, afterState: true },
    orderBy: { id: "asc" },
  });
  if (revisions.length === 0) return { repairedRevisions: 0 };

  const goals = await db.goal.findMany({
    where: { id: { in: [...new Set(revisions.map((r) => r.goalId))] } },
    select: { id: true, categoryId: true, themeId: true },
  });
  const filingByGoal = new Map(goals.map((g) => [g.id, { categoryId: g.categoryId ?? null, themeId: g.themeId ?? null }]));

  let repairedRevisions = 0;
  for (const revision of revisions) {
    const filing = filingByGoal.get(revision.goalId);
    if (!filing) continue;
    const next = repairedAfterState(revision.afterState, filing);
    if (!next) continue;
    await db.chapterRevision.update({ where: { id: revision.id }, data: { afterState: next } });
    repairedRevisions += 1;
  }
  return { repairedRevisions };
}
