import { formatMapContext, type FormattedMapContext } from "@/lib/ai/format-map-context";
import {
  amountImpactBodyPromptLines,
  amountImpactReadingPromptLines,
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
import { buildStorySystemPrompt, countMapPursuits } from "@/lib/story/generate-story";
import { isHolisticBenchmarkEligible } from "@/lib/pursuit/pursuit-enrich-readiness";
import { loadAllPursuitSignals } from "@/lib/pursuit/load-pursuit-signals";
import { isCurrentStoryPayload } from "@/lib/story/parse-story-cache";
import { STORY_SCHEMA_VERSION, type StoryGenerationResult } from "@/lib/story/story-types";
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

const RELATIONSHIP_QUESTIONS_FORBIDDEN = [
  "RELATIONSHIP QUESTIONS — DO NOT GENERATE:",
  '- Never ask how one pursuit relates to another ("How does X relate to Y?")',
  "- Never ask whether pursuits support, compete, or overlap",
  "- Pursuit relationships will be user-authored (connection lines) — do not ask the AI to infer them via questions",
  "- This rule applies regardless of the suggestConnections flag",
].join("\n");

const CONTEXTUAL_QUICK_QUESTIONS = [
  "CONTEXTUAL QUICK QUESTIONS:",
  "When generating clarifiers for a pursuit, ask about the domain-specific detail that would MOST change how this pursuit should be understood. Use your world knowledge of the pursuit's domain.",
  "",
  "Examples of GOOD contextual questions (the kind to generate):",
  "",
  'For a debt pursuit ("Clear £10,000 credit card debt"):',
  '- "Is this on a 0% promotional rate, or are you paying interest?" → the answer changes urgency completely',
  '- "What\'s the monthly payment?" → grounds the timeline',
  "",
  'For a qualification ("CeMAP qualification"):',
  '- "Are you self-studying or enrolled in a course?" → changes the pace expectation',
  '- "Is this required for your current role or a career change?" → changes the significance framing',
  "",
  'For a fitness goal ("Half-marathon"):',
  '- "What\'s your current longest run?" → grounds where they actually are',
  '- "Is this a specific race with a registration date?" → deadline becomes real vs aspirational',
  "",
  'For a financial goal ("£500,000 ISA"):',
  '- "Is this a stocks-and-shares ISA or cash?" → changes the growth framing entirely',
  '- "What\'s your monthly contribution?" → makes progress concrete',
  "",
  'For a life event ("Plan wedding"):',
  '- "Do you have a venue booked?" → distinguishes dream from plan',
  '- "What\'s the budget range?" → grounds the financial implications',
  "",
  "RULES for contextual questions:",
  "- Ask ONE question per sync (max), about the detail that would most change the Reading",
  "- The question must have a CONCRETE answer (a fact, a number, a yes/no) — not an open reflection (\"How do you feel about this?\")",
  "- The answer options should be specific and plausible (not generic \"Yes / No / Not sure\")",
  "- Use world knowledge to ask what a domain expert would ask — the model KNOWS what matters for credit cards, mortgages, races, qualifications",
  "- Once the pursuit has rich context (description + answers ≥ 120 chars), stop asking — don't over-probe",
  "- NEVER ask about relationships between pursuits (see RELATIONSHIP QUESTIONS rule)",
  '- NEVER ask the user to evaluate their own motivation or commitment ("How important is this to you?") — significance already covers that',
  "",
  "Title-disambiguation questions are still allowed when the title is genuinely ambiguous — domain questions are ADDITIONAL, not a replacement.",
  "",
  "OPTIONS FORMAT:",
  "- 3-4 specific, plausible answer options — not generic",
  '- Wrong options: "Yes / No / Not sure / Other"',
  '- Right options for "Is this on a 0% rate?": "Yes, 0% until [month]" / "No, standard interest rate" / "Not sure — need to check"',
  '- Right options for "Current longest run?": "Under 5k" / "5-10k" / "10k+" / "Haven\'t started training"',
  "- The options should cover the realistic range for this domain",
].join("\n");

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
    ? [
        "- clarifiers: 0-1 multiple-choice question per pursuit when title is ambiguous OR context is thin.",
        "  Each clarifier: id (short slug), prompt (question), options (3-4 domain-specific labels).",
        CONTEXTUAL_QUICK_QUESTIONS,
      ]
    : ["- clarifiers: always return an empty array."];

  return [
    "You generate Pathfinder pursuit insight panels only.",
    "Return ONLY valid JSON — no preamble, no markdown fences.",
    "",
    "RULES:",
    "- Name pursuits VERBATIM from map context.",
    "- Never invent pursuits, milestones, or connections not in the data.",
    "- Do not restate status changes, edits, or metadata updates in headline or body.",
    HEADLINE_MUST_ADD_MEANING,
    "- Never generic headlines like \"[title] is progressing well\" — name the specific fact (e.g. \"Contributions are a quarter of the way there after the raise\").",
    "- headline <= 100 chars; body 2-4 sentences, <= 500 chars.",
    "- Direct declarative voice in headline and body — no \"your map shows\", no opening with the user's name, no UI section labels.",
    "",
    PEOPLE_THEME_BODY_CLAUSE,
    ...amountImpactBodyPromptLines(amountImpactEligible),
    ...clarifierRules,
    RELATIONSHIP_QUESTIONS_FORBIDDEN,
    "",
    "VOICE ANTI-PATTERNS:",
    "- Do not open with the user's name, say \"your map shows\", or use \"significant\" as filler.",
    VOICE_EVALUATIVE_ANTI_PATTERNS,
    "",
    "OUTPUT:",
    '- "reading": always return an empty string "".',
    '- "pursuits": map of pursuitId -> { headline, body, fromMap?, comparison?, clarifiers?, suggestedMilestones? }',
    "  Pursuit tone is assigned server-side from map signals — do not set tone.",
    "  When age AND location are in user context, include fromMap and/or comparison fields (<= 200 chars each).",
    "- Do NOT include themes.",
  ].join("\n");
}

function buildReflectSystemPrompt(
  totalPursuitCount: number,
  options: Required<PursuitEnrichOptions>,
  scope: ReflectScope = "full",
  amountImpactEligible = false,
  holisticBenchmarkEligible = false,
): string {
  if (scope === "pursuits-only") {
    return buildReflectPursuitsOnlySystemPrompt(options, amountImpactEligible);
  }
  const clarifierRules = options.clarifyTitles
    ? [
        "- clarifiers: 0-1 multiple-choice question per pursuit when title is ambiguous OR context is thin.",
        "  Each clarifier: id (short slug), prompt (question), options (3-4 domain-specific labels).",
        CONTEXTUAL_QUICK_QUESTIONS,
      ]
    : ["- clarifiers: always return an empty array — do not generate quick questions."];

  return [
    "You are Pathfinder's reflection engine. Return a single JSON object with a whole-map reading and per-pursuit insights.",
    "Return ONLY valid JSON — no preamble, no markdown fences.",
    "",
    "RULES:",
    "- Name pursuits VERBATIM from map context — never paraphrase titles.",
    "- Never invent pursuits, milestones, or connections not in the data.",
    "- No filler: ban \"it will be interesting\", \"journey\", \"keep building\", \"as they take shape\", \"holistic commitment\".",
    "- Do not restate status changes, edits, or metadata updates in headline or body.",
    HEADLINE_MUST_ADD_MEANING,
    "- Never generic headlines like \"[title] is progressing well\" or \"Your ISA is progressing well\" — state the specific fact.",
    "- One concrete suggestion per pursuit, max.",
    "- Be honest about gaps and sparse maps.",
    "- Use age/location for contextual benchmarking only when data supports it.",
    "",
    "VOICE ANTI-PATTERNS (reading + pursuit headline/body/fromMap/comparison):",
    "- Do not open any text with the user's name (\"Alex, ...\").",
    "- Do not say \"your map shows\", \"the app sees\", \"this Reading reflects\".",
    "- Do not use \"significant\" as filler — name what is actually notable.",
    "- Do not write \"You have been making progress\" — say what the progress is.",
    "- Do not narrate Reading structure (\"First...\", \"In summary...\", \"In your Work theme...\").",
    '- Wrong: "Your map shows a significant financial arrival." Right: "Clearing the credit card debt ahead of schedule frees capacity before other spend ramps up."',
    VOICE_EVALUATIVE_ANTI_PATTERNS,
    "",
    ...amountImpactReadingPromptLines(amountImpactEligible),
    "",
    "OUTPUT:",
    '- "reading": whole-map reflective prose per WHOLE-MAP READING rules in the story prompt below.',
    '- "pursuits": map of pursuitId -> { headline, body, fromMap?, comparison?, clarifiers?, suggestedMilestones? }',
    "  Pursuit tone is assigned server-side from map signals — do not set tone.",
    "  headline <= 100 chars; body 2-4 sentences, <= 500 chars — direct declarative prose, not chatbot narration.",
    "  When age AND location are in user context, include fromMap and/or comparison fields (<= 200 chars each).",
    "  Do NOT embed \"From your map:\" or \"Comparison:\" prefixes inside body — use the structured fields; the mobile UI adds section labels.",
    "",
    PEOPLE_THEME_BODY_CLAUSE,
    ...amountImpactBodyPromptLines(amountImpactEligible),
    ...clarifierRules,
    RELATIONSHIP_QUESTIONS_FORBIDDEN,
    "- suggestedMilestones: 0-6 chronological steps ONLY when user message says milestones are allowed; otherwise null.",
    "  When milestones already exist on the map, suggest only missing steps from the current frontier to the deadline — do not duplicate existing titles.",
    "",
    "THEME INSIGHTS (macro synthesis — not per-pursuit narrative):",
    "- \"themes\": map of themeId -> { tone, oneLiner, reflective, contextual?, combined? }",
    "  tone MUST be one of: celebratory | encouraging | nudge",
    "  oneLiner <= 100 chars — theme-level verdict on balance, bottlenecks, or resource friction across pursuits in this theme.",
    "  reflective: 2-3 sentences on cross-pursuit dynamics within the theme — competition, reinforcement, tension (<= 500 chars). Name specific pursuits; do not inventory every row.",
    "  contextual: optional age/location benchmark for the theme as a whole (<= 500 chars); empty string if none.",
    "  combined: optional forward-looking unlock for the theme (<= 500 chars); empty string if none.",
    "  Do not repeat pursuit-panel execution copy — pursuit sheets own velocity and milestones.",
    "  Only include themes listed in <dirty_themes>. Skip themes with no pursuits.",
    "",
    buildStorySystemPrompt(totalPursuitCount, amountImpactEligible, holisticBenchmarkEligible),
  ].join("\n");
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
      return `- ${pursuitId}: Milestones allowed — path has ${signal.completedMilestoneCount}/${signal.milestoneCount} complete; suggest only missing chronological steps to the deadline; do not duplicate existing titles; max 6.`;
    }
    return `- ${pursuitId}: Milestones allowed — suggest 0-6 concrete chronological steps when specific.`;
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
  scope?: ReflectScope;
}): string {
  const scope = input.scope ?? "full";
  const milestoneOptions = buildReflectMilestoneOptions(input.dirtyPursuitIds, input.pursuitSignals);

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
      "<previous_reading>",
      input.previousReading || "None — this is the first reading.",
      "</previous_reading>",
      "If the previous reading claims any pursuit is complete but the current map shows that pursuit's status as ACTIVE, PAUSED, or MAINTAINING, remove that claim. The current map status is the only source of truth for completion.",
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
    "<options>",
    `clarifyTitles: ${input.enrichOptions.clarifyTitles}`,
    `suggestConnections: ${input.enrichOptions.suggestConnections}`,
    `includeMarks: ${input.enrichOptions.includeMarks}`,
    "</options>",
    "",
    "Only include pursuit entries for the dirty pursuit IDs listed above.",
  );

  if (scope === "full") {
    lines.push(
      "Only include theme entries for the dirty theme IDs listed above.",
      'Always include "reading" — it reflects the whole map.',
      'Respond with ONLY a JSON object: { "reading": "...", "themes": { ... }, "pursuits": { ... } }',
    );
  } else {
    lines.push(
      'Return ONLY: { "reading": "", "pursuits": { ... } } — one entry per dirty pursuit ID.',
    );
  }

  return lines.filter((line) => line !== null).join("\n");
}

async function finishReflectPartialSync(
  userId: string,
  plan: { pursuitIds: string[] },
  completedPursuitIds: string[],
  metrics: MapAiSyncMetrics,
  result: {
    insightsRefreshed: boolean;
    storyRefreshed: boolean;
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
    storyRefreshed: result.storyRefreshed,
    geminiCallsMade: result.callsMade,
    geminiRateLimited: result.geminiRateLimited ?? false,
  };
}

function validateReflectBatch(
  batchPursuitIds: string[],
  reflect: ReflectResponse,
  options: { requireReading?: boolean },
): void {
  for (const pursuitId of batchPursuitIds) {
    if (!reflect.pursuits[pursuitId]) {
      throw new ReflectGenerationResponseError(
        `Reflect call missing pursuit panel for ${pursuitId}. Please try again.`,
      );
    }
  }
  if (options.requireReading && !reflect.reading.trim()) {
    throw new ReflectGenerationResponseError(
      "Reflect call returned no whole-map reading. Please try again.",
    );
  }
}

async function runReflectBatchesIncremental(
  userId: string,
  dirty: ReadingDirtyAnalysis,
  plan: { pursuitIds: string[]; themeIds: string[]; mode: import("@/lib/ai/reflect-sync-plan").ReflectWorkMode },
  enrichOptions: Required<PursuitEnrichOptions>,
  previousReading: string,
  mapVersion: string,
  memoryVersion: number,
  metrics: MapAiSyncMetrics,
  options: {
    needsReadingRefresh: boolean;
    mapContext: FormattedMapContext;
    amountImpactEligible: boolean;
    holisticBenchmarkEligible: boolean;
  },
): Promise<ReflectSyncResult> {
  const batches = chunkReflectPursuitIds(plan.pursuitIds);

  let insightsRefreshed = false;
  let storyRefreshed = false;
  let callsMade = 0;
  const completedPursuitIds: string[] = [];

  for (let i = 0; i < batches.length; i += 1) {
    if (!canMakeReflectCall(metrics)) {
      break;
    }
    metrics.aiCallsPlanned += 1;

    const batch = batches[i];
    const isFullBatch = i === 0 && options.needsReadingRefresh;
    try {
      const reflect = await invokeGenerateReflectResponse(
        userId,
        dirty,
        batch,
        isFullBatch ? plan.themeIds : [],
        enrichOptions,
        previousReading,
        metrics,
        { scope: isFullBatch ? "full" : "pursuits-only", mapContext: options.mapContext, amountImpactEligible: options.amountImpactEligible, holisticBenchmarkEligible: options.holisticBenchmarkEligible },
      );

      validateReflectBatch(batch, reflect, { requireReading: isFullBatch });

      callsMade += 1;
      metrics.aiCallsCompleted += 1;

      const { insightsWritten, storyWritten } = await applyReflectOutput(
        userId,
        reflect,
        batch,
        enrichOptions,
        mapVersion,
        memoryVersion,
      );
      if (insightsWritten) insightsRefreshed = true;
      if (storyWritten) storyRefreshed = true;
      completedPursuitIds.push(...batch);
    } catch (err) {
      if (isGeminiRateLimited(err)) {
        metrics.rateLimited = true;
        return finishReflectPartialSync(userId, plan, completedPursuitIds, metrics, {
          insightsRefreshed,
          storyRefreshed,
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
          storyRefreshed,
          callsMade,
        });
      }
      if (err instanceof ReflectGenerationResponseError) {
        metrics.enrichErrors.push(err.message);
        return finishReflectPartialSync(userId, plan, completedPursuitIds, metrics, {
          insightsRefreshed,
          storyRefreshed,
          callsMade,
        });
      }
      throw err;
    }
  }

  if (completedPursuitIds.length < plan.pursuitIds.length) {
    return finishReflectPartialSync(userId, plan, completedPursuitIds, metrics, {
      insightsRefreshed,
      storyRefreshed,
      callsMade,
    });
  }

  await clearReadingDirtyLedger(userId);
  metrics.morePending = false;
  metrics.pendingInsightCount = 0;

  return {
    insightsRefreshed,
    storyRefreshed,
    geminiCallsMade: callsMade,
    geminiRateLimited: false,
  };
}

/** Single-call reflect sync — Reading + dirty/missing pursuit panels. */
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

  const storyRow = await prisma.storyCache.findUnique({ where: { userId } });
  const previousStory = storyRow ? parsePreviousStory(storyRow.payload) : null;
  const previousReading = previousStory?.seasonRead?.trim() ?? "";
  const hasStory = Boolean(previousReading);

  const plan = await planReflectWork(userId, dirty, {
    force: options.force,
    storyStale: options.storyStale,
    insightsStale: options.insightsStale,
    hasStory,
  });

  if (plan.mode === "skip" || plan.pursuitIds.length === 0) {
    return {
      skipped: true,
      insightsRefreshed: false,
      storyRefreshed: false,
      geminiCallsMade: 0,
      geminiRateLimited: false,
    };
  }

  const needsReadingRefresh =
    plan.mode === "full" || options.storyStale || !hasStory;

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
    previousReading,
    mapVersion,
    memoryVersion,
    options.metrics,
    { needsReadingRefresh, mapContext, amountImpactEligible, holisticBenchmarkEligible },
  );
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

async function generateReflectResponse(
  userId: string,
  dirty: ReadingDirtyAnalysis,
  pursuitIds: string[],
  themeIds: string[],
  enrichOptions: Required<PursuitEnrichOptions>,
  previousReading: string,
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

  const [mapContext, userContext, readingPacket, pursuitSignals, allPursuitSignals] =
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
  ]);

  const amountImpactEligible =
    options?.amountImpactEligible ?? isAmountImpactEligible(mapContext);
  const holisticBenchmarkEligible =
    options?.holisticBenchmarkEligible ??
    isHolisticBenchmarkEligible(allPursuitSignals);

  const readingPacketJson = readingPacketToJson(readingPacket);
  const mapContextForPrompt =
    scope === "pursuits-only"
      ? buildPursuitsOnlyMapContext(mapContext, pursuitIds)
      : mapContext;
  const mapContextJson = JSON.stringify(mapContextForPrompt, null, 2);
  if (metrics && scope === "full") {
    metrics.readingPacketChars = readingPacketJson.length;
  }

  const totalPursuitCount = countMapPursuits(mapContext);

  const raw = await generateJsonCompletion({
    system: buildReflectSystemPrompt(
      totalPursuitCount,
      enrichOptions,
      scope,
      amountImpactEligible,
      holisticBenchmarkEligible,
    ),
    user: buildReflectUserMessage({
      userContext,
      readingPacketJson,
      mapContextJson,
      previousReading,
      dirtyPursuitIds: pursuitIds,
      dirtyThemeIds: themeIds,
      pursuitSignals,
      enrichOptions,
      scope,
    }),
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
  const merged: ReflectResponse = { reading: "", themes: {}, pursuits: {} };
  for (const partial of partials) {
    if (partial.reading.trim()) merged.reading = partial.reading;
    merged.themes = { ...merged.themes, ...(partial.themes ?? {}) };
    merged.pursuits = { ...merged.pursuits, ...partial.pursuits };
  }
  return merged;
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
  previousReading: string,
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
        previousReading,
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
  if (!merged.reading.trim()) {
    throw new ReflectGenerationResponseError(
      "Reflect call returned no whole-map reading. Please try again.",
    );
  }

  return merged;
}
