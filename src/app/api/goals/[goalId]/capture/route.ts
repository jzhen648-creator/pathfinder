import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { savePendingPursuitCapture } from "@/lib/stream-pursuit-capture";

type RouteProps = { params: Promise<{ goalId: string }> };

const requestSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  inputMode: z.enum(["text", "voice"]).optional(),
});

export async function POST(request: Request, props: RouteProps) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  const { goalId } = await props.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const result = await savePendingPursuitCapture(
    auth.userId,
    goalId,
    parsed.data.text,
    parsed.data.inputMode ?? "text",
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
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
