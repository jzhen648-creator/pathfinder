export class ReadingDeltaGenerationResponseError extends Error {
  status = 503;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ReadingDeltaGenerationResponseError";
  }
}

/** Retired — whole-map season read / StoryCache removed. */
export async function generateReadingDelta(): Promise<never> {
  throw new ReadingDeltaGenerationResponseError("Reading delta generation is retired.");
}
