import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { STEP } from "@/lib/branch-sequence";
import { zodErrorMessage } from "@/lib/validation/marks-and-branches";

/**
 * Explicit reorder for the branch line. Client sends a complete `order` array of node ids in their
 * new visual order (goals + moments together). Server rewrites every `sequencePosition` to clean
 * multiples of `STEP` inside one transaction. Continuation children (`Goal.parentGoalId != null`)
 * are not part of the branch sequence and must not appear in `order`.
 *
 * Use cases: drag-and-drop reorder UI (future), AI Stream batch rewrite, tests.
 */

const reorderBodySchema = z.object({
  order: z
    .array(
      z.object({
        id: z.string().min(1),
        kind: z.enum(["goal", "moment"]),
      }),
    )
    .min(1),
});

type RouteProps = { params: Promise<{ branchId: string }> };

export async function PATCH(request: Request, { params }: RouteProps) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { branchId } = await params;

  const branch = await prisma.themeCategory.findFirst({
    where: { id: branchId, userId },
    select: { id: true },
  });
  if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = reorderBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const { order } = parsed.data;

  /** Validate that every id exists on this branch + isn't an evolution child. */
  const [goals, marks] = await Promise.all([
    prisma.goal.findMany({
      where: { categoryId: branchId, parentGoalId: null, archived: false },
      select: { id: true },
    }),
    prisma.mark.findMany({
      where: { categoryId: branchId, archived: false },
      select: { id: true },
    }),
  ]);
  const goalIds = new Set(goals.map((g) => g.id));
  const markIds = new Set(marks.map((m) => m.id));
  for (const entry of order) {
    const ok = entry.kind === "goal" ? goalIds.has(entry.id) : markIds.has(entry.id);
    if (!ok) {
      return NextResponse.json(
        {
          error: `Node ${entry.id} is not a ${entry.kind} on this branch (or is archived / a continuation child).`,
        },
        { status: 400 },
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < order.length; i += 1) {
      const entry = order[i]!;
      const sequencePosition = (i + 1) * STEP;
      if (entry.kind === "goal") {
        await tx.goal.update({ where: { id: entry.id }, data: { sequencePosition } });
      } else {
        await tx.mark.update({ where: { id: entry.id }, data: { sequencePosition } });
      }
    }
  });

  return NextResponse.json({ ok: true, count: order.length });
}
