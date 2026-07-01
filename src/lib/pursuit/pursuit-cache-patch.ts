import {
  CLARIFIER_INITIAL_BATCH,
  CLARIFIER_PENDING_CAP,
  CLARIFIER_REPLENISH_BATCH,
  CLARIFIER_SKIPPED_PROMPTS_MAX,
} from "@/lib/pursuit/clarifier-prompt-blocks";
import {
  gatePursuitComparison,
  isQuickQuestionsQuiet,
  type PursuitSignal,
} from "@/lib/pursuit/pursuit-enrich-readiness";
import type { Clarifier, PursuitEnrichCachePayload, PursuitEnrichResult } from "@/lib/pursuit/pursuit-enrich-types";

export type ClarifierMergeMode = "routine" | "initial" | "replenish";

function normalizeClarifierPrompt(prompt: string): string {
  return prompt.trim().toLowerCase();
}

function filterFreshAgainstSkipped(fresh: Clarifier[], skippedPrompts?: string[]): Clarifier[] {
  if (!skippedPrompts?.length) return fresh;
  const skipped = new Set(skippedPrompts.map(normalizeClarifierPrompt));
  return fresh.filter((c) => !skipped.has(normalizeClarifierPrompt(c.prompt)));
}

/** Append a skipped prompt to the rolling anti-repeat list (wording only, not topics). */
export function appendSkippedClarifierPrompt(
  existing: string[] | undefined,
  prompt: string,
): string[] | undefined {
  const trimmed = prompt.trim();
  if (!trimmed) return existing?.length ? existing : undefined;
  const normalized = normalizeClarifierPrompt(trimmed);
  const withoutDup = (existing ?? []).filter((p) => normalizeClarifierPrompt(p) !== normalized);
  const next = [...withoutDup, trimmed].slice(-CLARIFIER_SKIPPED_PROMPTS_MAX);
  return next.length > 0 ? next : undefined;
}

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
  profile?: { age: number | null; location: string | null },
): string | undefined {
  const gatedFresh = gatePursuitComparison(freshRaw?.trim() ?? "", signal, profile);
  if (gatedFresh) return gatedFresh;
  const gatedCached = gatePursuitComparison(cached?.trim() ?? "", signal, profile);
  return gatedCached || undefined;
}

export function mergePreservedClarifiers(input: {
  fresh: Clarifier[];
  cached: Clarifier[] | undefined;
  preserveAllowed: boolean;
  mode: ClarifierMergeMode;
  skippedPrompts?: string[];
}): Clarifier[] {
  const cached = input.cached ?? [];
  const fresh = filterFreshAgainstSkipped(input.fresh, input.skippedPrompts);

  if (!input.preserveAllowed) {
    return cached.length > 0 ? cached.slice(0, CLARIFIER_PENDING_CAP) : [];
  }

  if (input.mode === "routine") {
    if (cached.length > 0) return cached.slice(0, CLARIFIER_PENDING_CAP);
    if (fresh.length > 0) return fresh.slice(0, CLARIFIER_INITIAL_BATCH);
    return [];
  }

  if (input.mode === "initial") {
    if (cached.length > 0) return cached.slice(0, CLARIFIER_PENDING_CAP);
    return fresh.slice(0, CLARIFIER_INITIAL_BATCH);
  }

  // replenish — pending queue was cleared by dismiss; add up to REPLENISH_BATCH new cards.
  const room = CLARIFIER_PENDING_CAP - cached.length;
  if (room <= 0) return cached;
  const seenIds = new Set(cached.map((c) => c.id));
  const seenPrompts = new Set(cached.map((c) => normalizeClarifierPrompt(c.prompt)));
  const merged = [...cached];
  for (const clarifier of fresh) {
    if (merged.length >= CLARIFIER_PENDING_CAP) break;
    if (merged.length - cached.length >= CLARIFIER_REPLENISH_BATCH) break;
    if (seenIds.has(clarifier.id)) continue;
    const normalized = normalizeClarifierPrompt(clarifier.prompt);
    if (seenPrompts.has(normalized)) continue;
    merged.push(clarifier);
    seenIds.add(clarifier.id);
    seenPrompts.add(normalized);
  }
  return merged;
}

/** @deprecated Use mergePreservedClarifiers with an explicit mode. */
export function resolvePreservedClarifiers(input: {
  fresh: Clarifier[];
  cached: Clarifier[] | undefined;
  preserveAllowed: boolean;
}): Clarifier[] {
  return mergePreservedClarifiers({
    ...input,
    mode: "routine",
  });
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
    input.status !== "COMPLETE" &&
    !isQuickQuestionsQuiet(input.quickQuestionsQuietUntil, input.now)
  );
}

/** Prefer fresh gated theme text; when reflect returned the field (even empty), do not resurrect stale cache. */
export function resolvePreservedThemeText(
  fresh: string | undefined | null,
  cached: string | undefined,
  gate: (text: string) => string,
): string {
  if (fresh !== undefined && fresh !== null) {
    return gate(fresh.trim());
  }
  return gate(cached?.trim() ?? "");
}

/** Build pursuit insight-cache row — optional fields omitted when empty. */
export function buildPursuitCachePayload(
  result: PursuitEnrichResult,
  options?: {
    quickQuestionsQuietUntil?: string;
    skippedClarifierPrompts?: string[];
  },
): PursuitEnrichCachePayload | null {
  const hasClarifiers = result.clarifiers.length > 0;
  const hasMilestones = (result.suggestedMilestones?.length ?? 0) > 0;
  const hasInsight = Boolean(result.insight?.headline?.trim());

  if (!hasClarifiers && !hasMilestones && !hasInsight) return null;

  const clarifiers = hasClarifiers ? result.clarifiers : undefined;
  const suggestedMilestones = hasMilestones ? result.suggestedMilestones ?? undefined : undefined;
  const quietField = options?.quickQuestionsQuietUntil
    ? { quickQuestionsQuietUntil: options.quickQuestionsQuietUntil }
    : {};
  const skippedField = options?.skippedClarifierPrompts?.length
    ? { skippedClarifierPrompts: options.skippedClarifierPrompts }
    : {};

  if (hasInsight && result.insight) {
    return {
      ...result.insight,
      clarifiers,
      suggestedMilestones,
      ...quietField,
      ...skippedField,
    };
  }

  return {
    tone: "context",
    headline: "Help Almanac read this chapter",
    body: "Answer a quick question below — then update your Reading when you're ready.",
    clarifiers,
    suggestedMilestones,
    ...quietField,
    ...skippedField,
  };
}
