import { z } from "zod";

export const storySectionSchema = z.object({
  pursuitTitle: z.string(),
  body: z.string(),
});

export const storyGenerationSchema = z.object({
  opening: z.string(),
  strengths: z.array(storySectionSchema),
  gaps: z.array(storySectionSchema),
  comparison: z.string(),
  focus: z.string(),
  closing: z.string(),
});

export type StorySection = z.infer<typeof storySectionSchema>;
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
