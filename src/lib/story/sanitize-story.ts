import { sanitizeThemeLabelsInText } from "@/lib/life-areas";
import type { StoryGenerationResult, StoryPayload } from "./story-types";

function sanitizeString(value: string): string {
  return sanitizeThemeLabelsInText(value);
}

export function sanitizeStoryGeneration(
  story: StoryGenerationResult,
): StoryGenerationResult {
  return {
    opening: sanitizeString(story.opening),
    strengths: story.strengths.map((s) => ({
      pursuitTitle: sanitizeString(s.pursuitTitle),
      body: sanitizeString(s.body),
    })),
    gaps: story.gaps.map((s) => ({
      pursuitTitle: sanitizeString(s.pursuitTitle),
      body: sanitizeString(s.body),
    })),
    comparison: sanitizeString(story.comparison),
    focus: sanitizeString(story.focus),
    closing: sanitizeString(story.closing),
  };
}

export function sanitizeStoryPayload(story: StoryPayload): StoryPayload {
  const sanitized = sanitizeStoryGeneration(story);
  return { ...sanitized, generatedAt: story.generatedAt };
}
