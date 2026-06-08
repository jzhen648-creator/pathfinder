import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createMarkBodySchema,
  displayMarkTitleFromInput,
  isMarkDateInTheFuture,
  resolveMarkInputDate,
  zodErrorMessage,
} from "@/lib/validation/marks-and-branches";
import {
  applySequenceResolution,
  loadBranchSequencedNodes,
  resolveSequenceAnchor,
} from "@/lib/branch-sequence";
import { activateHubForUser } from "@/lib/system-hubs";

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
  try {
    const auth = await requireApiSessionUserId();
    if (!auth.ok) return auth.response;
    const userId = auth.userId;

    const url = new URL(request.url);
    const includeArchived = url.searchParams.get("includeArchived") === "true";
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, birthYear: true, birthPlace: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Session expired. Sign in again." }, { status: 401 });
    }

    const [marks, branches] = await Promise.all([
      prisma.mark.findMany({
        where: { userId, ...(includeArchived ? {} : { archived: false }) },
        orderBy: [{ sequencePosition: "asc" }, { date: "asc" }, { createdAt: "asc" }],
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
      const sorted = [...arr].sort((a, b) => {
        const ta = a.date?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const tb = b.date?.getTime() ?? Number.MAX_SAFE_INTEGER;
        if (ta !== tb) return ta - tb;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
      const total = sorted.length;
      const branch = branchById[branchId];
      sorted.forEach((mark, idx) => {
        const previous = idx > 0 ? sorted[idx - 1] : null;
        const next = idx < total - 1 ? sorted[idx + 1] : null;
        const daysFromPrevious =
          previous?.date && mark.date
            ? Math.max(
                0,
                Math.round(
                  (mark.date.getTime() - previous.date.getTime()) / (1000 * 60 * 60 * 24),
                ),
              )
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
        name: user.name ?? "",
        email: user.email ?? "",
        birthYear: user.birthYear ?? null,
        birthPlace: user.birthPlace ?? "",
      },
      marks: marksWithContext,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load marks";
    console.error("[GET /api/marks]", err);
    return NextResponse.json({ error: message, marks: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

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
    select: { id: true, limbId: true, isActive: true },
  });
  if (!branch) {
    return NextResponse.json(
      { error: "branchId must belong to the authenticated user and reference a valid branch." },
      { status: 400 },
    );
  }
  if (!branch.isActive) {
    await activateHubForUser(prisma, userId, branch.id);
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
  const markIsFuture = resolved.d ? isMarkDateInTheFuture(resolved.d) : false;

  const title = displayMarkTitleFromInput(input.title, input.label);
  if (!title) {
    return NextResponse.json({ error: "Title is required (1–100 characters)." }, { status: 400 });
  }

  /** Resolve branch-line sequence position. Same transactional reindex pattern as POST /api/goals. */
  const anchor = input.anchor ?? { kind: "append" as const };
  const existingNodes = await loadBranchSequencedNodes(prisma, input.branchId);
  const resolution = resolveSequenceAnchor(existingNodes, anchor);
  const sequencePosition = resolution.sequencePosition;

  const mark = await prisma.$transaction(async (tx) => {
    await applySequenceResolution(tx, resolution);
    return tx.mark.create({
      data: {
        userId,
        branchId: input.branchId,
        limbId: input.limbId,
        title,
        description: input.description ?? null,
        date: resolved.d,
        value: input.value === undefined ? null : input.value,
        sentiment: input.sentiment ?? inferSentiment(input),
        archived: Boolean(input.archived ?? false),
        future: markIsFuture,
        year: resolved.d?.getUTCFullYear() ?? null,
        month: resolved.d ? resolved.d.getUTCMonth() + 1 : null,
        sequencePosition,
        kind: input.kind ?? "mark",
      },
    });
  });
  return NextResponse.json({ mark });
}
