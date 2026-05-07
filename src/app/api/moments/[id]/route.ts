import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteProps = {
  params: Promise<{ id: string }>;
};

const updateMomentSchema = z.object({
  limbId: z.string().min(1).optional(),
  branchId: z.string().min(1).optional(),
  label: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  month: z.number().int().min(1).max(12).nullable().optional(),
  mapPosition: z.number().optional(),
  significance: z.number().int().min(1).max(3).optional(),
  future: z.boolean().optional(),
  location: z.string().nullable().optional(),
  timelineNote: z.string().nullable().optional(),
  isTurningPoint: z.boolean().optional(),
  subtype: z.string().max(40).nullable().optional(),
});

/** Legacy JSON shape for clients that still expect `moment` payloads (formerly Prisma Moment). */
function goalToLegacyMomentJson(g: {
  id: string;
  title: string;
  description: string;
  limbId: string | null;
  branchId: string | null;
  parentGoalId: string | null;
  year: number;
  month: number | null;
  mapPosition: number;
  significance: number;
  future: boolean;
  isTurningPoint: boolean;
  location: string | null;
  timelineNote: string | null;
  subtype: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: g.id,
    label: g.title,
    description: g.description,
    limbId: g.limbId,
    branchId: g.branchId,
    parentMomentId: g.parentGoalId,
    year: g.year,
    month: g.month,
    mapPosition: g.mapPosition,
    significance: g.significance,
    future: g.future,
    isTurningPoint: g.isTurningPoint,
    location: g.location,
    timelineNote: g.timelineNote,
    subtype: g.subtype,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
}

export async function PATCH(request: Request, { params }: RouteProps) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const parsed = updateMomentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
  }

  const existing = await prisma.goal.findFirst({
    where: {
      id,
      userId,
      goalType: { in: ["moment", "event"] },
    },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const input = parsed.data;
  const updated = await prisma.goal.update({
    where: { id },
    data: {
      limbId: input.limbId ?? undefined,
      branchId: input.branchId ?? undefined,
      title: input.label ? input.label.trim().split(/\s+/).slice(0, 5).join(" ") : undefined,
      description: input.description !== undefined ? (input.description ?? "") : undefined,
      year: input.year,
      month: input.month,
      mapPosition: input.mapPosition,
      significance: input.significance,
      future: input.future,
      location: input.location,
      timelineNote: input.timelineNote,
      isTurningPoint: input.isTurningPoint,
      subtype: input.subtype,
    },
  });
  return NextResponse.json({ moment: goalToLegacyMomentJson(updated) });
}

export async function DELETE(_request: Request, { params }: RouteProps) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.goal.findFirst({
    where: { id, userId, goalType: { in: ["moment", "event"] } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.goal.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
