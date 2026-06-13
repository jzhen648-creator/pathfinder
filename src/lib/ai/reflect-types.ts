import { z } from "zod";
import { clarifierSchema, suggestedMilestoneSchema } from "@/lib/pursuit/pursuit-enrich-types";
import { pursuitInsightToneSchema } from "@/lib/insights/insight-types";

export const REFLECT_READING_MAX_CHARS = 900;

export const reflectPursuitEntrySchema = z.object({
  tone: pursuitInsightToneSchema,
  headline: z.string().max(100),
  body: z.string().max(500),
  clarifiers: z.array(clarifierSchema).max(3).optional(),
  suggestedMilestones: z.array(suggestedMilestoneSchema).max(6).nullable().optional(),
});

export const reflectResponseSchema = z.object({
  reading: z.string().max(REFLECT_READING_MAX_CHARS),
  pursuits: z.record(z.string(), reflectPursuitEntrySchema),
});

export type ReflectPursuitEntry = z.infer<typeof reflectPursuitEntrySchema>;
export type ReflectResponse = z.infer<typeof reflectResponseSchema>;
