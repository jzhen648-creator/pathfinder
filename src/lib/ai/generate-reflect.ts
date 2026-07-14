import { formatMapContext, type FormattedMapContext } from "@/lib/ai/format-map-context";
import { pursuitStatusPromptBlock } from "@/lib/ai/pursuit-status-prompt";
import {
  amountImpactBodyPromptLines,
  isAmountImpactEligible,
} from "@/lib/ai/amount-impact-eligibility";
import { PEOPLE_THEME_BODY_CLAUSE } from "@/lib/ai/people-theme-prompt";
import { formatUserContext } from "@/lib/ai/format-user-context";
import { isReflectCallEnabled, REFLECT_MAX_OUTPUT_TOKENS, chunkReflectPursuitIds } from "@/lib/ai/reflect-call";
import { normalizeReflectResponse } from "@/lib/ai/normalize-reflect-response";
import { reflectResponseSchema, type ReflectResponse } from "@/lib/ai/reflect-types";
import { applyReflectOutput } from "@/lib/ai/apply-reflect-output";
import {
  compileReadingPacket,
  buildFocalPursuitFactsBlock,
  mapContextForReadingPacketPrompt,
  readingPacketToJson,
} from "@/lib/map/compile-reading-packet";
import type { MapAiSyncMetrics } from "@/lib/map/ai-sync-metrics";
import { canMakeReflectCall } from "@/lib/map/sync-gemini-budget";
import {
  analyzeReadingDirty,
  clearReadingDirtyForPursuits,
  clearReadingDirtyLedger,
  type ReadingDirtyAnalysis,
} from "@/lib/map/reading-dirty-ledger";
import { loadPursuitToneGoals } from "@/lib/insights/load-pursuit-tone-goals";
import { clampSignificance } from "@/lib/pursuit/significance";
import {
  DATE_DEADLINE_ARITHMETIC_RULE,
  MAP_SPECIFICITY_BAR,
  ORIENTATION_AS_LENS_RULE,
  PROSE_CONCRETE_NOUNS_RULE,
  PURSUIT_HEADLINE_FIELD_JOB,
  PURSUIT_TITLE_REFERENCE_RULE,
  REFLECT_CORE_RULES,
  REFLECT_VOICE_ANTI_PATTERNS,
  USER_RATIONALE_RULE,
  TENSION_NOT_FORECAST_RULE,
  PLAN_IMPLICATION_RULE,
  ATTRIBUTES_AT_A_DATE_RULE,
} from "@/lib/insights/insight-voice-prompt-blocks";
import {
  buildBenchmarkFactsBlock,
  flattenBenchmarkPursuitsFromMapContext,
  parseAgeFromUserContext,
  parseDobDateFromUserContext,
  parseLocationFromUserContext,
} from "@/lib/insights/benchmark-facts";
import {
  collectChapterAgeFacts,
  formatChapterAgeFactsBlock,
} from "@/lib/ai/temporal-age-gate";
import {
  PURSUIT_BODY_DOMAIN_CONTEXT_RULE,
  PURSUIT_COMPARISON_FIELD_JOBS,
  PURSUIT_CONTEXT_TAB_NON_DUPLICATION,
  PURSUIT_INSIGHT_FIELD_LANES,
  PURSUIT_PANEL_UI_CONTEXT,
  PURSUIT_READING_AUTHORSHIP_ORDER,
  THEME_INSIGHT_FIELD_JOBS,
  THEME_INSIGHT_FIELD_LANES,
  THEME_REFLECT_OUTPUT_CONTRACT,
  OVERALL_READING_OUTPUT_CONTRACT,
} from "@/lib/insights/theme-insight-prompt-blocks";
import { buildPursuitToneGuidanceBlock } from "@/lib/insights/pursuit-tone-prompt";
import { clampInsightGenerationJson } from "@/lib/insights/clamp-insight-json";
import { listDirtyThemeIds, listEligiblePursuitIds, planReflectWork } from "@/lib/ai/reflect-sync-plan";
import {
  resolvePursuitEnrichOptions,
  type PursuitEnrichOptions,
} from "@/lib/pursuit/enrich-options";
import {
  shouldSuggestMilestones,
  pursuitSignalFromGoal,
  type PursuitSignal,
} from "@/lib/pursuit/pursuit-enrich-readiness";
import {
  buildClarifierSystemOutputLines,
  PURSUIT_PANEL_CONTEXT_PRECEDENCE,
  PURSUIT_PANEL_SUGGESTED_MILESTONES_FIELD,
  SUGGESTED_CONTINUATIONS_OUTPUT_LINES,
  SUGGESTED_MILESTONES_OUTPUT_LINES,
} from "@/lib/pursuit/clarifier-prompt-blocks";
import { buildClarifierKindPromptSection } from "@/lib/pursuit/clarifier-question-prompt";
import {
  formatReflectPursuitSlotLines,
  loadRelationshipPeerIdsForGoal,
  type QuestionSlotMessageContext,
} from "@/lib/pursuit/pick-question-slot";
import { enrichAnswersSchema } from "@/lib/pursuit/pursuit-enrich-types";
import { parsePursuitInsightRecord } from "@/lib/insights/parse-insight-cache";
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
  geminiCallsMade: number;
  geminiRateLimited: boolean;
  skipped?: boolean;
};

const HEADLINE_MUST_ADD_MEANING = [
  "HEADLINE MUST ADD MEANING:",
  '- Never restate the status line ("X is paused with a deadline of Y") or the milestone count ("X has N milestones complete")',
  "- The user already sees those. The headline tells them what it MEANS.",
  '- Wrong: "Half-marathon chapter has one milestone complete, 5k achieved 79 days ago"',
  '- Right: "5k is done — the jump to 10k is where the training plan actually starts"',
  "- If there's nothing meaningful to add beyond the status, write a shorter, honest headline rather than padding with facts the user already has.",
].join("\n");

const REFLECT_BENCHMARK_INSIGHT_RUBRIC = [
  "BENCHMARK & INSIGHT MOVES",
  "",
  "These examples illustrate *moves* — ways of finding the edge in a chapter. They are NOT a list",
  "of topics or domains. Each move applies to ANY chapter regardless of subject. The genres below",
  "are varied on purpose, to show the same move working across money, fitness, relationships, and",
  "work — apply these shapes to whatever chapter you're given, including kinds not shown here. Use",
  "the user's profile (age, location) and the rest of their map as the material. Name the real",
  "chapter. At most one observation per chapter.",
  "",
  "Move 1 — Benchmark against the person. Is this notable for someone like them, given age,",
  "location, or stage? State the fact and any benchmark tension — do not predict outcomes.",
  "When the map shows a ceiling or limit hit, name it as uncommon/observed — never neutral admin alignment.",
  '- Weak: "Saving £500k in an ISA is a great financial goal."',
  '- Weak: "Monthly contributions align with the annual ISA limit."',
  '- Strong: "The ISA target is £500k by your mid-thirties; the balance and contribution on the',
  "  map are a fraction of that — those two numbers sit in tension.",
  '- Strong: "Contributions hit the full £20k allowance — that is uncommon; most people use a fraction."',
  "",
  "Move 2 — Read the combination. What tension exists because these two things sit on the map together?",
  "(Needs no numbers — works for anything.)",
  '- Weak: "You have several active chapters across work and family."',
  '- Strong: "Being more present at home is marked significant in the same season three work chapters',
  '  are all active — those are competing for the same evenings, not running in parallel."',
  "",
  "Move 3 — Name the gap between what the map shows now and what the user committed to",
  "(deadline, target, milestone frontier). State both facts and that they sit in tension —",
  "do not judge pace, predict success, or describe consequences.",
  '- Weak: "Your half-marathon training is in progress."',
  '- Strong: "The race is ten weeks out and the longest logged run is still 8k — those two facts',
  '  sit in tension."',
  "",
  "Move 4 — Be honest about thin or stalled. When a chapter is sparse, untouched, or stuck, name",
  "the facts plainly instead of padding or guessing intent.",
  '- Weak: "Learning Spanish is a wonderful journey of growth."',
  '- Strong: "Learn Spanish has been active since spring with no milestones and no context logged yet."',
  "Silence is measured for you: reading_packet silenceFacts list quiet in-progress chapters, each",
  "chapter carries daysSinceTouched, and themeRollup daysSinceThemeTouched shows whole themes gone",
  "quiet. Use these exact ages when naming silence — never estimate one. A theme silent for months",
  "while another gains chapters is a Move 2 combination worth naming.",
  "Comebacks: recentEvents kind pursuit_returned means the chapter came back after pausedDays of",
  "lived pause (pursuit_paused marks where a pause began). A return is part of the story — name it",
  "plainly with its real duration. Never frame the pause as failure, erase it, or congratulate;",
  'state the arc: "paused in March, returned in June after 94 days."',
  "",
  "Move 5 — Plan frontier (theme oneLiner especially). When Complete chapters end the timeline with",
  "nothing Active or Maintaining ahead, name the empty frontier — do not invent progression.",
  '- Weak: "Education and first role show clear progression into a professional career."',
  '- Strong: "Formal Education and First Job are both complete — nothing Active after 2021 continues the arc."',
  "",
  "GROUNDING RULE (mandatory): Benchmark only when you have real grounds — age, location, an actual",
  "number, or another chapter on the map to weigh against. If a chapter is qualitative and you have",
  "nothing concrete to compare it to, reflect on it plainly and specifically; do NOT invent a",
  "statistic, percentile, or comparison. Never assert a population ranking you cannot derive from",
  "the context. A relationship or personal-growth chapter is read through the map (Move 2) and",
  "honesty (Move 4), not through fabricated numbers.",
  "Exception — chapter body only: one qualitative cross-chapter domain sentence is allowed per CHAPTER body",
  "domain-context rule; standalone chapter-type domain context belongs in comparison (Worth knowing), not body.",
  "Exception — chapter comparison (Worth knowing): consequential domain context anchored to this map belongs there;",
  "quantified norms require <benchmark_facts> or other real grounds — do not invent numbers.",
];

function buildReflectSharedVoiceBlocks(): string[] {
  return [
    REFLECT_CORE_RULES,
    "",
    PURSUIT_PANEL_CONTEXT_PRECEDENCE,
    HEADLINE_MUST_ADD_MEANING,
    PURSUIT_HEADLINE_FIELD_JOB,
    PROSE_CONCRETE_NOUNS_RULE,
    "",
    pursuitStatusPromptBlock(),
    "",
    ...REFLECT_BENCHMARK_INSIGHT_RUBRIC,
    "",
    TENSION_NOT_FORECAST_RULE,
    "",
    PLAN_IMPLICATION_RULE,
    "",
    ORIENTATION_AS_LENS_RULE,
    "",
    USER_RATIONALE_RULE,
    "",
    PURSUIT_TITLE_REFERENCE_RULE,
    "",
    MAP_SPECIFICITY_BAR,
    "",
    DATE_DEADLINE_ARITHMETIC_RULE,
    "",
    ATTRIBUTES_AT_A_DATE_RULE,
    "",
    REFLECT_VOICE_ANTI_PATTERNS,
  ];
}

function stripMarkdownFence(raw: string): string {
  const trimmed = raw.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}

type ReflectScope = "full" | "pursuits-only";

function buildReflectPursuitsOnlySystemPrompt(
  options: Required<PursuitEnrichOptions>,
  amountImpactEligible: boolean,
): string {
  const clarifierRules = options.clarifyTitles
    ? buildClarifierSystemOutputLines()
    : ["- clarifiers: always return an empty array."];

  return [
    "You generate Almanac chapter reading panels only.",
    "Return ONLY valid JSON — no preamble, no markdown fences.",
    "",
    ...buildReflectSharedVoiceBlocks(),
    "",
    PEOPLE_THEME_BODY_CLAUSE,
    ...amountImpactBodyPromptLines(amountImpactEligible),
    ...clarifierRules,
    buildClarifierKindPromptSection(options),
    "",
    "OUTPUT:",
    '- "pursuits": map of pursuitId (chapter id) -> { headline, body, comparison?, clarifiers?, suggestedMilestones? }',
    "  Chapter tone is assigned server-side from map signals — do not set tone.",
    "  headline <= 100 chars; body 2-4 sentences, <= 500 chars.",
    "  Direct declarative voice in headline and body — no UI section labels.",
    PURSUIT_INSIGHT_FIELD_LANES,
    PURSUIT_BODY_DOMAIN_CONTEXT_RULE,
    PURSUIT_CONTEXT_TAB_NON_DUPLICATION,
    PURSUIT_READING_AUTHORSHIP_ORDER,
    PURSUIT_COMPARISON_FIELD_JOBS,
    PURSUIT_PANEL_UI_CONTEXT,
    ...PURSUIT_PANEL_SUGGESTED_MILESTONES_FIELD,
    ...SUGGESTED_MILESTONES_OUTPUT_LINES,
    ...SUGGESTED_CONTINUATIONS_OUTPUT_LINES,
    "- Do NOT include themes.",
  ].join("\n");
}

function buildReflectSystemPrompt(
  options: Required<PursuitEnrichOptions>,
  scope: ReflectScope = "full",
  amountImpactEligible = false,
): string {
  if (scope === "pursuits-only") {
    return buildReflectPursuitsOnlySystemPrompt(options, amountImpactEligible);
  }
  const clarifierRules = options.clarifyTitles
    ? buildClarifierSystemOutputLines()
    : ["- clarifiers: always return an empty array — do not generate quick questions."];

  return [
    "You are Almanac's reflection engine. Return a single JSON object with per-theme synthesis and per-chapter reading panels.",
    "Return ONLY valid JSON — no preamble, no markdown fences.",
    "",
    ...buildReflectSharedVoiceBlocks(),
    "",
    "OUTPUT:",
    '- "pursuits": map of pursuitId (chapter id) -> { headline, body, comparison?, clarifiers?, suggestedMilestones? }',
    "  Chapter tone is assigned server-side from map signals — do not set tone.",
    "  headline <= 100 chars; body 2-4 sentences, <= 500 chars — direct declarative prose, not chatbot narration.",
    "  Do NOT embed section labels inside body — use the structured comparison field (Worth knowing); the mobile UI adds labels.",
    PURSUIT_INSIGHT_FIELD_LANES,
    PURSUIT_BODY_DOMAIN_CONTEXT_RULE,
    PURSUIT_CONTEXT_TAB_NON_DUPLICATION,
    PURSUIT_READING_AUTHORSHIP_ORDER,
    PURSUIT_COMPARISON_FIELD_JOBS,
    PURSUIT_PANEL_UI_CONTEXT,
    ...PURSUIT_PANEL_SUGGESTED_MILESTONES_FIELD,
    ...SUGGESTED_MILESTONES_OUTPUT_LINES,
    ...SUGGESTED_CONTINUATIONS_OUTPUT_LINES,
    "",
    PEOPLE_THEME_BODY_CLAUSE,
    ...amountImpactBodyPromptLines(amountImpactEligible),
    ...clarifierRules,
    buildClarifierKindPromptSection(options),
    "",
    THEME_INSIGHT_FIELD_LANES,
    "",
    THEME_INSIGHT_FIELD_JOBS,
    "",
    THEME_REFLECT_OUTPUT_CONTRACT,
    "",
    OVERALL_READING_OUTPUT_CONTRACT,
  ].join("\n");
}

async function loadReflectPursuitSlotContexts(
  userId: string,
  pursuitIds: string[],
  pursuitSignals: Map<string, PursuitSignal>,
  cachedQuietUntilByPursuit: Record<string, string | undefined>,
): Promise<Map<string, QuestionSlotMessageContext>> {
  if (pursuitIds.length === 0) return new Map();

  const goals = await prisma.goal.findMany({
    where: { userId, id: { in: pursuitIds }, archived: false },
    select: {
      id: true,
      status: true,
      completedAt: true,
      significance: true,
      background: true,
      enrichAnswers: true,
      themeId: true,
    },
  });

  const contexts = new Map<string, QuestionSlotMessageContext>();
  for (const goal of goals) {
    const signal = pursuitSignals.get(goal.id);
    if (!signal) continue;
    const enrichAnswersParsed = enrichAnswersSchema.safeParse(goal.enrichAnswers);
    const enrichAnswers = enrichAnswersParsed.success ? enrichAnswersParsed.data : [];
    const existingRelationshipPeerIds = await loadRelationshipPeerIdsForGoal(userId, goal.id);
    contexts.set(goal.id, {
      signal,
      status: goal.status ?? "ACTIVE",
      completedAt: goal.completedAt ?? null,
      significance:
        goal.significance != null ? clampSignificance(goal.significance) : null,
      enrichAnswers,
      background: goal.background,
      quickQuestionsQuietUntil: cachedQuietUntilByPursuit[goal.id],
      siblingGoalIds: [],
      existingRelationshipPeerIds,
    });
  }
  return contexts;
}

async function loadPursuitSignals(userId: string, pursuitIds: string[]): Promise<Map<string, PursuitSignal>> {
  if (pursuitIds.length === 0) return new Map();

  const goals = await prisma.goal.findMany({
    where: { userId, id: { in: pursuitIds }, archived: false },
    select: {
      id: true,
      title: true,
      background: true,
      enrichAnswers: true,
      deadline: true,
      status: true,
      targetAmount: true,
      milestones: { select: { completedAt: true } },
    },
  });

  return new Map(
    goals.map((goal) => [goal.id, pursuitSignalFromGoal(goal)]),
  );
}

export function buildPursuitsOnlyMapContext(
  mapContext: FormattedMapContext,
  dirtyPursuitIds: string[],
): FormattedMapContext {
  const dirtyIds = new Set(dirtyPursuitIds);
  if (dirtyIds.size === 0) return { themes: [] };

  return {
    themes: mapContext.themes.flatMap((theme) => {
      const categories = theme.categories.flatMap((category) => {
        const dirtyPursuits = category.pursuits.filter((pursuit) => dirtyIds.has(pursuit.id));
        if (dirtyPursuits.length === 0) return [];

        const siblingPursuits = category.pursuits.filter((pursuit) => !dirtyIds.has(pursuit.id));
        return [
          {
            ...category,
            // Same-category siblings keep local context without sending the whole map.
            pursuits: [...dirtyPursuits, ...siblingPursuits],
          },
        ];
      });

      if (categories.length === 0) return [];
      return [{ ...theme, categories }];
    }),
  };
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
    if (!milestonesAllowed) {
      return `- ${pursuitId}: Milestones NOT allowed — set suggestedMilestones to null.`;
    }
    if (signal && signal.milestoneCount > 0) {
      return `- ${pursuitId}: Milestones allowed — MUST return 1-6 items in suggestedMilestones; path has ${signal.completedMilestoneCount}/${signal.milestoneCount} complete; suggest only missing chronological steps to the deadline; do not duplicate existing titles.`;
    }
    return `- ${pursuitId}: Milestones allowed — MUST return 1-6 items in suggestedMilestones (chronological outcome waypoints toward the deadline from title, deadline, and durable enrichAnswers).`;
  });

  return ["<milestone_options>", ...lines, "</milestone_options>"].join("\n");
}

function buildReflectUserMessage(input: {
  userContext: string;
  readingPacketJson: string;
  mapContextJson: string;
  mapContext?: FormattedMapContext;
  dirtyPursuitIds: string[];
  dirtyThemeIds: string[];
  pursuitSignals: Map<string, PursuitSignal>;
  pursuitSlotContexts: Map<string, QuestionSlotMessageContext>;
  enrichOptions: Required<PursuitEnrichOptions>;
  scope?: ReflectScope;
  pursuitToneGuidance?: string | null;
}): string {
  const scope = input.scope ?? "full";
  const milestoneOptions = buildReflectMilestoneOptions(input.dirtyPursuitIds, input.pursuitSignals);

  const quickQuestionSlots =
    input.enrichOptions.clarifyTitles && input.dirtyPursuitIds.length > 0
      ? [
          "",
          "<quick_question_slots>",
          ...input.dirtyPursuitIds.flatMap((pursuitId) => {
            const ctx = input.pursuitSlotContexts.get(pursuitId);
            if (!ctx) return [];
            return [formatReflectPursuitSlotLines(pursuitId, ctx)];
          }),
          "</quick_question_slots>",
        ]
      : [];

  const benchmarkFactsBlock = input.mapContext
    ? (() => {
        const pursuits = flattenBenchmarkPursuitsFromMapContext(input.mapContext!);
        const themeIds =
          pursuits.length > 0
            ? [...new Set(pursuits.map((p) => p.themeId))]
            : input.dirtyThemeIds;
        return buildBenchmarkFactsBlock({
          age: parseAgeFromUserContext(input.userContext),
          location: parseLocationFromUserContext(input.userContext),
          themeIds,
          pursuits,
        });
      })()
    : null;

  const lines = [
    input.userContext || "(No profile context yet.)",
    "",
  ];

  if (input.mapContext) {
    const chapterAgeBlock = formatChapterAgeFactsBlock(
      collectChapterAgeFacts(
        input.mapContext,
        parseDobDateFromUserContext(input.userContext),
      ),
    );
    if (chapterAgeBlock) {
      lines.push("<chapter_age_facts>", chapterAgeBlock, "</chapter_age_facts>", "");
    }
  }

  lines.push(
    "<reading_packet>",
    input.readingPacketJson,
    "</reading_packet>",
  );

  if (input.mapContext && input.dirtyPursuitIds.length > 0) {
    const focalBlock = buildFocalPursuitFactsBlock(
      input.mapContext,
      input.dirtyPursuitIds,
      Date.now(),
      parseDobDateFromUserContext(input.userContext),
    );
    if (Object.keys(focalBlock).length > 0) {
      lines.push(
        "",
        "<focal_chapter_facts>",
        JSON.stringify(focalBlock),
        "</focal_chapter_facts>",
      );
    }
  }

  lines.push(
    "",
    "<map_context>",
    input.mapContextJson,
    "</map_context>",
  );

  if (benchmarkFactsBlock) {
    lines.push("", "<benchmark_facts>", benchmarkFactsBlock, "</benchmark_facts>");
  }

  if (scope === "full") {
    lines.push(
      "",
      "<dirty_themes>",
      JSON.stringify(input.dirtyThemeIds),
      "</dirty_themes>",
    );
  }

  lines.push(
    "",
    "<dirty_pursuits>",
    JSON.stringify(input.dirtyPursuitIds),
    "</dirty_pursuits>",
  );

  if (input.pursuitToneGuidance) {
    lines.push("", input.pursuitToneGuidance);
  }

  lines.push(
    "",
    ...(milestoneOptions ? [milestoneOptions, ""] : []),
    ...quickQuestionSlots,
    "<options>",
    `clarifyTitles: ${input.enrichOptions.clarifyTitles}`,
    "</options>",
    "",
    "Only include chapter entries for the dirty chapter IDs listed above.",
  );

  if (scope === "full") {
    lines.push(
      "Only include theme entries for the dirty theme IDs listed above.",
      'Respond with ONLY a JSON object: { "overall": { ... }, "themes": { ... }, "pursuits": { ... } }',
    );
  } else {
    lines.push(
      'Return ONLY: { "pursuits": { ... } } — one entry per dirty chapter ID.',
    );
  }

  return lines.filter((line) => line !== null).join("\n");
}

/** Fixed backoff before the one-per-sync transient retry (reflect batch loop only). */
const REFLECT_TRANSIENT_RETRY_BACKOFF_MS = 1_500;

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Gemini quota (429) — rate-limit path; do not treat 503 overload the same. */
function isGeminiRateLimited(err: unknown): boolean {
  if (err instanceof GeminiProviderError && err.status === 429) {
    return true;
  }
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("quota") ||
    message.includes("resource_exhausted")
  );
}

/** Transient overload (503) — retry soon; not a quota block. */
function isGeminiTransient(err: unknown): boolean {
  if (err instanceof GeminiProviderError && err.status === 503) {
    return true;
  }
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return message.includes("overloaded") || message.includes("temporarily unavailable");
}

/**
 * Re-invokes the same reflect batch once when the first attempt is transient (503).
 * Cap is one retry per runReflectBatchesIncremental call (syncRetryState.retriesUsed).
 */
async function invokeReflectBatchWithSyncCappedTransientRetry(
  invoke: () => Promise<ReflectResponse>,
  syncRetryState: { retriesUsed: number },
  logContext: { batchIndex: number },
): Promise<ReflectResponse> {
  try {
    return await invoke();
  } catch (err) {
    if (!isGeminiTransient(err) || syncRetryState.retriesUsed >= 1) {
      throw err;
    }
    syncRetryState.retriesUsed += 1;
    console.info("[reflect] transient Gemini error — one-per-sync retry", {
      batchIndex: logContext.batchIndex,
      backoffMs: REFLECT_TRANSIENT_RETRY_BACKOFF_MS,
    });
    await sleepMs(REFLECT_TRANSIENT_RETRY_BACKOFF_MS);
    try {
      const reflect = await invoke();
      console.info("[reflect] transient retry succeeded", { batchIndex: logContext.batchIndex });
      return reflect;
    } catch (retryErr) {
      console.warn("[reflect] transient retry failed", {
        batchIndex: logContext.batchIndex,
        message: retryErr instanceof Error ? retryErr.message : String(retryErr),
      });
      throw retryErr;
    }
  }
}

async function finishReflectPartialSync(
  userId: string,
  plan: { pursuitIds: string[] },
  completedPursuitIds: string[],
  metrics: MapAiSyncMetrics,
  result: {
    insightsRefreshed: boolean;
    callsMade: number;
    geminiRateLimited?: boolean;
  },
): Promise<ReflectSyncResult> {
  const pendingIds = plan.pursuitIds.filter((id) => !completedPursuitIds.includes(id));
  metrics.morePending = pendingIds.length > 0;
  metrics.pendingInsightCount = pendingIds.length;
  if (completedPursuitIds.length > 0) {
    await clearReadingDirtyForPursuits(userId, completedPursuitIds);
  }
  return {
    insightsRefreshed: result.insightsRefreshed,
    geminiCallsMade: result.callsMade,
    geminiRateLimited: result.geminiRateLimited ?? false,
  };
}

function validateReflectBatch(batchPursuitIds: string[], reflect: ReflectResponse): void {
  for (const pursuitId of batchPursuitIds) {
    if (!reflect.pursuits[pursuitId]) {
      throw new ReflectGenerationResponseError(
        `Reflect call missing chapter panel for ${pursuitId}. Please try again.`,
      );
    }
  }
}

async function runReflectBatchesIncremental(
  userId: string,
  dirty: ReadingDirtyAnalysis,
  plan: { pursuitIds: string[]; themeIds: string[]; mode: import("@/lib/ai/reflect-sync-plan").ReflectWorkMode },
  enrichOptions: Required<PursuitEnrichOptions>,
  mapVersion: string,
  memoryVersion: number,
  metrics: MapAiSyncMetrics,
  options: {
    mapContext: FormattedMapContext;
    amountImpactEligible: boolean;
  },
): Promise<ReflectSyncResult> {
  const batches = chunkReflectPursuitIds(plan.pursuitIds);

  metrics.fullRefresh = plan.mode === "full";
  metrics.incrementalRefresh = plan.mode === "dirty" || plan.mode === "panels-only";

  let insightsRefreshed = false;
  let callsMade = 0;
  const completedPursuitIds: string[] = [];
  const syncRetryState = { retriesUsed: 0 };

  for (let i = 0; i < batches.length; i += 1) {
    if (!canMakeReflectCall(metrics)) {
      break;
    }
    metrics.aiCallsPlanned += 1;

    const batch = batches[i];
    const isFullBatch = i === 0 && plan.themeIds.length > 0;
    const reflectInvokeOptions = {
      scope: isFullBatch ? ("full" as const) : ("pursuits-only" as const),
      mapContext: options.mapContext,
      amountImpactEligible: options.amountImpactEligible,
    };
    try {
      const reflect = await invokeReflectBatchWithSyncCappedTransientRetry(
        () =>
          invokeGenerateReflectResponse(
            userId,
            dirty,
            batch,
            isFullBatch ? plan.themeIds : [],
            enrichOptions,
            metrics,
            reflectInvokeOptions,
          ),
        syncRetryState,
        { batchIndex: i },
      );

      validateReflectBatch(batch, reflect);

      callsMade += 1;
      metrics.aiCallsCompleted += 1;

      const { insightsWritten } = await applyReflectOutput(
        userId,
        reflect,
        batch,
        enrichOptions,
        mapVersion,
        memoryVersion,
      );
      if (insightsWritten) insightsRefreshed = true;
      completedPursuitIds.push(...batch);
    } catch (err) {
      if (isGeminiRateLimited(err)) {
        metrics.rateLimited = true;
        return finishReflectPartialSync(userId, plan, completedPursuitIds, metrics, {
          insightsRefreshed,
          callsMade,
          geminiRateLimited: true,
        });
      }
      if (isGeminiTransient(err)) {
        const message =
          err instanceof Error ? err.message : "Gemini is temporarily overloaded. Try again shortly.";
        metrics.enrichErrors.push(message);
        return finishReflectPartialSync(userId, plan, completedPursuitIds, metrics, {
          insightsRefreshed,
          callsMade,
        });
      }
      if (err instanceof ReflectGenerationResponseError) {
        metrics.enrichErrors.push(err.message);
        return finishReflectPartialSync(userId, plan, completedPursuitIds, metrics, {
          insightsRefreshed,
          callsMade,
        });
      }
      throw err;
    }
  }

  if (completedPursuitIds.length < plan.pursuitIds.length) {
    return finishReflectPartialSync(userId, plan, completedPursuitIds, metrics, {
      insightsRefreshed,
      callsMade,
    });
  }

  await clearReadingDirtyLedger(userId);
  metrics.morePending = false;
  metrics.pendingInsightCount = 0;

  return {
    insightsRefreshed,
    geminiCallsMade: callsMade,
    geminiRateLimited: false,
  };
}

/** Single-call reflect sync — dirty/missing pursuit panels + theme synthesis. */
export async function runReflectSync(
  userId: string,
  mapVersion: string,
  memoryVersion: number,
  options: {
    force?: boolean;
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

  const insightRow = await prisma.insightCache.findUnique({ where: { userId } });
  const plan = await planReflectWork(userId, dirty, {
    force: options.force,
    insightsStale: options.insightsStale,
    hasInsightCache: Boolean(insightRow),
  });

  let workPlan = plan;
  if (workPlan.pursuitIds.length === 0 && options.insightsStale) {
    const eligibleIds = await listEligiblePursuitIds(userId);
    if (eligibleIds.length > 0) {
      workPlan = {
        mode: "full",
        pursuitIds: eligibleIds,
        themeIds: await listDirtyThemeIds(userId),
      };
    }
  }

  if (workPlan.mode === "skip" || workPlan.pursuitIds.length === 0) {
    return {
      skipped: true,
      insightsRefreshed: false,
      geminiCallsMade: 0,
      geminiRateLimited: false,
    };
  }

  const mapContext = await formatMapContext(userId);
  const amountImpactEligible = isAmountImpactEligible(mapContext);

  return runReflectBatchesIncremental(
    userId,
    dirty,
    workPlan,
    enrichOptions,
    mapVersion,
    memoryVersion,
    options.metrics,
    { mapContext, amountImpactEligible },
  );
}

async function generateReflectResponse(
  userId: string,
  dirty: ReadingDirtyAnalysis,
  pursuitIds: string[],
  themeIds: string[],
  enrichOptions: Required<PursuitEnrichOptions>,
  metrics?: MapAiSyncMetrics,
  options?: {
    scope?: ReflectScope;
    mapContext?: FormattedMapContext;
    amountImpactEligible?: boolean;
  },
): Promise<ReflectResponse> {
  if (!hasGeminiKey()) {
    throw new GeminiNotConfiguredError();
  }

  const scope = options?.scope ?? "full";

  const [mapContext, userContext, readingPacket, pursuitSignals, insightCacheRow, toneGoals] =
    await Promise.all([
    options?.mapContext
      ? Promise.resolve(options.mapContext)
      : formatMapContext(userId),
    formatUserContext(userId),
    compileReadingPacket(userId, dirty, { mapContext: options?.mapContext }),
    loadPursuitSignals(userId, pursuitIds),
    prisma.insightCache.findUnique({ where: { userId }, select: { pursuitInsights: true } }),
    loadPursuitToneGoals(userId, pursuitIds),
  ]);

  const cachedPursuits = parsePursuitInsightRecord(
    insightCacheRow?.pursuitInsights,
    "pursuit",
  );
  const cachedQuietUntilByPursuit = Object.fromEntries(
    pursuitIds.map((id) => [id, cachedPursuits[id]?.quickQuestionsQuietUntil]),
  );
  const pursuitSlotContexts = await loadReflectPursuitSlotContexts(
    userId,
    pursuitIds,
    pursuitSignals,
    cachedQuietUntilByPursuit,
  );

  const amountImpactEligible =
    options?.amountImpactEligible ?? isAmountImpactEligible(mapContext);

  const readingPacketJson = readingPacketToJson(readingPacket);
  const mapContextForPrompt =
    scope === "pursuits-only"
      ? buildPursuitsOnlyMapContext(mapContext, pursuitIds)
      : mapContextForReadingPacketPrompt(mapContext);
  const mapContextJson = JSON.stringify(mapContextForPrompt);

  const pursuitToneGuidance = buildPursuitToneGuidanceBlock(pursuitIds, toneGoals);

  const systemPrompt = buildReflectSystemPrompt(
    enrichOptions,
    scope,
    amountImpactEligible,
  );
  const userPrompt = buildReflectUserMessage({
    userContext,
    readingPacketJson,
    mapContextJson,
    mapContext,
    dirtyPursuitIds: pursuitIds,
    dirtyThemeIds: themeIds,
    pursuitSignals,
    pursuitSlotContexts,
    enrichOptions,
    scope,
    pursuitToneGuidance,
  });

  if (metrics) {
    metrics.systemPromptChars += systemPrompt.length;
    metrics.mapContextChars += mapContextJson.length;
    metrics.userPromptChars += userPrompt.length;
    metrics.readingPacketChars += readingPacketJson.length;
    if (scope === "full") {
      metrics.reflectFullCalls += 1;
    } else {
      metrics.reflectScopedCalls += 1;
    }
  }

  const raw = await generateJsonCompletion({
    system: systemPrompt,
    user: userPrompt,
    maxTokens: REFLECT_MAX_OUTPUT_TOKENS,
    temperature: 0.4,
    queueKey: userId,
    onUsage: metrics
      ? (usage) => {
          metrics.hasRealTokenUsage = true;
          metrics.realInputTokens += usage.inputTokens;
          metrics.realOutputTokens += usage.outputTokens;
          metrics.realCachedInputTokens += usage.cachedInputTokens;
        }
      : undefined,
  });

  let json: unknown;
  try {
    json = clampInsightGenerationJson(JSON.parse(stripMarkdownFence(raw)) as unknown);
  } catch (err) {
    throw new ReflectGenerationResponseError(
      "Reflect call returned incomplete JSON. Please try again.",
      { cause: err },
    );
  }

  const normalized = normalizeReflectResponse(json);
  const parsed = reflectResponseSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new ReflectGenerationResponseError(
      parsed.error.issues[0]?.message ?? "Invalid reflect response shape.",
    );
  }

  if (metrics) {
    metrics.reflectResponseChars += JSON.stringify(parsed.data).length;
  }

  return parsed.data;
}

type GenerateReflectResponseFn = typeof generateReflectResponse;

let generateReflectResponseDelegate: GenerateReflectResponseFn | null = null;

function invokeGenerateReflectResponse(...args: Parameters<GenerateReflectResponseFn>) {
  const fn = generateReflectResponseDelegate ?? generateReflectResponse;
  return fn(...args);
}

/** @internal Vitest hook for batch-cap tests — pass null to restore production behavior. */
export function setGenerateReflectResponseDelegate(delegate: GenerateReflectResponseFn | null) {
  generateReflectResponseDelegate = delegate;
}

function mergeReflectResponses(partials: ReflectResponse[]): ReflectResponse {
  const merged: ReflectResponse = { themes: {}, pursuits: {} };
  for (const partial of partials) {
    if (partial.overall && !merged.overall) {
      merged.overall = partial.overall;
    }
    merged.themes = { ...merged.themes, ...(partial.themes ?? {}) };
    merged.pursuits = { ...merged.pursuits, ...partial.pursuits };
  }
  return merged;
}

export { isReflectCallEnabled };

/** @internal Exported for vitest completeness / output-size assertions. */
export {
  buildReflectPursuitsOnlySystemPrompt,
  buildReflectSystemPrompt,
  buildReflectUserMessage,
  generateReflectResponse,
  generateReflectResponseBatched,
  mergeReflectResponses,
  runReflectBatchesIncremental,
};

async function generateReflectResponseBatched(
  userId: string,
  dirty: ReadingDirtyAnalysis,
  pursuitIds: string[],
  themeIds: string[],
  enrichOptions: Required<PursuitEnrichOptions>,
  metrics?: MapAiSyncMetrics,
): Promise<ReflectResponse> {
  const batches = chunkReflectPursuitIds(pursuitIds);
  const partials: ReflectResponse[] = [];

  for (let i = 0; i < batches.length; i += 1) {
    partials.push(
      await generateReflectResponse(
        userId,
        dirty,
        batches[i],
        i === 0 ? themeIds : [],
        enrichOptions,
        metrics,
        { scope: i === 0 ? "full" : "pursuits-only" },
      ),
    );
  }

  const merged = mergeReflectResponses(partials);
  for (const pursuitId of pursuitIds) {
    if (!merged.pursuits[pursuitId]) {
      throw new ReflectGenerationResponseError(
        `Reflect call missing chapter panel for ${pursuitId}. Please try again.`,
      );
    }
  }

  return merged;
}
