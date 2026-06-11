import { computeMapVersion, getMemoryVersion } from "@/lib/insights/compute-map-version";
import { generateInsights } from "@/lib/insights/generate-insights";
import { insightCacheToPayload } from "@/lib/insights/parse-insight-cache";
import { GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";
import { generateStory } from "@/lib/story/generate-story";
import { isCurrentStoryPayload, storyCacheToPayload } from "@/lib/story/parse-story-cache";
import { TAXONOMY_VERSION } from "@/lib/taxonomy";
import {
  countPendingCaptures,
  digestAllPendingCaptures,
} from "@/lib/stream-pursuit-apply";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type MapAiSyncResult = {
  ok: true;
  mapVersion: string;
  skipped: boolean;
  digested: { runs: number; failed: number; errors: string[] };
  insights: { refreshed: boolean; skipped: boolean };
  story: { refreshed: boolean; skipped: boolean };
};

function isOlderThanOneDay(generatedAt: Date): boolean {
  return Date.now() - generatedAt.getTime() >= ONE_DAY_MS;
}

async function resolveVersions(userId: string) {
  const [mapVersion, memoryVersion, user] = await Promise.all([
    computeMapVersion(userId),
    getMemoryVersion(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { hubTaxonomyVersion: true },
    }),
  ]);
  return {
    mapVersion,
    memoryVersion,
    hubTaxonomyVersion: user?.hubTaxonomyVersion ?? null,
  };
}

function insightCacheStale(
  row: { mapVersion: string; memoryVersion: number },
  mapVersion: string,
  memoryVersion: number,
): boolean {
  return row.mapVersion !== mapVersion || row.memoryVersion !== memoryVersion;
}

function storyCacheStale(
  row: { mapVersion: string; memoryVersion: number; payload: string },
  mapVersion: string,
  memoryVersion: number,
  hubTaxonomyVersion: string | null,
): boolean {
  if (row.mapVersion !== mapVersion || row.memoryVersion !== memoryVersion) return true;
  if (hubTaxonomyVersion && hubTaxonomyVersion !== TAXONOMY_VERSION) return true;
  return !isCurrentStoryPayload(row.payload);
}

async function refreshInsightCache(userId: string, mapVersion: string, memoryVersion: number) {
  const generated = await generateInsights(userId);
  await prisma.insightCache.upsert({
    where: { userId },
    create: {
      userId,
      globalInsight: JSON.stringify(generated.global),
      themeInsights: generated.themes,
      hubInsights: generated.hubs,
      pursuitInsights: generated.pursuits,
      mapVersion,
      memoryVersion,
    },
    update: {
      globalInsight: JSON.stringify(generated.global),
      themeInsights: generated.themes,
      hubInsights: generated.hubs,
      pursuitInsights: generated.pursuits,
      generatedAt: new Date(),
      mapVersion,
      memoryVersion,
    },
  });
}

async function refreshStoryCache(
  userId: string,
  mapVersion: string,
  memoryVersion: number,
) {
  const generated = await generateStory(userId);
  const payloadJson = JSON.stringify(generated);
  await prisma.storyCache.upsert({
    where: { userId },
    create: {
      userId,
      payload: payloadJson,
      mapVersion,
      memoryVersion,
    },
    update: {
      payload: payloadJson,
      generatedAt: new Date(),
      mapVersion,
      memoryVersion,
    },
  });
}

export async function runMapAiSync(
  userId: string,
  options?: { force?: boolean },
): Promise<MapAiSyncResult> {
  if (!hasGeminiKey()) {
    throw new GeminiNotConfiguredError();
  }

  const force = options?.force === true;
  const pendingBefore = await countPendingCaptures(userId);
  const digested = await digestAllPendingCaptures(userId);

  const { mapVersion, memoryVersion, hubTaxonomyVersion } = await resolveVersions(userId);

  const [insightRow, storyRow] = await Promise.all([
    prisma.insightCache.findUnique({ where: { userId } }),
    prisma.storyCache.findUnique({ where: { userId } }),
  ]);

  const insightsStale =
    !insightRow ||
    insightCacheStale(insightRow, mapVersion, memoryVersion) ||
    isOlderThanOneDay(insightRow.generatedAt);
  const storyStale =
    !storyRow ||
    storyCacheStale(storyRow, mapVersion, memoryVersion, hubTaxonomyVersion) ||
    isOlderThanOneDay(storyRow.generatedAt);

  const workNeeded =
    force || pendingBefore > 0 || digested.processed > 0 || insightsStale || storyStale;

  if (!workNeeded) {
    return {
      ok: true,
      mapVersion,
      skipped: true,
      digested: { runs: 0, failed: digested.failed, errors: digested.errors },
      insights: { refreshed: false, skipped: true },
      story: { refreshed: false, skipped: true },
    };
  }

  let insightsRefreshed = false;
  let storyRefreshed = false;

  if (force || insightsStale || digested.processed > 0) {
    await refreshInsightCache(userId, mapVersion, memoryVersion);
    insightsRefreshed = true;
  }

  if (force || storyStale || digested.processed > 0) {
    await refreshStoryCache(userId, mapVersion, memoryVersion);
    storyRefreshed = true;
  }

  // Validate caches materialized (throws if corrupt — unlikely).
  if (insightsRefreshed) {
    const row = await prisma.insightCache.findUnique({ where: { userId } });
    if (!row || !insightCacheToPayload(row, false)) {
      throw new Error("Failed to store insights after sync");
    }
  }
  if (storyRefreshed) {
    const row = await prisma.storyCache.findUnique({ where: { userId } });
    if (!row || !storyCacheToPayload(row, false)) {
      throw new Error("Failed to store story after sync");
    }
  }

  return {
    ok: true,
    mapVersion,
    skipped: false,
    digested: {
      runs: digested.processed,
      failed: digested.failed,
      errors: digested.errors,
    },
    insights: { refreshed: insightsRefreshed, skipped: !insightsRefreshed },
    story: { refreshed: storyRefreshed, skipped: !storyRefreshed },
  };
}
