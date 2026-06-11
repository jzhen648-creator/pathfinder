import { NextResponse } from "next/server";
import { z } from "zod";
import { formatPursuitContext } from "@/lib/ai/format-map-context";
import { runStreamEnrich } from "@/lib/ai/stream-enrich";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { getLifeArea } from "@/lib/life-areas";
import { GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";
import { isSparseContextItem } from "@/lib/sparse-context";

const enrichRequestSchema = z.object({
  itemType: z.enum(["mark", "pursuit"]),
  itemId: z.string().min(1),
  additionalContext: z.string().min(1).max(2000),
});

export async function POST(request: Request) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  if (!hasGeminiKey()) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const parsed = enrichRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const { itemType, itemId, additionalContext } = parsed.data;

  try {
    if (itemType === "mark") {
      const mark = await prisma.mark.findFirst({
        where: { id: itemId, userId, archived: false },
        include: { themeCategory: { select: { label: true, name: true, themeId: true } } },
      });
      if (!mark) return NextResponse.json({ error: "Mark not found" }, { status: 404 });
      if (!isSparseContextItem(mark.title, mark.description)) {
        return NextResponse.json({ error: "Mark already has enough context" }, { status: 400 });
      }

      const hubLabel = (mark.themeCategory?.label ?? mark.themeCategory?.name ?? "").trim() || "Hub";
      const themeLabel = getLifeArea(mark.themeId ?? mark.themeCategory?.themeId ?? "")?.label ?? "Life";
      const { title, description } = await runStreamEnrich({
        itemType: "mark",
        currentTitle: mark.title,
        hubLabel,
        themeLabel,
        additionalContext,
        queueKey: userId,
      });

      const updated = await prisma.mark.update({
        where: { id: mark.id },
        data: { title, description },
      });

      return NextResponse.json({
        itemType: "mark",
        id: updated.id,
        title: updated.title,
        description: updated.description,
      });
    }

    const goal = await prisma.goal.findFirst({
      where: { id: itemId, userId, archived: false },
      include: { themeCategory: { select: { label: true, name: true, themeId: true } } },
    });
    if (!goal) return NextResponse.json({ error: "Pursuit not found" }, { status: 404 });
    if (goal.goalType === "moment" || goal.goalType === "event") {
      return NextResponse.json({ error: "Not a pursuit" }, { status: 400 });
    }
    if (!isSparseContextItem(goal.title, goal.description)) {
      return NextResponse.json({ error: "Pursuit already has enough context" }, { status: 400 });
    }

    const hubLabel =
      (goal.themeCategory?.label ?? goal.themeCategory?.name ?? "").trim() || goal.lifeArea || "Hub";
    const themeLabel =
      getLifeArea(goal.themeId ?? goal.themeCategory?.themeId ?? goal.lifeArea)?.label ?? "Life";
    const pursuitCtx = await formatPursuitContext(userId, goal.id);
    const { title, description } = await runStreamEnrich({
      itemType: "pursuit",
      currentTitle: goal.title,
      hubLabel,
      themeLabel,
      additionalContext,
      pursuitContextJson: pursuitCtx ? JSON.stringify(pursuitCtx, null, 2) : null,
      queueKey: userId,
    });

    const updated = await prisma.goal.update({
      where: { id: goal.id },
      data: { title, description },
    });

    return NextResponse.json({
      itemType: "pursuit",
      id: updated.id,
      title: updated.title,
      description: updated.description,
    });
  } catch (err) {
    if (err instanceof GeminiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Enrich failed";
    console.error("[POST /api/stream/enrich]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
