import { NextResponse } from "next/server";
import { GeminiNotConfiguredError, GeminiProviderError } from "@/lib/gemini";
import { AiUserRateLimitError } from "@/lib/ai/ai-user-rate-limit";

function providerStatus(err: unknown): number | null {
  if (err instanceof GeminiProviderError) return err.status;
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: unknown }).status;
    return typeof status === "number" ? status : null;
  }
  return null;
}

function isRateLimitMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("429") ||
    normalized.includes("rate limit") ||
    normalized.includes("quota")
  );
}

/** Map pursuit-panel AI failures to HTTP status (429 for quota, 503 for config, 502 otherwise). */
export function aiRouteErrorResponse(err: unknown, logLabel: string): NextResponse {
  if (err instanceof GeminiNotConfiguredError) {
    return NextResponse.json({ error: err.message }, { status: 503 });
  }

  if (err instanceof AiUserRateLimitError) {
    const seconds = Math.max(1, Math.ceil(err.retryAfterMs / 1000));
    return NextResponse.json(
      { error: `Pathfinder is spacing AI requests — try again in about ${seconds} seconds.` },
      {
        status: 429,
        headers: { "Retry-After": String(seconds) },
      },
    );
  }

  if (providerStatus(err) === 429) {
    return NextResponse.json(
      {
        error:
          "Gemini quota reached. Wait a few minutes and try again — or check AI Studio if the daily limit is exhausted.",
      },
      { status: 429, headers: { "Retry-After": "120" } },
    );
  }

  if (providerStatus(err) === 503) {
    return NextResponse.json(
      { error: "Gemini is temporarily overloaded. Wait a couple of minutes, then try again." },
      { status: 503, headers: { "Retry-After": "120" } },
    );
  }

  const message = err instanceof Error ? err.message : "AI request failed";
  if (isRateLimitMessage(message)) {
    return NextResponse.json({ error: message }, { status: 429 });
  }

  console.error(logLabel, err);
  return NextResponse.json({ error: message }, { status: 502 });
}
