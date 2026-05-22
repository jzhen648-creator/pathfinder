"use client";

import type { OnboardingScene } from "@/lib/onboarding-progress";

type SceneThresholdProps = {
  onAdvance: (nextScene: OnboardingScene) => void;
  pending: boolean;
};

export function SceneThreshold({ onAdvance, pending }: SceneThresholdProps) {
  return (
    <section className="space-y-8 rounded-2xl border border-white/10 bg-[#0a0a0a] p-8 text-center">
      <p className="text-lg leading-relaxed text-zinc-200">
        In a few minutes, we&apos;ll turn one thing on your mind into the start of your life map.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => onAdvance(2)}
        className="w-full rounded-xl bg-[#EF9F27] px-4 py-3 text-sm font-semibold text-[#07060A] transition hover:bg-[#f5b34d] disabled:opacity-50"
      >
        {pending ? "…" : "I'm ready"}
      </button>
    </section>
  );
}
