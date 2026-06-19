import { NextResponse } from "next/server";
import { z } from "zod";
import { aiRouteErrorResponse } from "@/lib/ai/ai-route-errors";
import { formatUserContext } from "@/lib/ai/format-user-context";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { getLifeArea } from "@/lib/life-areas";
import { hasGeminiKey } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";
import { suggestCreateClarifier } from "@/lib/pursuit/generate-create-clarifier";

const milestoneStubSchema = z.object({
  title: z.string().trim().min(1),
  completed: z.boolean().optional(),
});

const requestSchema = z.object({
  title: z.string().trim().min(3, "title must be at least 3 characters"),
  categoryId: z.string().trim().min(1, "categoryId is required"),
  deadline: z.string().trim().optional(),
  clarifyTitles: z.boolean().optional(),
  milestones: z.array(milestoneStubSchema).optional(),
});

export async function POST(request: Request) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  if (!hasGeminiKey()) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const reqParsed = requestSchema.safeParse(body);
  if (!reqParsed.success) {
    const issue = reqParsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
  }

  if (reqParsed.data.clarifyTitles === false) {
    return NextResponse.json({ clarifier: null });
  }

  const userId = auth.userId;
  const category = await prisma.themeCategory.findFirst({
    where: { id: reqParsed.data.categoryId, userId },
    select: { id: true, themeId: true, label: true, name: true },
  });
  if (!category) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  const themeLabel = getLifeArea(category.themeId)?.label ?? category.themeId;
  const categoryLabel = category.label ?? category.name ?? "Category";

  try {
    const userContext = await formatUserContext(userId);
    const clarifier = await suggestCreateClarifier({
      title: reqParsed.data.title,
      themeLabel,
      categoryLabel,
      deadline: reqParsed.data.deadline ?? null,
      milestones: reqParsed.data.milestones?.map((m) => ({
        title: m.title,
        completed: m.completed === true,
      })),
      userContext,
      queueKey: userId,
    });

    return NextResponse.json({ clarifier });
  } catch (err) {
    return aiRouteErrorResponse(err, "[POST /api/goals/suggest-clarifier]");
  }
}
