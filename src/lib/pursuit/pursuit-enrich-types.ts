import { z } from "zod";
import { pursuitInsightSchema } from "@/lib/insights/insight-types";
import { CLARIFIER_INITIAL_BATCH, CLARIFIER_SKIPPED_PROMPTS_MAX } from "@/lib/pursuit/clarifier-prompt-blocks";

export const clarifierKindSchema = z.enum(["clarify", "connect", "suggest_add", "retrospective"]);

export const clarifierSchema = z
  .object({
    id: z.string().min(1),
    prompt: z.string().min(1).max(200),
    options: z.array(z.string().min(1).max(80)).min(2).max(4),
    kind: clarifierKindSchema.optional(),
    peerGoalId: z.string().optional(),
    suggestedTitle: z.string().max(100).optional(),
    suggestedCategoryId: z.string().optional(),
    suggestedThemeId: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const kind = value.kind ?? "clarify";
    if (kind === "connect" && !value.peerGoalId?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Connect clarifiers require peerGoalId",
        path: ["peerGoalId"],
      });
    }
    if (kind === "suggest_add" && !value.suggestedTitle?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Suggest-add clarifiers require suggestedTitle",
        path: ["suggestedTitle"],
      });
    }
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
});

export type PursuitEnrichCachePayload = z.infer<typeof pursuitEnrichCacheSchema>;

export function clarifierKind(clarifier: Clarifier): ClarifierKind {
  return clarifier.kind ?? "clarify";
}
