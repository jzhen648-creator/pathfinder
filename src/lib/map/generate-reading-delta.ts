import { formatUserContext } from "@/lib/ai/format-user-context";
import { generateJsonCompletion, GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";
import {
  compileReadingPacket,
  readingPacketToJson,
} from "@/lib/map/compile-reading-packet";
import type { ReadingDirtyAnalysis } from "@/lib/map/reading-dirty-ledger";
import type { MapAiSyncMetrics } from "@/lib/map/ai-sync-metrics";
import { buildStorySystemPrompt, countMapPursuits } from "@/lib/story/generate-story";
import { formatMapContext } from "@/lib/ai/format-map-context";
import { sanitizeStoryGeneration } from "@/lib/story/sanitize-story";
import {
  STORY_SCHEMA_VERSION,
  storyGenerationSchema,
  type StoryGenerationResult,
} from "@/lib/story/story-types";

export class ReadingDeltaGenerationResponseError extends Error {
  status = 503;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ReadingDeltaGenerationResponseError";
  }
}

function stripMarkdownFence(raw: string): string {
  const t = raw.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(t);
  return m?.[1]?.trim() ?? t;
}

function buildDeltaSystemPrompt(totalPursuitCount: number): string {
  return [
    "You revise an existing whole-map Insights reading for Pathfinder.",
    "Return ONLY valid JSON with schemaVersion and seasonRead.",
    "Preserve stable interpretation from the previous reading.",
    "Ground on the reading packet facts — do not re-derive status counts, category mixes, or deadlines.",
    "Update only where the packet change events and category signals require it.",
    "Do not re-audit the entire map or invent facts.",
    "Do not duplicate per-pursuit panel Insight copy verbatim.",
    "",
    buildStorySystemPrompt(totalPursuitCount),
  ].join("\n");
}

function buildDeltaUserMessage(input: {
  previousSeasonRead: string;
  previousGeneratedAt: string;
  userContext: string;
  readingPacketJson: string;
}): string {
  return [
    userContextOrPlaceholder(input.userContext),
    "",
    `Previous reading (generated ${input.previousGeneratedAt}):`,
    input.previousSeasonRead,
    "",
    "Reading packet since last reading (deterministic facts — trust these):",
    input.readingPacketJson,
    "",
    `Return JSON: { "schemaVersion": "${STORY_SCHEMA_VERSION}", "seasonRead": "..." }`,
    "Revise the previous reading — do not start from scratch unless the packet changes are substantial.",
  ].join("\n");
}

function userContextOrPlaceholder(userContext: string): string {
  return userContext || "(No profile context yet.)";
}

export async function generateReadingDelta(
  userId: string,
  previousStory: StoryGenerationResult,
  previousGeneratedAt: Date,
  dirty: ReadingDirtyAnalysis,
  metrics?: MapAiSyncMetrics,
): Promise<StoryGenerationResult> {
  if (!hasGeminiKey()) {
    throw new GeminiNotConfiguredError();
  }

  const [mapContext, userContext, readingPacket] = await Promise.all([
    formatMapContext(userId, { excludeAbandoned: true }),
    formatUserContext(userId),
    compileReadingPacket(userId, dirty),
  ]);

  const readingPacketJson = readingPacketToJson(readingPacket);
  if (metrics) {
    metrics.readingPacketChars = readingPacketJson.length;
  }

  const totalPursuitCount = countMapPursuits(mapContext);

  const raw = await generateJsonCompletion({
    system: buildDeltaSystemPrompt(totalPursuitCount),
    user: buildDeltaUserMessage({
      previousSeasonRead: previousStory.seasonRead,
      previousGeneratedAt: previousGeneratedAt.toISOString(),
      userContext,
      readingPacketJson,
    }),
    maxTokens: 2048,
    temperature: 0.4,
    queueKey: userId,
  });

  let json: unknown;
  try {
    json = JSON.parse(stripMarkdownFence(raw)) as unknown;
  } catch (err) {
    throw new ReadingDeltaGenerationResponseError(
      "Reading delta returned incomplete JSON. Please try again.",
      { cause: err },
    );
  }

  const parsed = storyGenerationSchema.safeParse(json);
  if (!parsed.success) {
    throw new ReadingDeltaGenerationResponseError(
      `Reading delta returned invalid shape: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    );
  }

  return sanitizeStoryGeneration(parsed.data);
}
