import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  applySequenceResolution,
  loadCategorySequencedNodes,
  resolveSequenceAnchor,
  type SequenceAnchor,
} from "@/lib/category-sequence";
import {
  displayMarkTitleFromInput,
  isMarkDateInTheFuture,
  resolveMarkInputDate,
  zodErrorMessage,
} from "@/lib/validation/marks-and-categories";

const anchorSchema = z.union([
  z.object({ kind: z.literal("append") }),
  z.object({ kind: z.literal("after"), nodeId: z.string().min(1) }),
  z.object({ kind: z.literal("before"), nodeId: z.string().min(1) }),
  z.object({
    kind: z.literal("between"),
    afterNodeId: z.string().min(1),
    beforeNodeId: z.string().min(1),
  }),
]);

const goalPayloadSchema = z.object({
  kind: z.literal("goal"),
  title: z.string().min(1).max(100),
  description: z.string().max(500).default(""),
  goalType: z.enum(["project", "identity"]).default("project"),
  deadline: z.string().optional(),
  significance: z.coerce.number().int().min(1).max(5).default(3),
});

const momentPayloadSchema = z.object({
  kind: z.literal("moment"),
  title: z.string().min(1).max(100).optional(),
  label: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  date: z.string().optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  month: z.number().int().min(1).max(12).nullable().optional(),
  significance: z.number().int().min(1).max(3).optional(),
  future: z.boolean().optional(),
  markKind: z.enum(["mark", "stream"]).optional(),
});

const insertNodeBodySchema = z
  .object({
    anchor: anchorSchema.optional(),
  })
  .and(z.union([goalPayloadSchema, momentPayloadSchema]));

type RouteProps = { params: Promise<{ categoryId: string }> };

export async function POST(request: Request, { params }: RouteProps) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { categoryId } = await params;

  const category = await prisma.themeCategory.findFirst({
    where: { id: categoryId, userId },
    select: { id: true, themeId: true },
  });
  if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = insertNodeBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const input = parsed.data;
  const anchor: SequenceAnchor = input.anchor ?? { kind: "append" };

  const existingNodes = await loadCategorySequencedNodes(prisma, categoryId);
  const resolution = resolveSequenceAnchor(existingNodes, anchor);
  const sequencePosition = resolution.sequencePosition;

  if (input.kind === "goal") {
    const deadline =
      input.deadline && input.deadline.trim().length > 0 ? new Date(input.deadline.trim()) : null;
    const now = new Date();
    const year = deadline ? deadline.getFullYear() : now.getFullYear();
    const month = deadline ? deadline.getMonth() + 1 : now.getMonth() + 1;
    const future = deadline ? deadline.getTime() > Date.now() : true;

    const goal = await prisma.$transaction(async (tx) => {
      await applySequenceResolution(tx, resolution);
      return tx.goal.create({
        data: {
          userId,
          categoryId,
          themeId: category.themeId,
          title: input.title.trim(),
          description: input.description,
          goalType: input.goalType,
          deadline,
          significance: input.significance,
          status: "ACTIVE",
          aiGenerated: false,
          future,
          year,
          month,
          sequencePosition,
        },
      });
    });
    return NextResponse.json(
      { node: { ...goal, branchNodeKind: "goal" as const } },
      { status: 201 },
    );
  }

  const resolved = resolveMarkInputDate({ date: input.date, year: input.year, month: input.month });
  if (!resolved.ok) return NextResponse.json({ error: resolved.message }, { status: 400 });
  if (resolved.d && isMarkDateInTheFuture(resolved.d)) {
    return NextResponse.json({ error: "Date cannot be in the future." }, { status: 400 });
  }
  const title = displayMarkTitleFromInput(input.title, input.label);
  if (!title) return NextResponse.json({ error: "Title is required (1\u2013100 characters)." }, { status: 400 });

  const mark = await prisma.$transaction(async (tx) => {
    await applySequenceResolution(tx, resolution);
    return tx.mark.create({
      data: {
        userId,
        categoryId,
        themeId: category.themeId,
        title,
        description: input.description ?? null,
        date: resolved.d,
        year: resolved.d?.getUTCFullYear() ?? null,
        month: resolved.d ? resolved.d.getUTCMonth() + 1 : null,
        sentiment: "neutral",
        archived: false,
        significance: input.significance ?? 1,
        future: resolved.d ? Boolean(input.future ?? false) : false,
        sequencePosition,
        kind: input.markKind ?? "mark",
      },
    });
  });
  return NextResponse.json(
    { node: { ...mark, branchNodeKind: "moment" as const } },
    { status: 201 },
  );
}
