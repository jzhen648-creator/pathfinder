import { sanitizeThemeLabelsInText } from "@/lib/life-areas";

import type { StoryGenerationResult, StoryPayload } from "./story-types";

function sanitizeString(value: string): string {
  return sanitizeThemeLabelsInText(value);
}

export function sanitizeStoryGeneration(story: StoryGenerationResult): StoryGenerationResult {
  return {
    schemaVersion: story.schemaVersion,
    seasonRead: sanitizeString(story.seasonRead),
  };
}

export function sanitizeStoryPayload(story: StoryPayload): StoryPayload {
  const sanitized = sanitizeStoryGeneration(story);
  return { ...sanitized, generatedAt: story.generatedAt };
}
