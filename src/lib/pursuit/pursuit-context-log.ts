import type { Prisma, PursuitContextEntryKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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

/** Concatenate log lines for Goal.description cache (AI + mobile display). */
export function derivePursuitDescriptionFromLog(entries: PursuitContextLogRow[]): string {
  const clarifierLines: string[] = [];
  const clarifierSeen = new Set<string>();
  let authored = "";

  for (const entry of entries) {
    const trimmed = entry.text.trim();
    if (!trimmed) continue;

    if (entry.kind === "clarifier_answer") {
      if (!clarifierSeen.has(trimmed)) {
        clarifierSeen.add(trimmed);
        clarifierLines.push(trimmed);
      }
      continue;
    }

    if (AUTHORED_KINDS.has(entry.kind)) {
      authored = trimmed;
    }
  }

  const parts: string[] = [];
  if (authored) parts.push(authored);
  for (const line of clarifierLines) {
    if (!parts.includes(line)) parts.push(line);
  }

  return parts.join("\n").slice(0, MAX_DESCRIPTION_CHARS);
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
  if (!text) return;

  await prisma.pursuitContextEntry.create({
    data: {
      userId,
      goalId,
      kind: entry.kind,
      text: text.slice(0, MAX_DESCRIPTION_CHARS),
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
