import type { InsightLevelPayload } from "@/lib/insights/insight-types";
import {
  benchmarkFactsApplicable,
  flattenBenchmarkPursuitsFromMapContext,
  type BenchmarkPursuitRow,
} from "@/lib/insights/benchmark-facts";
import { themeHasConfirmedLinks } from "@/lib/insights/theme-relationship-eligibility";
import { formatMapContext } from "@/lib/ai/format-map-context";
import {
  gateThemeCombined,
  gateThemeContextual,
  type ThemeContextualGateInput,
} from "@/lib/pursuit/pursuit-enrich-readiness";
import { loadPursuitSignalsByTheme } from "@/lib/pursuit/load-pursuit-signals";
import { prisma } from "@/lib/prisma";

async function loadUserAgeLocation(userId: string): Promise<{ age: number | null; location: string | null }> {
  const profile = await prisma.userManualProfile.findUnique({
    where: { userId },
    select: { dateOfBirth: true, location: true },
  });
  if (!profile) return { age: null, location: null };

  let age: number | null = null;
  if (profile.dateOfBirth) {
    const now = new Date();
    age = now.getFullYear() - profile.dateOfBirth.getFullYear();
    const monthDiff = now.getMonth() - profile.dateOfBirth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < profile.dateOfBirth.getDate())) {
      age -= 1;
    }
    if (age < 0) age = null;
  }

  return {
    age,
    location: profile.location?.trim() || null,
  };
}

async function loadPursuitThemeMap(userId: string): Promise<Map<string, string>> {
  const goals = await prisma.goal.findMany({
    where: { userId, archived: false },
    select: { id: true, themeId: true },
  });
  return new Map(goals.map((g) => [g.id, g.themeId ?? "becoming"]));
}

async function loadConfirmedRelationships(userId: string) {
  return prisma.pursuitRelationship.findMany({
    where: { userId },
    select: { goalAId: true, goalBId: true },
  });
}

function benchmarkPursuitsForTheme(
  all: BenchmarkPursuitRow[],
  themeId: string,
): BenchmarkPursuitRow[] {
  return all.filter((p) => p.themeId === themeId);
}

/** Strip theme contextual/combined using benchmark + relationship gates. */
export async function gateThemeInsightsPatch(
  userId: string,
  themes: Record<string, InsightLevelPayload>,
): Promise<Record<string, InsightLevelPayload>> {
  const themeIds = Object.keys(themes);
  if (themeIds.length === 0) return themes;

  const [signalsByTheme, profile, pursuitThemeMap, relationships, mapContext] = await Promise.all([
    loadPursuitSignalsByTheme(userId, themeIds),
    loadUserAgeLocation(userId),
    loadPursuitThemeMap(userId),
    loadConfirmedRelationships(userId),
    formatMapContext(userId),
  ]);
  const allBenchmarkPursuits = flattenBenchmarkPursuitsFromMapContext(mapContext);

  const gated: Record<string, InsightLevelPayload> = {};
  for (const [themeId, entry] of Object.entries(themes)) {
    const themeSignals = signalsByTheme.get(themeId) ?? [];
    const themePursuits = benchmarkPursuitsForTheme(allBenchmarkPursuits, themeId);
    const benchmarkApplicable = benchmarkFactsApplicable(
      themeId,
      allBenchmarkPursuits,
      profile.age,
      profile.location,
    );
    const gateInput: ThemeContextualGateInput = {
      themeId,
      age: profile.age,
      location: profile.location,
      benchmarkApplicable,
    };
    const hasLinks = themeHasConfirmedLinks(themeId, relationships, pursuitThemeMap);

    gated[themeId] = {
      ...entry,
      contextual: gateThemeContextual(entry.contextual?.trim() ?? "", themeSignals, gateInput),
      combined: gateThemeCombined(entry.combined?.trim() ?? "", hasLinks),
    };
  }
  return gated;
}

export { benchmarkPursuitsForTheme };
