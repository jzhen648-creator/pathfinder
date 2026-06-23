import type { ReflectResponse } from "@/lib/ai/reflect-types";
import { mergeNodeInsightsIntoCache } from "@/lib/insights/merge-insight-cache";
import type { InsightLevelPayload } from "@/lib/insights/insight-types";
import { parsePursuitInsightRecord } from "@/lib/insights/parse-insight-cache";
import { loadPursuitToneGoals } from "@/lib/insights/load-pursuit-tone-goals";
import { resolvePursuitInsightTone } from "@/lib/insights/resolve-pursuit-insight-tone";
import {
  filterClarifiersAgainstMilestones,
  milestonesToGroundingInput,
} from "@/lib/pursuit/filter-clarifiers-against-milestones";
import {
  gateEnrichResult,
  resolveQuickQuestionsQuietUntilAfterGeneration,
  shouldSuggestMilestones,
  pursuitSignalFromGoal,
} from "@/lib/pursuit/pursuit-enrich-readiness";
import {
  applyQuestionSlotToResult,
  loadRelationshipPeerIdsForGoal,
  pickQuestionSlotForPursuit,
  type QuestionSlotMessageContext,
} from "@/lib/pursuit/pick-question-slot";
import {
  buildPursuitCachePayload,
  clarifierPreserveAllowed,
  mergePreservedClarifiers,
  resolvePreservedComparison,
  resolveReflectSuggestedMilestones,
} from "@/lib/pursuit/pursuit-cache-patch";
import {
  enrichAnswersSchema,
  type Clarifier,
  type PursuitEnrichCachePayload,
  type PursuitEnrichResult,
} from "@/lib/pursuit/pursuit-enrich-types";
import type { PursuitEnrichOptions } from "@/lib/pursuit/enrich-options";
import { resolvePursuitEnrichOptions } from "@/lib/pursuit/enrich-options";
import { prisma } from "@/lib/prisma";

export {
  dedupeSuggestedMilestones,
  resolveReflectSuggestedMilestones,
} from "@/lib/pursuit/pursuit-cache-patch";

function normalizeReflectClarifier(raw: unknown, index: number): Clarifier | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const prompt =
    typeof c.prompt === "string"
      ? c.prompt
      : typeof c.question === "string"
        ? c.question
        : "";
  const options = Array.isArray(c.options)
    ? c.options.filter((o): o is string => typeof o === "string")
    : [];
  if (!prompt.trim() || options.length < 2) return null;
  return {
    id: typeof c.id === "string" && c.id.trim() ? c.id : `q-${index + 1}`,
    prompt: prompt.trim(),
    options,
    ...(typeof c.kind === "string" ? { kind: c.kind as Clarifier["kind"] } : {}),
    ...(typeof c.peerGoalId === "string" ? { peerGoalId: c.peerGoalId } : {}),
    ...(typeof c.suggestedTitle === "string" ? { suggestedTitle: c.suggestedTitle } : {}),
    ...(typeof c.suggestedCategoryId === "string"
      ? { suggestedCategoryId: c.suggestedCategoryId }
      : {}),
    ...(typeof c.suggestedThemeId === "string" ? { suggestedThemeId: c.suggestedThemeId } : {}),
  };
}

/** Write reflect output to InsightCache pursuit + theme entries. */
export async function applyReflectOutput(
  userId: string,
  reflect: ReflectResponse,
  pursuitIds: string[],
  enrichOptions: PursuitEnrichOptions | undefined,
  _mapVersion: string,
  _memoryVersion: number,
): Promise<{ insightsWritten: boolean }> {
  const options = resolvePursuitEnrichOptions(enrichOptions);

  const toneGoals = await loadPursuitToneGoals(userId, pursuitIds);
  const existingCache = await prisma.insightCache.findUnique({
    where: { userId },
    select: { pursuitInsights: true },
  });
  const cachedPursuits = parsePursuitInsightRecord(existingCache?.pursuitInsights, "pursuit");
  const siblingTitlesByTheme = new Map<string, Array<{ id: string; title: string }>>();
  for (const goal of toneGoals.values()) {
    const themeId = goal.themeId ?? "becoming";
    const list = siblingTitlesByTheme.get(themeId) ?? [];
    list.push({ id: goal.id, title: goal.title });
    siblingTitlesByTheme.set(themeId, list);
  }
  const profile = await prisma.userManualProfile.findUnique({
    where: { userId },
    select: { dateOfBirth: true, location: true },
  });
  let profileAge: number | null = null;
  if (profile?.dateOfBirth) {
    const nowDate = new Date();
    profileAge = nowDate.getFullYear() - profile.dateOfBirth.getFullYear();
    const monthDiff = nowDate.getMonth() - profile.dateOfBirth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && nowDate.getDate() < profile.dateOfBirth.getDate())) {
      profileAge -= 1;
    }
    if (profileAge < 0) profileAge = null;
  }
  const profileLocation = profile?.location?.trim() || null;

  const pursuits: Record<string, PursuitEnrichCachePayload> = {};
  const themes: Record<string, InsightLevelPayload> = {};
  const now = Date.now();

  for (const [themeId, entry] of Object.entries(reflect.themes ?? {})) {
    if (!entry.oneLiner?.trim() && !entry.reflective?.trim()) continue;
    themes[themeId] = {
      tone: entry.tone,
      oneLiner: entry.oneLiner.trim(),
      reflective: entry.reflective.trim(),
      contextual: "",
      combined: "",
    };
  }

  for (const pursuitId of pursuitIds) {
    const entry = reflect.pursuits[pursuitId];
    const goal = toneGoals.get(pursuitId);
    if (!entry || !goal) continue;

    const signal = pursuitSignalFromGoal(goal);
    const cachedEntry = cachedPursuits[pursuitId];
    const comparison = resolvePreservedComparison(
      entry.comparison,
      cachedEntry?.comparison,
      signal,
      { age: profileAge, location: profileLocation },
    );

    const enrichAnswersParsed = enrichAnswersSchema.safeParse(goal.enrichAnswers);
    const enrichAnswers = enrichAnswersParsed.success ? enrichAnswersParsed.data : [];
    const previousQuietUntil = cachedEntry?.quickQuestionsQuietUntil;
    const milestonesAllowed = shouldSuggestMilestones(signal);
    const suggestedMilestones = resolveReflectSuggestedMilestones({
      fresh: entry.suggestedMilestones ?? null,
      cached: cachedEntry?.suggestedMilestones,
      mapMilestones: goal.milestones,
      allowed: milestonesAllowed,
    });

    const milestoneGrounding = milestonesToGroundingInput(goal.milestones);
    const freshClarifiers = filterClarifiersAgainstMilestones(
      (entry.clarifiers ?? [])
        .map((c, index) => normalizeReflectClarifier(c, index))
        .filter((c): c is Clarifier => c != null),
      milestoneGrounding,
    );
    const clarifiers = mergePreservedClarifiers({
      fresh: freshClarifiers,
      cached: filterClarifiersAgainstMilestones(cachedEntry?.clarifiers ?? [], milestoneGrounding),
      preserveAllowed: clarifierPreserveAllowed({
        clarifyTitles: options.clarifyTitles,
        status: goal.status ?? "ACTIVE",
        quickQuestionsQuietUntil: previousQuietUntil,
        now,
      }),
      mode: "routine",
      skippedPrompts: cachedEntry?.skippedClarifierPrompts,
    });

    const rawResult: PursuitEnrichResult = {
      clarifiers,
      insight: {
        tone: resolvePursuitInsightTone(goal, now),
        headline: entry.headline,
        body: entry.body,
        ...(comparison ? { comparison } : {}),
      },
      suggestedMilestones,
    };

    const gated = gateEnrichResult(rawResult, signal, options, {
      status: goal.status ?? "ACTIVE",
      quickQuestionsQuietUntil: previousQuietUntil,
    });
    const themeId = goal.themeId ?? "becoming";
    const siblingPursuits = (siblingTitlesByTheme.get(themeId) ?? []).filter(
      (s) => s.id !== pursuitId,
    );
    const existingRelationshipPeerIds = await loadRelationshipPeerIdsForGoal(userId, pursuitId);
    const slotContext: QuestionSlotMessageContext = {
      signal,
      status: goal.status ?? "ACTIVE",
      completedAt: goal.completedAt ?? null,
      significance: Math.min(5, Math.max(1, Math.round(goal.significance ?? 3))),
      enrichAnswers,
      quickQuestionsQuietUntil: previousQuietUntil,
      siblingGoalIds: siblingPursuits.map((s) => s.id),
      existingRelationshipPeerIds,
      enrichOptions: options,
      siblingPursuits,
      skippedClarifierPrompts: cachedEntry?.skippedClarifierPrompts,
    };
    const slot = pickQuestionSlotForPursuit(slotContext);
    const slotted = applyQuestionSlotToResult(gated, slotContext);
    const quickQuestionsQuietUntil = resolveQuickQuestionsQuietUntilAfterGeneration({
      slot,
      clarifiers: slotted.clarifiers,
      previousQuietUntil,
    });
    const payload = buildPursuitCachePayload(slotted, {
      quickQuestionsQuietUntil,
      skippedClarifierPrompts: cachedEntry?.skippedClarifierPrompts,
    });
    if (payload?.headline?.trim() || payload?.clarifiers?.length || payload?.suggestedMilestones?.length) {
      pursuits[pursuitId] = payload;
    }
  }

  let insightsWritten = false;
  if (Object.keys(themes).length > 0 || Object.keys(pursuits).length > 0) {
    await mergeNodeInsightsIntoCache(userId, { themes, categories: {}, pursuits });
    insightsWritten = true;
  }

  return { insightsWritten };
}
