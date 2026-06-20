import { generateText, GeminiNotConfiguredError } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";
import { markUserMemoryDirty, writeUserMemory, type UserMemoryRow } from "@/lib/memory/memory-write";
import { seedUserMemory } from "@/lib/memory/seed-memory";

const UPDATE_SYSTEM = `You update a personal context summary for Pathfinder.
Output plain prose only — no JSON. Stay under 250 words.

Rules:
- Rewrite the full summary incorporating any new identity-level signals from the conversation.
- If there is no current summary yet, write the first summary from this conversation.
- Do NOT name specific goals, projects, tasks, marks, milestones, hubs, or named work items.
- Only capture who this person is, what phase of life they're in, how they think and operate.
- If something has changed, update it. If something is confirmed, sharpen it.
- Write in a natural, grounded tone that reflects how this person talks.
- Distil their meaning, not their exact words. Do not make them sound more confident or polished than they are.`;

type UpdateUserMemoryOptions = {
  /** User-initiated incorporate while manual-edit pause is active. */
  forceIncorporate?: boolean;
};

function buildUpdateUserMessage(input: {
  currentBlob: string;
  sessionText: string;
  preserveUserEdits: boolean;
}): string {
  const preserveNote = input.preserveUserEdits
    ? "\n\nThe user recently edited their summary manually. Preserve their edits and blend new signals around them."
    : "";

  return [
    "Current summary:",
    input.currentBlob.trim() || "(empty)",
    "",
    "New conversation:",
    input.sessionText.trim(),
    preserveNote,
  ].join("\n");
}

export async function countPendingIncorporateForUser(_userId: string): Promise<number> {
  return 0;
}

/** Advance incorporate watermark after a successful merge — pause persists, already-folded sessions excluded. */
export async function advanceIncorporateWatermark(userId: string): Promise<void> {
  await prisma.userMemory.update({
    where: { userId },
    data: {
      lastUserEditedAt: new Date(),
      isDirty: false,
    },
  });
}

/**
 * Evolve UserMemory from conversation text. Does not read map data.
 * When `lastUserEditedAt` is set, auto updates pause and mark dirty instead of overwriting.
 */
export async function updateUserMemory(
  userId: string,
  sessionText: string,
  options: UpdateUserMemoryOptions = {},
): Promise<UserMemoryRow | null> {
  const text = sessionText.trim();
  if (!text) return null;

  let memory = await prisma.userMemory.findUnique({ where: { userId } });
  if (!memory?.blob.trim() && !memory?.lastUserEditedAt) {
    memory = await seedUserMemory(userId);
  }

  if (memory?.lastUserEditedAt && !options.forceIncorporate) {
    await markUserMemoryDirty(userId);
    return null;
  }

  const currentBlob = memory?.blob.trim() || "(none yet)";
  const preserveUserEdits = Boolean(memory?.lastUserEditedAt) || options.forceIncorporate === true;

  try {
    const blob = await generateText({
      system: UPDATE_SYSTEM,
      messages: [
        {
          role: "user",
          content: buildUpdateUserMessage({
            currentBlob,
            sessionText: text,
            preserveUserEdits,
          }),
        },
      ],
      maxTokens: 600,
      temperature: 0.3,
      queueKey: userId,
    });

    if (!blob.trim()) {
      await markUserMemoryDirty(userId);
      return null;
    }

    const row = await writeUserMemory({
      userId,
      blob,
      clearDirty: true,
    });

    if (options.forceIncorporate) {
      await advanceIncorporateWatermark(userId);
      return (
        (await prisma.userMemory.findUnique({ where: { userId } })) ??
        row
      );
    }

    return row;
  } catch (err) {
    if (err instanceof GeminiNotConfiguredError) {
      console.warn("[updateUserMemory] Gemini not configured — marking dirty");
    } else {
      console.error("[updateUserMemory] failed", err);
    }
    await markUserMemoryDirty(userId);
    return null;
  }
}

/** Retired with Stream — nothing pending to incorporate. */
export async function incorporatePendingMemory(_userId: string): Promise<UserMemoryRow | null> {
  return null;
}
