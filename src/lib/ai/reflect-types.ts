import { z } from "zod";
import { clarifierSchema, suggestedContinuationSchema, suggestedMilestoneSchema } from "@/lib/pursuit/pursuit-enrich-types";
import { THEME_ONE_LINER_MAX } from "@/lib/ai/normalize-reflect-response";
import {
  PURSUIT_INSIGHT_BODY_MAX,
  PURSUIT_INSIGHT_COMPARISON_MAX,
  PURSUIT_INSIGHT_HEADLINE_MAX,
} from "@/lib/insights/insight-field-limits";
import { insightToneSchema } from "@/lib/insights/insight-types";
import { normalizeLegacyPursuitTone } from "@/lib/insights/resolve-pursuit-insight-tone";

export const reflectPursuitEntrySchema = z.object({
  tone: z
    .unknown()
    .optional()
    .transform((val) =>
      val == null || val === "" ? undefined : normalizeLegacyPursuitTone(val),
    ),
  headline: z.string().max(PURSUIT_INSIGHT_HEADLINE_MAX),
  body: z.string().max(PURSUIT_INSIGHT_BODY_MAX),
  comparison: z.string().max(PURSUIT_INSIGHT_COMPARISON_MAX).optional(),
  clarifiers: z.array(clarifierSchema).max(3).optional(),
  suggestedMilestones: z.array(suggestedMilestoneSchema).max(6).nullable().optional(),
  suggestedContinuations: z.array(suggestedContinuationSchema).max(2).optional(),
});

export const reflectThemeEntrySchema = z.object({
  tone: insightToneSchema,
  oneLiner: z.string().max(THEME_ONE_LINER_MAX),
  reflective: z.string().max(800),
  contextual: z.string().max(500).optional().default(""),
  combined: z.string().max(500).optional().default(""),
});

export const reflectResponseSchema = z.object({
  themes: z.record(z.string(), reflectThemeEntrySchema).optional().default({}),
  pursuits: z.record(z.string(), reflectPursuitEntrySchema),
});

export type ReflectPursuitEntry = z.infer<typeof reflectPursuitEntrySchema>;
export type ReflectThemeEntry = z.infer<typeof reflectThemeEntrySchema>;
export type ReflectResponse = z.infer<typeof reflectResponseSchema>;
