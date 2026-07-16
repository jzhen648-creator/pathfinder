import type { InsightLevelPayload } from "@/lib/insights/insight-types";
import {
  benchmarkFactsApplicable,
  flattenBenchmarkPursuitsFromMapContext,
  type BenchmarkPursuitRow,
} from "@/lib/insights/benchmark-facts";
import { themeHasConfirmedLinks } from "@/lib/insights/theme-relationship-eligibility";
import { formatMapContext } from "@/lib/ai/format-map-context";
import {
  collectChapterAgeFacts,
  gateMisappliedCurrentAgeProse,
} from "@/lib/ai/temporal-age-gate";
import {
  gateThemeCombined,
  gateThemeContextual,
  gateThemeContextualContent,
  gateThemeInsightProse,
  gateThemeReflective,
  significantClarityTokens,
  type ThemeLinkGateRow,
  type ThemeContextualGateInput,
} from "@/lib/pursuit/pursuit-enrich-readiness";
import { loadPursuitSignalsByTheme } from "@/lib/pursuit/load-pursuit-signals";
import { prisma } from "@/lib/prisma";

async function loadUserAgeLocation(userId: string): Promise<{
  age: number | null;
  location: string | null;
  dateOfBirth: Date | null;
}> {
  const profile = await prisma.userManualProfile.findUnique({
    where: { userId },
    select: { dateOfBirth: true, location: true },
  });
  if (!profile) return { age: null, location: null, dateOfBirth: null };

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
    dateOfBirth: profile.dateOfBirth,
  };
}

async function loadPursuitThemeMap(userId: string): Promise<Map<string, string>> {
  const goals = await prisma.goal.findMany({
    where: { userId, archived: false },
    select: { id: true, themeId: true },
  });
  return new Map(goals.map((g) => [g.id, g.themeId ?? "becoming"]));
}

async function loadConfirmedRelationships(userId: string): Promise<ThemeLinkGateRow[]> {
  const rows = await prisma.pursuitRelationship.findMany({
    where: { userId },
    select: {
      goalAId: true,
      goalBId: true,
      label: true,
      goalA: { select: { title: true } },
      goalB: { select: { title: true } },
    },
  });
  return rows.map((row) => ({
    goalAId: row.goalAId,
    goalBId: row.goalBId,
    label: row.label,
    goalATitle: row.goalA.title,
    goalBTitle: row.goalB.title,
  }));
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
  const chapterAgeFacts = collectChapterAgeFacts(mapContext, profile.dateOfBirth);

  const gated: Record<string, InsightLevelPayload> = {};
  for (const [themeId, entry] of Object.entries(themes)) {
    const themeAgeFacts = chapterAgeFacts.filter((fact) => fact.themeId === themeId);
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
    const combined = gateMisappliedCurrentAgeProse(
      gateThemeCombined(entry.combined?.trim() ?? "", hasLinks),
      profile.age,
      themeAgeFacts,
    );
    const contextual = gateMisappliedCurrentAgeProse(
      gateThemeContextualContent(
        gateThemeContextual(entry.contextual?.trim() ?? "", themeSignals, gateInput),
      ),
      profile.age,
      themeAgeFacts,
    );
    const reflectiveAfterLinks = gateThemeReflective(
      entry.reflective?.trim() ?? "",
      themeId,
      relationships,
      pursuitThemeMap,
    );
    const knownTitleTokens = themeSignals.flatMap((signal) =>
      significantClarityTokens(signal.title),
    );
    const amountFallback = themePursuits
      .map((row) => {
        const current = row.currentAmount;
        const target = row.targetAmount;
        if (current != null && target != null && target > 0) {
          return `${row.title}: ${current} of ${target}`;
        }
        return "";
      })
      .find((line) => line.length > 0);

    const { oneLiner, reflective } = gateThemeInsightProse({
      oneLiner: gateMisappliedCurrentAgeProse(
        entry.oneLiner?.trim() ?? "",
        profile.age,
        themeAgeFacts,
      ),
      reflective: gateMisappliedCurrentAgeProse(reflectiveAfterLinks, profile.age, themeAgeFacts),
      knownTitleTokens,
      fallbackOneLiner: amountFallback,
    });

    gated[themeId] = {
      ...entry,
      oneLiner: oneLiner ?? "",
      reflective: reflective ?? "",
      contextual,
      combined,
    };
  }
  return gated;
}

export { benchmarkPursuitsForTheme };
