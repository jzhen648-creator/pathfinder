import { formatMapContext, formatPursuitContext } from "@/lib/ai/format-map-context";
import { pursuitStatusPromptBlock } from "@/lib/ai/pursuit-status-prompt";
import { isAmountImpactEligible, amountImpactBodyPromptLines } from "@/lib/ai/amount-impact-eligibility";
import { PEOPLE_THEME_BODY_CLAUSE, shouldApplyPeopleThemeBodyRules } from "@/lib/ai/people-theme-prompt";
import { formatUserContext } from "@/lib/ai/format-user-context";
import { parseDobDateFromUserContext } from "@/lib/insights/benchmark-facts";
import { generateJsonCompletion, GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";
import { InsightGenerationResponseError } from "@/lib/insights/insight-generation-errors";
import { clampInsightGenerationJson } from "@/lib/insights/clamp-insight-json";
import { normalizePursuitEnrichBatch } from "@/lib/pursuit/normalize-pursuit-enrich";
import { mergeNodeInsightsIntoCache } from "@/lib/insights/merge-insight-cache";
import { parsePursuitInsightRecord } from "@/lib/insights/parse-insight-cache";
import {
  gateEnrichResult,
  resolveQuickQuestionsQuietUntilAfterGeneration,
  shouldSuggestMilestones,
  pursuitSignalFromGoal,
  type PursuitSignal,
} from "@/lib/pursuit/pursuit-enrich-readiness";
import { loadPursuitToneGoals } from "@/lib/insights/load-pursuit-tone-goals";
import { clampSignificance } from "@/lib/pursuit/significance";
import {
  DATE_DEADLINE_ARITHMETIC_RULE,
  ATTRIBUTES_AT_A_DATE_RULE,
  MAP_SPECIFICITY_BAR,
  ORIENTATION_AS_LENS_RULE,
  PLAN_IMPLICATION_RULE,
  PURSUIT_TITLE_REFERENCE_RULE,
  TENSION_NOT_FORECAST_RULE,
  USER_WORDS_RULE,
  VOICE_EVALUATIVE_ANTI_PATTERNS,
} from "@/lib/insights/insight-voice-prompt-blocks";
import {
  PURSUIT_BODY_DOMAIN_CONTEXT_RULE,
  PURSUIT_COMPARISON_FIELD_JOBS,
  PURSUIT_CONTEXT_TAB_NON_DUPLICATION,
  PURSUIT_INSIGHT_FIELD_LANES,
  PURSUIT_PANEL_UI_CONTEXT,
  PURSUIT_READING_AUTHORSHIP_ORDER,
} from "@/lib/insights/theme-insight-prompt-blocks";
import {
  formatPursuitToneGuidanceEntry,
  pursuitToneVoiceLines,
} from "@/lib/insights/pursuit-tone-prompt";
import {
  resolvePursuitInsightTone,
  type PursuitToneGoalInput,
} from "@/lib/insights/resolve-pursuit-insight-tone";
import {
  enrichAnswersSchema,
  pursuitEnrichBatchSchema,
  type PursuitEnrichCachePayload,
  type PursuitEnrichResult,
} from "@/lib/pursuit/pursuit-enrich-types";
import {
  DEFAULT_PURSUIT_ENRICH_OPTIONS,
  resolvePursuitEnrichOptions,
  type PursuitEnrichOptions,
} from "@/lib/pursuit/enrich-options";
import { prisma } from "@/lib/prisma";
import {
  buildClarifierSystemOutputLines,
  PURSUIT_PANEL_CONTEXT_PRECEDENCE,
  SUGGESTED_MILESTONES_OUTPUT_LINES,
  TITLE_RECONCILE_PROMPT_LINES,
} from "@/lib/pursuit/clarifier-prompt-blocks";
import { buildClarifierKindPromptSection } from "@/lib/pursuit/clarifier-question-prompt";
import {
  applyQuestionSlotToResult,
  loadRelationshipPeerIdsForGoal,
  pickQuestionSlotForPursuit,
  questionSlotUserMessageLines,
  type QuestionSlotMessageContext,
} from "@/lib/pursuit/pick-question-slot";
import {
  filterClarifiersAgainstMilestones,
  milestonesToGroundingInput,
} from "@/lib/pursuit/filter-clarifiers-against-milestones";
import { filterClarifiersAgainstKnownFacts } from "@/lib/pursuit/filter-clarifiers-against-known-facts";
import {
  buildPursuitCachePayload,
  clarifierPreserveAllowed,
  mergePreservedClarifiers,
  type ClarifierMergeMode,
  resolvePreservedComparison,
  resolveReflectSuggestedMilestones,
} from "@/lib/pursuit/pursuit-cache-patch";
import { buildPursuitEnrichInsightContext } from "@/lib/pursuit/pursuit-insight-prompt-context";
import {
  CLARIFIER_INITIAL_BATCH,
  CLARIFIER_REPLENISH_BATCH,
} from "@/lib/pursuit/clarifier-prompt-blocks";

const MAX_ENRICH_PER_RUN = 1;

const HEADLINE_MUST_ADD_MEANING = [
  "HEADLINE MUST ADD MEANING:",
  '- Never restate the status line ("X is paused with a deadline of Y") or the milestone count ("X has N milestones complete")',
  "- The user already sees those. The headline tells them what it MEANS.",
  '- Wrong: "Half-marathon chapter has one milestone complete, 5k achieved 79 days ago"',
  '- Right: "5k is done — the jump to 10k is where the training plan actually starts"',
  "- If there's nothing meaningful to add beyond the status, write a shorter, honest headline rather than padding with facts the user already has.",
].join("\n");

function stripMarkdownFence(raw: string): string {
  const trimmed = raw.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}

function buildEnrichSystemPrompt(
  options: Required<PursuitEnrichOptions>,
  peopleThemeBody: boolean,
  amountImpactEligible: boolean,
): string {
  const clarifierRules = options.clarifyTitles
    ? buildClarifierSystemOutputLines()
    : ["- clarifiers: always return an empty array — do not generate quick questions."];

  return [
    "You enrich a single chapter on a personal life map.",
    "Return ONLY valid JSON matching the schema.",
    "Quick questions must improve accuracy — never invent facts or chapters not in context.",
    PURSUIT_PANEL_CONTEXT_PRECEDENCE,
    "",
    "OUTPUT:",
    ...clarifierRules,
    buildClarifierKindPromptSection(options),
    "- insight: headline (verdict, <=100 chars) + body (2-4 sentences, <=500 chars) + optional comparison (Worth knowing). Tone is assigned server-side — do not set tone.",
    "",
    pursuitStatusPromptBlock(),
    HEADLINE_MUST_ADD_MEANING,
    PURSUIT_INSIGHT_FIELD_LANES,
    PURSUIT_PANEL_UI_CONTEXT,
    "  Body: single prose paragraph — no section labels; use structured comparison when needed (the UI renders labels).",
    PURSUIT_BODY_DOMAIN_CONTEXT_RULE,
    PURSUIT_CONTEXT_TAB_NON_DUPLICATION,
    PURSUIT_READING_AUTHORSHIP_ORDER,
    PURSUIT_COMPARISON_FIELD_JOBS,
    ...(peopleThemeBody ? ["", PEOPLE_THEME_BODY_CLAUSE] : []),
    ...amountImpactBodyPromptLines(amountImpactEligible),
    ...SUGGESTED_MILESTONES_OUTPUT_LINES,
    "",
    "JSON shape (single chapter under pursuits map):",
    '{ "pursuits": { "<pursuitId>": { "clarifiers": [], "insight": { "headline": "...", "body": "...", "comparison": "..." }, "suggestedMilestones": null } } }',
    "",
    "RULES:",
    "- Ground map-fact sentences in provided scoped context JSON; the optional cross-chapter domain-context sentence is exempt per domain-context rule.",
    "- Null/empty arrays are correct when unsure.",
    "",
  TENSION_NOT_FORECAST_RULE,
  "",
  PLAN_IMPLICATION_RULE,
  "",
  ORIENTATION_AS_LENS_RULE,
  "",
  USER_WORDS_RULE,
  "",
  PURSUIT_TITLE_REFERENCE_RULE,
  "",
  MAP_SPECIFICITY_BAR,
  "",
  DATE_DEADLINE_ARITHMETIC_RULE,
  "",
  ATTRIBUTES_AT_A_DATE_RULE,
    "",
    "VOICE ANTI-PATTERNS:",
    "- Do not open headline or body with the user's name.",
    "- Do not say \"your map shows\", \"the app sees\", or embed UI chrome in prose.",
    "- Do not use \"significant\" as filler — name the specific fact.",
    "- Never generic headlines like \"[title] is progressing well\".",
    VOICE_EVALUATIVE_ANTI_PATTERNS,
  ].join("\n");
}

function parseEnrichAnswers(raw: unknown): { clarifierId: string; prompt: string; selectedOption: string }[] {
  const parsed = enrichAnswersSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

function buildPursuitEnrichUserMessage(
  pursuitId: string,
  insightContext: ReturnType<typeof buildPursuitEnrichInsightContext>,
  userContext: string,
  milestonesAllowed: boolean,
  slotLines: string[],
  tone: ReturnType<typeof resolvePursuitInsightTone>,
  chapterNote?: string | null,
  titleReconcilePending?: boolean,
): string {
  const noteBlock =
    chapterNote?.trim()
      ? [
          "<chapter_note>",
          "User freeform note for this chapter — read before drafting quick questions:",
          chapterNote.trim(),
          "</chapter_note>",
          "",
        ]
      : [];

  return [
    userContext || "(No profile context yet.)",
    "",
    `Generate enrich output for chapter id: ${pursuitId}`,
    "",
    formatPursuitToneGuidanceEntry(pursuitId, tone),
    "",
    ...pursuitToneVoiceLines(tone),
    "",
    ...(titleReconcilePending ? [TITLE_RECONCILE_PROMPT_LINES, ""] : []),
    ...slotLines,
    milestonesAllowed
      ? "Milestones: allowed — suggest 1-6 chronological outcome waypoints toward the deadline from title, deadline, and durable enrichAnswers."
      : "Milestones: NOT allowed — set suggestedMilestones to null.",
    "",
    ...noteBlock,
    "<focal_chapter_facts>",
    insightContext.focalFactsJson,
    "</focal_chapter_facts>",
    "",
    "Scoped chapter context JSON (focal chapter + sibling chapters — enrichAnswers omitted; see confirmed_on_context_tab):",
    insightContext.scopedChapterJson,
    "",
    "<confirmed_on_context_tab>",
    "Already visible on the chapter About tab — supporting interpretation only; do not restate in headline/body.",
    insightContext.confirmedOnContextTabJson,
    "</confirmed_on_context_tab>",
  ].join("\n");
}

async function generateOnePursuitEnrich(
  userId: string,
  pursuitId: string,
  userContext: string,
  goal: PursuitToneGoalInput,
  signal: PursuitSignal,
  enrichOptions: Required<PursuitEnrichOptions>,
  amountImpactEligible: boolean,
  cachedEntry?: PursuitEnrichCachePayload,
  mergeMode: ClarifierMergeMode = "routine",
): Promise<{ result: PursuitEnrichResult; quickQuestionsQuietUntil?: string }> {
  const previousQuietUntil = cachedEntry?.quickQuestionsQuietUntil;
  const skippedClarifierPrompts = cachedEntry?.skippedClarifierPrompts;
  const milestonesAllowed = shouldSuggestMilestones(signal);
  const pursuitContext = await formatPursuitContext(userId, pursuitId);
  if (!pursuitContext) {
    throw new InsightGenerationResponseError("Chapter enrich missing chapter context.");
  }
  const enrichAnswers = parseEnrichAnswers(goal.enrichAnswers);
  const existingRelationshipPeerIds = await loadRelationshipPeerIdsForGoal(userId, pursuitId);
  const clarifierOutputMax =
    mergeMode === "replenish" ? CLARIFIER_REPLENISH_BATCH : CLARIFIER_INITIAL_BATCH;
  const slotContext: QuestionSlotMessageContext = {
    signal,
    status: goal.status ?? "ACTIVE",
    completedAt: goal.completedAt ?? null,
    significance:
      goal.significance != null ? clampSignificance(goal.significance) : null,
    enrichAnswers,
    background: goal.background,
    quickQuestionsQuietUntil: previousQuietUntil,
    siblingGoalIds: pursuitContext.siblingPursuits.map((s) => s.id),
    existingRelationshipPeerIds,
    enrichOptions,
    siblingPursuits: pursuitContext.siblingPursuits,
    clarifierOutputMax,
    skippedClarifierPrompts,
    replenishAfterDismiss: mergeMode === "replenish",
    nextAfterAnswer: mergeMode === "next",
  };
  const slot = pickQuestionSlotForPursuit(slotContext);
  const slotLines = questionSlotUserMessageLines(slot, slotContext);
  const insightContext = buildPursuitEnrichInsightContext(
    pursuitContext,
    parseDobDateFromUserContext(userContext),
  );

  const raw = await generateJsonCompletion({
    system: buildEnrichSystemPrompt(
      enrichOptions,
      shouldApplyPeopleThemeBodyRules(pursuitContext.pursuit.themeId),
      amountImpactEligible,
    ),
    user: buildPursuitEnrichUserMessage(
      pursuitId,
      insightContext,
      userContext,
      milestonesAllowed,
      slotLines,
      resolvePursuitInsightTone(goal),
      goal.background,
      cachedEntry?.titleReconcilePending,
    ),
    maxTokens: 2048,
    queueKey: userId,
  });

  let json: unknown;
  try {
    json = clampInsightGenerationJson(JSON.parse(stripMarkdownFence(raw)) as unknown);
  } catch (err) {
    throw new InsightGenerationResponseError("Chapter enrich returned invalid JSON.", { cause: err });
  }

  const wrapped =
    json && typeof json === "object" && "pursuits" in (json as object)
      ? json
      : { pursuits: { [pursuitId]: json } };

  const normalized = normalizePursuitEnrichBatch(wrapped);
  const parsed = pursuitEnrichBatchSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new InsightGenerationResponseError(
      parsed.error.issues[0]?.message ?? "Invalid chapter enrich shape.",
    );
  }

  let result = parsed.data.pursuits[pursuitId];
  if (!result) {
    const entries = Object.values(parsed.data.pursuits);
    if (entries.length === 1) {
      result = entries[0];
    }
  }
  if (!result) {
    throw new InsightGenerationResponseError("Chapter enrich missing target chapter entry.");
  }

  const milestoneGrounding = milestonesToGroundingInput(goal.milestones);
  const knownFacts = { background: goal.background, enrichAnswers };
  const freshClarifiers = filterClarifiersAgainstKnownFacts(
    filterClarifiersAgainstMilestones(result.clarifiers, milestoneGrounding),
    knownFacts,
  );
  const clarifiers = mergePreservedClarifiers({
    fresh: freshClarifiers,
    cached: filterClarifiersAgainstKnownFacts(
      filterClarifiersAgainstMilestones(cachedEntry?.clarifiers ?? [], milestoneGrounding),
      knownFacts,
    ),
    preserveAllowed: clarifierPreserveAllowed({
      clarifyTitles: enrichOptions.clarifyTitles,
      status: goal.status ?? "ACTIVE",
      quickQuestionsQuietUntil: previousQuietUntil,
    }),
    mode: mergeMode,
    skippedPrompts: skippedClarifierPrompts,
  });
  const suggestedMilestones = resolveReflectSuggestedMilestones({
    fresh: result.suggestedMilestones,
    cached: cachedEntry?.suggestedMilestones,
    mapMilestones: goal.milestones,
    allowed: milestonesAllowed,
  });
  const comparison = resolvePreservedComparison(
    result.insight?.comparison,
    cachedEntry?.comparison,
    signal,
  );
  const insight = result.insight
    ? (() => {
        const { comparison: _comparison, ...rest } = result.insight!;
        return {
          ...rest,
          ...(comparison ? { comparison } : {}),
        };
      })()
    : result.insight;

  result = {
    clarifiers,
    insight,
    suggestedMilestones,
  };

  const gated = gateEnrichResult(result, signal, enrichOptions, {
    status: goal.status ?? "ACTIVE",
    quickQuestionsQuietUntil: previousQuietUntil,
    enrichAnswers,
    focalFacts: insightContext.focalFacts,
  });
  const slotted = applyQuestionSlotToResult(gated, slotContext);
  if (slotted.insight) {
    slotted.insight.tone = resolvePursuitInsightTone(goal);
  }
  const quickQuestionsQuietUntil = resolveQuickQuestionsQuietUntilAfterGeneration({
    slot,
    clarifiers: slotted.clarifiers,
    previousQuietUntil,
  });
  return { result: slotted, quickQuestionsQuietUntil };
}

/** Serialized per-pursuit enrich — clarifiers, insight, gated milestones. */
export async function refreshPursuitEnrich(
  userId: string,
  pursuitIds: string[],
  options?: PursuitEnrichOptions,
): Promise<{ processedIds: string[]; remainingIds: string[]; geminiCallsMade: number }> {
  const enrichOptions = resolvePursuitEnrichOptions(options ?? DEFAULT_PURSUIT_ENRICH_OPTIONS);
  if (!hasGeminiKey()) {
    throw new GeminiNotConfiguredError();
  }

  const uniqueIds = [...new Set(pursuitIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { processedIds: [], remainingIds: [], geminiCallsMade: 0 };
  }

  const batchIds = uniqueIds.slice(0, MAX_ENRICH_PER_RUN);
  const remainingIds = uniqueIds.slice(MAX_ENRICH_PER_RUN);

  const [userContext, toneGoals, mapContext, insightCacheRow] = await Promise.all([
    formatUserContext(userId),
    loadPursuitToneGoals(userId, batchIds),
    formatMapContext(userId),
    prisma.insightCache.findUnique({ where: { userId }, select: { pursuitInsights: true } }),
  ]);
  const cachedPursuits = parsePursuitInsightRecord(
    insightCacheRow?.pursuitInsights,
    "pursuit",
  );
  const amountImpactEligible = isAmountImpactEligible(mapContext);

  const pursuits: Record<string, PursuitEnrichCachePayload> = {};
  const writtenIds: string[] = [];
  let geminiCallsMade = 0;

  for (const pursuitId of batchIds) {
    const goal = toneGoals.get(pursuitId);
    if (!goal) continue;
    const signal = pursuitSignalFromGoal(goal);
    const cachedEntry = cachedPursuits[pursuitId];
    const { result, quickQuestionsQuietUntil } = await generateOnePursuitEnrich(
      userId,
      pursuitId,
      userContext,
      goal,
      signal,
      enrichOptions,
      amountImpactEligible,
      cachedEntry,
      "routine",
    );
    geminiCallsMade += 1;
    const payload = buildPursuitCachePayload(result, {
      quickQuestionsQuietUntil,
      skippedClarifierPrompts: cachedEntry?.skippedClarifierPrompts,
      clearTitleReconcilePending: cachedEntry?.titleReconcilePending === true,
    });
    if (payload?.headline?.trim() || payload?.clarifiers?.length || payload?.suggestedMilestones?.length) {
      pursuits[pursuitId] = payload;
      writtenIds.push(pursuitId);
    }
  }

  if (Object.keys(pursuits).length > 0) {
    await mergeNodeInsightsIntoCache(userId, { themes: {}, categories: {}, pursuits }, {
      stampMapVersion: remainingIds.length === 0 && writtenIds.length === batchIds.length,
    });
  }

  const unwrittenBatchIds = batchIds.filter((id) => !writtenIds.includes(id));

  return {
    processedIds: writtenIds,
    remainingIds: [...remainingIds, ...unwrittenBatchIds],
    geminiCallsMade,
  };
}

export { MAX_ENRICH_PER_RUN };

/** Pursuit-only panel + quick questions — after create (initial), answer (next), or dismiss replenish. */
export async function syncPursuitPanel(
  userId: string,
  pursuitId: string,
  mode: "initial" | "replenish" | "next",
  options?: PursuitEnrichOptions,
): Promise<{ clarifierCount: number; headline?: string }> {
  const enrichOptions = resolvePursuitEnrichOptions(options ?? DEFAULT_PURSUIT_ENRICH_OPTIONS);
  if (!enrichOptions.clarifyTitles && (mode === "replenish" || mode === "next")) {
    return { clarifierCount: 0 };
  }
  if (!hasGeminiKey()) {
    throw new GeminiNotConfiguredError();
  }

  const mergeMode: ClarifierMergeMode =
    mode === "replenish" ? "replenish" : mode === "next" ? "next" : "initial";
  const [userContext, toneGoals, mapContext, insightCacheRow] = await Promise.all([
    formatUserContext(userId),
    loadPursuitToneGoals(userId, [pursuitId]),
    formatMapContext(userId),
    prisma.insightCache.findUnique({ where: { userId }, select: { pursuitInsights: true } }),
  ]);
  const goal = toneGoals.get(pursuitId);
  if (!goal) {
    throw new InsightGenerationResponseError("Chapter not found for panel sync.");
  }

  const cachedPursuits = parsePursuitInsightRecord(
    insightCacheRow?.pursuitInsights,
    "pursuit",
  );
  const cachedEntry = cachedPursuits[pursuitId];
  const signal = pursuitSignalFromGoal(goal);
  const amountImpactEligible = isAmountImpactEligible(mapContext);

  const { result, quickQuestionsQuietUntil } = await generateOnePursuitEnrich(
    userId,
    pursuitId,
    userContext,
    goal,
    signal,
    enrichOptions,
    amountImpactEligible,
    cachedEntry,
    mergeMode,
  );

  const payload = buildPursuitCachePayload(result, {
    quickQuestionsQuietUntil,
    skippedClarifierPrompts: cachedEntry?.skippedClarifierPrompts,
    clearTitleReconcilePending: cachedEntry?.titleReconcilePending === true,
  });
  if (!payload) {
    return { clarifierCount: 0 };
  }

  await mergeNodeInsightsIntoCache(
    userId,
    { themes: {}, categories: {}, pursuits: { [pursuitId]: payload } },
    { stampMapVersion: false },
  );

  return {
    clarifierCount: payload.clarifiers?.length ?? 0,
    headline: payload.headline?.trim() || undefined,
  };
}

/** @internal Vitest — pursuit enrich prompt builder. */
export { buildEnrichSystemPrompt };
