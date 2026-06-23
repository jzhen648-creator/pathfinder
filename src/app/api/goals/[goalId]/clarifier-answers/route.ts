import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSessionUserId } from "@/lib/api-auth";
import {
  applyClarifierAnswerForUser,
  deleteClarifierAnswerForUser,
} from "@/lib/pursuit/apply-clarifier-answers";
import { enrichAnswerSchema } from "@/lib/pursuit/pursuit-enrich-types";

type RouteProps = {
  params: Promise<{ goalId: string }>;
};

const deleteBodySchema = z.object({
  clarifierId: z.string().min(1),
});

function routeError(err: unknown): NextResponse {
  const message = err instanceof Error ? err.message : "Request failed";
  if (message === "Not found") {
    return NextResponse.json({ error: message }, { status: 404 });
  }
  return NextResponse.json({ error: message }, { status: 400 });
}

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

  const parsed = enrichAnswerSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
  }

  try {
    const result = await applyClarifierAnswerForUser(auth.userId, goalId, parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return routeError(err);
  }
}

export async function DELETE(request: Request, { params }: RouteProps) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  const { goalId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const parsed = deleteBodySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
  }

  try {
    const result = await deleteClarifierAnswerForUser(
      auth.userId,
      goalId,
      parsed.data.clarifierId,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return routeError(err);
  }
}
