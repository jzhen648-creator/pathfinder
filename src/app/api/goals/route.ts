import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { recomputeGoalBloomStatus } from "@/lib/goal-bloom";
import { getLimb } from "@/lib/limbs";
import { prisma } from "@/lib/prisma";
import {
  createGoalPayloadSchema,
  deadlineIsInFutureLocal,
  parseLocalDateOnly,
} from "@/lib/validation/create-goal";

function redirectToMoments(request: Request) {
  const url = new URL(request.url);
  url.pathname = "/api/marks";
  return NextResponse.redirect(url, 308);
}

export async function GET(request: Request) {
  return redirectToMoments(request);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const parsed = createGoalPayloadSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      { error: issue?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const branchRecord = await prisma.branch.findFirst({
    where: { id: input.branchId.trim(), userId },
    select: { id: true, limbId: true, name: true, label: true },
  });
  if (!branchRecord) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  const title = input.title.trim();
  const description = input.description.trim();

  let deadline: Date | null = null;
  if (input.goalType === "project" && input.deadline.trim()) {
    deadline = parseLocalDateOnly(input.deadline.trim());
    if (!deadline) {
      return NextResponse.json({ error: "Invalid deadline date" }, { status: 400 });
    }
  }

  const future = deadline ? deadlineIsInFutureLocal(deadline) : true;

  const now = new Date();
  const year = deadline ? deadline.getFullYear() : now.getFullYear();
  const month = deadline ? deadline.getMonth() + 1 : now.getMonth() + 1;

  const measurable = input.hasMeasurableTarget;
  const targetNum = measurable ? Number(input.targetAmount) : NaN;
  if (measurable && (!Number.isFinite(targetNum) || targetNum <= 0)) {
    return NextResponse.json({ error: "Target amount must be a positive number" }, { status: 400 });
  }
  let currentNum = measurable ? Number(input.currentAmount) : null;
  if (measurable) {
    if (!Number.isFinite(currentNum) || (currentNum ?? 0) < 0) {
      currentNum = 0;
    }
  }

  const unit = measurable && input.unit.trim().length > 0 ? input.unit.trim() : null;
  const lifeArea = getLimb(branchRecord.limbId)?.label ?? "Other";

  try {
    const goal = await prisma.goal.create({
      data: {
        userId,
        title,
        description,
        lifeArea,
        goalType: input.goalType,
        branchId: branchRecord.id,
        limbId: branchRecord.limbId,
        deadline,
        significance: input.significance,
        bloomStatus: "BUD",
        aiGenerated: false,
        future,
        year,
        month,
        targetAmount: measurable ? targetNum : null,
        currentAmount: measurable ? currentNum : null,
        unit: measurable ? unit : null,
      },
    });

    await recomputeGoalBloomStatus(goal.id);

    const branchLabel = branchRecord.name ?? branchRecord.label ?? "Branch";

    return NextResponse.json(
      {
        goal: { id: goal.id, title: goal.title },
        branchLabel,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/goals] create failed", err);
    return NextResponse.json({ error: "Could not create goal" }, { status: 500 });
  }
}
