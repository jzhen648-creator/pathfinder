import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { markPursuitReadingDirty } from "@/lib/map/reading-dirty-ledger";
import { reorderMilestonesForGoal } from "@/lib/reorder-goal-milestones";

const bodySchema = z.object({
  orderedIds: z.array(z.string().trim().min(1)).min(1),
});

type RouteProps = { params: Promise<{ goalId: string }> };

/** Replace milestone order for one chapter (transaction-safe). */
export async function POST(request: Request, props: RouteProps) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  const { goalId } = await props.params;

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

  const result = await reorderMilestonesForGoal(goalId, userId, parsed.data.orderedIds);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await markPursuitReadingDirty(userId, goalId, "milestone_reordered");

  return NextResponse.json({ ok: true });
}
