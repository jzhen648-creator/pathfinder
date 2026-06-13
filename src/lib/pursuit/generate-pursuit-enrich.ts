import { formatPursuitContext } from "@/lib/ai/format-map-context";
import { formatUserContext } from "@/lib/ai/format-user-context";
import { generateJsonCompletion, GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";
import { InsightGenerationResponseError } from "@/lib/insights/generate-insights";
import { clampInsightGenerationJson } from "@/lib/insights/clamp-insight-json";
import { mergeNodeInsightsIntoCache } from "@/lib/insights/merge-insight-cache";
import {
  gateEnrichResult,
  shouldSuggestMilestones,
  type PursuitSignal,
} from "@/lib/pursuit/pursuit-enrich-readiness";
import {
  enrichAnswersSchema,
  pursuitEnrichBatchSchema,
  type PursuitEnrichCachePayload,
  type PursuitEnrichResult,
} from "@/lib/pursuit/pursuit-enrich-types";
import { prisma } from "@/lib/prisma";

const MAX_ENRICH_PER_RUN = 1;

const ENRICH_SYSTEM_PROMPT = [
  "You enrich a single pursuit on a personal life map.",
  "Return ONLY valid JSON matching the schema.",
  "",
  "OUTPUT:",
  "- clarifiers: 0-3 multiple-choice questions when the title is ambiguous AND existing context does not already disambiguate.",
  "  Each clarifier: id (short slug), prompt (question), options (2-4 short labels, <=6 words each).",
  "  Skip clarifiers when theme + category + deadline + description already make the pursuit specific.",
  "  Example — title 'Project manager', Work theme, Job category, empty description:",
  '  prompt "What kind of project management?" options ["Tech / software","Construction","Marketing / agency","Not sure"]',
  "- insight: headline (verdict, <=100 chars) + body (2-4 sentences, <=500 chars) + tone.",
  "  Body structure when data supports it (each on its own line):",
  '  - \"From your map: \" + one sentence on cross-pursuit connections (siblings, marks) when present in context.',
  '  - \"Comparison: \" + one benchmark sentence when user profile has age AND location; omit if either is unknown.',
  "  - Remaining lines: pursuit-specific detail beyond headline. Never restate the title alone.",
  "- suggestedMilestones: 0-6 chronological steps ONLY when the user message says milestones are allowed.",
  "  Otherwise return null for suggestedMilestones.",
  "",
  "RULES:",
  "- Ground every field in provided scoped context JSON only.",
  "- Null/empty arrays are correct when unsure.",
].join("\n");

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
    "Scoped pursuit context JSON (focal pursuit + sibling pursuits + related marks):",
    contextJson,
  ].join("\n");
}

async function loadPursuitSignals(userId: string, pursuitIds: string[]) {
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
  const byId = new Map(
    goals.map((g) => [
      g.id,
      {
        title: g.title,
        description: g.description ?? "",
        enrichAnswerCount: parseEnrichAnswers(g.enrichAnswers).length,
        milestoneCount: g._count.milestones,
        hasDeadline: g.deadline != null,
        status: g.status,
      },
    ]),
  );
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
    tone: "informational",
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
  signal: PursuitSignal,
): Promise<PursuitEnrichResult> {
  const milestonesAllowed = shouldSuggestMilestones(signal);
  const pursuitContext = await formatPursuitContext(userId, pursuitId);
  if (!pursuitContext) {
    throw new InsightGenerationResponseError("Pursuit enrich missing pursuit context.");
  }
  const contextJson = JSON.stringify(pursuitContext, null, 2);

  const raw = await generateJsonCompletion({
    system: ENRICH_SYSTEM_PROMPT,
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

  const parsed = pursuitEnrichBatchSchema.safeParse(wrapped);
  if (!parsed.success) {
    throw new InsightGenerationResponseError(
      parsed.error.issues[0]?.message ?? "Invalid pursuit enrich shape.",
    );
  }

  const result = parsed.data.pursuits[pursuitId];
  if (!result) {
    throw new InsightGenerationResponseError("Pursuit enrich missing target pursuit entry.");
  }

  return gateEnrichResult(result, signal);
}

/** Serialized per-pursuit enrich — clarifiers, insight, gated milestones. */
export async function refreshPursuitEnrich(
  userId: string,
  pursuitIds: string[],
): Promise<{ processedIds: string[]; remainingIds: string[]; geminiCallsMade: number }> {
  if (!hasGeminiKey()) {
    throw new GeminiNotConfiguredError();
  }

  const uniqueIds = [...new Set(pursuitIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return { processedIds: [], remainingIds: [], geminiCallsMade: 0 };
  }

  const batchIds = uniqueIds.slice(0, MAX_ENRICH_PER_RUN);
  const remainingIds = uniqueIds.slice(MAX_ENRICH_PER_RUN);

  const [userContext, signals] = await Promise.all([
    formatUserContext(userId),
    loadPursuitSignals(userId, batchIds),
  ]);

  const pursuits: Record<string, PursuitEnrichCachePayload> = {};
  let geminiCallsMade = 0;

  for (const pursuitId of batchIds) {
    const signal = signals.get(pursuitId);
    if (!signal) continue;
    const result = await generateOnePursuitEnrich(userId, pursuitId, userContext, signal);
    geminiCallsMade += 1;
    const payload = toCachePayload(result);
    if (payload?.headline?.trim() || payload?.clarifiers?.length || payload?.suggestedMilestones?.length) {
      pursuits[pursuitId] = payload;
    }
  }

  if (Object.keys(pursuits).length > 0) {
    await mergeNodeInsightsIntoCache(userId, { themes: {}, hubs: {}, pursuits }, {
      stampMapVersion: remainingIds.length === 0,
    });
  }

  return { processedIds: batchIds, remainingIds, geminiCallsMade };
}

export { MAX_ENRICH_PER_RUN };
