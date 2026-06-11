import { ensureTaxonomyCurrent } from "@/lib/taxonomy-sync";
import { getOnboardingProgress } from "@/lib/onboarding-progress";
import { prisma } from "@/lib/prisma";
import { normalizeHubLabelKey } from "@/lib/taxonomy";
import { mapToTreeData } from "@/components/tree/tree-data";
import type { RawBranch, RawTreeGoalPayload } from "@/components/tree/tree-data";
import { mergeUnlockedLimbIds, parseUnlockedLimbIds } from "@/lib/unlocked-themes";
import type { LifeAreaId } from "@/lib/types";
import type { OnboardingProgress } from "@/lib/onboarding-progress";
import type { AreaData } from "@/components/tree/tree-types";
import type { OnboardingHubOption } from "@/components/onboarding/onboarding-scene-router";

export type OnboardingTreePayload = {
  initialProgress: OnboardingProgress;
  hubs: OnboardingHubOption[];
  syntheticAreas: AreaData[];
  activeAreas: AreaData[];
  unlockedLimbIds: readonly LifeAreaId[];
};

/** Server-side onboarding data for the tree page overlay. */
export async function loadOnboardingTreePayload(userId: string): Promise<OnboardingTreePayload> {
  await ensureTaxonomyCurrent(prisma, userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      onboardingScene: true,
      onboardingThemeId: true,
      onboardingHubSlug: true,
      unlockedLimbIds: true,
    },
  });

  const hubs = await prisma.themeCategory.findMany({
    where: { userId, parentCategoryId: null, isSystemCategory: true },
    select: {
      id: true,
      themeId: true,
      label: true,
      name: true,
      order: true,
      createdAt: true,
      isActive: true,
      parentCategoryId: true,
    },
    orderBy: [{ themeId: "asc" }, { order: "asc" }, { createdAt: "asc" }],
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
  } as const;

  const goals = await prisma.goal.findMany({
    where: { userId, archived: false },
    orderBy: { createdAt: "asc" },
    include: goalInclude,
  });

  const syntheticAreas = mapToTreeData([], [], []);
  const activeAreas = mapToTreeData(
    hubs as unknown as RawBranch[],
    [],
    goals as unknown as RawTreeGoalPayload[],
  );
  const unlockedLimbIds = mergeUnlockedLimbIds(
    parseUnlockedLimbIds(user?.unlockedLimbIds ?? null),
    hubs as unknown as RawBranch[],
  );

  return {
    initialProgress: getOnboardingProgress(
      user ?? { onboardingScene: 1, onboardingThemeId: null, onboardingHubSlug: null },
    ),
    hubs: hubs.map((hub) => {
      const label = (hub.label ?? hub.name ?? "Hub").trim() || "Hub";
      return {
        id: hub.id,
        limbId: hub.themeId,
        label,
        slug: normalizeHubLabelKey(label),
      };
    }),
    syntheticAreas,
    activeAreas,
    unlockedLimbIds,
  };
}
