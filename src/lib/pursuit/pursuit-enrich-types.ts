import { z } from "zod";
import { pursuitInsightSchema } from "@/lib/insights/insight-types";
import { CLARIFIER_INITIAL_BATCH, CLARIFIER_SKIPPED_PROMPTS_MAX } from "@/lib/pursuit/clarifier-prompt-blocks";

export const clarifierKindSchema = z.enum(["clarify", "retrospective"]);

export const clarifierSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1).max(200),
  options: z.array(z.string().min(1).max(80)).min(2).max(4),
  kind: clarifierKindSchema.optional(),
});

export const suggestedMilestoneSchema = z.object({
  title: z.string().min(1).max(120),
  order: z.number().int().nonnegative(),
});

export const suggestedContinuationSchema = z.object({
  title: z.string().min(1).max(80),
  rationale: z.string().max(200),
});

export const pursuitEnrichResultSchema = z.object({
  clarifiers: z.array(clarifierSchema).max(CLARIFIER_INITIAL_BATCH),
  insight: pursuitInsightSchema.nullable(),
  suggestedMilestones: z.array(suggestedMilestoneSchema).max(6).nullable(),
  suggestedContinuations: z.array(suggestedContinuationSchema).max(2).optional(),
});

export const pursuitEnrichBatchSchema = z.object({
  pursuits: z.record(z.string(), pursuitEnrichResultSchema),
});

export const enrichAnswerSchema = z.object({
  clarifierId: z.string().min(1),
  prompt: z.string().min(1),
  selectedOption: z.string().min(1),
  /** The choices offered when answered — lets the detail panel re-open this question to re-pick. */
  options: z.array(z.string().min(1).max(80)).min(2).max(4).optional(),
});

export const enrichAnswersSchema = z.array(enrichAnswerSchema);

export type ClarifierKind = z.infer<typeof clarifierKindSchema>;
export type Clarifier = z.infer<typeof clarifierSchema>;
export type SuggestedMilestone = z.infer<typeof suggestedMilestoneSchema>;
export type SuggestedContinuation = z.infer<typeof suggestedContinuationSchema>;
export type PursuitEnrichResult = z.infer<typeof pursuitEnrichResultSchema>;
export type EnrichAnswer = z.infer<typeof enrichAnswerSchema>;

/** Cached pursuit payload — insight plus optional enrich UI fields. */
export const pursuitEnrichCacheSchema = pursuitInsightSchema.extend({
  clarifiers: z.array(clarifierSchema).optional(),
  suggestedMilestones: z.array(suggestedMilestoneSchema).optional(),
  suggestedContinuations: z.array(suggestedContinuationSchema).max(2).optional(),
  /** ISO timestamp — no new clarifiers until this passes or status/map changes. */
  quickQuestionsQuietUntil: z.string().datetime().optional(),
  /** Skipped prompt wording — do not repeat exact phrasing; not a topic blacklist. */
  skippedClarifierPrompts: z.array(z.string().min(1).max(200)).max(CLARIFIER_SKIPPED_PROMPTS_MAX).optional(),
  /** Set after a significant title rename when user chose review — cleared after next enrich. */
  titleReconcilePending: z.boolean().optional(),
});

export type PursuitEnrichCachePayload = z.infer<typeof pursuitEnrichCacheSchema>;

export function clarifierKind(clarifier: Clarifier): ClarifierKind {
  return clarifier.kind ?? "clarify";
}

/** Retired QQ kinds — strip from cache and generation paths. */
export function isRetiredClarifierKind(kind: unknown): boolean {
  return kind === "connect" || kind === "suggest_add";
}

export function filterActiveClarifiers(clarifiers: Clarifier[]): Clarifier[] {
  return clarifiers.filter((clarifier) => !isRetiredClarifierKind(clarifier.kind));
}

/** QQ-invite shell stored when enrich has clarifiers but no chapter prose. */
export const CLARIFIER_PLACEHOLDER_HEADLINE_ALMANAC = "Help Almanac read this chapter";
export const CLARIFIER_PLACEHOLDER_HEADLINE_LEGACY = "Help Pathfinder read this pursuit";
export const CLARIFIER_PLACEHOLDER_BODY =
  "Answer a quick question below — then update your Reading when you're ready.";

/** True when the cached headline is the clarifier-only invite (not a real reading). */
export function isClarifierPlaceholderHeadline(headline: string | null | undefined): boolean {
  const trimmed = headline?.trim() ?? "";
  return (
    trimmed === CLARIFIER_PLACEHOLDER_HEADLINE_ALMANAC ||
    trimmed === CLARIFIER_PLACEHOLDER_HEADLINE_LEGACY
  );
}

/** True when a pursuit cache row has a substantive reading headline (not invite / empty). */
export function hasSubstantivePursuitHeadline(headline: string | null | undefined): boolean {
  const trimmed = headline?.trim() ?? "";
  return Boolean(trimmed) && !isClarifierPlaceholderHeadline(trimmed);
}

/** True when body is the QQ-invite shell (not real reading prose). */
export function isClarifierPlaceholderBody(body: string | null | undefined): boolean {
  return (body?.trim() ?? "") === CLARIFIER_PLACEHOLDER_BODY;
}

/** Invite headline or body — never treat as substantive reading to preserve. */
export function isClarifierPlaceholderProse(text: string | null | undefined): boolean {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return false;
  return isClarifierPlaceholderHeadline(trimmed) || isClarifierPlaceholderBody(trimmed);
}
