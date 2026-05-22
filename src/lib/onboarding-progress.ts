import type { PrismaClient } from "@prisma/client";

export type OnboardingScene = 1 | 2 | 3 | 4 | 5 | 6;

export type OnboardingProgress = {
  scene: OnboardingScene;
  themeId: string | null;
  hubId: string | null;
};

type OnboardingProgressUser = {
  onboardingScene: number | null;
  onboardingThemeId: string | null;
  onboardingHubId: string | null;
};

export function isOnboardingScene(value: number): value is OnboardingScene {
  return Number.isInteger(value) && value >= 1 && value <= 6;
}

export function getOnboardingProgress(user: OnboardingProgressUser): OnboardingProgress {
  const rawScene = user.onboardingScene;
  return {
    scene: rawScene != null && isOnboardingScene(rawScene) ? rawScene : 1,
    themeId: user.onboardingThemeId,
    hubId: user.onboardingHubId,
  };
}

export async function advanceOnboardingScene(
  prisma: PrismaClient,
  userId: string,
  scene: OnboardingScene,
  themeId?: string | null,
  hubId?: string | null,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      onboardingScene: scene,
      ...(themeId !== undefined ? { onboardingThemeId: themeId } : {}),
      ...(hubId !== undefined ? { onboardingHubId: hubId } : {}),
    },
  });
}

export async function completeOnboarding(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      onboardingCompleted: true,
      firstRunCompleted: true,
      onboardingScene: null,
      onboardingThemeId: null,
      onboardingHubId: null,
    },
  });
}
