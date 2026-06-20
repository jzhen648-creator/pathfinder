import { NextResponse } from "next/server";
import { z } from "zod";
import { aiRouteErrorResponse } from "@/lib/ai/ai-route-errors";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";
import { MapAiSyncRateLimitError, runMapAiSync } from "@/lib/map/ai-sync";
import { insightCacheToPayload } from "@/lib/insights/parse-insight-cache";
import { isReadingDrift } from "@/lib/insights/reading-cache-stale";
import { computeMapVersion, getMemoryVersion } from "@/lib/insights/compute-map-version";
import { prisma } from "@/lib/prisma";
import { InsightGenerationResponseError } from "@/lib/insights/generate-insights";

export const maxDuration = 120;

const bodySchema = z.object({
  force: z.boolean().optional(),
  clarifyTitles: z.boolean().optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

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

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const userId = auth.userId;

  try {
    const result = await runMapAiSync(userId, {
      force: parsed.data.force === true,
      enrichOptions: {
        clarifyTitles: parsed.data.clarifyTitles,
      },
    });
    console.info("[POST /api/map/ai-sync] metrics", result.metrics);

    const [mapVersion, memoryVersion] = await Promise.all([
      computeMapVersion(userId),
      getMemoryVersion(userId),
    ]);
    let insightRow = await prisma.insightCache.findUnique({ where: { userId } });

    if (!result.skipped && insightRow && result.insights.refreshed) {
      await prisma.insightCache.update({
        where: { userId },
        data: { mapVersion, memoryVersion },
      });
      insightRow = await prisma.insightCache.findUnique({ where: { userId } });
    }

    const insightDrift = insightRow
      ? isReadingDrift(insightRow, mapVersion, memoryVersion)
      : false;

    const insightsFresh = !result.skipped && (result.insights.refreshed || !insightDrift);

    const insightPayload = insightRow
      ? insightCacheToPayload(insightRow, insightsFresh ? false : insightDrift)
      : null;

    return NextResponse.json({
      ...result,
      synced: !result.skipped,
      memoryVersion,
      cache: {
        insights: insightPayload,
        story: null,
        storyGeneratedAt: null,
      },
    });
  } catch (err) {
    if (err instanceof MapAiSyncRateLimitError) {
      return NextResponse.json(
        {
          error: err.message,
          partial: err.partialResult,
          progress: err.partialResult.progress,
          metrics: err.partialResult.metrics,
        },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(err.retryAfterMs / 1000)) },
        },
      );
    }
    if (err instanceof GeminiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof InsightGenerationResponseError) {
      console.error("[POST /api/map/ai-sync] insight generation failed", err.message);
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    return aiRouteErrorResponse(err, "[POST /api/map/ai-sync]");
  }
}
