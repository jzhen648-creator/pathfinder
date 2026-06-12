import { z } from "zod";
import { formatMapContext } from "@/lib/ai/format-map-context";
import { formatUserContext } from "@/lib/ai/format-user-context";
import {
  finalizeInsightGeneration,
  INSIGHT_GENERATION_SYSTEM_PROMPT,
  InsightGenerationResponseError,
} from "@/lib/insights/generate-insights";
import { insightGenerationSchema, type InsightGenerationResult } from "@/lib/insights/insight-types";
import { LIFE_AREA_IDS } from "@/lib/taxonomy";
import { generateJsonCompletion, GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";
import {
  buildStorySystemPrompt,
  countMapPursuits,
  StoryGenerationResponseError,
} from "@/lib/story/generate-story";
import { sanitizeStoryGeneration } from "@/lib/story/sanitize-story";
import {
  STORY_SCHEMA_VERSION,
  storyGenerationSchema,
  type StoryGenerationResult,
} from "@/lib/story/story-types";

export class ReadingSyncGenerationResponseError extends Error {
  status = 503;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ReadingSyncGenerationResponseError";
  }
}

const readingSyncGenerationSchema = z.object({
  insights: insightGenerationSchema,
  story: storyGenerationSchema,
});

export type ReadingSyncGenerationResult = {
  insights: InsightGenerationResult;
  story: StoryGenerationResult;
};

function stripMarkdownFence(raw: string): string {
  const t = raw.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(t);
  return m?.[1]?.trim() ?? t;
}

function buildCombinedSystemPrompt(totalPursuitCount: number): string {
  return [
    "You generate Pathfinder reading output in ONE JSON response with two top-level keys: insights and story.",
    "Use the same life map context for both. Do not contradict facts between them.",
    "story.seasonRead is the whole-map Insights tab reading — reflective prose only.",
    "insights holds per-theme, per-hub, per-pursuit sparkle cache plus global — not duplicated in seasonRead verbatim.",
    "",
    "=== insights rules ===",
    INSIGHT_GENERATION_SYSTEM_PROMPT,
    "",
    "=== story rules ===",
    buildStorySystemPrompt(totalPursuitCount),
  ].join("\n");
}

function buildCombinedUserMessage(
  mapJson: string,
  userContext: string,
  totalPursuitCount: number,
): string {
  const themeIds = LIFE_AREA_IDS.join(", ");
  return [
    userContext || "(No profile context yet.)",
    "",
    `Total pursuits on map: ${totalPursuitCount}`,
    "",
    "Life map JSON:",
    mapJson,
    "",
    'Return JSON: { "insights": { global, themes, hubs, pursuits }, "story": { schemaVersion, seasonRead } }.',
    "",
    "insights:",
    `- Include theme keys only for ids present in the map (${themeIds}).`,
    "- Include every hub id and every pursuit id from the map in hubs and pursuits objects.",
    "- Pursuit entries use { tone, headline, body } — not the theme/hub four-field schema.",
    "- global.sections: use short ALL-CAPS titles like MOMENTUM, ATTENTION, INTERESTING.",
    "",
    "story:",
    `- schemaVersion must be "${STORY_SCHEMA_VERSION}".`,
    "- seasonRead follows the story rules above for this map depth.",
    "",
    "Keep the full JSON response under 6000 output tokens — compact strings, no markdown.",
  ].join("\n");
}

/** Single Gemini call for insight cache + season read (ai-sync primary path). */
export async function generateInsightsAndStory(
  userId: string,
): Promise<ReadingSyncGenerationResult> {
  if (!hasGeminiKey()) {
    throw new GeminiNotConfiguredError();
  }

  const [mapContext, userContext] = await Promise.all([
    formatMapContext(userId, { excludeAbandoned: true }),
    formatUserContext(userId),
  ]);

  const totalPursuitCount = countMapPursuits(mapContext);
  const mapJson = JSON.stringify(mapContext, null, 2);

  const raw = await generateJsonCompletion({
    system: buildCombinedSystemPrompt(totalPursuitCount),
    user: buildCombinedUserMessage(mapJson, userContext, totalPursuitCount),
    maxTokens: 8192,
    temperature: 0.35,
    queueKey: userId,
  });

  let json: unknown;
  try {
    json = JSON.parse(stripMarkdownFence(raw)) as unknown;
  } catch (err) {
    console.error("[reading-sync] Gemini returned invalid/truncated JSON", { raw });
    throw new ReadingSyncGenerationResponseError(
      "Reading generation returned incomplete JSON. Please try again.",
      { cause: err },
    );
  }

  const parsed = readingSyncGenerationSchema.safeParse(json);
  if (!parsed.success) {
    console.error("[reading-sync] Gemini returned JSON with invalid shape", {
      issues: parsed.error.issues,
      raw,
    });
    throw new ReadingSyncGenerationResponseError(
      `Reading generation returned an invalid response shape: ${
        parsed.error.issues[0]?.message ?? "unknown"
      }`,
    );
  }

  let insights: InsightGenerationResult;
  try {
    insights = await finalizeInsightGeneration(
      userId,
      mapContext,
      userContext,
      parsed.data.insights,
    );
  } catch (err) {
    if (err instanceof InsightGenerationResponseError) throw err;
    throw new ReadingSyncGenerationResponseError("Insight generation failed after reading sync.", {
      cause: err,
    });
  }

  let story: StoryGenerationResult;
  try {
    story = sanitizeStoryGeneration(parsed.data.story);
  } catch (err) {
    throw new StoryGenerationResponseError("Story generation failed after reading sync.", {
      cause: err,
    });
  }

  return { insights, story };
}
