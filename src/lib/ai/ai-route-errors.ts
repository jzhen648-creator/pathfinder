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
    return NextResponse.json(
      { error: "AI is busy — wait a moment and try again." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(err.retryAfterMs / 1000)) },
      },
    );
  }

  if (providerStatus(err) === 429) {
    const message = err instanceof Error ? err.message : "Rate limit exceeded. Try again later.";
    return NextResponse.json({ error: message }, { status: 429 });
  }

  const message = err instanceof Error ? err.message : "AI request failed";
  if (isRateLimitMessage(message)) {
    return NextResponse.json({ error: message }, { status: 429 });
  }

  console.error(logLabel, err);
  return NextResponse.json({ error: message }, { status: 502 });
}
