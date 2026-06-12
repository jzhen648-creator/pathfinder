import { NextResponse } from "next/server";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { ReorganizeError, reorganizeGoalForUser } from "@/lib/goal-reorganize";
import { markPursuitReadingDirty } from "@/lib/map/reading-dirty-ledger";
import { goalReorganizeBodySchema } from "@/lib/validation/goal-reorganize";

type RouteProps = { params: Promise<{ goalId: string }> };

export async function POST(request: Request, { params }: RouteProps) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  const { goalId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = goalReorganizeBodySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
  }

  try {
    const result = await reorganizeGoalForUser(auth.userId, goalId, parsed.data);
    await markPursuitReadingDirty(auth.userId, goalId, "pursuit_reorganized");
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ReorganizeError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
