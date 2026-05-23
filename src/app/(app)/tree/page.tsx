import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { TreePageShell } from "@/components/tree/tree-page-shell";
import { authOptions } from "@/lib/auth";
import { loadOnboardingTreePayload } from "@/lib/onboarding-tree-data";
import { prisma } from "@/lib/prisma";
import type { TreeFirstRunConfig } from "@/types/first-run";

export default async function TreePage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      firstRunCompleted: true,
      onboardingCompleted: true,
      onboardingPrimaryLimbId: true,
      name: true,
    },
  });

  if (!user) {
    redirect("/login");
  }

  const firstRun: TreeFirstRunConfig = {
    completed: user.firstRunCompleted,
    primaryLimbId: user.onboardingPrimaryLimbId,
    userName: user.name,
  };

  const onboarding = user.onboardingCompleted
    ? undefined
    : await loadOnboardingTreePayload(userId);

  return (
    <Suspense fallback={null}>
      <TreePageShell
        onboardingCompleted={user.onboardingCompleted}
        firstRun={firstRun}
        onboarding={onboarding}
      />
    </Suspense>
  );
}
