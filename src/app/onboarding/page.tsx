import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OnboardingChat } from "@/components/onboarding/onboarding-chat";

export default async function OnboardingPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, onboardingCompleted: true },
  });

  if (!user) {
    redirect("/login");
  }

  if (user.onboardingCompleted) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[#0f0f0f] px-4 py-10 text-white">
      <OnboardingChat userName={user.name ?? "there"} />
    </main>
  );
}
