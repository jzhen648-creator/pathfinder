import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { appendCanonicalTreeMilestoneForGoal } from "@/lib/append-canonical-tree-milestone";
import { appendCanonicalTreeMilestoneBodySchema } from "@/lib/validation/append-canonical-tree-milestone";

type RouteProps = { params: Promise<{ goalId: string }> };

/**
 * Phase 1 tree write convergence: append one relational `Milestone` (tree “Add step…” / AI chips).
 * Legacy `PATCH …/goals/[id]` JSON orbitals remain for checkbox edits on JSON-only goals only.
 */
export async function POST(request: Request, props: RouteProps) {
  const session = await getServerSession(authOptions);
  const sessionUserId = session?.user?.id;
  if (!sessionUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const requestedUserId = url.searchParams.get("userId");
  const userId =
    process.env.NODE_ENV === "development" && requestedUserId ? requestedUserId : sessionUserId;

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

  const result = await appendCanonicalTreeMilestoneForGoal(goalId, userId, parsed.data.title);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(
    {
      ok: true,
      bloomRecomputeFailed: result.bloomRecomputeFailed === true,
    },
    { status: 201 },
  );
}
