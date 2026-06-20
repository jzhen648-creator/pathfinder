import { Prisma, type PursuitContextEntryKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enrichAnswersSchema } from "@/lib/pursuit/pursuit-enrich-types";

const MAX_DESCRIPTION_CHARS = 2000;

export type PursuitContextLogEntry = {
  kind: PursuitContextEntryKind;
  text: string;
  metadata?: Prisma.InputJsonValue | null;
};

export type PursuitContextLogRow = {
  kind: PursuitContextEntryKind;
  text: string;
};

const AUTHORED_KINDS = new Set<PursuitContextEntryKind>([
  "create",
  "manual_edit",
  "stream_digest",
  "ai_merge",
]);

/** Latest authored prose for Goal.description — excludes quick-question answers (enrichAnswers). */
export function derivePursuitDescriptionFromLog(entries: PursuitContextLogRow[]): string {
  let authored = "";

  for (const entry of entries) {
    if (entry.kind === "clarifier_answer") {
      continue;
    }

    if (AUTHORED_KINDS.has(entry.kind)) {
      authored = entry.text.trim();
    }
  }

  return authored.slice(0, MAX_DESCRIPTION_CHARS);
}

export function clarifierAnswerLine(prompt: string, selectedOption: string): string {
  return `${prompt.trim()} → ${selectedOption.trim()}`;
}

export async function listPursuitContextEntries(
  goalId: string,
): Promise<PursuitContextLogRow[]> {
  const rows = await prisma.pursuitContextEntry.findMany({
    where: { goalId },
    orderBy: { createdAt: "asc" },
    select: { kind: true, text: true },
  });
  return rows;
}

export async function appendPursuitContextEntry(
  userId: string,
  goalId: string,
  entry: PursuitContextLogEntry,
): Promise<void> {
  const text = entry.text.trim();
  const allowEmpty = entry.kind === "manual_edit";
  if (!text && !allowEmpty) return;

  await prisma.pursuitContextEntry.create({
    data: {
      userId,
      goalId,
      kind: entry.kind,
      text: (text || "").slice(0, MAX_DESCRIPTION_CHARS),
      metadata: entry.metadata ?? undefined,
    },
  });
}

/** Rebuild Goal.description from append-only log entries. */
export async function syncGoalDescriptionFromLog(goalId: string): Promise<string> {
  const entries = await listPursuitContextEntries(goalId);
  const description = derivePursuitDescriptionFromLog(entries);
  await prisma.goal.update({
    where: { id: goalId },
    data: { description },
  });
  return description;
}

export async function appendPursuitContextEntryAndSync(
  userId: string,
  goalId: string,
  entry: PursuitContextLogEntry,
): Promise<string> {
  await appendPursuitContextEntry(userId, goalId, entry);
  return syncGoalDescriptionFromLog(goalId);
}

export function normalizeRelationshipPair(goalAId: string, goalBId: string): [string, string] {
  return goalAId < goalBId ? [goalAId, goalBId] : [goalBId, goalAId];
}

/** Remove QQ mirror lines still present in description prose (migration / belt-and-suspenders). */
export function stripMirroredClarifierLinesFromDescription(
  description: string,
  enrichAnswers: Array<{ prompt: string; selectedOption: string }>,
): string {
  if (!description.trim() || enrichAnswers.length === 0) return description;

  const kept = description
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !enrichAnswers.some(
          (answer) => line === clarifierAnswerLine(answer.prompt, answer.selectedOption).trim(),
        ),
    );

  return kept.join("\n");
}

/** One-time batch: rebuild descriptions without QQ prose before structured map_context ships. */
export async function migrateStripQqProseFromDescriptions(): Promise<{
  scanned: number;
  updated: number;
}> {
  const goalRows = await prisma.goal.findMany({
    where: {
      OR: [
        { contextEntries: { some: {} } },
        { enrichAnswers: { not: Prisma.DbNull } },
      ],
    },
    select: { id: true, enrichAnswers: true, description: true },
  });

  let updated = 0;
  for (const goal of goalRows) {
    const rebuilt = await syncGoalDescriptionFromLog(goal.id);
    const parsed = enrichAnswersSchema.safeParse(goal.enrichAnswers);
    const answers = parsed.success ? parsed.data : [];
    const finalDescription = stripMirroredClarifierLinesFromDescription(rebuilt, answers);

    if (finalDescription !== goal.description) {
      await prisma.goal.update({
        where: { id: goal.id },
        data: { description: finalDescription },
      });
      updated += 1;
    }
  }

  return { scanned: goalRows.length, updated };
}
