import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dedupeDuplicateRootHubs } from "@/lib/hub-dedupe";
import { ensureHubTaxonomyCurrent } from "@/lib/hub-taxonomy-sync";
import { TAXONOMY_VERSION } from "@/lib/taxonomy";
import { withCategoryIdMirrors } from "@/lib/category-id";
import { mergeUnlockedLimbIds, parseUnlockedLimbIds } from "@/lib/unlocked-themes";

/** Root hub rows + goals for tree/roadmap. Read-only; taxonomy sync on register, onboarding, activate, or backfill. */
const createBranchSchema = z
  .object({
    limbId: z.string().min(1),
    label: z.string().nullable().optional(),
    mapAngleOffset: z.number().default(0),
  })
  .strict();

export async function GET() {
  try {
    const auth = await requireApiSessionUserId();
    if (!auth.ok) return auth.response;
    const userId = auth.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, unlockedLimbIds: true, hubTaxonomyVersion: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Session expired. Sign in again." }, { status: 401 });
    }

    if (user.hubTaxonomyVersion !== TAXONOMY_VERSION) {
      try {
        await ensureHubTaxonomyCurrent(prisma, userId);
      } catch (err) {
        console.error("[GET /api/branches] hub taxonomy sync failed", err);
      }
    } else {
      try {
        await dedupeDuplicateRootHubs(prisma, userId);
      } catch (err) {
        console.error("[GET /api/branches] hub dedupe failed", err);
      }
    }

    const branches = await prisma.branch.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    const goalInclude = {
      milestones: {
        orderBy: { position: "asc" as const },
        include: {
          subtasks: {
            orderBy: { position: "asc" as const },
            select: { id: true, isCompleted: true, position: true, title: true },
          },
        },
      },
      forkedGoals: { select: { id: true } },
    };
    const [goals, archivedGoals, marks] = await Promise.all([
      prisma.goal.findMany({
        where: { userId, archived: false },
        orderBy: { createdAt: "asc" },
        include: goalInclude,
      }),
      prisma.goal.findMany({
        where: { userId, archived: true },
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, branchId: true, updatedAt: true },
      }),
      prisma.mark.findMany({
        where: { userId, archived: false },
        orderBy: [{ sequencePosition: "asc" }, { date: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          title: true,
          description: true,
          branchId: true,
          limbId: true,
          date: true,
          year: true,
          month: true,
          sequencePosition: true,
          kind: true,
          future: true,
          isTurningPoint: true,
          needsResolution: true,
          sentiment: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);
    const unlockedLimbIds = mergeUnlockedLimbIds(parseUnlockedLimbIds(user.unlockedLimbIds), branches);
    return NextResponse.json({
      branches,
      /** Phase 2 alias — same rows as `branches` (taxonomy categories). */
      categories: branches,
      goals: withCategoryIdMirrors(goals),
      archivedGoals: withCategoryIdMirrors(archivedGoals),
      marks: withCategoryIdMirrors(marks),
      unlockedLimbIds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load branches";
    console.error("[GET /api/branches]", err);
    return NextResponse.json(
      { error: message, branches: [], categories: [], goals: [] },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createBranchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
  }

  const input = parsed.data;
  const branch = await prisma.branch.create({
    data: {
      userId,
      limbId: input.limbId,
      label: input.label ?? null,
      parentBranchId: null,
      turningPointId: null,
      mapAngleOffset: input.mapAngleOffset,
    },
  });
  return NextResponse.json({ branch });
}
