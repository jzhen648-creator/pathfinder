import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { pruneSuggestedMilestoneFromInsightCache } from "@/lib/pursuit/apply-clarifier-answers";
import { prisma } from "@/lib/prisma";

type RouteProps = { params: Promise<{ goalId: string }> };

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
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

  const goal = await prisma.goal.findFirst({
    where: { id: goalId, userId: auth.userId, archived: false },
    select: { id: true },
  });
  if (!goal) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await pruneSuggestedMilestoneFromInsightCache(auth.userId, goalId, parsed.data.title);
  return NextResponse.json({ ok: true });
}
