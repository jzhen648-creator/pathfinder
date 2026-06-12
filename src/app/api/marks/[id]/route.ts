import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSessionUserId } from "@/lib/api-auth";
import {
  applySequenceResolution,
  loadBranchSequencedNodes,
  resolveSequenceAnchor,
} from "@/lib/category-sequence";
import { prisma } from "@/lib/prisma";

type RouteProps = {
  params: Promise<{ id: string }>;
};

const updateMarkSchema = z.object({
  categoryId: z.string().min(1).optional(),
  limbId: z.string().min(1).optional(),
  title: z.string().min(1).max(200).optional(),
  label: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  date: z.union([z.string().datetime(), z.null()]).optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  month: z.number().int().min(1).max(12).nullable().optional(),
  value: z.number().nullable().optional(),
  sentiment: z.enum(["positive", "neutral", "negative"]).optional(),
  archived: z.boolean().optional(),
  sequenceAnchor: z
    .union([
      z.object({ kind: z.literal("append") }),
      z.object({ kind: z.literal("after"), nodeId: z.string().min(1) }),
      z.object({ kind: z.literal("before"), nodeId: z.string().min(1) }),
      z.object({
        kind: z.literal("between"),
        afterNodeId: z.string().min(1),
        beforeNodeId: z.string().min(1),
      }),
    ])
    .optional(),
});

function resolveDatePatch(
  input: { date?: string | null; year?: number; month?: number | null },
  existingDate: Date | null,
): Date | null | undefined {
  if (input.date === null) return null;
  if (input.date) return new Date(input.date);
  if (input.year !== undefined || input.month !== undefined) {
    const y = Number.isFinite(Number(input.year))
      ? Number(input.year)
      : existingDate?.getUTCFullYear() ?? new Date().getUTCFullYear();
    const m = Number.isFinite(Number(input.month))
      ? Number(input.month)
      : existingDate
        ? existingDate.getUTCMonth() + 1
        : 1;
    return new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00.000Z`);
  }
  return undefined;
}

export async function PATCH(request: Request, { params }: RouteProps) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  const { id } = await params;
  const body = await request.json();
  const parsed = updateMarkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
  }
  const existing = await prisma.mark.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const input = parsed.data;
  const targetBranchId = input.categoryId ?? existing.categoryId;
  const targetLimbId = input.limbId ?? existing.themeId;
  if (targetBranchId !== existing.categoryId || targetLimbId !== existing.themeId) {
    const branch = await prisma.themeCategory.findFirst({
      where: { id: targetBranchId, userId },
      select: { id: true, themeId: true },
    });
    if (!branch) {
      return NextResponse.json({ error: "branchId must reference an existing branch" }, { status: 400 });
    }
    if (branch.themeId !== targetLimbId) {
      return NextResponse.json({ error: "branchId must belong to the same limbId" }, { status: 400 });
    }
  }

  const titleInput = input.title ?? input.label;
  const patchDate = resolveDatePatch(input, existing.date);

  if (input.sequenceAnchor) {
    await prisma.$transaction(async (tx) => {
      const nodes = await loadBranchSequencedNodes(tx, targetBranchId);
      const resolution = resolveSequenceAnchor(nodes, input.sequenceAnchor!);
      await applySequenceResolution(tx, resolution);
      await tx.mark.update({
        where: { id },
        data: {
          categoryId: targetBranchId,
          themeId: targetLimbId,
          title: titleInput ? titleInput.trim().split(/\s+/).slice(0, 7).join(" ") : undefined,
          description: input.description,
          ...(patchDate !== undefined ? { date: patchDate } : {}),
          ...(patchDate !== undefined
            ? {
                year: patchDate?.getUTCFullYear() ?? null,
                month: patchDate ? patchDate.getUTCMonth() + 1 : null,
                future: patchDate ? patchDate.getTime() > Date.now() : false,
              }
            : {}),
          value: input.value,
          sentiment: input.sentiment,
          archived: input.archived,
          sequencePosition: resolution.sequencePosition,
        },
      });
    });
    const mark = await prisma.mark.findFirst({ where: { id, userId } });
    return NextResponse.json({ mark });
  }

  const mark = await prisma.mark.update({
    where: { id },
    data: {
      categoryId: targetBranchId,
      themeId: targetLimbId,
      title: titleInput ? titleInput.trim().split(/\s+/).slice(0, 7).join(" ") : undefined,
      description: input.description,
      ...(patchDate !== undefined ? { date: patchDate } : {}),
      ...(patchDate !== undefined
        ? {
            year: patchDate?.getUTCFullYear() ?? null,
            month: patchDate ? patchDate.getUTCMonth() + 1 : null,
            future: patchDate ? patchDate.getTime() > Date.now() : false,
          }
        : {}),
      value: input.value,
      sentiment: input.sentiment,
      archived: input.archived,
    },
  });
  return NextResponse.json({ mark });
}

// Compatibility for legacy delete flows: archive instead of hard delete.
export async function DELETE(request: Request, { params }: RouteProps) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;
  const { id } = await params;

  const existing = await prisma.mark.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.mark.update({
    where: { id },
    data: { archived: true },
  });
  return NextResponse.json({ ok: true });
}
