import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteProps = {
  params: Promise<{ id: string }>;
};

const updateMarkSchema = z.object({
  branchId: z.string().min(1).optional(),
  limbId: z.string().min(1).optional(),
  title: z.string().min(1).max(200).optional(),
  label: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  date: z.string().datetime().optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  month: z.number().int().min(1).max(12).nullable().optional(),
  type: z.enum(["milestone", "setback", "realisation", "decision", "achievement"]).optional(),
  value: z.number().nullable().optional(),
  sentiment: z.enum(["positive", "neutral", "negative"]).optional(),
  archived: z.boolean().optional(),
});

function resolveDate(input: { date?: string; year?: number; month?: number | null }): Date | undefined {
  if (input.date) return new Date(input.date);
  if (input.year !== undefined || input.month !== undefined) {
    const y = Number.isFinite(Number(input.year)) ? Number(input.year) : new Date().getFullYear();
    const m = Number.isFinite(Number(input.month)) ? Number(input.month) : 1;
    return new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00.000Z`);
  }
  return undefined;
}

export async function PATCH(request: Request, { params }: RouteProps) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const parsed = updateMarkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
  }
  const existing = await prisma.mark.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const input = parsed.data;
  const targetBranchId = input.branchId ?? existing.branchId;
  const targetLimbId = input.limbId ?? existing.limbId;
  if (targetBranchId !== existing.branchId || targetLimbId !== existing.limbId) {
    const branch = await prisma.branch.findFirst({
      where: { id: targetBranchId, userId },
      select: { id: true, limbId: true },
    });
    if (!branch) {
      return NextResponse.json({ error: "branchId must reference an existing branch" }, { status: 400 });
    }
    if (branch.limbId !== targetLimbId) {
      return NextResponse.json({ error: "branchId must belong to the same limbId" }, { status: 400 });
    }
  }

  const titleInput = input.title ?? input.label;
  const mark = await prisma.mark.update({
    where: { id },
    data: {
      branchId: targetBranchId,
      limbId: targetLimbId,
      title: titleInput ? titleInput.trim().split(/\s+/).slice(0, 7).join(" ") : undefined,
      description: input.description,
      date: resolveDate(input),
      type: input.type,
      value: input.value,
      sentiment: input.sentiment,
      archived: input.archived,
    },
  });
  return NextResponse.json({ mark });
}

// Compatibility for legacy delete flows: archive instead of hard delete.
export async function DELETE(_request: Request, { params }: RouteProps) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.mark.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.mark.update({
    where: { id },
    data: { archived: true },
  });
  return NextResponse.json({ ok: true });
}
