/** Phase 1 unified reflect — one Gemini call for Reading + pursuit panels. */
export function isReflectCallEnabled(): boolean {
  return process.env.USE_REFLECT_CALL === "true";
}

/**
 * Max output tokens for the unified reflect JSON payload (reading + all dirty panels).
 * 2048 truncated ~15-pursuit first refresh into invalid JSON; 8192 covers dense QA maps.
 */
export const REFLECT_MAX_OUTPUT_TOKENS = 8192;
