import { NextResponse } from "next/server";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { excludePursuitFromInterpretation } from "@/lib/insights/invalidate-reading-caches";
import { clearReadingDirtyForPursuits } from "@/lib/map/reading-dirty-ledger";
import { prisma } from "@/lib/prisma";

type RouteProps = {
  params: Promise<{ goalId: string }>;
};

/** Permanently remove an archived pursuit and its milestones, context, and relationships. */
export async function DELETE(_request: Request, { params }: RouteProps) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const { goalId } = await params;

  const existing = await prisma.goal.findFirst({
    where: { id: goalId, userId },
    select: { id: true, archived: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!existing.archived) {
    return NextResponse.json(
      { error: "Only archived pursuits can be deleted permanently. Archive it first." },
      { status: 400 },
    );
  }

  await clearReadingDirtyForPursuits(userId, [goalId]);
  await excludePursuitFromInterpretation(userId, goalId);
  await prisma.goal.delete({ where: { id: goalId } });

  return NextResponse.json({ ok: true });
}
