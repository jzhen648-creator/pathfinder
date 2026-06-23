import { z } from "zod";
import {
  PURSUIT_INSIGHT_BODY_MAX,
  PURSUIT_INSIGHT_COMPARISON_MAX,
  PURSUIT_INSIGHT_HEADLINE_MAX,
} from "@/lib/insights/insight-field-limits";

export const insightToneSchema = z.enum(["encouraging", "nudge", "celebratory"]);

/** Pursuit panel insight kicker — see claude-project/INSIGHT-TONE-CONTRACT.md */
export const pursuitInsightToneSchema = z.enum([
  "arrival",
  "in_focus",
  "worth_a_look",
  "context",
  "paused",
]);

export type PursuitInsightTone = z.infer<typeof pursuitInsightToneSchema>;

export const insightLevelSchema = z.object({
  reflective: z.string(),
  contextual: z.string(),
  combined: z.string(),
  tone: insightToneSchema,
  oneLiner: z.string(),
});

export const pursuitInsightSchema = z.object({
  tone: pursuitInsightToneSchema.default("in_focus"),
  headline: z.string().max(PURSUIT_INSIGHT_HEADLINE_MAX),
  body: z.string().max(PURSUIT_INSIGHT_BODY_MAX),
  comparison: z.string().max(PURSUIT_INSIGHT_COMPARISON_MAX).optional(),
});

export const globalNowInsightSchema = z.object({
  greeting: z.string(),
  sections: z.array(
    z.object({
      title: z.string(),
      body: z.string(),
    }),
  ),
  streamCta: z.string().optional(),
});

export const insightGenerationSchema = z
  .object({
    global: globalNowInsightSchema,
    themes: z.record(z.string(), insightLevelSchema),
    categories: z.record(z.string(), insightLevelSchema).optional(),
    /** @deprecated AI may still emit `hubs` — coerced to categories on parse. */
    hubs: z.record(z.string(), insightLevelSchema).optional(),
    pursuits: z.record(z.string(), pursuitInsightSchema),
  })
  .transform((data) => ({
    global: data.global,
    themes: data.themes,
    categories: { ...(data.hubs ?? {}), ...(data.categories ?? {}) },
    pursuits: data.pursuits,
  }));

export type InsightLevelPayload = z.infer<typeof insightLevelSchema>;
export type PursuitInsightPayload = z.infer<typeof pursuitInsightSchema>;
export type GlobalNowInsight = z.infer<typeof globalNowInsightSchema>;
export type InsightGenerationResult = z.infer<typeof insightGenerationSchema>;

export type InsightCachePayload = {
  global: GlobalNowInsight;
  themes: Record<string, InsightLevelPayload>;
  categories: Record<string, InsightLevelPayload>;
  pursuits: Record<string, PursuitInsightPayload>;
  generatedAt: string;
  mapVersion: string;
  memoryVersion: number;
  stale: boolean;
};
