import { NextResponse } from "next/server";
import { z } from "zod";
import { aiRouteErrorResponse } from "@/lib/ai/ai-route-errors";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";
import { runMapAiSync } from "@/lib/map/ai-sync";
import { insightCacheToPayload } from "@/lib/insights/parse-insight-cache";
import { computeMapVersion, getMemoryVersion } from "@/lib/insights/compute-map-version";
import { storyCacheToPayload } from "@/lib/story/parse-story-cache";
import { prisma } from "@/lib/prisma";
import { InsightGenerationResponseError } from "@/lib/insights/generate-insights";
import { StoryGenerationResponseError } from "@/lib/story/generate-story";

const bodySchema = z.object({
  force: z.boolean().optional(),
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
    const result = await runMapAiSync(userId, { force: parsed.data.force === true });

    const [mapVersion, memoryVersion, insightRow, storyRow] = await Promise.all([
      computeMapVersion(userId),
      getMemoryVersion(userId),
      prisma.insightCache.findUnique({ where: { userId } }),
      prisma.storyCache.findUnique({ where: { userId } }),
    ]);

    const insightPayload = insightRow
      ? insightCacheToPayload(
          insightRow,
          insightRow.mapVersion !== mapVersion || insightRow.memoryVersion !== memoryVersion,
        )
      : null;
    const storyPayload = storyRow ? storyCacheToPayload(storyRow, false) : null;

    return NextResponse.json({
      ...result,
      cache: {
        insights: insightPayload,
        story: storyPayload,
        storyGeneratedAt: storyRow?.generatedAt.toISOString() ?? null,
      },
    });
  } catch (err) {
    if (err instanceof GeminiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof InsightGenerationResponseError || err instanceof StoryGenerationResponseError) {
      return NextResponse.json({ error: err.message }, { status: err.status ?? 502 });
    }
    return aiRouteErrorResponse(err, "[POST /api/map/ai-sync]");
  }
}
