import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { ensureTaxonomyCurrent } from "@/lib/taxonomy-sync";
import {
  advanceOnboardingScene,
  isOnboardingScene,
  type OnboardingScene,
} from "@/lib/onboarding-progress";
import { prisma } from "@/lib/prisma";
import { activateHubForUser } from "@/lib/system-categories";
import { LIFE_AREA_IDS, normalizeCategoryLabelKey } from "@/lib/taxonomy";
import type { LifeAreaId } from "@/lib/types";
import { isLifeAreaId, unlockThemesForUser } from "@/lib/unlocked-themes";

const advanceSchema = z.object({
  scene: z.number().int().min(1).max(6),
  themeId: z.enum(LIFE_AREA_IDS).nullable().optional(),
  hubSlug: z.string().min(1).nullable().optional(),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = advanceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid onboarding payload" },
        { status: 400 },
      );
    }

    const scene = parsed.data.scene;
    if (!isOnboardingScene(scene)) {
      return NextResponse.json({ error: "Invalid onboarding scene" }, { status: 400 });
    }

    await ensureTaxonomyCurrent(prisma, userId);

    const hubSlugKey = parsed.data.hubSlug
      ? normalizeCategoryLabelKey(parsed.data.hubSlug)
      : null;

    const themeRoots =
      parsed.data.themeId || hubSlugKey
        ? await prisma.themeCategory.findMany({
            where: {
              userId,
              parentCategoryId: null,
              isSystemCategory: true,
              ...(parsed.data.themeId ? { themeId: parsed.data.themeId } : {}),
            },
            select: { id: true, themeId: true, label: true, name: true },
          })
        : [];

    const selectedHub = hubSlugKey
      ? themeRoots.find(
          (hub) => normalizeCategoryLabelKey(hub.label ?? hub.name ?? "") === hubSlugKey,
        )
      : null;

    if (parsed.data.hubSlug && !selectedHub) {
      return NextResponse.json({ error: "Hub not found." }, { status: 404 });
    }

    const selectedHubThemeId = selectedHub?.themeId;
    if (selectedHubThemeId && !isLifeAreaId(selectedHubThemeId)) {
      return NextResponse.json({ error: "Invalid hub theme" }, { status: 400 });
    }

    const themeId =
      parsed.data.themeId === null
        ? undefined
        : ((parsed.data.themeId ?? selectedHubThemeId) as LifeAreaId | undefined);
    if (themeId) {
      await unlockThemesForUser(prisma, userId, [themeId]);
    }
    if (selectedHub) {
      await activateHubForUser(prisma, userId, selectedHub.id);
    }

    const themeIdToSave =
      parsed.data.themeId !== undefined
        ? parsed.data.themeId
        : themeId !== undefined
          ? themeId
          : undefined;
    const hubSlugToSave =
      parsed.data.hubSlug === null
        ? null
        : parsed.data.hubSlug !== undefined
          ? hubSlugKey
          : undefined;

    await advanceOnboardingScene(
      prisma,
      userId,
      scene as OnboardingScene,
      themeIdToSave,
      hubSlugToSave,
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[onboarding/advance]", error);
    const message =
      process.env.NODE_ENV === "development" && error instanceof Error
        ? error.message
        : "Failed to save onboarding progress";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
