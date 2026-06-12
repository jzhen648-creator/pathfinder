import { z } from "zod";
import { pursuitInsightSchema } from "@/lib/insights/insight-types";

export const clarifierSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1).max(200),
  options: z.array(z.string().min(1).max(80)).min(2).max(4),
});

export const suggestedMilestoneSchema = z.object({
  title: z.string().min(1).max(120),
  order: z.number().int().nonnegative(),
});

export const pursuitEnrichResultSchema = z.object({
  clarifiers: z.array(clarifierSchema).max(3),
  insight: pursuitInsightSchema.nullable(),
  suggestedMilestones: z.array(suggestedMilestoneSchema).max(6).nullable(),
});

export const pursuitEnrichBatchSchema = z.object({
  pursuits: z.record(z.string(), pursuitEnrichResultSchema),
});

export const enrichAnswerSchema = z.object({
  clarifierId: z.string().min(1),
  prompt: z.string().min(1),
  selectedOption: z.string().min(1),
});

export const enrichAnswersSchema = z.array(enrichAnswerSchema);

export type Clarifier = z.infer<typeof clarifierSchema>;
export type SuggestedMilestone = z.infer<typeof suggestedMilestoneSchema>;
export type PursuitEnrichResult = z.infer<typeof pursuitEnrichResultSchema>;
export type EnrichAnswer = z.infer<typeof enrichAnswerSchema>;

/** Cached pursuit payload — insight plus optional enrich UI fields. */
export const pursuitEnrichCacheSchema = pursuitInsightSchema.extend({
  clarifiers: z.array(clarifierSchema).optional(),
  suggestedMilestones: z.array(suggestedMilestoneSchema).optional(),
});

export type PursuitEnrichCachePayload = z.infer<typeof pursuitEnrichCacheSchema>;
