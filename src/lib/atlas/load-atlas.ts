import type { Prisma } from "@prisma/client";
import { ensureAtlasPlacements, runAtlasSerializable } from "./atlas-placement";

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const SUMMARY_LIMIT = 220;

function calmSummary(value: string | null | undefined): string {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) return "No current understanding has been confirmed yet.";
  if (normalized.length <= SUMMARY_LIMIT) return normalized;
  return `${normalized.slice(0, SUMMARY_LIMIT - 3).trimEnd()}...`;
}

function latestObservation<T extends { confirmedAt: Date; lastConfirmedAt: Date | null }>(
  observations: readonly T[],
): T | null {
  return observations.reduce<T | null>((latest, candidate) => {
    if (!latest) return candidate;
    const latestAt = latest.lastConfirmedAt ?? latest.confirmedAt;
    const candidateAt = candidate.lastConfirmedAt ?? candidate.confirmedAt;
    return candidateAt.getTime() > latestAt.getTime() ? candidate : latest;
  }, null);
}

export async function loadAtlas(userId: string, now: Date = new Date()) {
  return runAtlasSerializable(async (transaction) => {
    const placementPlan = await ensureAtlasPlacements(transaction, userId);
    const [goals, backgroundCount] = await Promise.all([
      transaction.goal.findMany({
        where: { userId, archived: false },
        orderBy: [{ title: "asc" }, { id: "asc" }],
        select: {
          id: true,
          title: true,
          description: true,
          background: true,
          currentFocus: true,
          atlasPlacement: {
            select: { slot: true, hiddenAt: true, focusedAt: true, version: true },
          },
          observations: {
            where: {
              observation: {
                status: "ACTIVE",
                OR: [{ exactEvidence: { some: {} } }, { evidence: { some: {} } }],
              },
            },
            select: {
              observation: {
                select: {
                  id: true,
                  canonicalText: true,
                  confirmedAt: true,
                  lastConfirmedAt: true,
                },
              },
            },
          },
        },
      }),
      transaction.lifeObservation.count({
        where: { userId, status: "ACTIVE", memoryDestination: "BACKGROUND" },
      }),
    ]);

    const recentCutoff = now.getTime() - RECENT_WINDOW_MS;
    return {
      chapters: goals.map((goal) => {
        const cited = goal.observations.map(({ observation }) => observation);
        const latest = latestObservation(cited);
        const latestAt = latest ? latest.lastConfirmedAt ?? latest.confirmedAt : null;
        const placement = goal.atlasPlacement;
        return {
          id: goal.id,
          title: goal.title,
          summary: calmSummary(
            latest?.canonicalText ?? goal.currentFocus ?? goal.background ?? goal.description,
          ),
          slotId: placement?.slot ?? null,
          shown: Boolean(placement && !placement.hiddenAt),
          hiddenAt: placement?.hiddenAt?.toISOString() ?? null,
          focus: Boolean(placement?.focusedAt),
          recentlyChanged: Boolean(latestAt && latestAt.getTime() >= recentCutoff),
          lastChangedAt: latestAt?.toISOString() ?? null,
          evidenceCount: cited.length,
          placementVersion: placement?.version ?? null,
        };
      }),
      backgroundCount,
      capacity: {
        limit: 64,
        placed: goals.filter((goal) => goal.atlasPlacement).length,
        overflow: placementPlan.overflowGoalIds.length,
      },
    };
  });
}

export class AtlasChapterNotFoundError extends Error {}
export class AtlasChapterCapacityError extends Error {}

export type AtlasPresentationPatch = {
  shown?: boolean;
  focused?: boolean;
};

export async function updateAtlasChapterPresentation(
  userId: string,
  goalId: string,
  patch: AtlasPresentationPatch,
  now: Date = new Date(),
) {
  await runAtlasSerializable(async (transaction) => {
    const goal = await transaction.goal.findFirst({
      where: { id: goalId, userId, archived: false },
      select: { id: true },
    });
    if (!goal) throw new AtlasChapterNotFoundError();
    await ensureAtlasPlacements(transaction, userId);
    const placement = await transaction.atlasPlacement.findFirst({
      where: { goalId, userId },
      select: { goalId: true },
    });
    if (!placement) throw new AtlasChapterCapacityError();

    const data: Prisma.AtlasPlacementUpdateInput = { version: { increment: 1 } };
    if (patch.shown !== undefined) data.hiddenAt = patch.shown ? null : now;
    if (patch.focused !== undefined) data.focusedAt = patch.focused ? now : null;
    await transaction.atlasPlacement.update({ where: { goalId }, data });
  });
  return loadAtlas(userId, now);
}
