import { z } from "zod";

/** Bump when Insights season-read payload shape or rules change materially. */
export const STORY_SCHEMA_VERSION = "2026-06-10-insights-season" as const;

/** Previous Story tab schema — parsed for one-release cache migration. */
export const LEGACY_STORY_SCHEMA_VERSION = "2026-06-05-v3-map-shape" as const;

export const storyGenerationSchema = z.object({
  schemaVersion: z.literal(STORY_SCHEMA_VERSION),
  seasonRead: z.string(),
});

const legacyStoryGenerationSchema = z.object({
  schemaVersion: z.literal(LEGACY_STORY_SCHEMA_VERSION),
  opening: z.string(),
  focus: z.string().optional(),
});

export type StoryGenerationResult = z.infer<typeof storyGenerationSchema>;

export type StoryPayload = StoryGenerationResult & {
  generatedAt: string;
};

export type StoryCacheResponse = {
  story: StoryPayload;
  stale: boolean;
  generatedAt: string;
  mapVersion?: string;
  memoryVersion?: number;
  canAutoRefresh?: boolean;
};

/** Migrate legacy opening/focus cache to seasonRead shape. */
export function migrateLegacyStoryJson(json: unknown): StoryGenerationResult | null {
  const parsed = legacyStoryGenerationSchema.safeParse(json);
  if (!parsed.success) return null;
  return {
    schemaVersion: STORY_SCHEMA_VERSION,
    seasonRead: parsed.data.opening.trim(),
  };
}
