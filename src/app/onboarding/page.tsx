import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ensureHubTaxonomyCurrent } from "@/lib/hub-taxonomy-sync";
import { getOnboardingProgress } from "@/lib/onboarding-progress";
import { prisma } from "@/lib/prisma";
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
      onboardingHubId: true,
    },
  });

  if (!user) {
    redirect("/login");
  }

  if (user.onboardingCompleted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#111210] px-4 py-10 text-white">
        <OnboardingResumeRedirect />
      </main>
    );
  }

  await ensureHubTaxonomyCurrent(prisma, userId);

  const hubs = await prisma.branch.findMany({
    where: { userId, parentBranchId: null, isSystemHub: true },
    select: { id: true, limbId: true, label: true, name: true, order: true, createdAt: true },
    orderBy: [{ limbId: "asc" }, { order: "asc" }, { createdAt: "asc" }],
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#111210] px-4 py-10 text-white">
      <OnboardingSceneRouter
        initialProgress={getOnboardingProgress(user)}
        hubs={hubs.map((hub) => ({
          id: hub.id,
          limbId: hub.limbId,
          label: (hub.label ?? hub.name ?? "Hub").trim() || "Hub",
        }))}
      />
    </main>
  );
}
