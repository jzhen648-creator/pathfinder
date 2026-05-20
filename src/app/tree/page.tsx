import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { TreeView } from "@/components/tree/tree-view";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireOnboardingComplete } from "@/lib/onboarding-gate";
import type { TreeFirstRunConfig } from "@/types/first-run";

export default async function TreePage() {
  await requireOnboardingComplete();

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      firstRunCompleted: true,
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

  return (
    <Suspense fallback={null}>
      <TreeView firstRun={firstRun} />
    </Suspense>
  );
}
