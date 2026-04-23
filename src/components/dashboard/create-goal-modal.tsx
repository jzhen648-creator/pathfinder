"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type CreateGoalModalProps = {
  triggerLabel?: string;
  defaultLifeArea?: string;
  quickStart?: boolean;
  autoOpenToken?: number;
};

export function CreateGoalModal({
  triggerLabel = "Add a moment",
  defaultLifeArea,
  quickStart = false,
  autoOpenToken,
}: CreateGoalModalProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(Boolean(autoOpenToken && autoOpenToken > 0));
  const [lifeArea, setLifeArea] = useState(
    quickStart && defaultLifeArea ? defaultLifeArea : "Career",
  );
  const [goalTitle, setGoalTitle] = useState("");
  const [whyMatters, setWhyMatters] = useState("");
  const [deadline, setDeadline] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setLifeArea(quickStart && defaultLifeArea ? defaultLifeArea : "Career");
    setGoalTitle("");
    setWhyMatters("");
    setDeadline("");
    setIsSubmitting(false);
    setError(null);
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!lifeArea.trim() || !goalTitle.trim() || !whyMatters.trim() || !deadline) {
      setError("Please complete all fields before adding your moment.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Single AI call happens inside /api/goals for milestone generation.
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lifeArea: lifeArea.trim(),
          title: goalTitle.trim(),
          description: whyMatters.trim(),
          deadline,
          // Keep backend contract backward-compatible while avoiding extra AI calls.
          startingPoint: "Not provided.",
          biggestObstacle: "Not specified.",
          hoursPerWeek: "Not specified.",
          discoveryContext: [],
          evaluation: whyMatters.trim(),
        }),
      });
      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !data.id) {
        setError(data.error ?? "Failed to add moment. Please try again.");
        setIsSubmitting(false);
        return;
      }

      setIsOpen(false);
      reset();
      router.refresh();
    } catch {
      setError("Failed to add moment. Please check your connection and try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="rounded-xl border border-indigo-400/40 bg-indigo-500/20 px-4 py-2 text-sm font-medium text-indigo-200 shadow-[0_0_24px_rgba(99,102,241,0.2)] transition hover:border-indigo-300/70 hover:bg-indigo-400/25"
      >
        {triggerLabel}
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#141414] p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">Add a moment</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Fill out the basics, then we generate your milestones in one step.
                </p>
              </div>
              <button
                onClick={() => {
                  setIsOpen(false);
                  reset();
                }}
                className="rounded-md px-2 py-1 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs text-zinc-500">Life area</label>
                <select
                  value={lifeArea}
                  onChange={(event) => setLifeArea(event.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#151515] px-3 py-2 text-sm text-zinc-100 outline-none ring-indigo-500/40 transition focus:ring"
                >
                  <option>Career</option>
                  <option>Finance</option>
                  <option>Health & Fitness</option>
                  <option>Relationships</option>
                  <option>Personal Growth</option>
                  <option>Mental Wellbeing</option>
                  <option>Fun & Recreation</option>
                  <option>Environment & Lifestyle</option>
                  <option>Education</option>
                  <option>Other</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-zinc-500">Moment in one sentence</label>
                <input
                  value={goalTitle}
                  onChange={(event) => setGoalTitle(event.target.value)}
                  placeholder="e.g. Become a licensed mortgage broker in the UK"
                  className="w-full rounded-lg border border-white/10 bg-[#151515] px-3 py-2 text-sm text-zinc-100 outline-none ring-indigo-500/40 transition focus:ring"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-zinc-500">Why this matters</label>
                <textarea
                  value={whyMatters}
                  onChange={(event) => setWhyMatters(event.target.value)}
                  rows={4}
                  placeholder="Tell us why this moment is important to you."
                  className="w-full rounded-lg border border-white/10 bg-[#151515] px-3 py-2 text-sm text-zinc-100 outline-none ring-indigo-500/40 transition focus:ring"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-zinc-500">Deadline</label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(event) => setDeadline(event.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#151515] px-3 py-2 text-sm text-zinc-100 outline-none ring-indigo-500/40 transition focus:ring"
                />
              </div>

              {error ? (
                <p className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                  {error}
                </p>
              ) : null}

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 transition hover:border-white/20"
                >
                  Reset
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-60"
                >
                  {isSubmitting ? "Generating roadmap..." : "Add a moment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
