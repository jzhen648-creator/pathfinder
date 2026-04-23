import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGoalWithProgress, getUserLevelData } from "@/lib/roadmap";
import { RoadmapClient } from "@/components/roadmap/roadmap-client";

type RouteProps = {
  params: Promise<{
    goalId: string;
  }>;
};

export default async function GoalRoadmapPage({ params }: RouteProps) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  const { goalId } = await params;
  const [goal, user] = await Promise.all([
    getGoalWithProgress(goalId, userId),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);

  if (!goal || !user) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[#0f0f0f] px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-5xl">
        <Link
          href="/dashboard"
          className="mb-6 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zinc-300 transition hover:text-white"
        >
          ← Back to Dashboard
        </Link>

        <p className="mb-4 text-xs uppercase tracking-[0.16em] text-zinc-500">
          Vision → Milestones → Quick Wins → Daily Tasks
        </p>

        <RoadmapClient initialGoal={goal} initialUser={getUserLevelData(user.xp)} />
      </div>
    </main>
  );
}
