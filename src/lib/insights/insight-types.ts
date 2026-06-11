import { z } from "zod";

export const insightToneSchema = z.enum(["encouraging", "nudge", "celebratory"]);

export const pursuitInsightToneSchema = z.enum([
  "celebratory",
  "encouraging",
  "nudge",
  "reality_check",
  "informational",
]);

export const insightLevelSchema = z.object({
  reflective: z.string(),
  contextual: z.string(),
  combined: z.string(),
  tone: insightToneSchema,
  oneLiner: z.string(),
});

export const pursuitInsightSchema = z.object({
  tone: pursuitInsightToneSchema,
  headline: z.string().max(100),
  body: z.string().max(500),
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

export const insightGenerationSchema = z.object({
  global: globalNowInsightSchema,
  themes: z.record(z.string(), insightLevelSchema),
  hubs: z.record(z.string(), insightLevelSchema),
  pursuits: z.record(z.string(), pursuitInsightSchema),
});

export type InsightLevelPayload = z.infer<typeof insightLevelSchema>;
export type PursuitInsightPayload = z.infer<typeof pursuitInsightSchema>;
export type GlobalNowInsight = z.infer<typeof globalNowInsightSchema>;
export type InsightGenerationResult = z.infer<typeof insightGenerationSchema>;

export type InsightCachePayload = {
  global: GlobalNowInsight;
  themes: Record<string, InsightLevelPayload>;
  hubs: Record<string, InsightLevelPayload>;
  pursuits: Record<string, PursuitInsightPayload>;
  generatedAt: string;
  mapVersion: string;
  memoryVersion: number;
  stale: boolean;
};
