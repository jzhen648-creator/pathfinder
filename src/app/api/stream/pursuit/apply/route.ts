import { NextResponse } from "next/server";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { savePendingPursuitCapture } from "@/lib/stream-pursuit-capture";
import { streamPursuitApplyRequestSchema } from "@/types/stream";

export async function POST(request: Request) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

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
  const result = await savePendingPursuitCapture(auth.userId, pursuitId, input, inputMode);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    pending: true,
    streamRunId: result.runId,
    rawInput: result.rawInput,
    expiresAt: result.expiresAt,
    appended: result.appended,
  });
}
