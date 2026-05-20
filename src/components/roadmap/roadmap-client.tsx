"use client";

import { useMemo, useState } from "react";

type RoadmapSubtask = {
  id: string;
  title: string;
  isCompleted: boolean;
  dailyTasks: {
    id: string;
    title: string;
  }[];
  checkpoints: {
    id: string;
    title: string;
  }[];
};

type RoadmapMilestone = {
  id: string;
  title: string;
  description: string;
  position: number;
  progress: number;
  isCompleted: boolean;
  isUnlocked: boolean;
  isActive: boolean;
  subtasks: RoadmapSubtask[];
};

type GoalRoadmap = {
  id: string;
  title: string;
  description: string;
  lifeArea: string;
  goalType: "action" | "outcome" | string;
  targetAmount: number | null;
  currentAmount: number | null;
  deadline: string | null;
  progress: number;
  milestones: RoadmapMilestone[];
};

type RoadmapClientProps = {
  initialGoal: GoalRoadmap;
};

export function RoadmapClient({ initialGoal }: RoadmapClientProps) {
  const [goal, setGoal] = useState(initialGoal);
  const [loadingSubtaskId, setLoadingSubtaskId] = useState<string | null>(null);
  const [expandedMilestoneIds, setExpandedMilestoneIds] = useState<Set<string>>(() => new Set());

  const activeMilestoneId = useMemo(
    () => goal.milestones.find((milestone) => milestone.isActive)?.id,
    [goal.milestones],
  );

  return (
    <section className="space-y-6">
      <header className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#141414] p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Milestones</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">{goal.title}</h1>
        <p className="mt-2 max-w-3xl text-zinc-400">{goal.description}</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <StatItem label="Life Area" value={goal.lifeArea} />
          <StatItem label="Progress" value={`${goal.progress}%`} />
        </div>
        {goal.goalType === "outcome" && goal.targetAmount ? (
          <div className="mt-4 rounded-lg border border-indigo-400/20 bg-black/20 p-3">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Savings Tracker</span>
              <span>
                {Math.round(goal.currentAmount ?? 0)} / {Math.round(goal.targetAmount)}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-black/40">
              <div
                className="h-1.5 rounded-full bg-[#6366f1]"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((((goal.currentAmount ?? 0) / goal.targetAmount) * 100) || 0),
                  )}%`,
                }}
              />
            </div>
          </div>
        ) : null}
      </header>

      <div className="space-y-5">
        {goal.milestones.map((milestone, index) => (
          <article
            key={milestone.id}
            className={`relative rounded-2xl border p-5 transition-all ${
              milestone.isCompleted
                ? "border-indigo-400/45 bg-indigo-500/5"
                : milestone.isActive
                  ? "border-indigo-400/60 bg-indigo-500/8 shadow-[0_0_18px_rgba(99,102,241,0.2)]"
                  : milestone.isUnlocked
                    ? "border-white/10 bg-[#171717]"
                    : "border-white/5 bg-[#131313] opacity-60"
            }`}
          >
            {index < goal.milestones.length - 1 ? (
              <span
                className={`absolute left-9 top-[95px] h-[calc(100%+20px)] w-px ${
                  milestone.isCompleted ? "bg-indigo-400/45" : "bg-white/10"
                }`}
              />
            ) : null}

            <div className="flex gap-4">
              <div
                className={`mt-1 flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                  milestone.isCompleted
                    ? "bg-indigo-500/20 text-indigo-200"
                    : milestone.isActive
                      ? "bg-indigo-500/25 text-indigo-200"
                      : milestone.isUnlocked
                        ? "bg-white/10 text-zinc-300"
                        : "bg-zinc-800 text-zinc-500"
                }`}
              >
                {milestone.position}
              </div>

              <div className="flex-1 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-white">{milestone.title}</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400">
                      {!milestone.isUnlocked ? "Locked" : milestone.isCompleted ? "Complete" : "Active"}
                    </span>
                    <button
                      type="button"
                      aria-expanded={expandedMilestoneIds.has(milestone.id)}
                      onClick={() => {
                        setExpandedMilestoneIds((prev) => {
                          const n = new Set(prev);
                          if (n.has(milestone.id)) n.delete(milestone.id);
                          else n.add(milestone.id);
                          return n;
                        });
                      }}
                      className="rounded-md border border-white/15 bg-black/30 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:border-white/25 hover:text-white"
                    >
                      {expandedMilestoneIds.has(milestone.id) ? "Hide detail" : "Detail"}
                    </button>
                  </div>
                </div>
                {expandedMilestoneIds.has(milestone.id) && milestone.description.trim() ? (
                  <p className="text-sm text-zinc-400">{milestone.description}</p>
                ) : null}

                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-zinc-400">
                    <span>Milestone Progress</span>
                    <span>{milestone.progress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-black/40">
                    <div
                      className={`shimmer-fill h-1.5 rounded-full transition-all duration-500 ${
                        milestone.isCompleted ? "bg-indigo-400" : "bg-indigo-400"
                      }`}
                      style={{ width: `${milestone.progress}%` }}
                    />
                  </div>
                </div>

                {expandedMilestoneIds.has(milestone.id) ? (
                <div className="grid gap-2">
                  {milestone.subtasks.map((subtask) => (
                    <div key={subtask.id} className="rounded-lg border border-white/10 bg-black/30 p-3">
                      <div className="relative overflow-hidden rounded-md">
                        <button
                          disabled={!milestone.isUnlocked || loadingSubtaskId === subtask.id}
                          onClick={async () => {
                            setLoadingSubtaskId(subtask.id);
                            try {
                              const response = await fetch(
                                `/api/subtasks/${subtask.id}/complete`,
                                { method: "PATCH" },
                              );
                              const result = (await response.json()) as {
                                error?: string;
                                goal?: GoalRoadmap;
                              };
                              if (!response.ok || !result.goal) {
                                return;
                              }

                              setGoal(result.goal);
                            } finally {
                              setLoadingSubtaskId(null);
                            }
                          }}
                          className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition ${
                            subtask.isCompleted
                              ? "border-indigo-400/25 bg-indigo-500/10 text-indigo-100"
                              : !milestone.isUnlocked
                                ? "cursor-not-allowed border-white/5 bg-black/20 text-zinc-600"
                                : "border-white/10 bg-black/20 text-zinc-200 hover:border-indigo-300/40"
                          }`}
                        >
                          <span className={subtask.isCompleted ? "line-through opacity-80" : ""}>
                            {subtask.title}
                          </span>
                          <span className="text-xs text-zinc-500">
                            {subtask.isCompleted ? "Done" : "Open"}
                          </span>
                        </button>
                      </div>

                      <div className="mt-2 space-y-1 pl-1">
                        {goal.goalType === "action" ? (
                          <>
                            <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                              Daily Tasks
                            </p>
                            {subtask.dailyTasks.map((dailyTask) => (
                              <p key={dailyTask.id} className="text-xs text-zinc-400">
                                • {dailyTask.title}
                              </p>
                            ))}
                          </>
                        ) : (
                          <>
                            <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                              Checkpoints
                            </p>
                            {subtask.checkpoints.map((checkpoint) => (
                              <p key={checkpoint.id} className="text-xs text-zinc-400">
                                • {checkpoint.title}
                              </p>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>

      <p className="text-xs text-zinc-500">
        Active milestone:{" "}
        <span className="text-zinc-300">
          {goal.milestones.find((milestone) => milestone.id === activeMilestoneId)?.title ?? "None"}
        </span>
      </p>
    </section>
  );
}

function StatItem({
  label,
  value,
  subtle,
}: {
  label: string;
  value: string;
  subtle?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 font-semibold ${subtle ? "text-sm text-zinc-300" : "text-lg text-white"}`}>
        {value}
      </p>
    </div>
  );
}
