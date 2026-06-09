import { sanitizeThemeLabelsInText } from "@/lib/life-areas";

import type { StoryGenerationResult, StoryPayload } from "./story-types";



function sanitizeString(value: string): string {

  return sanitizeThemeLabelsInText(value);

}



export function sanitizeStoryGeneration(

  story: StoryGenerationResult,

): StoryGenerationResult {

  return {

    schemaVersion: story.schemaVersion,

    opening: sanitizeString(story.opening),

    focus: sanitizeString(story.focus),

  };

}



export function sanitizeStoryPayload(story: StoryPayload): StoryPayload {

  const sanitized = sanitizeStoryGeneration(story);

  return { ...sanitized, generatedAt: story.generatedAt };

}


