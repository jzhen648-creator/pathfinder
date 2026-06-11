import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { resolveAmbiguousMark } from "@/lib/stream-commit-ambiguous";
import { STREAM_AMBIGUOUS_RESOLUTION_VALUES } from "@/types/stream";

const bodySchema = z.object({
  markId: z.string().min(1),
  resolution: z.enum(STREAM_AMBIGUOUS_RESOLUTION_VALUES),
  targetBranchId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
  }

  const result = await resolveAmbiguousMark(
    auth.userId,
    parsed.data.markId,
    parsed.data.resolution,
    parsed.data.targetBranchId ?? parsed.data.categoryId,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
