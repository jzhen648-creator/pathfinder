import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSessionUserId } from "@/lib/api-auth";
import {
  applyClarifierAnswerForUser,
  deleteClarifierAnswerForUser,
} from "@/lib/pursuit/apply-clarifier-answers";

type RouteProps = { params: Promise<{ goalId: string }> };

const bodySchema = z.object({
  clarifierId: z.string().min(1),
  prompt: z.string().min(1),
  selectedOption: z.string().min(1),
  options: z.array(z.string().min(1).max(80)).min(2).max(4).optional(),
});

const deleteSchema = z.object({
  clarifierId: z.string().min(1),
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
    const result = await applyClarifierAnswerForUser(auth.userId, goalId, parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save answer";
    const status = message === "Not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
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

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
  }

  try {
    const result = await deleteClarifierAnswerForUser(auth.userId, goalId, parsed.data.clarifierId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not delete answer";
    const status = message === "Not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
