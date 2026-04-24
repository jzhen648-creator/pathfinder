import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createMarkSchema = z.object({
  limbId: z.string().min(1),
  branchId: z.string().min(1),
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
  future: z.boolean().optional(),
  significance: z.number().int().min(1).max(3).optional(),
  location: z.string().nullable().optional(),
  subtype: z.string().max(40).nullable().optional(),
});

function inferType(input: {
  type?: "milestone" | "setback" | "realisation" | "decision" | "achievement";
  future?: boolean;
  significance?: number;
}): "milestone" | "setback" | "realisation" | "decision" | "achievement" {
  if (input.type) return input.type;
  if (input.future) return "milestone";
  if (Number(input.significance ?? 1) >= 3) return "achievement";
  return "milestone";
}

function inferSentiment(input: {
  sentiment?: "positive" | "neutral" | "negative";
  future?: boolean;
  significance?: number;
}): "positive" | "neutral" | "negative" {
  if (input.sentiment) return input.sentiment;
  if (input.future) return "positive";
  if (Number(input.significance ?? 1) >= 3) return "positive";
  return "neutral";
}

function resolveDate(input: { date?: string; year?: number; month?: number | null }): Date {
  if (input.date) return new Date(input.date);
  const y = Number.isFinite(Number(input.year)) ? Number(input.year) : new Date().getFullYear();
  const m = Number.isFinite(Number(input.month)) ? Number(input.month) : 1;
  return new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00.000Z`);
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true";
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, xp: true, birthYear: true, birthPlace: true },
  });

  const [marks, branches] = await Promise.all([
    prisma.mark.findMany({
      where: { userId, ...(includeArchived ? {} : { archived: false }) },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    prisma.branch.findMany({
      where: { userId },
      select: { id: true, goalValue: true, currentValue: true },
    }),
  ]);
  const branchById = Object.fromEntries(branches.map((b) => [b.id, b]));
  const byBranch = new Map<string, typeof marks>();
  for (const mark of marks) {
    const arr = byBranch.get(mark.branchId) ?? [];
    arr.push(mark);
    byBranch.set(mark.branchId, arr);
  }
  const contextById = new Map<
    string,
    {
      sequenceNumber: number;
      total: number;
      previousMarkId: string | null;
      nextMarkId: string | null;
      daysFromPrevious: number | null;
      progressAtTime: number | null;
    }
  >();
  byBranch.forEach((arr, branchId) => {
    const sorted = [...arr].sort((a, b) => a.date.getTime() - b.date.getTime());
    const total = sorted.length;
    const branch = branchById[branchId];
    sorted.forEach((mark, idx) => {
      const previous = idx > 0 ? sorted[idx - 1] : null;
      const next = idx < total - 1 ? sorted[idx + 1] : null;
      const daysFromPrevious = previous
        ? Math.max(0, Math.round((mark.date.getTime() - previous.date.getTime()) / (1000 * 60 * 60 * 24)))
        : null;
      const progressAtTime =
        branch?.goalValue && branch.goalValue > 0
          ? Math.min(
              100,
              Math.max(
                0,
                ((mark.value ?? branch.currentValue ?? 0) / branch.goalValue) * 100,
              ),
            )
          : null;
      contextById.set(mark.id, {
        sequenceNumber: idx + 1,
        total,
        previousMarkId: previous?.id ?? null,
        nextMarkId: next?.id ?? null,
        daysFromPrevious,
        progressAtTime: progressAtTime === null ? null : Number(progressAtTime.toFixed(2)),
      });
    });
  });

  const marksWithContext = marks.map((mark) => ({
    ...mark,
    ...contextById.get(mark.id),
  }));

  return NextResponse.json({
    user: {
      name: user?.name ?? "",
      email: user?.email ?? "",
      xp: Number(user?.xp ?? 0),
      birthYear: user?.birthYear ?? null,
      birthPlace: user?.birthPlace ?? "",
    },
    marks: marksWithContext,
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createMarkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
  }
  const input = parsed.data;
  const branch = await prisma.branch.findFirst({
    where: { id: input.branchId, userId },
    select: { id: true, limbId: true },
  });
  if (!branch) {
    return NextResponse.json({ error: "branchId must reference an existing branch" }, { status: 400 });
  }
  if (branch.limbId !== input.limbId) {
    return NextResponse.json({ error: "branchId must belong to the same limbId" }, { status: 400 });
  }

  const title = (input.title ?? input.label ?? "").trim().split(/\s+/).slice(0, 7).join(" ");
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const mark = await prisma.mark.create({
    data: {
      userId,
      branchId: input.branchId,
      limbId: input.limbId,
      title,
      description: input.description ?? null,
      date: resolveDate(input),
      type: inferType(input),
      value: input.value ?? null,
      sentiment: inferSentiment(input),
      archived: Boolean(input.archived ?? false),
    },
  });
  return NextResponse.json({ mark });
}
