import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { ensureHubTaxonomyCurrent } from "@/lib/hub-taxonomy-sync";
import {
  advanceOnboardingScene,
  isOnboardingScene,
  type OnboardingScene,
} from "@/lib/onboarding-progress";
import { prisma } from "@/lib/prisma";
import { activateHubForUser } from "@/lib/system-hubs";
import { LIFE_AREA_IDS } from "@/lib/taxonomy";
import type { LifeAreaId } from "@/lib/types";
import { isLifeAreaId, unlockThemesForUser } from "@/lib/unlocked-themes";

const advanceSchema = z.object({
  scene: z.number().int().min(1).max(6),
  themeId: z.enum(LIFE_AREA_IDS).optional(),
  hubId: z.string().min(1).optional(),
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

    await ensureHubTaxonomyCurrent(prisma, userId);

    const selectedHub = parsed.data.hubId
      ? await prisma.branch.findFirst({
          where: { id: parsed.data.hubId, userId, parentBranchId: null, isSystemHub: true },
          select: { id: true, limbId: true },
        })
      : null;
    if (parsed.data.hubId && !selectedHub) {
      return NextResponse.json({ error: "Hub not found" }, { status: 404 });
    }

    const selectedHubThemeId = selectedHub?.limbId;
    if (selectedHubThemeId && !isLifeAreaId(selectedHubThemeId)) {
      return NextResponse.json({ error: "Invalid hub theme" }, { status: 400 });
    }

    const themeId = (parsed.data.themeId ?? selectedHubThemeId) as LifeAreaId | undefined;
    if (themeId) {
      await unlockThemesForUser(prisma, userId, [themeId]);
    }
    if (selectedHub) {
      await activateHubForUser(prisma, userId, selectedHub.id);
    }

    await advanceOnboardingScene(
      prisma,
      userId,
      scene as OnboardingScene,
      themeId,
      parsed.data.hubId,
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
