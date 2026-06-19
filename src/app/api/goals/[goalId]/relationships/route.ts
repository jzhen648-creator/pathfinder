import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSessionUserId } from "@/lib/api-auth";
import {
  createPursuitRelationshipForUser,
  deletePursuitRelationshipForUser,
} from "@/lib/pursuit/apply-pursuit-relationship";

type RouteProps = { params: Promise<{ goalId: string }> };

const postSchema = z.object({
  peerGoalId: z.string().min(1),
  label: z.string().trim().max(80).optional().nullable(),
});

const deleteSchema = z.object({
  peerGoalId: z.string().min(1),
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

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
  }

  try {
    const result = await createPursuitRelationshipForUser(auth.userId, goalId, parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save connection";
    const status =
      message === "Source pursuit not found" || message === "Target pursuit not found" ? 404 : 400;
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
    const result = await deletePursuitRelationshipForUser(
      auth.userId,
      goalId,
      parsed.data.peerGoalId,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not remove connection";
    const status =
      message === "Source pursuit not found" || message === "Target pursuit not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
