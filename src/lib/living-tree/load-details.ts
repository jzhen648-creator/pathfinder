import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const SOURCE_SELECT = {
  id: true,
  title: true,
  sourceApp: true,
  capturedAt: true,
  createdAt: true,
} satisfies Prisma.ImportSourceSelect;

const OBSERVATION_DETAIL_SELECT = {
  id: true,
  kind: true,
  subjectType: true,
  subjectLabel: true,
  backgroundCategory: true,
  temporalState: true,
  temporalPrecision: true,
  canonicalText: true,
  occurredAt: true,
  effectiveFrom: true,
  effectiveTo: true,
  firstObservedAt: true,
  lastMentionedAt: true,
  lastConfirmedAt: true,
  confirmedAt: true,
  exactEvidence: {
    orderBy: { createdAt: "asc" as const },
    select: {
      role: true,
      supportType: true,
      evidenceSpan: {
        select: {
          id: true,
          text: true,
          startOffset: true,
          endOffset: true,
          source: { select: SOURCE_SELECT },
        },
      },
    },
  },
  evidence: {
    orderBy: { createdAt: "asc" as const },
    select: {
      role: true,
      fragment: {
        select: {
          id: true,
          text: true,
          startOffset: true,
          endOffset: true,
          source: { select: SOURCE_SELECT },
        },
      },
    },
  },
} satisfies Prisma.LifeObservationSelect;

type ObservationRecord = Prisma.LifeObservationGetPayload<{
  select: typeof OBSERVATION_DETAIL_SELECT;
}>;

function serializeEvidence(observation: ObservationRecord) {
  if (observation.exactEvidence.length) {
    return observation.exactEvidence.map(({ evidenceSpan, role, supportType }) => ({
      id: evidenceSpan.id,
      text: evidenceSpan.text,
      startOffset: evidenceSpan.startOffset,
      endOffset: evidenceSpan.endOffset,
      role,
      supportType,
      precision: "EXACT" as const,
      source: {
        id: evidenceSpan.source.id,
        title: evidenceSpan.source.title,
        sourceApp: evidenceSpan.source.sourceApp,
        capturedAt: evidenceSpan.source.capturedAt ?? evidenceSpan.source.createdAt,
      },
    }));
  }

  // Pre-exact-span observations remain inspectable. A processing fragment is
  // explicitly labelled as legacy evidence; it is never presented as an exact quote.
  return observation.evidence.map(({ fragment, role }) => ({
    id: fragment.id,
    text: fragment.text,
    startOffset: fragment.startOffset,
    endOffset: fragment.endOffset,
    role,
    supportType: "EXPLICIT" as const,
    precision: "LEGACY_FRAGMENT" as const,
    source: {
      id: fragment.source.id,
      title: fragment.source.title,
      sourceApp: fragment.source.sourceApp,
      capturedAt: fragment.source.capturedAt ?? fragment.source.createdAt,
    },
  }));
}

function serializeObservation(observation: ObservationRecord) {
  return {
    id: observation.id,
    kind: observation.kind,
    subjectType: observation.subjectType,
    subjectLabel: observation.subjectLabel,
    backgroundCategory: observation.backgroundCategory,
    temporalState: observation.temporalState,
    temporalPrecision: observation.temporalPrecision,
    canonicalText: observation.canonicalText,
    occurredAt: observation.occurredAt,
    effectiveFrom: observation.effectiveFrom,
    effectiveTo: observation.effectiveTo,
    firstObservedAt: observation.firstObservedAt,
    lastMentionedAt: observation.lastMentionedAt,
    confirmedAt: observation.confirmedAt,
    lastConfirmedAt: observation.lastConfirmedAt,
    evidence: serializeEvidence(observation),
  };
}

/** Owner-scoped, read-only detail for one unarchived chapter. */
export async function loadLivingTreeChapterDetail(userId: string, goalId: string) {
  const chapter = await prisma.goal.findFirst({
    where: { id: goalId, userId, archived: false },
    select: {
      id: true,
      title: true,
      status: true,
      livingTreeMembership: {
        select: { group: { select: { id: true, name: true, archivedAt: true } } },
      },
      observations: {
        where: {
          userId,
          observation: {
            userId,
            status: "ACTIVE",
            memoryDestination: "CHAPTER",
          },
        },
        orderBy: { createdAt: "desc" },
        select: { observation: { select: OBSERVATION_DETAIL_SELECT } },
      },
    },
  });

  if (!chapter) return null;
  const group = chapter.livingTreeMembership?.group;
  return {
    id: chapter.id,
    title: chapter.title,
    status: chapter.status,
    group: group && !group.archivedAt ? { id: group.id, name: group.name } : null,
    observations: chapter.observations.map(({ observation }) =>
      serializeObservation(observation),
    ),
  };
}

/** Active confirmed background meaning. Foundations are context, never branches. */
export async function loadLivingTreeFoundations(userId: string) {
  const observations = await prisma.lifeObservation.findMany({
    where: {
      userId,
      status: "ACTIVE",
      memoryDestination: "BACKGROUND",
    },
    orderBy: [
      { lastConfirmedAt: { sort: "desc", nulls: "last" } },
      { confirmedAt: "desc" },
      { id: "asc" },
    ],
    select: OBSERVATION_DETAIL_SELECT,
  });

  return { observations: observations.map(serializeObservation) };
}
