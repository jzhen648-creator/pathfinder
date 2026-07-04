import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clientIpFromRequest,
  consumeAuthRateLimit,
  rateLimitedResponse,
  __resetAuthRateLimitStore,
} from "./auth-rate-limit";

afterEach(() => {
  __resetAuthRateLimitStore();
  vi.useRealTimers();
});

describe("consumeAuthRateLimit", () => {
  const config = { limit: 3, windowMs: 60_000 };

  it("allows requests up to the limit, then blocks", () => {
    expect(consumeAuthRateLimit("k", config).limited).toBe(false);
    expect(consumeAuthRateLimit("k", config).limited).toBe(false);
    expect(consumeAuthRateLimit("k", config).limited).toBe(false);

    const blocked = consumeAuthRateLimit("k", config);
    expect(blocked.limited).toBe(true);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks distinct keys independently", () => {
    consumeAuthRateLimit("a", config);
    consumeAuthRateLimit("a", config);
    consumeAuthRateLimit("a", config);
    expect(consumeAuthRateLimit("a", config).limited).toBe(true);
    expect(consumeAuthRateLimit("b", config).limited).toBe(false);
  });

  it("resets after the window elapses", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    consumeAuthRateLimit("k", config);
    consumeAuthRateLimit("k", config);
    consumeAuthRateLimit("k", config);
    expect(consumeAuthRateLimit("k", config).limited).toBe(true);

    vi.setSystemTime(config.windowMs + 1);
    expect(consumeAuthRateLimit("k", config).limited).toBe(false);
  });
});

describe("clientIpFromRequest", () => {
  it("uses the first x-forwarded-for entry", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "203.0.113.7, 70.41.3.18" },
    });
    expect(clientIpFromRequest(req)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip then 'unknown'", () => {
    const withReal = new Request("https://example.com", {
      headers: { "x-real-ip": "198.51.100.2" },
    });
    expect(clientIpFromRequest(withReal)).toBe("198.51.100.2");
    expect(clientIpFromRequest(new Request("https://example.com"))).toBe("unknown");
  });
});

describe("rateLimitedResponse", () => {
  it("returns a 429 with a Retry-After header", () => {
    const res = rateLimitedResponse(42);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
  });
});
