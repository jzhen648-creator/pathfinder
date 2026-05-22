"use client";

import type { OnboardingScene } from "@/lib/onboarding-progress";

type SceneHorizonProps = {
  onAdvance: (nextScene: OnboardingScene, themeId?: string | null, hubSlug?: string | null) => void;
  onComplete: () => void;
  pending: boolean;
};

export function SceneHorizon({ onAdvance, onComplete, pending }: SceneHorizonProps) {
  return (
    <section className="space-y-6 rounded-2xl border border-white/10 bg-[#151515] p-6">
      <p className="text-lg font-medium text-zinc-100">Your map is ready.</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={pending}
          onClick={() => onAdvance(2, null, null)}
          className="flex-1 rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-200 transition hover:border-white/25 disabled:opacity-50"
        >
          Add another area
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onComplete}
          className="flex-1 rounded-xl bg-[#EF9F27] px-4 py-3 text-sm font-semibold text-[#07060A] transition hover:bg-[#f5b34d] disabled:opacity-50"
        >
          {pending ? "…" : "I'm done for now"}
        </button>
      </div>
    </section>
  );
}
