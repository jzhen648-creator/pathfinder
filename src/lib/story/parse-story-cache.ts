import type { StoryCache } from "@prisma/client";
import { sanitizeStoryPayload } from "./sanitize-story";
import { storyGenerationSchema, type StoryPayload } from "./story-types";

export function parseStoryPayload(raw: string, generatedAt: Date): StoryPayload | null {
  try {
    const json = JSON.parse(raw) as unknown;
    const parsed = storyGenerationSchema.safeParse(json);
    if (!parsed.success) return null;
    return sanitizeStoryPayload({
      ...parsed.data,
      generatedAt: generatedAt.toISOString(),
    });
  } catch {
    return null;
  }
}

export function storyCacheToPayload(row: StoryCache, stale: boolean): StoryPayload | null {
  return parseStoryPayload(row.payload, row.generatedAt);
}

export type { StoryCache };
