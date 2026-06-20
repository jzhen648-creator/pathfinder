import type { ProfileFactCategory } from "@prisma/client";
import { loadUserMemoryBlobForContext } from "@/lib/memory/memory-read";
import { PROFILE_FACT_CATEGORIES } from "@/lib/profile-memory";
import { prisma } from "@/lib/prisma";

export const MAX_PROFILE_FACTS_IN_CONTEXT = 20;
export const MAX_PROFILE_FACTS_PER_CATEGORY = 3;

const PROFILE_FACT_CATEGORY_LABELS: Record<ProfileFactCategory, string> = {
  personal: "Personal",
  career: "Career",
  financial: "Financial",
  health: "Health",
  relationships: "Relationships",
  preferences: "Preferences",
  strengths: "Strengths",
};

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

function educationLevelLabel(level: string): string {
  switch (level) {
    case "secondary":
      return "Secondary school";
    case "further":
      return "Further education";
    case "higher":
      return "Higher education";
    default:
      return level;
  }
}

function employmentStatusLabel(status: string): string {
  switch (status) {
    case "EMPLOYED":
      return "Employed";
    case "SELF_EMPLOYED":
      return "Self-employed";
    case "STUDENT":
      return "Student";
    case "SEEKING_WORK":
      return "Seeking work";
    case "PREFER_NOT_TO_SAY":
      return "Prefer not to say";
    default:
      return status;
  }
}

function formatProfileFactKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "fact";
  return trimmed.replace(/_/g, " ");
}

/** Compact profile-fact lines for AI prompts — grouped by category, capped for token cost. */
export function formatProfileFactsForContext(
  facts: Array<{ category: ProfileFactCategory; key: string; value: string }>,
): string[] {
  const grouped = new Map<ProfileFactCategory, Array<{ key: string; value: string }>>();
  for (const fact of facts) {
    const value = fact.value.trim();
    if (!value) continue;
    const list = grouped.get(fact.category) ?? [];
    list.push({ key: fact.key, value });
    grouped.set(fact.category, list);
  }

  const lines: string[] = [];
  for (const category of PROFILE_FACT_CATEGORIES) {
    const rows = grouped.get(category);
    if (!rows?.length) continue;
    const label = PROFILE_FACT_CATEGORY_LABELS[category];
    for (const fact of rows.slice(0, MAX_PROFILE_FACTS_PER_CATEGORY)) {
      if (lines.length >= MAX_PROFILE_FACTS_IN_CONTEXT) return lines;
      lines.push(`${label}: ${formatProfileFactKey(fact.key)} — ${fact.value}`);
    }
  }
  return lines;
}

async function loadProfileFactsForContext(userId: string) {
  return prisma.profileFact.findMany({
    where: { userId },
    select: { category: true, key: true, value: true },
    orderBy: [{ category: "asc" }, { updatedAt: "desc" }],
  });
}

/**
 * WHO context for Story, Insights, and Reflect — manual profile, profile facts, and identity blob.
 * Pursuit map JSON carries structured WHAT context.
 */
export async function formatUserContext(userId: string): Promise<string> {
  const [profile, profileFacts, identityBlob] = await Promise.all([
    prisma.userManualProfile.findUnique({
      where: { userId },
      select: {
        displayName: true,
        dateOfBirth: true,
        location: true,
        educationLevel: true,
        employmentStatus: true,
        industry: true,
        jobTitle: true,
        occupation: true,
      },
    }),
    loadProfileFactsForContext(userId),
    loadUserMemoryBlobForContext(userId),
  ]);

  const lines: string[] = [];
  if (profile?.displayName?.trim()) lines.push(`Name: ${profile.displayName.trim()}`);
  const age = calculateAge(profile?.dateOfBirth ?? null);
  if (age !== null) lines.push(`Age: ${age}`);
  if (profile?.location?.trim()) lines.push(`Location: ${profile.location.trim()}`);
  if (profile?.educationLevel?.trim()) {
    lines.push(`Education: ${educationLevelLabel(profile.educationLevel.trim())}`);
  }
  if (profile?.employmentStatus?.trim()) {
    lines.push(`Employment: ${employmentStatusLabel(profile.employmentStatus.trim())}`);
  }
  const jobTitle = profile?.jobTitle?.trim() || profile?.occupation?.trim();
  if (jobTitle) {
    const industry = profile?.industry?.trim();
    lines.push(industry ? `Occupation: ${jobTitle} (${industry})` : `Occupation: ${jobTitle}`);
  }

  const factLines = formatProfileFactsForContext(profileFacts);
  const blocks: string[] = [];
  if (lines.length > 0) {
    blocks.push(["User context:", ...lines].join("\n"));
  }
  if (factLines.length > 0) {
    blocks.push(["Profile facts:", ...factLines].join("\n"));
  }
  if (identityBlob) {
    blocks.push(["Identity:", identityBlob].join("\n"));
  }

  return blocks.join("\n\n");
}
