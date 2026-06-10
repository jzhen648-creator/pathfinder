import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { formatMapContext } from "@/lib/ai/format-map-context";
import { formatUserContext } from "@/lib/ai/format-user-context";
import {
  buildStreamHubContextInput,
  formatPreviousStreamSessionSummary,
  runStreamExtract,
  runStreamGlobalExtract,
  runStreamThemeExtract,
} from "@/lib/ai/stream-extract";
import { commitAmbiguousItemsToBranch } from "@/lib/stream-commit-ambiguous";
import { isValidHubSlugForTheme, resolveBranchForHub } from "@/lib/resolve-hub-branch";
import { GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";
import { canonicalHubDisplayLabel } from "@/lib/hub-catalog";
import { prisma } from "@/lib/prisma";
import { buildStreamThemeContextInput } from "@/lib/stream-theme-context";
import { LIFE_AREA_IDS } from "@/lib/taxonomy";
import type { LifeAreaId } from "@/lib/types";
import { streamExtractFailureStatus } from "@/lib/stream-extract-errors";
import {
  streamExtractRequestSchema,
  streamGlobalExtractRequestSchema,
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

function resolveThemeForHubSlug(preferredThemeId: LifeAreaId, slug: string): LifeAreaId | null {
  if (isValidHubSlugForTheme(preferredThemeId, slug)) return preferredThemeId;
  for (const candidate of LIFE_AREA_IDS) {
    if (isValidHubSlugForTheme(candidate, slug)) return candidate;
  }
  return null;
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
        const [userContext, mapContext] = await Promise.all([
          formatUserContext(userId),
          formatMapContext(userId),
        ]);
        const result = await runStreamThemeExtract(themeContext, input, {
          userContext,
          mapContext,
          queueKey: userId,
        });
        let committedAmbiguousCount = 0;
        const byBranch = new Map<
          string,
          { limbId: LifeAreaId; items: typeof result.ambiguous }
        >();
        for (const amb of result.ambiguous) {
          if (!amb.hubId) continue;
          const targetThemeId = resolveThemeForHubSlug(themeId as LifeAreaId, amb.hubId);
          if (!targetThemeId) continue;
          const resolved = await resolveBranchForHub(
            prisma,
            userId,
            targetThemeId,
            amb.hubId,
          );
          if (!resolved) continue;
          const entry = byBranch.get(resolved.branchId) ?? { limbId: targetThemeId, items: [] };
          entry.items.push(amb);
          byBranch.set(resolved.branchId, entry);
        }
        for (const [branchId, entry] of byBranch) {
          const { committed } = await commitAmbiguousItemsToBranch(
            userId,
            branchId,
            entry.limbId,
            entry.items,
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
          { status: streamExtractFailureStatus(err) },
        );
      }
    }

    if (!("hubId" in body)) {
      const reqParsed = streamGlobalExtractRequestSchema.safeParse(body);
      if (!reqParsed.success) {
        const issue = reqParsed.error.issues[0];
        return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
      }

      const { input } = reqParsed.data;
      try {
        const [userContext, mapContext] = await Promise.all([
          formatUserContext(userId),
          formatMapContext(userId),
        ]);
        const result = await runStreamGlobalExtract(input, { userContext, mapContext });
        return NextResponse.json({ ...result, committedAmbiguousCount: 0 });
      } catch (err) {
        if (err instanceof GeminiNotConfiguredError) {
          return NextResponse.json({ error: err.message }, { status: 503 });
        }
        const details = getErrorDetails(err);
        console.error("[POST /api/stream/extract global] failed", details, err);
        return NextResponse.json(
          { error: details.message || "Extract unavailable" },
          { status: streamExtractFailureStatus(err) },
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

    const { hubId, input, mapGridQ, mapGridR } = reqParsed.data;

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
        ...(m.date ? { date: m.date.toISOString().slice(0, 10) } : {}),
      })),
      removedPursuits: archivedGoals.map((g) => ({ title: g.title })),
      removedMarks: archivedMarks.map((m) => ({
        title: m.title,
        ...(m.date ? { date: m.date.toISOString().slice(0, 10) } : {}),
      })),
      previousStreamSessionSummary,
    });

    try {
      const [userContext, mapContext] = await Promise.all([
        formatUserContext(userId),
        formatMapContext(userId, { themeId: branch.limbId, hubId: branch.id }),
      ]);
      const placementNote =
        mapGridQ !== undefined && mapGridR !== undefined
          ? `User claimed grid cell q=${mapGridQ}, r=${mapGridR} on theme ${branch.limbId}, track "${hubLabel}".`
          : undefined;
      const result = await runStreamExtract(hubContext, input, {
        userContext,
        mapContext,
        placementNote,
        queueKey: userId,
      });
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
        { status: streamExtractFailureStatus(err) },
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
