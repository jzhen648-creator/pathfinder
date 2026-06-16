/** Unified reflect — batches dirty pursuits (`REFLECT_PURSUIT_BATCH_SIZE`) per Gemini call. */
export function isReflectCallEnabled(): boolean {
  return process.env.USE_REFLECT_CALL === "true";
}

/**
 * Max output tokens for the unified reflect JSON payload (reading + all dirty panels).
 * 2048 truncated ~15-pursuit Alex first refresh into invalid JSON; 8192 covers one batch.
 */
export const REFLECT_MAX_OUTPUT_TOKENS = 8192;

/** Split large first-refresh maps so each Gemini response stays under the output budget. */
export const REFLECT_PURSUIT_BATCH_SIZE = 8;

export function chunkReflectPursuitIds(pursuitIds: string[]): string[][] {
  if (pursuitIds.length <= REFLECT_PURSUIT_BATCH_SIZE) return [pursuitIds];
  const batches: string[][] = [];
  for (let i = 0; i < pursuitIds.length; i += REFLECT_PURSUIT_BATCH_SIZE) {
    batches.push(pursuitIds.slice(i, i + REFLECT_PURSUIT_BATCH_SIZE));
  }
  return batches;
}
