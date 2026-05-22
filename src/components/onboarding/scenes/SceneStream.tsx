"use client";

import type { OnboardingScene } from "@/lib/onboarding-progress";

type SceneStreamProps = {
  onAdvance: (nextScene: OnboardingScene) => void;
  pending: boolean;
};

export function SceneStream({ onAdvance, pending }: SceneStreamProps) {
  return (
    <section className="space-y-6 rounded-2xl border border-white/10 bg-[#151515] p-6">
      <p className="text-sm text-zinc-400">[Stream Lite goes here — Phase 5]</p>
      <button
        type="button"
        disabled={pending}
        onClick={() => onAdvance(5)}
        className="w-full rounded-xl border border-dashed border-white/20 px-4 py-3 text-sm text-zinc-400 transition hover:border-white/35 hover:text-zinc-200 disabled:opacity-50"
      >
        {pending ? "…" : "Skip for now (dev only)"}
      </button>
    </section>
  );
}
