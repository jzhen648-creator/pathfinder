import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { OnboardingResumeRedirect } from "@/components/onboarding/onboarding-resume-redirect";

export default async function OnboardingPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingCompleted: true },
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

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#111210] px-4 py-10 text-white">
      <OnboardingFlow />
    </main>
  );
}
