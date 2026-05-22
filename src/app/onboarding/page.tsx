import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ensureHubTaxonomyCurrent } from "@/lib/hub-taxonomy-sync";
import { getOnboardingProgress } from "@/lib/onboarding-progress";
import { prisma } from "@/lib/prisma";
import { normalizeHubLabelKey } from "@/lib/taxonomy";
import { mapToTreeData } from "@/components/tree/tree-data";
import type { RawBranch, RawTreeGoalPayload } from "@/components/tree/tree-data";
import { mergeUnlockedLimbIds, parseUnlockedLimbIds } from "@/lib/unlocked-themes";
import { OnboardingResumeRedirect } from "@/components/onboarding/onboarding-resume-redirect";
import { OnboardingSceneRouter } from "@/components/onboarding/onboarding-scene-router";

export default async function OnboardingPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      onboardingCompleted: true,
      onboardingScene: true,
      onboardingThemeId: true,
      onboardingHubSlug: true,
      unlockedLimbIds: true,
    },
  });

  if (!user) {
    redirect("/login");
  }

  if (user.onboardingCompleted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07060a] px-4 py-10 text-white">
        <OnboardingResumeRedirect />
      </main>
    );
  }

  await ensureHubTaxonomyCurrent(prisma, userId);

  const hubs = await prisma.branch.findMany({
    where: { userId, parentBranchId: null, isSystemHub: true },
    select: {
      id: true,
      limbId: true,
      label: true,
      name: true,
      order: true,
      createdAt: true,
      isActive: true,
      parentBranchId: true,
    },
    orderBy: [{ limbId: "asc" }, { order: "asc" }, { createdAt: "asc" }],
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
    parseUnlockedLimbIds(user.unlockedLimbIds),
    hubs as unknown as RawBranch[],
  );

  return (
    <main className="relative min-h-screen bg-[#07060a] text-white">
      <OnboardingSceneRouter
        initialProgress={getOnboardingProgress(user)}
        hubs={hubs.map((hub) => {
          const label = (hub.label ?? hub.name ?? "Hub").trim() || "Hub";
          return {
            id: hub.id,
            limbId: hub.limbId,
            label,
            slug: normalizeHubLabelKey(label),
          };
        })}
        syntheticAreas={syntheticAreas}
        activeAreas={activeAreas}
        unlockedLimbIds={unlockedLimbIds}
      />
    </main>
  );
}
