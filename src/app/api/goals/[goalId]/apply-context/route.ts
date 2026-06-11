import { NextResponse } from "next/server";
import { z } from "zod";
import { applyPursuitContextNote } from "@/lib/ai/apply-pursuit-context";
import { formatPursuitContext } from "@/lib/ai/format-map-context";
import { formatUserContext } from "@/lib/ai/format-user-context";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";

type RouteProps = { params: Promise<{ goalId: string }> };

const requestSchema = z.object({
  text: z.string().trim().min(1).max(4000),
});

export async function POST(request: Request, props: RouteProps) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  if (!hasGeminiKey()) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured." }, { status: 503 });
  }

  const { goalId } = await props.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 },
    );
  }

  const goal = await prisma.goal.findFirst({
    where: { id: goalId, userId, archived: false },
    select: { id: true, description: true, limbId: true, goalType: true },
  });

  if (!goal || goal.goalType === "moment" || goal.goalType === "event") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const [pursuitContext, userContext] = await Promise.all([
      formatPursuitContext(userId, goalId),
      formatUserContext(userId),
    ]);

    if (!pursuitContext) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const description = await applyPursuitContextNote({
      pursuitContext,
      userContext,
      note: parsed.data.text,
      existingDescription: goal.description,
      goalId: goal.id,
      themeId: goal.limbId ?? pursuitContext.pursuit.themeId,
    });

    return NextResponse.json({ description });
  } catch (err) {
    if (err instanceof GeminiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Apply context failed";
    console.error("[POST /api/goals/[goalId]/apply-context]", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
