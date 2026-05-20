import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateDMY } from "@/lib/date";
import { GoalCardActions } from "@/components/dashboard/goal-card-actions";
import { isScaffoldingSubtaskTitle } from "@/lib/legacy-subtask-placeholder-title";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      goals: {
        include: {
          milestones: {
            include: {
              subtasks: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!user) {
    redirect("/login");
  }

  if (!user.onboardingCompleted) {
    redirect("/onboarding");
  }

  return (
    <main className="min-h-screen bg-[#050b16] px-4 py-10 text-white">
      <section className="mx-auto w-full max-w-5xl space-y-6">
        <header className="rounded-2xl border border-white/10 bg-[#0b1220]/90 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Daily View</p>
              <h1 className="mt-2 text-2xl font-semibold text-white">{user.name ?? "Your"} pursuits and roadmaps</h1>
              <p className="mt-2 text-sm text-zinc-400">Manage pursuits, edit details, and jump into each roadmap.</p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/tree"
                className="rounded-xl border border-cyan-400/35 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200 transition hover:bg-cyan-400/20"
              >
                Open life tree
              </Link>
              <Link
                href="/next-steps"
                className="rounded-xl border border-indigo-400/40 bg-indigo-500/15 px-4 py-2 text-sm font-medium text-indigo-200 transition hover:border-indigo-300/60 hover:bg-indigo-500/25"
              >
                Add pursuit
              </Link>
            </div>
          </div>
        </header>

        <section className="space-y-3">
          <h2 className="text-sm uppercase tracking-[0.18em] text-zinc-500">Pursuits</h2>
          <div className="space-y-4">
            {user.goals.map((goal) => {
              const totalSubtasks = goal.milestones.reduce(
                (sum, milestone) =>
                  sum + milestone.subtasks.filter((s) => !isScaffoldingSubtaskTitle(s.title)).length,
                0,
              );
              const completedSubtasks = goal.milestones.reduce(
                (sum, milestone) =>
                  sum +
                  milestone.subtasks.filter(
                    (s) => !isScaffoldingSubtaskTitle(s.title) && s.isCompleted,
                  ).length,
                0,
              );
              const progress = totalSubtasks
                ? Math.round((completedSubtasks / totalSubtasks) * 100)
                : 0;

              return (
                <article
                  key={goal.id}
                  className="rounded-2xl border border-white/12 bg-[#101018]/95 p-5"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-zinc-100">{goal.title}</h3>
                      <p className="mt-1 text-xs text-zinc-400">{goal.lifeArea}</p>
                    </div>
                    <GoalCardActions
                      goal={{
                        id: goal.id,
                        title: goal.title,
                        description: goal.description,
                        lifeArea: goal.lifeArea,
                        deadline: goal.deadline ? formatDateDMY(goal.deadline) : "—",
                        milestones: [...goal.milestones]
                          .sort((a, b) => a.position - b.position)
                          .map((m) => ({
                            id: m.id,
                            title: m.title,
                            completedAt: m.completedAt,
                            subtasks: [...m.subtasks]
                              .sort((a, b) => a.position - b.position)
                              .map((s) => ({
                                id: s.id,
                                title: s.title,
                                isCompleted: s.isCompleted,
                              })),
                          })),
                      }}
                    />
                  </div>
                  <p className="mb-3 text-sm text-zinc-400">
                    Deadline: {goal.deadline ? formatDateDMY(goal.deadline) : "None set"}
                  </p>
                  <p className="mb-3 text-sm text-zinc-300">{goal.description}</p>

                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-zinc-400">
                      <span>Progress</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-black/50">
                      <div
                        className="h-2.5 rounded-full bg-indigo-400"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {user.goals.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-[#151515] p-10 text-center text-zinc-400">
            No pursuits yet. Add your first pursuit to get started.
          </div>
        ) : null}
      </section>
    </main>
  );
}
