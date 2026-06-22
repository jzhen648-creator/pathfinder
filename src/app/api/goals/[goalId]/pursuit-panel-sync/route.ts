import { NextResponse } from "next/server";
import { z } from "zod";
import { aiRouteErrorResponse } from "@/lib/ai/ai-route-errors";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { hasGeminiKey } from "@/lib/gemini";
import { syncPursuitPanel } from "@/lib/pursuit/generate-pursuit-enrich";

type RouteProps = {
  params: Promise<{ goalId: string }>;
};

const bodySchema = z.object({
  mode: z.enum(["initial", "replenish"]),
  clarifyTitles: z.boolean().optional(),
});

export async function POST(request: Request, { params }: RouteProps) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  if (!hasGeminiKey()) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured." }, { status: 503 });
  }

  const { goalId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
  }

  if (parsed.data.clarifyTitles === false && parsed.data.mode === "replenish") {
    return NextResponse.json({ ok: true, clarifierCount: 0, headline: null });
  }

  try {
    const result = await syncPursuitPanel(auth.userId, goalId, parsed.data.mode, {
      clarifyTitles: parsed.data.clarifyTitles ?? true,
    });
    return NextResponse.json({
      ok: true,
      clarifierCount: result.clarifierCount,
      headline: result.headline ?? null,
    });
  } catch (err) {
    return aiRouteErrorResponse(err, "[POST /api/goals/pursuit-panel-sync]");
  }
}
