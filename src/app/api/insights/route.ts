import { NextResponse } from "next/server";

import { requireApiSessionUserId } from "@/lib/api-auth";

import { computeMapVersion, getMemoryVersion } from "@/lib/insights/compute-map-version";

import { applyThemeInsightGatesToPayload } from "@/lib/insights/apply-theme-insight-gates";
import { insightCacheToPayload } from "@/lib/insights/parse-insight-cache";

import { prisma } from "@/lib/prisma";

async function resolveVersions(userId: string) {
  const [mapVersion, memoryVersion] = await Promise.all([
    computeMapVersion(userId),
    getMemoryVersion(userId),
  ]);

  return { mapVersion, memoryVersion };
}

function isCacheStale(
  row: { mapVersion: string; memoryVersion: number },
  mapVersion: string,
  memoryVersion: number,
): boolean {
  return row.mapVersion !== mapVersion || row.memoryVersion !== memoryVersion;
}

export async function GET() {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  const userId = auth.userId;

  try {
    const { mapVersion, memoryVersion } = await resolveVersions(userId);
    const row = await prisma.insightCache.findUnique({ where: { userId } });

    if (!row) {
      return NextResponse.json({ cache: null, mapVersion, memoryVersion });
    }

    const stale = isCacheStale(row, mapVersion, memoryVersion);
    const payload = insightCacheToPayload(row, stale);
    if (!payload) {
      return NextResponse.json({ cache: null, mapVersion, memoryVersion });
    }

    const gatedPayload = await applyThemeInsightGatesToPayload(userId, payload);

    return NextResponse.json({
      cache: gatedPayload,
      mapVersion,
      memoryVersion,
      canAutoRefresh: stale,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load insights";
    console.error("[GET /api/insights]", err);
    return NextResponse.json({ error: message, cache: null }, { status: 500 });
  }
}

/** Retired — use POST /api/map/ai-sync for reading refresh. */
export async function POST() {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  return NextResponse.json(
    { error: "Insight refresh moved to POST /api/map/ai-sync." },
    { status: 410 },
  );
}
