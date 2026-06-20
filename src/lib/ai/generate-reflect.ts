import { formatMapContext, type FormattedMapContext } from "@/lib/ai/format-map-context";
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
import { isHolisticBenchmarkEligible } from "@/lib/pursuit/pursuit-enrich-readiness";
import { loadAllPursuitSignals } from "@/lib/pursuit/load-pursuit-signals";
import { clampInsightGenerationJson } from "@/lib/insights/clamp-insight-json";
import { planReflectWork } from "@/lib/ai/reflect-sync-plan";
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

const VOICE_EVALUATIVE_ANTI_PATTERNS = [
  "EVALUATIVE LANGUAGE (never use):",
  '- Do not evaluate the user\'s qualities: "demonstrates dedication", "shows discipline", "reflects commitment", "strong financial management", "robust approach"',
  '- Do not grade their progress: "significant achievement", "impressive", "remarkable", "outstanding"',
  "- Do not write like a performance review or recommendation letter",
  "- Instead: describe what actually happened, in plain language, and let the user feel what they feel about it",
  '- Wrong: "Passing Module 2 marks significant progress towards your CeMAP qualification, demonstrating strong dedication to professional development."',
  '- Right: "Two modules down, one to go — Module 3 is in sixteen days."',
  '- Wrong: "This balanced approach to debt reduction and asset growth demonstrates robust financial management."',
  '- Right: "The debt\'s cleared and the ISA is a quarter of the way there. Two different speeds, both moving."',
  "- The voice is a calm friend who knows your situation, not a manager writing your annual review.",
].join("\n");

const HEADLINE_MUST_ADD_MEANING = [
  "HEADLINE MUST ADD MEANING:",
  '- Never restate the status line ("X is paused with a deadline of Y") or the milestone count ("X has N milestones complete")',
  "- The user already sees those. The headline tells them what it MEANS.",
  '- Wrong: "Half-marathon pursuit has one milestone complete, 5k achieved 79 days ago"',
  '- Right: "5k is done — the jump to 10k is where the training plan actually starts"',
  "- If there's nothing meaningful to add beyond the status, write a shorter, honest headline rather than padding with facts the user already has.",
].join("\n");

const REFLECT_BENCHMARK_INSIGHT_RUBRIC = [
  "BENCHMARK & INSIGHT MOVES",
  "",
  "These examples illustrate *moves* — ways of finding the edge in a pursuit. They are NOT a list",
  "of topics or domains. Each move applies to ANY pursuit regardless of subject. The genres below",
  "are varied on purpose, to show the same move working across money, fitness, relationships, and",
  "work — apply these shapes to whatever pursuit you're given, including kinds not shown here. Use",
  "the user's profile (age, location) and the rest of their map as the material. Name the real",
  "pursuit. At most one observation per pursuit.",
  "",
  "Move 1 — Benchmark against the person. Is this notable for someone like them, given age,",
  "location, or stage?",
  '- Weak: "Saving £500k in an ISA is a great financial goal."',
  '- Strong: "Targeting £500k in an ISA by your mid-thirties is an unusually steep climb — the',
  '  live question isn\'t the target, it\'s the monthly contribution that gets you there."',
  "",
  "Move 2 — Read the combination. What does it mean that these two things sit on the map together?",
  "(Needs no numbers — works for anything.)",
  '- Weak: "You have several active pursuits across work and family."',
  '- Strong: "You\'ve marked being more present at home as significant in the same season three',
  '  work pursuits are all peaking — those are competing for the same evenings, not running in',
  '  parallel."',
  "",
  "Move 3 — Read the trajectory. Given where they are versus the deadline or milestones, are they",
  "ahead, on pace, or drifting?",
  '- Weak: "Your half-marathon training is in progress."',
  '- Strong: "With the race ten weeks out and your longest run still at 8k, the half-marathon is',
  '  reachable but the next month is where it\'s won or lost."',
  "",
  "Move 4 — Be honest about thin or stalled. When a pursuit is sparse, untouched, or stuck, say so",
  "plainly instead of padding.",
  '- Weak: "Learning Spanish is a wonderful journey of growth."',
  '- Strong: "Learn Spanish has sat on the map since spring with nothing logged — either it\'s',
  '  waiting for a real start date, or it\'s quietly telling you it\'s not this year\'s priority."',
  "",
  "GROUNDING RULE (mandatory): Benchmark only when you have real grounds — age, location, an actual",
  "number, or another pursuit on the map to weigh against. If a pursuit is qualitative and you have",
  "nothing concrete to compare it to, reflect on it plainly and specifically; do NOT invent a",
  "statistic, percentile, or comparison. Never assert a population ranking you cannot derive from",
  "the context. A relationship or personal-growth pursuit is read through the map (Move 2) and",
  "honesty (Move 4), not through fabricated numbers.",
];

/** Pursuit panel insight only — not whole-map Reading (seasonRead). */
const PURSUIT_PANEL_MILESTONE_VISIBILITY = [
  "PURSUIT PANEL — MILESTONE LIST IS ON SCREEN:",
  "The mobile pursuit sheet shows the milestone list directly below this insight.",
  "Do NOT restate, enumerate, or quote milestone titles in headline, body, fromMap, or comparison.",
  'Do NOT write "next step is X" or "your next milestone is X" when X is already a visible milestone row.',
  "Read milestones as grounding for trajectory (Move 3): pace, gaps, and what completion implies — without naming row labels.",
  "Speak to overall progress, what it means, or what is notably missing beyond the checklist the user already sees.",
];

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
    "You generate Pathfinder pursuit insight panels only.",
    "Return ONLY valid JSON — no preamble, no markdown fences.",
    "",
    "RULES:",
    "- Name pursuits VERBATIM from map context.",
    "- Never invent pursuits or connections not in the data.",
    "- Existing milestones on the map are facts — do not duplicate them in prose. Proposing new waypoints in suggestedMilestones is allowed when the user message permits.",
    "- Do not restate status changes, edits, or metadata updates in headline or body.",
    PURSUIT_PANEL_CONTEXT_PRECEDENCE,
    HEADLINE_MUST_ADD_MEANING,
    "- Never generic headlines like \"[title] is progressing well\" — name the specific fact (e.g. \"Contributions are a quarter of the way there after the raise\").",
    "- headline <= 100 chars; body 2-4 sentences, <= 500 chars.",
    "- Direct declarative voice in headline and body — no \"your map shows\", no opening with the user's name, no UI section labels.",
    "",
    ...REFLECT_BENCHMARK_INSIGHT_RUBRIC,
    "",
    PEOPLE_THEME_BODY_CLAUSE,
    ...amountImpactBodyPromptLines(amountImpactEligible),
    ...clarifierRules,
    buildClarifierKindPromptSection(options),
    "",
    "VOICE ANTI-PATTERNS:",
    "- Do not open with the user's name, say \"your map shows\", or use \"significant\" as filler.",
    VOICE_EVALUATIVE_ANTI_PATTERNS,
    "",
    "OUTPUT:",
    '- "pursuits": map of pursuitId -> { headline, body, fromMap?, comparison?, clarifiers?, suggestedMilestones? }',
    "  Pursuit tone is assigned server-side from map signals — do not set tone.",
    ...PURSUIT_PANEL_MILESTONE_VISIBILITY,
    ...PURSUIT_PANEL_SUGGESTED_MILESTONES_FIELD,
    ...SUGGESTED_MILESTONES_OUTPUT_LINES,
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
    "You are Pathfinder's reflection engine. Return a single JSON object with per-theme synthesis and per-pursuit insight panels.",
    "Return ONLY valid JSON — no preamble, no markdown fences.",
    "",
    "RULES:",
    "- Name pursuits VERBATIM from map context — never paraphrase titles.",
    "- Never invent pursuits or connections not in the data.",
    "- Existing milestones on the map are facts — do not duplicate them in prose. Proposing new waypoints in suggestedMilestones is allowed when the user message permits.",
    "- No filler: ban \"it will be interesting\", \"journey\", \"keep building\", \"as they take shape\", \"holistic commitment\".",
    "- Do not restate status changes, edits, or metadata updates in headline or body.",
    PURSUIT_PANEL_CONTEXT_PRECEDENCE,
    HEADLINE_MUST_ADD_MEANING,
    "- Never generic headlines like \"[title] is progressing well\" or \"Your ISA is progressing well\" — state the specific fact.",
    "- Be honest about gaps and sparse maps.",
    "",
    ...REFLECT_BENCHMARK_INSIGHT_RUBRIC,
    "",
    "VOICE ANTI-PATTERNS (pursuit headline/body/fromMap/comparison):",
    "- Do not open any text with the user's name (\"Alex, ...\").",
    "- Do not say \"your map shows\", \"the app sees\", \"this Reading reflects\".",
    "- Do not use \"significant\" as filler — name what is actually notable.",
    "- Do not write \"You have been making progress\" — say what the progress is.",
    VOICE_EVALUATIVE_ANTI_PATTERNS,
    "",
    "OUTPUT:",
    '- "pursuits": map of pursuitId -> { headline, body, fromMap?, comparison?, clarifiers?, suggestedMilestones? }',
    "  Pursuit tone is assigned server-side from map signals — do not set tone.",
    "  headline <= 100 chars; body 2-4 sentences, <= 500 chars — direct declarative prose, not chatbot narration.",
    "  Do NOT embed \"From your map:\" or \"Comparison:\" prefixes inside body — use the structured fields; the mobile UI adds section labels.",
    ...PURSUIT_PANEL_MILESTONE_VISIBILITY,
    ...PURSUIT_PANEL_SUGGESTED_MILESTONES_FIELD,
    ...SUGGESTED_MILESTONES_OUTPUT_LINES,
    "",
    PEOPLE_THEME_BODY_CLAUSE,
    ...amountImpactBodyPromptLines(amountImpactEligible),
    ...clarifierRules,
    buildClarifierKindPromptSection(options),
    "",
    "THEME INSIGHTS (macro synthesis — not per-pursuit narrative):",
    "- \"themes\": map of themeId -> { tone, oneLiner, reflective, contextual?, combined? }",
    "  tone MUST be one of: celebratory | encouraging | nudge",
    "  oneLiner <= 100 chars — theme-level verdict on balance, bottlenecks, or resource friction across pursuits in this theme.",
    "  reflective: 2-3 sentences on cross-pursuit dynamics within the theme — competition, reinforcement, tension (<= 500 chars). Name specific pursuits; do not inventory every row.",
    "  contextual: optional supplementary theme observation (<= 500 chars); empty string if none.",
    "  combined: optional forward-looking unlock for the theme (<= 500 chars); empty string if none.",
    "  Do not repeat pursuit-panel execution copy in theme insights — pursuit sheets own per-pursuit velocity; theme insights do not replace suggestedMilestones on pursuit panels.",
    "  Only include themes listed in <dirty_themes>. Skip themes with no pursuits.",
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
      significance: Math.min(5, Math.max(1, Math.round(goal.significance ?? 3))),
      enrichAnswers,
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
      description: true,
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
      const hubs = theme.hubs.flatMap((hub) => {
        const dirtyPursuits = hub.pursuits.filter((pursuit) => dirtyIds.has(pursuit.id));
        if (dirtyPursuits.length === 0) return [];

        const siblingPursuits = hub.pursuits.filter((pursuit) => !dirtyIds.has(pursuit.id));
        return [
          {
            ...hub,
            // Same-category siblings keep local context without sending the whole map.
            pursuits: [...dirtyPursuits, ...siblingPursuits],
          },
        ];
      });

      if (hubs.length === 0) return [];
      return [{ ...theme, hubs }];
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
  dirtyPursuitIds: string[];
  dirtyThemeIds: string[];
  pursuitSignals: Map<string, PursuitSignal>;
  pursuitSlotContexts: Map<string, QuestionSlotMessageContext>;
  enrichOptions: Required<PursuitEnrichOptions>;
  scope?: ReflectScope;
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

  const lines = [
    input.userContext || "(No profile context yet.)",
    "",
    "<reading_packet>",
    input.readingPacketJson,
    "</reading_packet>",
    "",
    "<map_context>",
    input.mapContextJson,
    "</map_context>",
  ];

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
    "",
    ...(milestoneOptions ? [milestoneOptions, ""] : []),
    ...quickQuestionSlots,
    "<options>",
    `clarifyTitles: ${input.enrichOptions.clarifyTitles}`,
    "</options>",
    "",
    "Only include pursuit entries for the dirty pursuit IDs listed above.",
  );

  if (scope === "full") {
    lines.push(
      "Only include theme entries for the dirty theme IDs listed above.",
      'Respond with ONLY a JSON object: { "themes": { ... }, "pursuits": { ... } }',
    );
  } else {
    lines.push(
      'Return ONLY: { "pursuits": { ... } } — one entry per dirty pursuit ID.',
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
        `Reflect call missing pursuit panel for ${pursuitId}. Please try again.`,
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
    holisticBenchmarkEligible: boolean;
  },
): Promise<ReflectSyncResult> {
  const batches = chunkReflectPursuitIds(plan.pursuitIds);

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
      holisticBenchmarkEligible: options.holisticBenchmarkEligible,
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

  const plan = await planReflectWork(userId, dirty, {
    force: options.force,
    insightsStale: options.insightsStale,
  });

  if (plan.mode === "skip" || plan.pursuitIds.length === 0) {
    return {
      skipped: true,
      insightsRefreshed: false,
      geminiCallsMade: 0,
      geminiRateLimited: false,
    };
  }

  const mapContext = await formatMapContext(userId);
  const [amountImpactEligible, allPursuitSignals] = await Promise.all([
    Promise.resolve(isAmountImpactEligible(mapContext)),
    loadAllPursuitSignals(userId),
  ]);
  const holisticBenchmarkEligible = isHolisticBenchmarkEligible(allPursuitSignals);

  return runReflectBatchesIncremental(
    userId,
    dirty,
    plan,
    enrichOptions,
    mapVersion,
    memoryVersion,
    options.metrics,
    { mapContext, amountImpactEligible, holisticBenchmarkEligible },
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
    holisticBenchmarkEligible?: boolean;
  },
): Promise<ReflectResponse> {
  if (!hasGeminiKey()) {
    throw new GeminiNotConfiguredError();
  }

  const scope = options?.scope ?? "full";

  const [mapContext, userContext, readingPacket, pursuitSignals, allPursuitSignals, insightCacheRow] =
    await Promise.all([
    options?.mapContext
      ? Promise.resolve(options.mapContext)
      : formatMapContext(userId),
    formatUserContext(userId),
    compileReadingPacket(userId, dirty),
    loadPursuitSignals(userId, pursuitIds),
    options?.holisticBenchmarkEligible === undefined
      ? loadAllPursuitSignals(userId)
      : Promise.resolve([]),
    prisma.insightCache.findUnique({ where: { userId }, select: { pursuitInsights: true } }),
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
  const holisticBenchmarkEligible =
    options?.holisticBenchmarkEligible ??
    isHolisticBenchmarkEligible(allPursuitSignals);

  const readingPacketJson = readingPacketToJson(readingPacket);
  const mapContextForPrompt =
    scope === "pursuits-only"
      ? buildPursuitsOnlyMapContext(mapContext, pursuitIds)
      : mapContextForReadingPacketPrompt(mapContext);
  const mapContextJson = JSON.stringify(mapContextForPrompt, null, 2);

  const systemPrompt = buildReflectSystemPrompt(
    enrichOptions,
    scope,
    amountImpactEligible,
  );
  const userPrompt = buildReflectUserMessage({
    userContext,
    readingPacketJson,
    mapContextJson,
    dirtyPursuitIds: pursuitIds,
    dirtyThemeIds: themeIds,
    pursuitSignals,
    pursuitSlotContexts,
    enrichOptions,
    scope,
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
        `Reflect call missing pursuit panel for ${pursuitId}. Please try again.`,
      );
    }
  }

  return merged;
}
