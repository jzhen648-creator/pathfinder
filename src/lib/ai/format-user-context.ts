import { prisma } from "@/lib/prisma";

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

/**
 * Thin WHO context for Story and Insights — name, age, location from manual profile.
 * Map marks and pursuits carry structured life context; no memory blob.
 */
export async function formatUserContext(userId: string): Promise<string> {
  const [profile, lifeStageLine] = await Promise.all([
    prisma.userManualProfile.findUnique({
      where: { userId },
      select: {
        displayName: true,
        dateOfBirth: true,
        location: true,
      },
    }),
    loadLifeStageLine(userId),
  ]);

  const lines: string[] = [];
  if (profile?.displayName?.trim()) lines.push(`Name: ${profile.displayName.trim()}`);
  const age = calculateAge(profile?.dateOfBirth ?? null);
  if (age !== null) lines.push(`Age: ${age}`);
  if (profile?.location?.trim()) lines.push(`Location: ${profile.location.trim()}`);
  if (lifeStageLine) lines.push(lifeStageLine);

  if (lines.length === 0) return "";
  return ["User context:", ...lines].join("\n");
}
