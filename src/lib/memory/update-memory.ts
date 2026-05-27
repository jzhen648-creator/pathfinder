import { generateText, GeminiNotConfiguredError } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";
import { markUserMemoryDirty, writeUserMemory, type UserMemoryRow } from "@/lib/memory/memory-write";
import { seedUserMemory } from "@/lib/memory/seed-memory";

const USER_EDIT_PRESERVE_MS = 7 * 24 * 60 * 60 * 1000;

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

function userRecentlyEdited(lastUserEditedAt: Date | null): boolean {
  if (!lastUserEditedAt) return false;
  return Date.now() - lastUserEditedAt.getTime() < USER_EDIT_PRESERVE_MS;
}

/**
 * Evolve UserMemory from raw Stream conversation text. Does not read map data.
 */
export async function updateUserMemory(
  userId: string,
  sessionText: string,
): Promise<UserMemoryRow | null> {
  const text = sessionText.trim();
  if (!text) return null;

  let memory = await prisma.userMemory.findUnique({ where: { userId } });
  if (!memory?.blob.trim()) {
    memory = await seedUserMemory(userId);
  }

  const currentBlob = memory?.blob.trim() || "(none yet)";
  const preserveUserEdits = userRecentlyEdited(memory?.lastUserEditedAt ?? null);

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
    });

    if (!blob.trim()) {
      await markUserMemoryDirty(userId);
      return null;
    }

    return await writeUserMemory({
      userId,
      blob,
      incrementStreamSessionCount: true,
      clearDirty: true,
    });
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
