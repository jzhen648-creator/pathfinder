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

  if (!profile) return "";

  const lines = ["User context:"];
  if (profile.displayName) lines.push(`Name: ${profile.displayName}`);
  const age = calculateAge(profile.dateOfBirth);
  if (age !== null) lines.push(`Age: ${age}`);
  if (profile.location) lines.push(`Location: ${profile.location}`);
  if (profile.languages.length > 0) lines.push(`Languages: ${profile.languages.join(", ")}`);
  if (profile.occupation) lines.push(`Occupation: ${profile.occupation}`);

  return lines.length > 1 ? lines.join("\n") : "";
}

export async function formatUserContext(userId: string): Promise<string> {
  try {
    let memory = await prisma.userMemory.findUnique({
      where: { userId },
      select: { blob: true },
    });

    if (!memory?.blob.trim()) {
      const seeded = await seedUserMemory(userId);
      if (seeded?.blob.trim()) {
        return `User context:\n${seeded.blob.trim()}`;
      }
      memory = await prisma.userMemory.findUnique({
        where: { userId },
        select: { blob: true },
      });
    }

    if (memory?.blob.trim()) {
      return `User context:\n${memory.blob.trim()}`;
    }

    return await formatManualProfileFallback(userId);
  } catch (err) {
    console.warn("[formatUserContext] failed", err);
    try {
      return await formatManualProfileFallback(userId);
    } catch {
      return "";
    }
  }
}
