import { NextResponse } from "next/server";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { hasGeminiKey } from "@/lib/gemini";
import { refreshInsightsInBackground } from "@/lib/insights/refresh-insights-background";
import { applyPursuitStream } from "@/lib/stream-pursuit-apply";
import { streamPursuitApplyRequestSchema } from "@/types/stream";

export async function POST(request: Request) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  if (!hasGeminiKey()) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const parsed = streamPursuitApplyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const { pursuitId, input, inputMode } = parsed.data;
  const result = await applyPursuitStream(auth.userId, pursuitId, input, inputMode);

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        streamRunId: result.streamRunId,
        rawInput: result.rawInput,
        error: result.error,
      },
      { status: result.status },
    );
  }

  refreshInsightsInBackground(auth.userId);

  return NextResponse.json({
    ok: true,
    streamRunId: result.streamRunId,
    rawInput: result.rawInput,
    expiresAt: result.expiresAt,
    narrativeSentence: result.narrativeSentence,
    summary: result.summary,
    items: result.items,
  });
}
