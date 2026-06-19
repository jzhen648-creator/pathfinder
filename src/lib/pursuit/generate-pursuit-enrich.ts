import { formatMapContext, formatPursuitContext } from "@/lib/ai/format-map-context";
import { isAmountImpactEligible, amountImpactBodyPromptLines } from "@/lib/ai/amount-impact-eligibility";
import { PEOPLE_THEME_BODY_CLAUSE, shouldApplyPeopleThemeBodyRules } from "@/lib/ai/people-theme-prompt";
import { formatUserContext } from "@/lib/ai/format-user-context";
import { generateJsonCompletion, GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";
import { InsightGenerationResponseError } from "@/lib/insights/generate-insights";
import { clampInsightGenerationJson } from "@/lib/insights/clamp-insight-json";
import { normalizePursuitEnrichBatch } from "@/lib/pursuit/normalize-pursuit-enrich";
import { mergeNodeInsightsIntoCache } from "@/lib/insights/merge-insight-cache";
import {
  gateEnrichResult,
  shouldSuggestMilestones,
  pursuitSignalFromGoal,
  type PursuitSignal,
} from "@/lib/pursuit/pursuit-enrich-readiness";
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

const MAX_ENRICH_PER_RUN = 1;

function buildEnrichSystemPrompt(
  options: Required<PursuitEnrichOptions>,
  peopleThemeBody: boolean,
  amountImpactEligible: boolean,
): string {
  const clarifierRules = options.clarifyTitles
    ? [
        "- clarifiers: 0-3 multiple-choice questions when the title is ambiguous AND existing context does not already disambiguate.",
        "  Each clarifier: id (short slug), prompt (question), options (2-4 short labels, <=6 words each).",
        "  Skip clarifiers when theme + category + deadline + description already make the pursuit specific.",
        '  Example — title "Project manager", Work theme, Job category, empty description:',
        '  prompt "What kind of project management?" options ["Tech / software","Construction","Marketing / agency","Not sure"]',
      ]
    : ["- clarifiers: always return an empty array — do not generate quick questions."];

  const connectionRules = options.suggestConnections
    ? [
        "- You MAY add at most ONE clarifier about how this pursuit relates to a named sibling pursuit in context.",
        "  Only use pursuit titles that appear in siblingPursuits — never invent pursuits.",
        '  Options must include "Unrelated" or "Not sure".',
        "- Clarifier answers are user-stated context only — never assert pursuit-to-pursuit relationships as confirmed fact in Reading, theme, or pursuit insight prose unless explicitly supported by map structure (e.g. parentPursuitTitle).",
      ]
    : [
        "- Do NOT ask relationship or cross-pursuit connection questions in clarifiers.",
        "  Cross-pursuit links belong only in insight body when already supported by context.",
      ];

  return [
    "You enrich a single pursuit on a personal life map.",
    "Return ONLY valid JSON matching the schema.",
    "Quick questions must improve accuracy — never invent facts or pursuits not in context.",
    "",
    "OUTPUT:",
    ...clarifierRules,
    ...connectionRules,
    "- insight: headline (verdict, <=100 chars) + body (2-4 sentences, <=500 chars). Tone is assigned server-side — do not set tone.",
    "  Body: single prose paragraph — no section labels, no \"From your map:\" or \"Comparison:\" prefixes (the UI renders labels).",
    "  When sibling pursuits support a cross-link, weave one sentence into the body naturally.",
    "  When age AND location are known, weave one benchmark sentence into the body; omit if either is unknown.",
    "  Never restate the title alone; never open with the user's name; never say \"your map shows\".",
    ...(peopleThemeBody ? ["", PEOPLE_THEME_BODY_CLAUSE] : []),
    ...amountImpactBodyPromptLines(amountImpactEligible),
    "- suggestedMilestones: 0-6 chronological steps ONLY when the user message says milestones are allowed.",
    "  Otherwise return null for suggestedMilestones.",
    "  Each item: { title: string, order: 0-based integer } — order is required.",
    "",
    "JSON shape (single pursuit under pursuits map):",
    '{ "pursuits": { "<pursuitId>": { "clarifiers": [], "insight": { "headline": "...", "body": "..." }, "suggestedMilestones": null } } }',
    "",
    "RULES:",
    "- Ground every field in provided scoped context JSON only.",
    "- Null/empty arrays are correct when unsure.",
    "",
    "VOICE ANTI-PATTERNS:",
    "- Do not open headline or body with the user's name.",
    "- Do not say \"your map shows\", \"the app sees\", or embed UI chrome in prose.",
    "- Do not use \"significant\" as filler — name the specific fact.",
    "- Never generic headlines like \"[title] is progressing well\".",
  ].join("\n");
}

function stripMarkdownFence(raw: string): string {
  const trimmed = raw.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}

function parseEnrichAnswers(raw: unknown): { clarifierId: string; prompt: string; selectedOption: string }[] {
  const parsed = enrichAnswersSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

function buildPursuitEnrichUserMessage(
  pursuitId: string,
  contextJson: string,
  userContext: string,
  milestonesAllowed: boolean,
): string {
  return [
    userContext || "(No profile context yet.)",
    "",
    `Generate enrich output for pursuit id: ${pursuitId}`,
    milestonesAllowed
      ? "Milestones: allowed — suggest only if concrete and specific."
      : "Milestones: NOT allowed — set suggestedMilestones to null.",
    "",
    "Scoped pursuit context JSON (focal pursuit + sibling pursuits):",
    contextJson,
  ].join("\n");
}

async function loadPursuitToneGoals(userId: string, pursuitIds: string[]) {
  const goals = await prisma.goal.findMany({
    where: { userId, id: { in: pursuitIds }, archived: false },
    select: {
      id: true,
      title: true,
      description: true,
      enrichAnswers: true,
      deadline: true,
      status: true,
      significance: true,
      targetAmount: true,
      currentAmount: true,
      completedAt: true,
      milestones: {
        select: { id: true, title: true, completedAt: true },
        orderBy: { position: "asc" },
      },
    },
  });
  const byId = new Map<string, PursuitToneGoalInput>();
  for (const goal of goals) {
    byId.set(goal.id, goal);
  }
  return byId;
}

function toCachePayload(result: PursuitEnrichResult): PursuitEnrichCachePayload | null {
  const hasClarifiers = result.clarifiers.length > 0;
  const hasMilestones = (result.suggestedMilestones?.length ?? 0) > 0;
  const hasInsight = Boolean(result.insight?.headline?.trim());

  if (!hasClarifiers && !hasMilestones && !hasInsight) return null;

  const clarifiers = hasClarifiers ? result.clarifiers : undefined;
  const suggestedMilestones = hasMilestones ? result.suggestedMilestones ?? undefined : undefined;

  if (hasInsight && result.insight) {
    return {
      ...result.insight,
      clarifiers,
      suggestedMilestones,
    };
  }

  return {
    tone: "context",
    headline: "Help Pathfinder read this pursuit",
    body: "Answer a quick question below — then update your AI reading on Insights.",
    clarifiers,
    suggestedMilestones,
  };
}

async function generateOnePursuitEnrich(
  userId: string,
  pursuitId: string,
  userContext: string,
  goal: PursuitToneGoalInput,
  signal: PursuitSignal,
  enrichOptions: Required<PursuitEnrichOptions>,
  amountImpactEligible: boolean,
): Promise<PursuitEnrichResult> {
  const milestonesAllowed = shouldSuggestMilestones(signal);
  const pursuitContext = await formatPursuitContext(userId, pursuitId, {
    includeMarks: enrichOptions.includeMarks,
  });
  if (!pursuitContext) {
    throw new InsightGenerationResponseError("Pursuit enrich missing pursuit context.");
  }
  const contextJson = JSON.stringify(pursuitContext, null, 2);

  const raw = await generateJsonCompletion({
    system: buildEnrichSystemPrompt(
      enrichOptions,
      shouldApplyPeopleThemeBodyRules(pursuitContext.pursuit.themeId),
      amountImpactEligible,
    ),
    user: buildPursuitEnrichUserMessage(pursuitId, contextJson, userContext, milestonesAllowed),
    maxTokens: 2048,
    queueKey: userId,
  });

  let json: unknown;
  try {
    json = clampInsightGenerationJson(JSON.parse(stripMarkdownFence(raw)) as unknown);
  } catch (err) {
    throw new InsightGenerationResponseError("Pursuit enrich returned invalid JSON.", { cause: err });
  }

  const wrapped =
    json && typeof json === "object" && "pursuits" in (json as object)
      ? json
      : { pursuits: { [pursuitId]: json } };

  const normalized = normalizePursuitEnrichBatch(wrapped);
  const parsed = pursuitEnrichBatchSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new InsightGenerationResponseError(
      parsed.error.issues[0]?.message ?? "Invalid pursuit enrich shape.",
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
    throw new InsightGenerationResponseError("Pursuit enrich missing target pursuit entry.");
  }

  const gated = gateEnrichResult(result, signal, enrichOptions);
  if (gated.insight) {
    gated.insight.tone = resolvePursuitInsightTone(goal);
  }
  return gated;
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

  const [userContext, toneGoals, mapContext] = await Promise.all([
    formatUserContext(userId),
    loadPursuitToneGoals(userId, batchIds),
    formatMapContext(userId),
  ]);
  const amountImpactEligible = isAmountImpactEligible(mapContext);

  const pursuits: Record<string, PursuitEnrichCachePayload> = {};
  const writtenIds: string[] = [];
  let geminiCallsMade = 0;

  for (const pursuitId of batchIds) {
    const goal = toneGoals.get(pursuitId);
    if (!goal) continue;
    const signal = pursuitSignalFromGoal(goal);
    const result = await generateOnePursuitEnrich(
      userId,
      pursuitId,
      userContext,
      goal,
      signal,
      enrichOptions,
      amountImpactEligible,
    );
    geminiCallsMade += 1;
    const payload = toCachePayload(result);
    if (payload?.headline?.trim() || payload?.clarifiers?.length || payload?.suggestedMilestones?.length) {
      pursuits[pursuitId] = payload;
      writtenIds.push(pursuitId);
    }
  }

  if (Object.keys(pursuits).length > 0) {
    await mergeNodeInsightsIntoCache(userId, { themes: {}, hubs: {}, pursuits }, {
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

/** @internal Vitest — pursuit enrich prompt builder. */
export { buildEnrichSystemPrompt };
