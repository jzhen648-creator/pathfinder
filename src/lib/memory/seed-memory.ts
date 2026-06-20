import { generateText, GeminiNotConfiguredError } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";
import { writeUserMemory, type UserMemoryRow } from "@/lib/memory/memory-write";

const SEED_SYSTEM = `You write personal context summaries for Pathfinder, a life-mapping app.
Output plain prose only — no JSON, no bullet lists unless they read naturally as short sections.
Stay under 250 words. Use a natural, grounded tone that reflects who this person is — not a LinkedIn bio.
Cover: who they are, what phase of life they're in, how they operate.
Do not list goals or achievements. Do not over-polish — preserve their register when source material is informal.`;

function formatManualProfileBlock(profile: {
  displayName: string | null;
  dateOfBirth: Date | null;
  location: string | null;
  languages: string[];
  occupation: string | null;
} | null): string {
  if (!profile) return "(none)";
  const lines: string[] = [];
  if (profile.displayName) lines.push(`Name: ${profile.displayName}`);
  if (profile.dateOfBirth) {
    lines.push(`Date of birth: ${profile.dateOfBirth.toISOString().slice(0, 10)}`);
  }
  if (profile.location) lines.push(`Location: ${profile.location}`);
  if (profile.languages.length > 0) lines.push(`Languages: ${profile.languages.join(", ")}`);
  if (profile.occupation) lines.push(`Occupation: ${profile.occupation}`);
  return lines.length > 0 ? lines.join("\n") : "(none)";
}

type ManualProfileSeed = {
  displayName: string | null;
  dateOfBirth: Date | null;
  location: string | null;
  languages: string[];
  occupation: string | null;
} | null;

function buildSeedUserMessage(input: { manualProfile: ManualProfileSeed }): string {
  return ["Manual profile fields:", formatManualProfileBlock(input.manualProfile)].join("\n");
}

/**
 * Create the first UserMemory row from manual profile data.
 * No-op when a row already exists.
 */
export async function seedUserMemory(userId: string): Promise<UserMemoryRow | null> {
  const existing = await prisma.userMemory.findUnique({ where: { userId } });
  if (existing?.blob.trim()) {
    return existing;
  }
  if (existing?.lastUserEditedAt) {
    return existing;
  }

  const manualProfile = await prisma.userManualProfile.findUnique({
    where: { userId },
    select: {
      displayName: true,
      dateOfBirth: true,
      location: true,
      languages: true,
      occupation: true,
    },
  });

  if (!manualProfile) return existing ?? null;

  try {
    const blob = await generateText({
      system: SEED_SYSTEM,
      messages: [
        {
          role: "user",
          content: buildSeedUserMessage({ manualProfile }),
        },
      ],
      maxTokens: 600,
      temperature: 0.35,
    });

    if (!blob.trim()) return existing;

    return await writeUserMemory({
      userId,
      blob,
      clearDirty: true,
    });
  } catch (err) {
    if (err instanceof GeminiNotConfiguredError) {
      console.warn("[seedUserMemory] Gemini not configured — skipping seed");
      return existing;
    }
    console.error("[seedUserMemory] failed", err);
    return existing;
  }
}
