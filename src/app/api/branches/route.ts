import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Root hub rows only. Hub splits from timeline moments (`parentBranchId` / `turningPointId`) were removed in 2026-05. */
const createBranchSchema = z
  .object({
    limbId: z.string().min(1),
    label: z.string().nullable().optional(),
    mapAngleOffset: z.number().default(0),
  })
  .strict();

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const sessionUserId = session?.user?.id;
  if (!sessionUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const requestedUserId = url.searchParams.get("userId");
  const userId =
    process.env.NODE_ENV === "development" && requestedUserId
      ? requestedUserId
      : sessionUserId;

  const branches = await prisma.branch.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  const goals = await prisma.goal.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: {
      milestones: {
        orderBy: { position: "asc" },
        include: {
          subtasks: {
            orderBy: { position: "asc" },
            select: { id: true, isCompleted: true, position: true, title: true },
          },
        },
      },
      forkedGoals: { select: { id: true } },
    },
  });
  return NextResponse.json({ branches, goals });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createBranchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
  }

  const input = parsed.data;
  const branch = await prisma.branch.create({
    data: {
      userId,
      limbId: input.limbId,
      label: input.label ?? null,
      parentBranchId: null,
      turningPointId: null,
      mapAngleOffset: input.mapAngleOffset,
    },
  });
  return NextResponse.json({ branch });
}
