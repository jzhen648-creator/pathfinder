import type { PrismaClient } from "@prisma/client";

export type OnboardingScene = 1 | 2 | 3 | 4 | 5 | 6;

export type OnboardingProgress = {
  scene: OnboardingScene;
  themeId: string | null;
  hubSlug: string | null;
};

type OnboardingProgressUser = {
  onboardingThemeId: string | null;
};

export function isOnboardingScene(value: number): value is OnboardingScene {
  return Number.isInteger(value) && value >= 1 && value <= 6;
}

/** Mobile onboarding progress — scene/hub slug are client-only; server tracks theme id. */
export function getOnboardingProgress(user: OnboardingProgressUser): OnboardingProgress {
  return {
    scene: 1,
    themeId: user.onboardingThemeId,
    hubSlug: null,
  };
}

export async function advanceOnboardingScene(
  prisma: PrismaClient,
  userId: string,
  _scene: OnboardingScene,
  themeId?: string | null,
  _hubSlug?: string | null,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      ...(themeId !== undefined ? { onboardingThemeId: themeId } : {}),
    },
  });
}

export async function completeOnboarding(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      onboardingCompleted: true,
      onboardingThemeId: null,
    },
  });
}
