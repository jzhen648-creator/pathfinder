import { NextResponse } from "next/server";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { appendCanonicalMilestoneForGoal } from "@/lib/append-canonical-milestone";
import { appendCanonicalTreeMilestoneBodySchema } from "@/lib/validation/append-canonical-milestone";

type RouteProps = { params: Promise<{ goalId: string }> };

/**
 * Phase 1 tree write convergence: append one relational `Milestone` (tree “Add step…” / AI chips).
 * Legacy `PATCH …/goals/[id]` JSON orbitals remain for checkbox edits on JSON-only goals only.
 */
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

  const parsed = appendCanonicalTreeMilestoneBodySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
  }

  const result = await appendCanonicalMilestoneForGoal(goalId, userId, parsed.data.title);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
