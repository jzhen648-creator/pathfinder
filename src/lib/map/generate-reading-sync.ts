import {
  generateInsights,
  InsightGenerationResponseError,
} from "@/lib/insights/generate-insights";
import type { InsightGenerationResult } from "@/lib/insights/insight-types";
import { GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";

export class ReadingSyncGenerationResponseError extends Error {
  status = 503;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ReadingSyncGenerationResponseError";
  }
}

export type ReadingSyncGenerationResult = {
  insights: InsightGenerationResult;
};

/** Legacy non-reflect path — insights only (season read / StoryCache retired). */
export async function generateInsightsAndStory(
  userId: string,
  options?: { skipBackfill?: boolean },
): Promise<ReadingSyncGenerationResult> {
  if (!hasGeminiKey()) {
    throw new GeminiNotConfiguredError();
  }

  try {
    const insights = await generateInsights(userId);
    if (options?.skipBackfill) {
      return { insights };
    }
    return { insights };
  } catch (err) {
    if (err instanceof InsightGenerationResponseError) throw err;
    throw new ReadingSyncGenerationResponseError("Insight generation failed.", { cause: err });
  }
}
