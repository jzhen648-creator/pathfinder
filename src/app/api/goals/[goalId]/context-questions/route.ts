import { NextResponse } from "next/server";
import { generateContextQuestions } from "@/lib/ai/context-questions";
import { aiRouteErrorResponse } from "@/lib/ai/ai-route-errors";
import { formatPursuitContext } from "@/lib/ai/format-map-context";
import { formatUserContext } from "@/lib/ai/format-user-context";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { hasGeminiKey } from "@/lib/gemini";

type RouteProps = { params: Promise<{ goalId: string }> };

export async function POST(_request: Request, props: RouteProps) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  if (!hasGeminiKey()) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured." }, { status: 503 });
  }

  const { goalId } = await props.params;

  try {
    const [pursuitContext, userContext] = await Promise.all([
      formatPursuitContext(userId, goalId),
      formatUserContext(userId),
    ]);

    if (!pursuitContext) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const questions = await generateContextQuestions(pursuitContext, userContext, userId);
    return NextResponse.json({ questions });
  } catch (err) {
    return aiRouteErrorResponse(err, "[POST /api/goals/[goalId]/context-questions]");
  }
}
