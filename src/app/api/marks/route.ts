import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createMarkBodySchema,
  displayMarkTitleFromInput,
  isMarkDateInTheFuture,
  resolveMarkInputDate,
  zodErrorMessage,
} from "@/lib/validation/marks-and-branches";

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

  const includeArchived = url.searchParams.get("includeArchived") === "true";
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, birthYear: true, birthPlace: true },
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = createMarkBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const input = parsed.data;
  const branch = await prisma.branch.findFirst({
    where: { id: input.branchId, userId },
    select: { id: true, limbId: true },
  });
  if (!branch) {
    return NextResponse.json(
      { error: "branchId must belong to the authenticated user and reference a valid branch." },
      { status: 400 },
    );
  }
  if (branch.limbId !== input.limbId) {
    return NextResponse.json(
      { error: "branchId must belong to the same theme (limbId) as the mark." },
      { status: 400 },
    );
  }

  const resolved = resolveMarkInputDate(input);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.message }, { status: 400 });
  }
  if (isMarkDateInTheFuture(resolved.d)) {
    return NextResponse.json({ error: "Date cannot be in the future." }, { status: 400 });
  }

  const title = displayMarkTitleFromInput(input.title, input.label);
  if (!title) {
    return NextResponse.json({ error: "Title is required (1–100 characters)." }, { status: 400 });
  }

  const mark = await prisma.mark.create({
    data: {
      userId,
      branchId: input.branchId,
      limbId: input.limbId,
      title,
      description: input.description ?? null,
      date: resolved.d,
      type: inferType(input),
      value: input.value === undefined ? null : input.value,
      sentiment: inferSentiment(input),
      archived: Boolean(input.archived ?? false),
    },
  });
  return NextResponse.json({ mark });
}
