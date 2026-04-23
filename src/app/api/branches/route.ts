import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createBranchSchema = z.object({
  limbId: z.string().min(1),
  label: z.string().nullable().optional(),
  parentBranchId: z.string().nullable().optional(),
  turningPointId: z.string().nullable().optional(),
  mapAngleOffset: z.number().default(0),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const branches = await prisma.branch.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ branches });
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
      parentBranchId: input.parentBranchId ?? null,
      turningPointId: input.turningPointId ?? null,
      mapAngleOffset: input.mapAngleOffset,
    },
  });
  return NextResponse.json({ branch });
}
