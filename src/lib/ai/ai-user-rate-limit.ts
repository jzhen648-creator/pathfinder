const ONE_MINUTE_MS = 60_000;
/** Successful Gemini calls per user per minute (failed attempts do not count). */
const MAX_SUCCESSFUL_CALLS_PER_MINUTE = 10;

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

export class AiUserRateLimitError extends Error {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super("Pathfinder is spacing AI requests — try again in a moment.");
    this.name = "AiUserRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

function windowForKey(userId: string | null | undefined): Window {
  const key = userId?.trim() || "__global__";
  const now = Date.now();
  let window = windows.get(key);
  if (!window || now >= window.resetAt) {
    window = { count: 0, resetAt: now + ONE_MINUTE_MS };
    windows.set(key, window);
  }
  return window;
}

/** Returns ms to wait when over limit; 0 when a new call may be attempted. Does not consume a slot. */
export function aiUserRateLimitDelayMs(userId: string | null | undefined): number {
  const window = windowForKey(userId);
  const now = Date.now();
  if (window.count >= MAX_SUCCESSFUL_CALLS_PER_MINUTE) {
    return Math.max(0, window.resetAt - now);
  }
  return 0;
}

/** Record one successful provider call (invoke after Gemini returns OK). */
export function recordAiUserRateLimitSuccess(userId: string | null | undefined): void {
  const window = windowForKey(userId);
  window.count += 1;
}

export function assertAiUserRateLimit(userId: string | null | undefined): void {
  const delayMs = aiUserRateLimitDelayMs(userId);
  if (delayMs > 0) {
    throw new AiUserRateLimitError(delayMs);
  }
}
