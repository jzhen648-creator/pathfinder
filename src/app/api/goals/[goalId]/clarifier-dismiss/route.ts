import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { dismissClarifierForUser } from "@/lib/pursuit/apply-clarifier-answers";

type RouteProps = {
  params: Promise<{ goalId: string }>;
};

const bodySchema = z.object({
  clarifierId: z.string().min(1),
  clarifyTitles: z.boolean().optional(),
});

export async function POST(request: Request, { params }: RouteProps) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

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

  try {
    const result = await dismissClarifierForUser(
      auth.userId,
      goalId,
      parsed.data.clarifierId,
      { clarifyTitles: parsed.data.clarifyTitles },
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    if (message === "Not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
