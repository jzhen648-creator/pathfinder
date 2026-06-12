import { formatMapContext } from "@/lib/ai/format-map-context";
import { formatUserContext } from "@/lib/ai/format-user-context";
import { generateJsonCompletion, GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";
import { buildStorySystemPrompt, countMapPursuits } from "@/lib/story/generate-story";
import { sanitizeStoryGeneration } from "@/lib/story/sanitize-story";
import {
  STORY_SCHEMA_VERSION,
  storyGenerationSchema,
  type StoryGenerationResult,
} from "@/lib/story/story-types";
import type { ReadingDirtySummary } from "@/lib/map/reading-dirty-ledger";

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

function filterMapContextForDirty(
  mapContext: Awaited<ReturnType<typeof formatMapContext>>,
  dirty: ReadingDirtySummary,
) {
  const pursuitSet = new Set(dirty.pursuitIds);
  const themeSet = new Set(dirty.themeIds);
  const markSet = new Set(dirty.markIds);

  return {
    themes: mapContext.themes
      .filter((theme) => themeSet.has(theme.id) || theme.hubs.some((hub) =>
        hub.pursuits.some((p) => pursuitSet.has(p.id)),
      ))
      .map((theme) => ({
        ...theme,
        marks: theme.marks.filter((m) => markSet.has(m.id) || themeSet.has(theme.id)),
        hubs: theme.hubs
          .map((hub) => ({
            ...hub,
            pursuits: hub.pursuits.filter((p) => pursuitSet.has(p.id)),
            marks: hub.marks.filter((m) => markSet.has(m.id)),
          }))
          .filter((hub) => hub.pursuits.length > 0 || dirty.hubIds.includes(hub.id)),
      })),
  };
}

function buildDeltaSystemPrompt(totalPursuitCount: number): string {
  return [
    "You revise an existing whole-map Insights reading for Pathfinder.",
    "Return ONLY valid JSON with schemaVersion and seasonRead.",
    "Preserve stable interpretation from the previous reading.",
    "Update only where the changed map data requires it.",
    "Do not re-audit the entire map or invent facts.",
    "Do not duplicate per-pursuit sparkle insight copy verbatim.",
    "",
    buildStorySystemPrompt(totalPursuitCount),
  ].join("\n");
}

function buildDeltaUserMessage(input: {
  previousSeasonRead: string;
  previousGeneratedAt: string;
  userContext: string;
  changedContextJson: string;
  mapSummary: string;
}): string {
  return [
    userContextOrPlaceholder(input.userContext),
    "",
    `Previous reading (generated ${input.previousGeneratedAt}):`,
    input.previousSeasonRead,
    "",
    "Changed map context since last reading:",
    input.changedContextJson,
    "",
    "Brief whole-map summary for grounding:",
    input.mapSummary,
    "",
    `Return JSON: { "schemaVersion": "${STORY_SCHEMA_VERSION}", "seasonRead": "..." }`,
    "Revise the previous reading — do not start from scratch unless the changes are substantial.",
  ].join("\n");
}

function userContextOrPlaceholder(userContext: string): string {
  return userContext || "(No profile context yet.)";
}

export async function generateReadingDelta(
  userId: string,
  previousStory: StoryGenerationResult,
  previousGeneratedAt: Date,
  dirty: ReadingDirtySummary,
): Promise<StoryGenerationResult> {
  if (!hasGeminiKey()) {
    throw new GeminiNotConfiguredError();
  }

  const [mapContext, userContext] = await Promise.all([
    formatMapContext(userId, { excludeAbandoned: true }),
    formatUserContext(userId),
  ]);

  const totalPursuitCount = countMapPursuits(mapContext);
  const changedContext = filterMapContextForDirty(mapContext, dirty);
  const mapSummary = JSON.stringify(
    {
      totalPursuits: totalPursuitCount,
      themeCount: mapContext.themes.length,
    },
    null,
    2,
  );

  const raw = await generateJsonCompletion({
    system: buildDeltaSystemPrompt(totalPursuitCount),
    user: buildDeltaUserMessage({
      previousSeasonRead: previousStory.seasonRead,
      previousGeneratedAt: previousGeneratedAt.toISOString(),
      userContext,
      changedContextJson: JSON.stringify(changedContext, null, 2),
      mapSummary,
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
