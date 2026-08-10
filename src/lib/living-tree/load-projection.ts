import { buildLivingTreeProjection } from "@/lib/living-tree/build-projection";
import type { LivingTreeChapterInput } from "@/lib/living-tree/types";
import { prisma } from "@/lib/prisma";

/** Load confirmed model data for the pure, read-only Living Tree projection. */
export async function loadLivingTreeProjection(userId: string) {
  const [groups, chapters, memberships, backgroundObservations] = await Promise.all([
    prisma.livingTreeGroup.findMany({
      where: { userId },
      select: { id: true, name: true, slot: true, archivedAt: true, version: true, createdAt: true },
    }),
    prisma.goal.findMany({
      where: { userId, archived: false },
      select: {
        id: true,
        title: true,
        status: true,
        createdAt: true,
        observations: {
          where: {
            observation: {
              status: "ACTIVE",
              OR: [{ exactEvidence: { some: {} } }, { evidence: { some: {} } }],
            },
          },
          select: {
            observation: {
              select: { id: true, canonicalText: true, confirmedAt: true, lastConfirmedAt: true },
            },
          },
        },
      },
    }),
    prisma.livingTreeGroupMembership.findMany({
      where: { goal: { userId } },
      select: { goalId: true, groupId: true },
    }),
    prisma.lifeObservation.findMany({
      where: { userId, status: "ACTIVE", memoryDestination: "BACKGROUND" },
      select: {
        id: true,
        backgroundCategory: true,
        subjectType: true,
        subjectLabel: true,
        canonicalKey: true,
      },
    }),
  ]);

  const chapterInputs: LivingTreeChapterInput[] = chapters.map((chapter) => {
    const cited = chapter.observations.map(({ observation }) => observation);
    const latest = cited.reduce<(typeof cited)[number] | null>((current, candidate) => {
      if (!current) return candidate;
      const currentAt = current.lastConfirmedAt ?? current.confirmedAt;
      const candidateAt = candidate.lastConfirmedAt ?? candidate.confirmedAt;
      return candidateAt.getTime() > currentAt.getTime() ? candidate : current;
    }, null);
    return {
      goalId: chapter.id,
      title: chapter.title,
      status: chapter.status,
      createdAt: chapter.createdAt,
      citedObservationCount: cited.length,
      latestConfirmed: latest
        ? {
            observationId: latest.id,
            text: latest.canonicalText,
            confirmedAt: latest.lastConfirmedAt ?? latest.confirmedAt,
          }
        : null,
    };
  });

  return buildLivingTreeProjection({ groups, chapters: chapterInputs, memberships, backgroundObservations });
}
