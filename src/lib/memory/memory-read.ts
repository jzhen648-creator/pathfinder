import { prisma } from "@/lib/prisma";

/** Defensive cap — seed/update targets ~250 words; allow headroom for edits. */
export const MAX_IDENTITY_BLOB_CHARS = 1_500;

/** Load UserMemory.blob for AI WHO context — omitted when empty. */
export async function loadUserMemoryBlobForContext(userId: string): Promise<string | null> {
  const row = await prisma.userMemory.findUnique({
    where: { userId },
    select: { blob: true },
  });
  const trimmed = row?.blob?.trim();
  if (!trimmed) return null;
  if (trimmed.length <= MAX_IDENTITY_BLOB_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_IDENTITY_BLOB_CHARS).trim()}…`;
}
