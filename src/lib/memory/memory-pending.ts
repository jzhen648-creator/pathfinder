import { prisma } from "@/lib/prisma";

const MAX_INCORPORATE_TEXT = 8000;

export type PendingMemorySource = {
  kind: "stream_session" | "stream_run";
  createdAt: Date;
  text: string;
};

/** Sessions and applied Stream runs after the incorporate watermark. */
export async function listPendingMemorySources(
  userId: string,
  since: Date,
): Promise<PendingMemorySource[]> {
  const [sessions, runs] = await Promise.all([
    prisma.streamSession.findMany({
      where: { userId, createdAt: { gt: since } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, inputText: true },
    }),
    prisma.streamRun.findMany({
      where: { userId, status: "applied", createdAt: { gt: since } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, rawInput: true },
    }),
  ]);

  const combined: PendingMemorySource[] = [
    ...sessions.map((row) => ({
      kind: "stream_session" as const,
      createdAt: row.createdAt,
      text: row.inputText.trim(),
    })),
    ...runs.map((row) => ({
      kind: "stream_run" as const,
      createdAt: row.createdAt,
      text: row.rawInput.trim(),
    })),
  ].filter((row) => row.text.length > 0);

  combined.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return combined;
}

export function countPendingMemorySources(sources: PendingMemorySource[]): number {
  return sources.length;
}

/** Most recent pending text first, capped for the update prompt. */
export function joinPendingMemoryText(sources: PendingMemorySource[]): string {
  if (sources.length === 0) return "";

  const chunks: string[] = [];
  let total = 0;

  for (let i = sources.length - 1; i >= 0; i -= 1) {
    const text = sources[i]!.text;
    const separator = chunks.length > 0 ? "\n\n---\n\n" : "";
    const nextLen = total + separator.length + text.length;
    if (nextLen > MAX_INCORPORATE_TEXT && chunks.length > 0) break;
    chunks.unshift(text);
    total = nextLen;
    if (total >= MAX_INCORPORATE_TEXT) break;
  }

  return chunks.join("\n\n---\n\n").slice(0, MAX_INCORPORATE_TEXT);
}
