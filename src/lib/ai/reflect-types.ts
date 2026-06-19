import { z } from "zod";
import { clarifierSchema, suggestedMilestoneSchema } from "@/lib/pursuit/pursuit-enrich-types";
import { insightToneSchema } from "@/lib/insights/insight-types";
import { normalizeLegacyPursuitTone } from "@/lib/insights/resolve-pursuit-insight-tone";

export const REFLECT_READING_MAX_CHARS = 900;

export const reflectPursuitEntrySchema = z.object({
  tone: z
    .unknown()
    .optional()
    .transform((val) =>
      val == null || val === "" ? undefined : normalizeLegacyPursuitTone(val),
    ),
  headline: z.string().max(100),
  body: z.string().max(500),
  fromMap: z.string().max(200).optional(),
  comparison: z.string().max(200).optional(),
  clarifiers: z.array(clarifierSchema).max(3).optional(),
  suggestedMilestones: z.array(suggestedMilestoneSchema).max(6).nullable().optional(),
});

export const reflectThemeEntrySchema = z.object({
  tone: insightToneSchema,
  oneLiner: z.string().max(100),
  reflective: z.string().max(500),
  contextual: z.string().max(500).optional().default(""),
  combined: z.string().max(500).optional().default(""),
});

export const reflectResponseSchema = z.object({
  reading: z.string().max(REFLECT_READING_MAX_CHARS),
  themes: z.record(z.string(), reflectThemeEntrySchema).optional().default({}),
  pursuits: z.record(z.string(), reflectPursuitEntrySchema),
});

export type ReflectPursuitEntry = z.infer<typeof reflectPursuitEntrySchema>;
export type ReflectThemeEntry = z.infer<typeof reflectThemeEntrySchema>;
export type ReflectResponse = z.infer<typeof reflectResponseSchema>;
