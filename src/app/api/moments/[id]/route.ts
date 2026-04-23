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

  const existing = await prisma.moment.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const input = parsed.data;
  if (input.branchId && !input.limbId) {
    return NextResponse.json(
      { error: "limbId is required when updating branchId" },
      { status: 400 },
    );
  }
  const moment = await prisma.moment.update({
    where: { id },
    data: {
      ...input,
      label: input.label ? input.label.trim().split(/\s+/).slice(0, 5).join(" ") : undefined,
    },
  });
  return NextResponse.json({ moment });
}

export async function DELETE(_request: Request, { params }: RouteProps) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await prisma.moment.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.moment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
