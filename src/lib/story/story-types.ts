import { z } from "zod";



/** Bump when Story AI payload shape or interpretation rules change materially. */

export const STORY_SCHEMA_VERSION = "2026-06-05-v3-map-shape" as const;



export const storyGenerationSchema = z.object({

  schemaVersion: z.literal(STORY_SCHEMA_VERSION),

  opening: z.string(),

  focus: z.string(),

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


