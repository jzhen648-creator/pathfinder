import { NextResponse } from "next/server";
import { requireApiSessionUserId } from "@/lib/api-auth";
import {
  assertAiUserRateLimit,
  AiUserRateLimitError,
  recordAiUserRateLimitSuccess,
} from "@/lib/ai/ai-user-rate-limit";
import {
  buildImportDraftSystemPrompt,
  importDraftRequestSchema,
  normalizeImportDraftResponse,
} from "@/lib/ai/import-draft";
import { generateJsonCompletion, GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";

/**
 * POST /api/goals/import-draft
 * Free text → drafted chapters for the user to curate. Stateless: nothing
 * is persisted here; the client walks the drafts through the normal create
 * flow one confirm at a time. See src/lib/ai/import-draft.ts.
 */

function stripJsonFence(raw: string): string {
  const t = raw.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(t);
  return m?.[1]?.trim() ?? t;
}

export async function POST(request: Request) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  if (!hasGeminiKey()) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const parsed = importDraftRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  try {
    assertAiUserRateLimit(userId);

    const raw = await generateJsonCompletion({
      system: buildImportDraftSystemPrompt(),
      user: parsed.data.text,
      maxTokens: 2048,
      temperature: 0.2,
    });

    if (!raw) {
      return NextResponse.json({ error: "Empty draft response." }, { status: 502 });
    }

    let json: unknown;
    try {
      json = JSON.parse(stripJsonFence(raw));
    } catch {
      return NextResponse.json({ error: "Model returned invalid JSON." }, { status: 502 });
    }

    recordAiUserRateLimitSuccess(userId);
    return NextResponse.json(normalizeImportDraftResponse(json));
  } catch (err) {
    if (err instanceof AiUserRateLimitError) {
      return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
    }
    if (err instanceof GeminiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Import draft failed";
    console.error("[POST /api/goals/import-draft] failed", message, err);
    return NextResponse.json({ error: `Import unavailable: ${message}` }, { status: 502 });
  }
}
