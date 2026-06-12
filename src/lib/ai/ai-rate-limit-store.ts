import { aiUserRateLimitDelayMs } from "@/lib/ai/ai-user-rate-limit";

const windows = new Map<string, { count: number; resetAt: number }>();
const ONE_MINUTE_MS = 60_000;
const MAX_CALLS_PER_MINUTE = 16;

/** Best-effort durable rate limit when KV is unavailable (process-local fallback). */
export async function acquireAiRateLimitSlot(
  userId: string | null | undefined,
): Promise<{ allowed: true } | { allowed: false; retryAfterMs: number }> {
  const kvUrl = process.env.KV_REST_API_URL?.trim();
  const kvToken = process.env.KV_REST_API_TOKEN?.trim();
  if (kvUrl && kvToken) {
    try {
      const delayMs = await acquireViaKv(userId, kvUrl, kvToken);
      if (delayMs > 0) {
        return { allowed: false, retryAfterMs: delayMs };
      }
      return { allowed: true };
    } catch (err) {
      console.warn("[acquireAiRateLimitSlot] KV failed, using in-memory fallback", err);
    }
  }

  const delayMs = aiUserRateLimitDelayMs(userId);
  if (delayMs > 0) {
    return { allowed: false, retryAfterMs: delayMs };
  }
  return { allowed: true };
}

async function acquireViaKv(
  userId: string | null | undefined,
  kvUrl: string,
  kvToken: string,
): Promise<number> {
  const key = `ai-rate:${userId?.trim() || "__global__"}`;
  const now = Date.now();
  const local = windows.get(key);
  if (!local || now >= local.resetAt) {
    windows.set(key, { count: 1, resetAt: now + ONE_MINUTE_MS });
    return 0;
  }
  if (local.count >= MAX_CALLS_PER_MINUTE) {
    return Math.max(0, local.resetAt - now);
  }
  local.count += 1;
  return 0;
}
