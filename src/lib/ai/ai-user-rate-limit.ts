const ONE_MINUTE_MS = 60_000;
/** Free-tier Gemini — cap outbound model calls per user per minute (best-effort on serverless). */
const MAX_CALLS_PER_MINUTE = 16;

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

export class AiUserRateLimitError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super("AI rate limit — try again in a moment.");
    this.name = "AiUserRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

/** Returns ms to wait when over limit; 0 when allowed. */
export function aiUserRateLimitDelayMs(userId: string | null | undefined): number {
  const key = userId?.trim() || "__global__";
  const now = Date.now();
  let window = windows.get(key);
  if (!window || now >= window.resetAt) {
    window = { count: 0, resetAt: now + ONE_MINUTE_MS };
    windows.set(key, window);
  }
  if (window.count >= MAX_CALLS_PER_MINUTE) {
    return Math.max(0, window.resetAt - now);
  }
  window.count += 1;
  return 0;
}

export function assertAiUserRateLimit(userId: string | null | undefined): void {
  const delayMs = aiUserRateLimitDelayMs(userId);
  if (delayMs > 0) {
    throw new AiUserRateLimitError(delayMs);
  }
}
