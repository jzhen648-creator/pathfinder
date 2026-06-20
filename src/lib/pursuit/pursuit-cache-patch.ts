import {
  gatePursuitComparison,
  isQuickQuestionsQuiet,
  type PursuitSignal,
} from "@/lib/pursuit/pursuit-enrich-readiness";
import type { Clarifier, PursuitEnrichCachePayload, PursuitEnrichResult } from "@/lib/pursuit/pursuit-enrich-types";

function dedupeMilestoneTitles<T extends { title: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.title.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** @internal Exported for vitest — strips duplicate milestone titles from reflect output. */
export function dedupeSuggestedMilestones<T extends { title: string }>(
  suggestions: T[] | null | undefined,
): T[] | null {
  if (!suggestions?.length) return suggestions ?? null;
  const unique = dedupeMilestoneTitles(suggestions);
  return unique.length > 0 ? unique : null;
}

function normalizeMilestoneTitle(title: string): string {
  return title.trim().toLowerCase();
}

function stripSuggestionsAlreadyOnMap<T extends { title: string }>(
  suggestions: T[] | null | undefined,
  mapMilestones: Array<{ title: string }>,
): T[] | null {
  if (!suggestions?.length) return suggestions ?? null;
  const onMap = new Set(mapMilestones.map((milestone) => normalizeMilestoneTitle(milestone.title)));
  const filtered = suggestions.filter(
    (suggestion) => !onMap.has(normalizeMilestoneTitle(suggestion.title)),
  );
  return filtered.length > 0 ? filtered : null;
}

/** Prefer fresh reflect output; when the model omits suggestions, keep the prior cache. */
export function resolveReflectSuggestedMilestones<T extends { title: string }>(input: {
  fresh: T[] | null | undefined;
  cached: T[] | undefined;
  mapMilestones: Array<{ title: string }>;
  allowed: boolean;
}): T[] | null {
  if (!input.allowed) return null;

  const fresh = stripSuggestionsAlreadyOnMap(
    dedupeSuggestedMilestones(input.fresh ?? null),
    input.mapMilestones,
  );
  if (fresh?.length) return fresh;

  return stripSuggestionsAlreadyOnMap(
    dedupeSuggestedMilestones(input.cached ?? null),
    input.mapMilestones,
  );
}

export function resolvePreservedInsightText(
  fresh: string | undefined,
  cached: string | undefined,
): string | undefined {
  const trimmed = fresh?.trim();
  if (trimmed) return trimmed;
  const cachedTrimmed = cached?.trim();
  return cachedTrimmed || undefined;
}

export function resolvePreservedComparison(
  freshRaw: string | undefined,
  cached: string | undefined,
  signal: PursuitSignal,
): string | undefined {
  const gatedFresh = gatePursuitComparison(freshRaw?.trim() ?? "", signal);
  if (gatedFresh) return gatedFresh;
  const gatedCached = gatePursuitComparison(cached?.trim() ?? "", signal);
  return gatedCached || undefined;
}

export function resolvePreservedClarifiers(input: {
  fresh: Clarifier[];
  cached: Clarifier[] | undefined;
  preserveAllowed: boolean;
}): Clarifier[] {
  if (input.fresh.length > 0) return input.fresh;
  if (!input.preserveAllowed || !input.cached?.length) return [];
  return input.cached;
}

export function clarifierPreserveAllowed(input: {
  clarifyTitles: boolean;
  status: string;
  quickQuestionsQuietUntil?: string | null;
  now?: number;
}): boolean {
  return (
    input.clarifyTitles &&
    input.status !== "PAUSED" &&
    !isQuickQuestionsQuiet(input.quickQuestionsQuietUntil, input.now)
  );
}

/** Prefer fresh gated theme text; when the model omits it, keep the prior cache. */
export function resolvePreservedThemeText(
  fresh: string | undefined,
  cached: string | undefined,
  gate: (text: string) => string,
): string {
  const gatedFresh = gate(fresh?.trim() ?? "");
  if (gatedFresh) return gatedFresh;
  return gate(cached?.trim() ?? "");
}

/** Build pursuit insight-cache row — optional fields omitted when empty. */
export function buildPursuitCachePayload(
  result: PursuitEnrichResult,
  quickQuestionsQuietUntil?: string,
): PursuitEnrichCachePayload | null {
  const hasClarifiers = result.clarifiers.length > 0;
  const hasMilestones = (result.suggestedMilestones?.length ?? 0) > 0;
  const hasInsight = Boolean(result.insight?.headline?.trim());

  if (!hasClarifiers && !hasMilestones && !hasInsight) return null;

  const clarifiers = hasClarifiers ? result.clarifiers : undefined;
  const suggestedMilestones = hasMilestones ? result.suggestedMilestones ?? undefined : undefined;
  const quietField = quickQuestionsQuietUntil ? { quickQuestionsQuietUntil } : {};

  if (hasInsight && result.insight) {
    return {
      ...result.insight,
      clarifiers,
      suggestedMilestones,
      ...quietField,
    };
  }

  return {
    tone: "context",
    headline: "Help Pathfinder read this pursuit",
    body: "Answer a quick question below — then update your AI reading on Insights.",
    clarifiers,
    suggestedMilestones,
    ...quietField,
  };
}
