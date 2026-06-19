import { NextResponse } from "next/server";

import { getServerSession } from "next-auth";

import { z } from "zod";

import { requireApiSessionUserId } from "@/lib/api-auth";

import { authOptions } from "@/lib/auth";

import { prisma } from "@/lib/prisma";

import { dedupeDuplicateRootCategories } from "@/lib/category-dedupe";

import { ensureTaxonomyCurrent } from "@/lib/taxonomy-sync";

import { TAXONOMY_VERSION } from "@/lib/taxonomy";


import { mergeUnlockedLimbIds, parseUnlockedLimbIds } from "@/lib/unlocked-themes";



/** Root taxonomy category rows + pursuits/marks for map. Taxonomy sync on register, onboarding, activate, or backfill. */

const createCategorySchema = z

  .object({

    limbId: z.string().min(1),

    label: z.string().nullable().optional(),

    mapAngleOffset: z.number().default(0),

  })

  .strict();



export async function GET(request: Request) {

  try {

    const auth = await requireApiSessionUserId();

    if (!auth.ok) return auth.response;

    const userId = auth.userId;



    const user = await prisma.user.findUnique({

      where: { id: userId },

      select: { id: true, unlockedLimbIds: true, taxonomyVersion: true },

    });

    if (!user) {

      return NextResponse.json({ error: "Session expired. Sign in again." }, { status: 401 });

    }



    if (user.taxonomyVersion !== TAXONOMY_VERSION) {

      try {

        await ensureTaxonomyCurrent(prisma, userId);

      } catch (err) {

        console.error("[GET /api/map-data] taxonomy sync failed", err);

      }

    } else {

      try {

        await dedupeDuplicateRootCategories(prisma, userId);

      } catch (err) {

        console.error("[GET /api/map-data] category dedupe failed", err);

      }

    }



    const categories = await prisma.themeCategory.findMany({

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

    const [goals, archivedGoals, marks, relationships] = await Promise.all([

      prisma.goal.findMany({

        where: {

          userId,

          archived: false,

        },

        orderBy: { createdAt: "asc" },

        include: goalInclude,

      }),

      prisma.goal.findMany({

        where: {
          userId,
          archived: true,
        },

        orderBy: { updatedAt: "desc" },

        select: { id: true, title: true, categoryId: true, updatedAt: true, status: true },

      }),

      prisma.mark.findMany({

        where: { userId, archived: false },

        orderBy: [{ sequencePosition: "asc" }, { date: "asc" }, { createdAt: "asc" }],

        select: {

          id: true,

          title: true,

          description: true,

          categoryId: true,

          themeId: true,

          date: true,

          year: true,

          month: true,

          sequencePosition: true,

          kind: true,

          future: true,

          isTurningPoint: true,

          needsResolution: true,

          sentiment: true,

          significance: true,

          createdAt: true,

          updatedAt: true,

        },

      }),

      prisma.pursuitRelationship.findMany({
        where: { userId },
        select: {
          id: true,
          goalAId: true,
          goalBId: true,
          kind: true,
          confirmedAt: true,
        },
      }),

    ]);

    const unlockedLimbIds = mergeUnlockedLimbIds(parseUnlockedLimbIds(user.unlockedLimbIds), categories);
    const mapCategories = categories.map((c) => ({ ...c, categoryId: c.id }));

    const pendingRuns = await prisma.streamRun.findMany({
      where: {
        userId,
        status: "pending",
        expiresAt: { gt: new Date() },
      },
      select: { goalId: true },
      distinct: ["goalId"],
    });
    const pendingCaptureGoalIds = pendingRuns.map((row) => row.goalId);

    return NextResponse.json({
      categories: mapCategories,
      goals,
      archivedGoals,
      marks,
      relationships,
      unlockedLimbIds,
      pendingCaptureGoalIds,
    });

  } catch (err) {

    const message = err instanceof Error ? err.message : "Failed to load map data";

    console.error("[GET /api/map-data]", err);

    return NextResponse.json(

      { error: message, categories: [], goals: [] },

      { status: 500 },

    );

  }

}



export async function POST(request: Request) {

  const session = await getServerSession(authOptions);

  const userId = session?.user?.id;

  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });



  const body = await request.json();

  const parsed = createCategorySchema.safeParse(body);

  if (!parsed.success) {

    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });

  }



  const input = parsed.data;

  const category = await prisma.themeCategory.create({

    data: {

      userId,

      themeId: input.limbId,

      label: input.label ?? null,

      parentCategoryId: null,

      turningPointId: null,

      mapAngleOffset: input.mapAngleOffset,

    },

  });

  return NextResponse.json({ category, branch: category });

}


