import { prisma } from "@/lib/prisma";
import { seedUserMemory } from "@/lib/memory/seed-memory";

function calculateAge(dateOfBirth: Date | null): number | null {
  if (!dateOfBirth) return null;
  const now = new Date();
  let age = now.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = now.getMonth() - dateOfBirth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dateOfBirth.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

/**
 * Life stage from ProfileFact (e.g. onboarding relationships/life_stage).
 * Included in formatUserContext for the next POST /api/insights run only —
 * does not bump InsightCache.memoryVersion; existing cached insights stay until
 * the user refreshes on the Now tab.
 */
async function loadLifeStageLine(userId: string): Promise<string | null> {
  const fact = await prisma.profileFact.findUnique({
    where: {
      userId_category_key: {
        userId,
        category: "relationships",
        key: "life_stage",
      },
    },
    select: { value: true },
  });
  if (!fact?.value.trim()) return null;
  return `Life stage: ${fact.value.trim()}`;
}

function appendSupplement(base: string, supplement: string): string {
  if (!supplement) return base;
  if (!base.trim()) return supplement;
  return `${base.trim()}\n${supplement}`;
}

async function formatManualProfileFallback(userId: string): Promise<string> {
  const profile = await prisma.userManualProfile.findUnique({
    where: { userId },
    select: {
      displayName: true,
      dateOfBirth: true,
      location: true,
      languages: true,
      occupation: true,
    },
  });

  const lifeStageLine = await loadLifeStageLine(userId);

  if (!profile) {
    if (!lifeStageLine) return "";
    return ["User context:", lifeStageLine].join("\n");
  }

  const lines = ["User context:"];
  if (profile.displayName) lines.push(`Name: ${profile.displayName}`);
  const age = calculateAge(profile.dateOfBirth);
  if (age !== null) lines.push(`Age: ${age}`);
  if (profile.location) lines.push(`Location: ${profile.location}`);
  if (profile.languages.length > 0) lines.push(`Languages: ${profile.languages.join(", ")}`);
  if (profile.occupation) lines.push(`Occupation: ${profile.occupation}`);
  if (lifeStageLine) lines.push(lifeStageLine);

  return lines.length > 1 ? lines.join("\n") : "";
}

export async function formatUserContext(userId: string): Promise<string> {
  const lifeStageLine = await loadLifeStageLine(userId);

  try {
    let memory = await prisma.userMemory.findUnique({
      where: { userId },
      select: { blob: true },
    });

    if (!memory?.blob.trim()) {
      const seeded = await seedUserMemory(userId);
      if (seeded?.blob.trim()) {
        return appendSupplement(`User context:\n${seeded.blob.trim()}`, lifeStageLine ?? "");
      }
      memory = await prisma.userMemory.findUnique({
        where: { userId },
        select: { blob: true },
      });
    }

    if (memory?.blob.trim()) {
      return appendSupplement(`User context:\n${memory.blob.trim()}`, lifeStageLine ?? "");
    }

    return await formatManualProfileFallback(userId);
  } catch (err) {
    console.warn("[formatUserContext] failed", err);
    try {
      return await formatManualProfileFallback(userId);
    } catch {
      return lifeStageLine ? `User context:\n${lifeStageLine}` : "";
    }
  }
}
