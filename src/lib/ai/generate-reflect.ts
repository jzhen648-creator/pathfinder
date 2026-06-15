import { formatMapContext } from "@/lib/ai/format-map-context";
import { formatUserContext } from "@/lib/ai/format-user-context";
import { isReflectCallEnabled, REFLECT_MAX_OUTPUT_TOKENS } from "@/lib/ai/reflect-call";
import { normalizeReflectResponse } from "@/lib/ai/normalize-reflect-response";
import { reflectResponseSchema, type ReflectResponse } from "@/lib/ai/reflect-types";
import { applyReflectOutput } from "@/lib/ai/apply-reflect-output";
import {
  compileReadingPacket,
  readingPacketToJson,
} from "@/lib/map/compile-reading-packet";
import type { MapAiSyncMetrics } from "@/lib/map/ai-sync-metrics";
import {
  analyzeReadingDirty,
  clearReadingDirtyLedger,
  type ReadingDirtyAnalysis,
} from "@/lib/map/reading-dirty-ledger";
import { buildStorySystemPrompt, countMapPursuits } from "@/lib/story/generate-story";
import { isCurrentStoryPayload } from "@/lib/story/parse-story-cache";
import { STORY_SCHEMA_VERSION, type StoryGenerationResult } from "@/lib/story/story-types";
import { clampInsightGenerationJson } from "@/lib/insights/clamp-insight-json";
import { interpretationEligiblePursuitWhere } from "@/lib/pursuit/interpretation-eligible";
import {
  resolvePursuitEnrichOptions,
  type PursuitEnrichOptions,
} from "@/lib/pursuit/enrich-options";
import { enrichAnswersSchema } from "@/lib/pursuit/pursuit-enrich-types";
import {
  shouldSuggestMilestones,
  type PursuitSignal,
} from "@/lib/pursuit/pursuit-enrich-readiness";
import { generateJsonCompletion, GeminiNotConfiguredError, GeminiProviderError, hasGeminiKey } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";

export class ReflectGenerationResponseError extends Error {
  status = 503;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ReflectGenerationResponseError";
  }
}

export type ReflectSyncResult = {
  insightsRefreshed: boolean;
  storyRefreshed: boolean;
  geminiCallsMade: number;
  geminiRateLimited: boolean;
};

function stripMarkdownFence(raw: string): string {
  const trimmed = raw.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}

function buildReflectSystemPrompt(totalPursuitCount: number, options: Required<PursuitEnrichOptions>): string {
  const clarifierRules = options.clarifyTitles
    ? [
        "- clarifiers: 0-3 multiple-choice questions when the title is ambiguous AND context does not already disambiguate.",
        "  Each clarifier: id (short slug), prompt (question), options (2-4 short labels).",
      ]
    : ["- clarifiers: always return an empty array — do not generate quick questions."];

  const connectionRules = options.suggestConnections
    ? [
        "- You MAY add at most ONE clarifier about how this pursuit relates to a named sibling pursuit in map context.",
        '  Options must include "Unrelated" or "Not sure".',
      ]
    : ["- Do NOT ask relationship or cross-pursuit connection questions in clarifiers."];

  return [
    "You are Pathfinder's reflection engine. Return a single JSON object with a whole-map reading and per-pursuit insights.",
    "Return ONLY valid JSON — no preamble, no markdown fences.",
    "",
    "RULES:",
    "- Name pursuits VERBATIM from map context — never paraphrase titles.",
    "- Never invent pursuits, milestones, or connections not in the data.",
    "- No filler: ban \"it will be interesting\", \"journey\", \"keep building\", \"as they take shape\", \"holistic commitment\".",
    "- Headline must add information beyond the pursuit title.",
    "- One concrete suggestion per pursuit, max.",
    "- Be honest about gaps and sparse maps.",
    "- Use age/location for contextual benchmarking only when data supports it.",
    "",
    "READING LENSES (not a checklist — one continuous voice, no sections):",
    "- Gap: where is significance high but movement absent, especially near a deadline?",
    "- Arrival: what's been completed, and what does the arc say about direction?",
    "Address only lenses the reading packet facts support. A reading may answer only one lens.",
    "",
    "WHOLE-MAP READING:",
    "- The reading sees what no single pursuit panel can: the shape of the map as a whole.",
    "- Do not inventory pursuits one by one — pursuit panels already do that.",
    "- Say one Gap observation and one Arrival observation (where the packet supports them) that only makes sense across the full map.",
    "- Do not repeat per-pursuit panel copy.",
    "- Use paragraph breaks between distinct observations. Each paragraph connects related pursuits — what they reveal together.",
    "- Two to three short paragraphs. Not a task list.",
    "  If map has 1-2 pursuits: stay short and factual; one question is OK.",
    "",
    "OUTPUT:",
    '- "reading": whole-map reflective prose per WHOLE-MAP READING rules above.',
    '- "pursuits": map of pursuitId -> { tone, headline, body, clarifiers?, suggestedMilestones? }',
    "  tone MUST be one of: celebratory | encouraging | nudge | reality_check | informational",
    "  headline <= 100 chars; body 2-4 sentences, <= 500 chars.",
    ...clarifierRules,
    ...connectionRules,
    "- suggestedMilestones: 0-6 chronological steps ONLY when user message says milestones are allowed; otherwise null.",
    "",
    "THEME INSIGHTS:",
    "- \"themes\": map of themeId -> { tone, oneLiner, reflective, contextual?, combined? }",
    "  tone MUST be one of: celebratory | encouraging | nudge",
    "  oneLiner <= 100 chars — theme-level headline, not a pursuit title.",
    "  reflective: 2-3 sentences on what is live in this theme (<= 500 chars).",
    "  contextual: optional age/location benchmark (<= 500 chars); empty string if none.",
    "  combined: optional \"what this opens\" line (<= 500 chars); empty string if none.",
    "  Only include themes listed in <dirty_themes>. Skip themes with no pursuits.",
    "",
    buildStorySystemPrompt(totalPursuitCount),
  ].join("\n");
}

function parseEnrichAnswers(raw: unknown): { clarifierId: string; prompt: string; selectedOption: string }[] {
  const parsed = enrichAnswersSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

async function loadPursuitSignals(userId: string, pursuitIds: string[]): Promise<Map<string, PursuitSignal>> {
  if (pursuitIds.length === 0) return new Map();

  const goals = await prisma.goal.findMany({
    where: { userId, id: { in: pursuitIds }, archived: false },
    select: {
      id: true,
      title: true,
      description: true,
      enrichAnswers: true,
      deadline: true,
      status: true,
      _count: { select: { milestones: true } },
    },
  });

  return new Map(
    goals.map((goal) => [
      goal.id,
      {
        title: goal.title,
        description: goal.description ?? "",
        enrichAnswerCount: parseEnrichAnswers(goal.enrichAnswers).length,
        milestoneCount: goal._count.milestones,
        hasDeadline: goal.deadline != null,
        status: goal.status,
      },
    ]),
  );
}

/** @internal Exported for vitest — per-pursuit milestone policy in reflect user message. */
export function buildReflectMilestoneOptions(
  pursuitIds: string[],
  signals: Map<string, PursuitSignal>,
): string {
  if (pursuitIds.length === 0) return "";

  const lines = pursuitIds.map((pursuitId) => {
    const signal = signals.get(pursuitId);
    const milestonesAllowed = signal ? shouldSuggestMilestones(signal) : false;
    return milestonesAllowed
      ? `- ${pursuitId}: Milestones allowed — suggest only if concrete and specific.`
      : `- ${pursuitId}: Milestones NOT allowed — set suggestedMilestones to null.`;
  });

  return ["<milestone_options>", ...lines, "</milestone_options>"].join("\n");
}

function buildReflectUserMessage(input: {
  userContext: string;
  readingPacketJson: string;
  mapContextJson: string;
  previousReading: string;
  dirtyPursuitIds: string[];
  dirtyThemeIds: string[];
  pursuitSignals: Map<string, PursuitSignal>;
  enrichOptions: Required<PursuitEnrichOptions>;
}): string {
  const milestoneOptions = buildReflectMilestoneOptions(input.dirtyPursuitIds, input.pursuitSignals);

  return [
    input.userContext || "(No profile context yet.)",
    "",
    "<reading_packet>",
    input.readingPacketJson,
    "</reading_packet>",
    "",
    "<map_context>",
    input.mapContextJson,
    "</map_context>",
    "",
    "<previous_reading>",
    input.previousReading || "None — this is the first reading.",
    "</previous_reading>",
    "",
    "<dirty_pursuits>",
    JSON.stringify(input.dirtyPursuitIds),
    "</dirty_pursuits>",
    "",
    "<dirty_themes>",
    JSON.stringify(input.dirtyThemeIds),
    "</dirty_themes>",
    "",
    milestoneOptions,
    milestoneOptions ? "" : null,
    "<options>",
    `clarifyTitles: ${input.enrichOptions.clarifyTitles}`,
    `suggestConnections: ${input.enrichOptions.suggestConnections}`,
    `includeMarks: ${input.enrichOptions.includeMarks}`,
    "</options>",
    "",
    "Only include pursuit entries for the dirty pursuit IDs listed above.",
    "Only include theme entries for the dirty theme IDs listed above.",
    "Always include \"reading\" — it reflects the whole map.",
    'Respond with ONLY a JSON object: { "reading": "...", "themes": { ... }, "pursuits": { ... } }',
  ]
    .filter((line) => line !== null)
    .join("\n");
}

async function resolveReflectPursuitIds(
  userId: string,
  dirty: ReadingDirtyAnalysis,
  options: { force?: boolean; storyStale: boolean; insightsStale: boolean },
): Promise<string[]> {
  if (dirty.activeDirtyPursuitIds.length > 0) {
    return dirty.activeDirtyPursuitIds;
  }
  if (options.force || options.storyStale || options.insightsStale) {
    const goals = await prisma.goal.findMany({
      where: { userId, ...interpretationEligiblePursuitWhere },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    return goals.map((goal) => goal.id);
  }
  return [];
}

function parsePreviousStory(payload: string | undefined): StoryGenerationResult | null {
  if (!payload || !isCurrentStoryPayload(payload)) return null;
  try {
    const parsed = JSON.parse(payload) as StoryGenerationResult;
    return parsed.schemaVersion === STORY_SCHEMA_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

async function resolveReflectThemeIds(
  userId: string,
  dirty: ReadingDirtyAnalysis,
  options: { force?: boolean; storyStale: boolean; insightsStale: boolean },
): Promise<string[]> {
  if (dirty.themeIds.length > 0) {
    return dirty.themeIds;
  }
  if (options.force || options.storyStale || options.insightsStale) {
    const mapContext = await formatMapContext(userId, { excludeAbandoned: true });
    return mapContext.themes
      .filter((theme) => theme.hubs.some((hub) => hub.pursuits.length > 0))
      .map((theme) => theme.id);
  }
  return [];
}

async function generateReflectResponse(
  userId: string,
  dirty: ReadingDirtyAnalysis,
  pursuitIds: string[],
  themeIds: string[],
  enrichOptions: Required<PursuitEnrichOptions>,
  previousReading: string,
  metrics?: MapAiSyncMetrics,
): Promise<ReflectResponse> {
  if (!hasGeminiKey()) {
    throw new GeminiNotConfiguredError();
  }

  const [mapContext, userContext, readingPacket, pursuitSignals] = await Promise.all([
    formatMapContext(userId, { excludeAbandoned: true }),
    formatUserContext(userId),
    compileReadingPacket(userId, dirty),
    loadPursuitSignals(userId, pursuitIds),
  ]);

  const readingPacketJson = readingPacketToJson(readingPacket);
  const mapContextJson = JSON.stringify(mapContext, null, 2);
  if (metrics) {
    metrics.readingPacketChars = readingPacketJson.length;
  }

  const totalPursuitCount = countMapPursuits(mapContext);

  const raw = await generateJsonCompletion({
    system: buildReflectSystemPrompt(totalPursuitCount, enrichOptions),
    user: buildReflectUserMessage({
      userContext,
      readingPacketJson,
      mapContextJson,
      previousReading,
      dirtyPursuitIds: pursuitIds,
      dirtyThemeIds: themeIds,
      pursuitSignals,
      enrichOptions,
    }),
    maxTokens: REFLECT_MAX_OUTPUT_TOKENS,
    temperature: 0.4,
    queueKey: userId,
  });

  let json: unknown;
  try {
    json = clampInsightGenerationJson(JSON.parse(stripMarkdownFence(raw)) as unknown);
  } catch (err) {
    throw new ReflectGenerationResponseError("Reflect call returned invalid JSON.", { cause: err });
  }

  const normalized = normalizeReflectResponse(json);
  const parsed = reflectResponseSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new ReflectGenerationResponseError(
      parsed.error.issues[0]?.message ?? "Invalid reflect response shape.",
    );
  }

  if (metrics) {
    metrics.reflectResponseChars = JSON.stringify(parsed.data).length;
  }

  return parsed.data;
}

/** Gemini quota (429) or transient overload (503) — safe to retry after a pause. */
function isGeminiBusy(err: unknown): boolean {
  if (err instanceof GeminiProviderError && (err.status === 429 || err.status === 503)) {
    return true;
  }
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    message.includes("429") ||
    message.includes("503") ||
    message.includes("rate limit") ||
    message.includes("quota") ||
    message.includes("resource_exhausted") ||
    message.includes("temporarily unavailable")
  );
}

/** Single-call reflect sync — Reading + all dirty pursuit panels. */
export async function runReflectSync(
  userId: string,
  mapVersion: string,
  memoryVersion: number,
  options: {
    force?: boolean;
    storyStale: boolean;
    insightsStale: boolean;
    metrics: MapAiSyncMetrics;
    enrichOptions?: PursuitEnrichOptions;
  },
): Promise<ReflectSyncResult> {
  if (!isReflectCallEnabled()) {
    throw new Error("runReflectSync called while USE_REFLECT_CALL is disabled");
  }

  const enrichOptions = resolvePursuitEnrichOptions(options.enrichOptions);
  const dirty = await analyzeReadingDirty(userId);
  options.metrics.dirtyItems = dirty.totalItems;
  options.metrics.dirtyPursuits = dirty.pursuitIds.length;
  options.metrics.reflectCall = true;
  options.metrics.aiCallsPlanned += 1;

  const pursuitIds = await resolveReflectPursuitIds(userId, dirty, {
    force: options.force,
    storyStale: options.storyStale,
    insightsStale: options.insightsStale,
  });
  const themeIds = await resolveReflectThemeIds(userId, dirty, {
    force: options.force,
    storyStale: options.storyStale,
    insightsStale: options.insightsStale,
  });

  const storyRow = await prisma.storyCache.findUnique({ where: { userId } });
  const previousStory = storyRow ? parsePreviousStory(storyRow.payload) : null;
  const previousReading = previousStory?.seasonRead?.trim() ?? "";

  try {
    const reflect = await generateReflectResponse(
      userId,
      dirty,
      pursuitIds,
      themeIds,
      enrichOptions,
      previousReading,
      options.metrics,
    );
    options.metrics.aiCallsCompleted += 1;

    const { insightsWritten, storyWritten } = await applyReflectOutput(
      userId,
      reflect,
      pursuitIds,
      enrichOptions,
      mapVersion,
      memoryVersion,
    );

    await clearReadingDirtyLedger(userId);
    options.metrics.morePending = false;
    options.metrics.pendingInsightCount = 0;

    return {
      insightsRefreshed: insightsWritten,
      storyRefreshed: storyWritten,
      geminiCallsMade: 1,
      geminiRateLimited: false,
    };
  } catch (err) {
    if (isGeminiBusy(err)) {
      options.metrics.rateLimited = true;
      options.metrics.morePending = pursuitIds.length > 0;
      options.metrics.pendingInsightCount = pursuitIds.length;
      return {
        insightsRefreshed: false,
        storyRefreshed: false,
        geminiCallsMade: options.metrics.aiCallsCompleted,
        geminiRateLimited: true,
      };
    }
    if (err instanceof ReflectGenerationResponseError) {
      options.metrics.enrichErrors.push(err.message);
      options.metrics.morePending = pursuitIds.length > 0;
      options.metrics.pendingInsightCount = pursuitIds.length;
      return {
        insightsRefreshed: false,
        storyRefreshed: false,
        geminiCallsMade: options.metrics.aiCallsCompleted,
        geminiRateLimited: false,
      };
    }
    throw err;
  }
}

export { isReflectCallEnabled };

/** @internal Exported for vitest completeness / output-size assertions. */
export { generateReflectResponse };
