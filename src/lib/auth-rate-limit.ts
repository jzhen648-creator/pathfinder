import { NextResponse } from "next/server";

/**
 * Lightweight in-memory rate limiter for unauthenticated auth endpoints
 * (login, register, forgot/reset password). Keyed by client IP and, where
 * useful, by the target email so both "one IP guessing many accounts" and
 * "many IPs hammering one account" are throttled.
 *
 * Caveat: this is per-instance memory. On Vercel it protects a single warm
 * lambda and resets on cold starts; it is a sensible first line for a
 * private beta, not a substitute for a shared store (Redis/Upstash) at scale.
 * The existing AI limiter (`ai-user-rate-limit.ts`) uses the same approach.
 */

export type AuthRateLimitConfig = { limit: number; windowMs: number };

const MINUTE = 60_000;

export const AUTH_RATE_LIMITS = {
  /** Per IP and per email: password guessing. */
  login: { limit: 10, windowMs: 15 * MINUTE },
  /** Per IP: signup spam / account enumeration via 409s. */
  register: { limit: 6, windowMs: 60 * MINUTE },
  /** Per IP and per email: reset-email flooding. */
  forgotPassword: { limit: 5, windowMs: 60 * MINUTE },
  /** Per IP: token brute forcing. */
  resetPassword: { limit: 12, windowMs: 15 * MINUTE },
} satisfies Record<string, AuthRateLimitConfig>;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 20_000;

function pruneExpired(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

export type RateLimitCheck = { limited: boolean; retryAfterSeconds: number };

/**
 * Consume one slot in the bucket identified by `key`. Returns `limited: true`
 * (without consuming) once the configured limit is reached for the window.
 */
export function consumeAuthRateLimit(
  key: string,
  config: AuthRateLimitConfig,
): RateLimitCheck {
  const now = Date.now();

  if (buckets.size > MAX_BUCKETS) pruneExpired(now);

  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + config.windowMs };
    buckets.set(key, bucket);
  }

  if (bucket.count >= config.limit) {
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  return { limited: false, retryAfterSeconds: 0 };
}

/** Best-effort client IP from proxy headers (Vercel sets `x-forwarded-for`). */
export function clientIpFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Standard 429 body understood by the mobile client (`ApiError.retryAfterSeconds`). */
export function rateLimitedResponse(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: "Too many attempts. Please wait a moment and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

/** Test-only reset so buckets don't leak between test cases. */
export function __resetAuthRateLimitStore(): void {
  buckets.clear();
}
