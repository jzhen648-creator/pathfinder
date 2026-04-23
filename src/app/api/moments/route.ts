import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createMomentSchema = z.object({
  limbId: z.string().min(1),
  branchId: z.string().min(1),
  label: z.string().min(1).max(200),
  description: z.string().nullable().optional(),
  year: z.number().int().min(1900).max(2100).default(new Date().getFullYear()),
  month: z.number().int().min(1).max(12).nullable().optional(),
  mapPosition: z.number().default(0),
  significance: z.number().int().min(1).max(3).default(1),
  future: z.boolean().default(false),
  location: z.string().nullable().optional(),
  subtype: z.string().max(40).nullable().optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, xp: true, birthYear: true, birthPlace: true },
  });
  const moments = await prisma.moment.findMany({
    where: { userId },
    orderBy: [{ year: "asc" }, { month: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({
    user: {
      name: user?.name ?? "",
      email: user?.email ?? "",
      xp: Number(user?.xp ?? 0),
      birthYear: user?.birthYear ?? null,
      birthPlace: user?.birthPlace ?? "",
    },
    moments,
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createMomentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
  }

  const input = parsed.data;
  const moment = await prisma.moment.create({
    data: {
      userId,
      limbId: input.limbId,
      branchId: input.branchId,
      label: input.label.trim().split(/\s+/).slice(0, 5).join(" "),
      description: input.description ?? null,
      year: input.year,
      month: input.month ?? null,
      mapPosition: input.mapPosition,
      significance: input.significance,
      future: input.future,
      location: input.location ?? null,
      subtype: input.subtype ?? null,
    },
  });
  return NextResponse.json({ moment });
}
