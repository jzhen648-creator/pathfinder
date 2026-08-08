import {
  LifeBackgroundCategory,
  LifeMemoryDestination,
  LifeObservationKind,
  LifeObservationStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

type ContextPackObservation = {
  id: string;
  canonicalText: string;
  kind: LifeObservationKind;
  memoryDestination: LifeMemoryDestination;
  backgroundCategory: LifeBackgroundCategory | null;
  temporalState: string;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  subjectLabel: string | null;
};

type ContextPackChapter = {
  id: string;
  title: string;
  status: string;
  themeId: string | null;
  background: string | null;
  currentFocus: string | null;
  timelineStart: Date | null;
  deadline: Date | null;
  observations: ContextPackObservation[];
};

export type ReviewContextPackInput = {
  generatedAt: Date;
  chapters: ContextPackChapter[];
  observations: ContextPackObservation[];
};

const CATEGORY_LABELS: Record<LifeBackgroundCategory, string> = {
  IDENTITY: "Identity",
  PEOPLE: "People",
  PLACES: "Places",
  WORK_QUALIFICATIONS: "Work and qualifications",
  ASSETS_FINANCES: "Assets and finances",
  HEALTH: "Health",
  PREFERENCES_CONSTRAINTS: "Preferences and constraints",
  OTHER: "Other background",
};

function dateOnly(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

function bullet(text: string): string {
  return `- ${text.trim()}`;
}

function uniqueTexts(observations: ContextPackObservation[]): string[] {
  const seen = new Set<string>();
  return observations.flatMap((observation) => {
    const text = observation.canonicalText.trim();
    const key = text.toLocaleLowerCase();
    if (!text || seen.has(key)) return [];
    seen.add(key);
    return [text];
  });
}

export function buildReviewContextPack(input: ReviewContextPackInput): string {
  const lines: string[] = [
    "# Review my Almanac",
    "",
    `Snapshot generated ${input.generatedAt.toISOString()}.`,
    "",
    "This is confirmed, curated Almanac memory—not a raw conversation transcript.",
    "Please compare it with what you know from our conversation. Do not invent facts.",
    "Return only: (1) outdated or contradicted information, (2) meaningful missing context,",
    "(3) changes that belong to an existing chapter, and (4) genuinely new chapters.",
    "Use exact dates when known, preserve uncertainty, and quote the Almanac wording you are correcting.",
    "",
    "## Active chapters",
  ];

  if (input.chapters.length === 0) lines.push("- None confirmed yet.");
  for (const chapter of input.chapters) {
    const meta = [
      chapter.status ? `status: ${chapter.status.toLocaleLowerCase()}` : null,
      chapter.themeId ? `theme: ${chapter.themeId}` : null,
      dateOnly(chapter.timelineStart) ? `started: ${dateOnly(chapter.timelineStart)}` : null,
      dateOnly(chapter.deadline) ? `target: ${dateOnly(chapter.deadline)}` : null,
    ].filter(Boolean);
    lines.push("", `### ${chapter.title}${meta.length ? ` (${meta.join(", ")})` : ""}`);
    if (chapter.currentFocus?.trim()) lines.push(bullet(`Current focus: ${chapter.currentFocus}`));
    if (chapter.background?.trim()) lines.push(bullet(`Context: ${chapter.background.trim()}`));
    const updates = uniqueTexts(chapter.observations).filter(
      (text) => !chapter.background?.toLocaleLowerCase().includes(text.toLocaleLowerCase()),
    );
    for (const update of updates) lines.push(bullet(`Confirmed update: ${update}`));
  }

  const unresolved = input.observations.filter(
    (observation) =>
      observation.temporalState === "UNRESOLVED" ||
      observation.kind === LifeObservationKind.OPEN_QUESTION ||
      observation.kind === LifeObservationKind.TENSION,
  );
  const unresolvedIds = new Set(unresolved.map((observation) => observation.id));
  const possibilities = input.observations.filter(
    (observation) => observation.memoryDestination === LifeMemoryDestination.POSSIBILITY,
  );
  const background = input.observations.filter(
    (observation) =>
      observation.memoryDestination === LifeMemoryDestination.BACKGROUND &&
      !unresolvedIds.has(observation.id),
  );

  lines.push("", "## Confirmed background");
  if (background.length === 0) lines.push("- None confirmed yet.");
  const grouped = new Map<LifeBackgroundCategory, ContextPackObservation[]>();
  for (const observation of background) {
    const category = observation.backgroundCategory ?? LifeBackgroundCategory.OTHER;
    grouped.set(category, [...(grouped.get(category) ?? []), observation]);
  }
  for (const [category, observations] of grouped) {
    lines.push("", `### ${CATEGORY_LABELS[category]}`);
    for (const text of uniqueTexts(observations)) lines.push(bullet(text));
  }

  lines.push("", "## Possibilities—not commitments");
  if (possibilities.length === 0) lines.push("- None currently kept.");
  for (const text of uniqueTexts(possibilities)) lines.push(bullet(text));

  lines.push("", "## Unresolved or conflicting");
  if (unresolved.length === 0) lines.push("- None currently marked unresolved.");
  for (const text of uniqueTexts(unresolved)) lines.push(bullet(text));

  lines.push(
    "",
    "## Response format",
    "",
    "For each suggested change, give:",
    "- Type: correct / update / add context / move chapter / new chapter / dismiss",
    "- Current Almanac wording (if correcting)",
    "- Proposed wording",
    "- Relevant chapter or background category",
    "- Effective date or 'date unknown'",
    "- Confidence and why",
  );
  return lines.join("\n").trim();
}

export async function createReviewContextPack(userId: string, now: Date = new Date()) {
  const [goals, observations] = await Promise.all([
    prisma.goal.findMany({
      where: { userId, archived: false, goalType: { notIn: ["moment", "event"] } },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: {
        id: true,
        title: true,
        status: true,
        themeId: true,
        background: true,
        currentFocus: true,
        timelineStart: true,
        deadline: true,
        observations: {
          where: { observation: { status: LifeObservationStatus.ACTIVE } },
          orderBy: { createdAt: "asc" },
          select: {
            observation: {
              select: {
                id: true,
                canonicalText: true,
                kind: true,
                memoryDestination: true,
                backgroundCategory: true,
                temporalState: true,
                effectiveFrom: true,
                effectiveTo: true,
                subjectLabel: true,
              },
            },
          },
        },
      },
    }),
    prisma.lifeObservation.findMany({
      where: {
        userId,
        status: LifeObservationStatus.ACTIVE,
        memoryDestination: {
          in: [LifeMemoryDestination.BACKGROUND, LifeMemoryDestination.POSSIBILITY],
        },
      },
      orderBy: [{ confirmedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        canonicalText: true,
        kind: true,
        memoryDestination: true,
        backgroundCategory: true,
        temporalState: true,
        effectiveFrom: true,
        effectiveTo: true,
        subjectLabel: true,
      },
    }),
  ]);

  const text = buildReviewContextPack({
    generatedAt: now,
    chapters: goals.map((goal) => ({
      ...goal,
      status: goal.status,
      observations: goal.observations.map((link) => link.observation),
    })),
    observations,
  });
  return {
    kind: "review_almanac" as const,
    generatedAt: now.toISOString(),
    text,
    counts: { chapters: goals.length, background: observations.length },
  };
}
