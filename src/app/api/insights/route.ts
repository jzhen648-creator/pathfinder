import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { computeMapVersion, getMemoryVersion } from "@/lib/insights/compute-map-version";
import { generateInsights } from "@/lib/insights/generate-insights";
import { insightCacheToPayload } from "@/lib/insights/parse-insight-cache";
import { GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const refreshBodySchema = z.object({
  force: z.boolean().optional(),
});

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

function isOlderThanOneDay(generatedAt: Date): boolean {
  return Date.now() - generatedAt.getTime() >= ONE_DAY_MS;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
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

  return NextResponse.json({
    cache: payload,
    mapVersion,
    memoryVersion,
    canAutoRefresh: stale || isOlderThanOneDay(row.generatedAt),
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasGeminiKey()) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured." }, { status: 503 });
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const parsedBody = refreshBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const userId = session.user.id;
  const force = parsedBody.data.force === true;
  const { mapVersion, memoryVersion } = await resolveVersions(userId);
  const existing = await prisma.insightCache.findUnique({ where: { userId } });

  if (existing && !force) {
    const stale = isCacheStale(existing, mapVersion, memoryVersion);
    const freshEnough = !isOlderThanOneDay(existing.generatedAt);
    if (!stale && freshEnough) {
      const payload = insightCacheToPayload(existing, false);
      if (payload) {
        return NextResponse.json({ cache: payload, refreshed: false });
      }
    }
  }

  try {
    const generated = await generateInsights(userId);
    const row = await prisma.insightCache.upsert({
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

    const payload = insightCacheToPayload(row, false);
    if (!payload) {
      return NextResponse.json({ error: "Failed to store insights" }, { status: 500 });
    }

    return NextResponse.json({ cache: payload, refreshed: true });
  } catch (err) {
    if (err instanceof GeminiNotConfiguredError) {
      return NextResponse.json({ error: "GEMINI_API_KEY not configured." }, { status: 503 });
    }
    console.error("[insights] refresh failed", err);
    const message = err instanceof Error ? err.message : "Insight generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
