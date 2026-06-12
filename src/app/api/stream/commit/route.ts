import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { hasStreamHubScopeInBody, normalizeStreamCommitBody } from "@/lib/category-id";
import { commitStreamGlobal, commitStreamToCategory, commitStreamToTheme } from "@/lib/stream-commit";
import {
  streamCommitPayloadSchema,
  streamGlobalCommitPayloadSchema,
  streamThemeCommitPayloadSchema,
} from "@/types/stream";

function isThemeCommitBody(body: unknown): body is { themeId: string } {
  return (
    typeof body === "object" &&
    body !== null &&
    "themeId" in body &&
    typeof (body as { themeId: unknown }).themeId === "string" &&
    !hasStreamHubScopeInBody(body)
  );
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const normalizedBody = normalizeStreamCommitBody(body);

  if (isThemeCommitBody(normalizedBody)) {
    const parsed = streamThemeCommitPayloadSchema.safeParse(normalizedBody);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
    }

    const result = await commitStreamToTheme(session.user.id, parsed.data);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      ok: true,
      themeId: result.themeId,
      branchIds: result.branchIds,
      createdMarks: result.createdMarks,
      createdPursuits: result.createdPursuits,
      bloomedPursuits: result.bloomedPursuits,
      createdMilestones: result.createdMilestones,
    });
  }

  if (!hasStreamHubScopeInBody(normalizedBody)) {
    const parsed = streamGlobalCommitPayloadSchema.safeParse(normalizedBody);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
    }

    const result = await commitStreamGlobal(session.user.id, parsed.data);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result);
  }

  const parsed = streamCommitPayloadSchema.safeParse(normalizedBody);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
  }

  const result = await commitStreamToCategory(session.user.id, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    branchId: result.branchId,
    createdMarks: result.createdMarks,
    createdPursuits: result.createdPursuits,
    bloomedPursuits: result.bloomedPursuits,
    createdMilestones: result.createdMilestones,
  });
}
