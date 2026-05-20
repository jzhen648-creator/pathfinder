import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  buildStreamHubContextInput,
  formatPreviousStreamSessionSummary,
  runStreamExtract,
  runStreamThemeExtract,
} from "@/lib/ai/stream-extract";
import { commitAmbiguousItemsToBranch } from "@/lib/stream-commit-ambiguous";
import { resolveBranchForHub } from "@/lib/resolve-hub-branch";
import { GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";
import { canonicalHubDisplayLabel } from "@/lib/hub-catalog";
import { prisma } from "@/lib/prisma";
import { buildStreamThemeContextInput } from "@/lib/stream-theme-context";
import { LIFE_AREA_IDS } from "@/lib/taxonomy";
import type { LifeAreaId } from "@/lib/types";
import {
  streamExtractRequestSchema,
  streamHubExtractRequestSchema,
  streamThemeExtractRequestSchema,
} from "@/types/stream";

function getErrorDetails(err: unknown) {
  if (err instanceof Error) {
    const e = err as Error & { status?: number; requestID?: string };
    return { message: e.message, status: e.status ?? null, requestId: e.requestID ?? null };
  }
  return { message: String(err), status: null, requestId: null };
}

function isThemeExtractBody(body: unknown): body is { themeId: string } {
  return (
    typeof body === "object" &&
    body !== null &&
    "themeId" in body &&
    typeof (body as { themeId: unknown }).themeId === "string" &&
    !("hubId" in body)
  );
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasGeminiKey()) {
      return NextResponse.json({ error: "GEMINI_API_KEY not configured." }, { status: 503 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON body required" }, { status: 400 });
    }

    if (body === null || typeof body !== "object") {
      return NextResponse.json({ error: "JSON body must be an object" }, { status: 400 });
    }

    const userId = session.user.id;

    if (isThemeExtractBody(body)) {
      const reqParsed = streamThemeExtractRequestSchema.safeParse(body);
      if (!reqParsed.success) {
        const issue = reqParsed.error.issues[0];
        return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
      }

      const { themeId, input } = reqParsed.data;
      if (!LIFE_AREA_IDS.includes(themeId as LifeAreaId)) {
        return NextResponse.json({ error: "Unknown theme" }, { status: 400 });
      }

      let themeContext;
      try {
        themeContext = await buildStreamThemeContextInput(
          prisma,
          userId,
          themeId as LifeAreaId,
          input,
        );
      } catch (err) {
        console.error("[POST /api/stream/extract theme] context failed", err);
        const details = getErrorDetails(err);
        return NextResponse.json(
          {
            error:
              details.message.includes("StreamSession") || details.message.includes("no such table")
                ? "Stream session storage is not migrated. Run: npx prisma migrate deploy"
                : details.message || "Could not load theme context",
          },
          { status: 500 },
        );
      }

      if (!themeContext) {
        return NextResponse.json({ error: "Theme hubs not found" }, { status: 404 });
      }

      try {
        const result = await runStreamThemeExtract(themeContext, input);
        let committedAmbiguousCount = 0;
        const byBranch = new Map<string, typeof result.ambiguous>();
        for (const amb of result.ambiguous) {
          if (!amb.hubId) continue;
          const resolved = await resolveBranchForHub(
            prisma,
            userId,
            themeId as LifeAreaId,
            amb.hubId,
          );
          if (!resolved) continue;
          const list = byBranch.get(resolved.branchId) ?? [];
          list.push(amb);
          byBranch.set(resolved.branchId, list);
        }
        for (const [branchId, items] of byBranch) {
          const { committed } = await commitAmbiguousItemsToBranch(
            userId,
            branchId,
            themeId as LifeAreaId,
            items,
          );
          committedAmbiguousCount += committed;
        }
        return NextResponse.json({ ...result, committedAmbiguousCount });
      } catch (err) {
        if (err instanceof GeminiNotConfiguredError) {
          return NextResponse.json({ error: err.message }, { status: 503 });
        }
        const details = getErrorDetails(err);
        console.error("[POST /api/stream/extract theme] failed", details, err);
        return NextResponse.json(
          { error: details.message || "Extract unavailable" },
          { status: 502 },
        );
      }
    }

    const reqParsed = streamHubExtractRequestSchema.safeParse(body);
    if (!reqParsed.success) {
      const unionParsed = streamExtractRequestSchema.safeParse(body);
      const issue = unionParsed.success ? null : unionParsed.error.issues[0];
      return NextResponse.json(
        { error: issue?.message ?? reqParsed.error.issues[0]?.message ?? "Invalid payload" },
        { status: 400 },
      );
    }

    const { hubId, input } = reqParsed.data;

    const branch = await prisma.branch.findFirst({
      where: { id: hubId, userId },
      select: { id: true, limbId: true, label: true },
    });
    if (!branch) {
      return NextResponse.json({ error: "Hub not found" }, { status: 404 });
    }

    const hubLabel = canonicalHubDisplayLabel(branch.limbId, branch.label ?? branch.id);

    const [goals, archivedGoals, marks, archivedMarks, recentStreamMarks] = await Promise.all([
      prisma.goal.findMany({
        where: {
          userId,
          branchId: branch.id,
          archived: false,
          goalType: { notIn: ["moment", "event"] },
        },
        select: {
          id: true,
          title: true,
          goalType: true,
          bloomStatus: true,
          parentGoalId: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.goal.findMany({
        where: {
          userId,
          branchId: branch.id,
          archived: true,
          goalType: { notIn: ["moment", "event"] },
        },
        select: { title: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.mark.findMany({
        where: { userId, branchId: branch.id, archived: false },
        select: { title: true, date: true },
        orderBy: { date: "asc" },
      }),
      prisma.mark.findMany({
        where: { userId, branchId: branch.id, archived: true },
        select: { title: true, date: true },
        orderBy: { date: "desc" },
      }),
      prisma.mark.findMany({
        where: { userId, branchId: branch.id, archived: false, kind: "stream" },
        select: { title: true },
        orderBy: { createdAt: "desc" },
        take: 3,
      }),
    ]);

    const previousStreamSessionSummary = formatPreviousStreamSessionSummary(
      [...recentStreamMarks].reverse().map((m) => m.title),
    );

    const hubContext = buildStreamHubContextInput({
      branchId: branch.id,
      limbId: branch.limbId,
      hubLabel,
      existingPursuits: goals.map((g) => ({
        goalId: g.id,
        title: g.title,
        goalType: g.goalType,
        bloomStatus: g.bloomStatus,
        parentGoalId: g.parentGoalId ?? null,
      })),
      existingMarks: marks.map((m) => ({
        title: m.title,
        date: m.date.toISOString().slice(0, 10),
      })),
      removedPursuits: archivedGoals.map((g) => ({ title: g.title })),
      removedMarks: archivedMarks.map((m) => ({
        title: m.title,
        date: m.date.toISOString().slice(0, 10),
      })),
      previousStreamSessionSummary,
    });

    try {
      const result = await runStreamExtract(hubContext, input);
      let committedAmbiguousCount = 0;
      if (result.ambiguous.length > 0) {
        const { committed } = await commitAmbiguousItemsToBranch(
          userId,
          branch.id,
          branch.limbId,
          result.ambiguous,
        );
        committedAmbiguousCount = committed;
      }
      return NextResponse.json({ ...result, committedAmbiguousCount });
    } catch (err) {
      if (err instanceof GeminiNotConfiguredError) {
        return NextResponse.json({ error: err.message }, { status: 503 });
      }
      const details = getErrorDetails(err);
      console.error("[POST /api/stream/extract hub] failed", details, err);
      return NextResponse.json(
        { error: details.message || "Extract unavailable" },
        { status: 502 },
      );
    }
  } catch (err) {
    console.error("[POST /api/stream/extract] unhandled", err);
    const details = getErrorDetails(err);
    return NextResponse.json(
      { error: details.message || "Extract failed" },
      { status: 500 },
    );
  }
}
