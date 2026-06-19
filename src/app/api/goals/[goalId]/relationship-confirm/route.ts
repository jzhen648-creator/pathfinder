import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { applyRelationshipConfirmForUser } from "@/lib/pursuit/apply-relationship-confirm";

type RouteProps = { params: Promise<{ goalId: string }> };

const bodySchema = z.object({
  clarifierId: z.string().min(1),
  peerGoalId: z.string().min(1),
  selectedOption: z.string().min(1),
});

export async function POST(request: Request, { params }: RouteProps) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  const { goalId } = await params;
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

  try {
    const result = await applyRelationshipConfirmForUser(auth.userId, goalId, parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save relationship";
    const status = message === "Not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
