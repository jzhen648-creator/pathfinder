"use client";

import type { OnboardingScene } from "@/lib/onboarding-progress";
import type { OnboardingHubOption } from "../onboarding-scene-router";

type SceneHubPickProps = {
  themeId: string | null;
  hubs: OnboardingHubOption[];
  onAdvance: (nextScene: OnboardingScene, themeId?: string, hubId?: string) => void;
  pending: boolean;
};

export function SceneHubPick({ themeId, hubs, onAdvance, pending }: SceneHubPickProps) {
  if (!themeId) {
    return (
      <section className="space-y-6 rounded-2xl border border-white/10 bg-[#151515] p-6">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-[0.2em] text-[#EF9F27]">Scene 3 / 6</p>
          <h1 className="text-3xl font-semibold text-white">Pick a hub</h1>
          <p className="text-sm text-zinc-400">Choose a theme first.</p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => onAdvance(2)}
          className="rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-300 transition hover:border-white/20 hover:text-white disabled:opacity-50"
        >
          Back to themes
        </button>
      </section>
    );
  }

  return (
    <section className="space-y-6 rounded-2xl border border-white/10 bg-[#151515] p-6">
      <div className="space-y-2">
        <p className="text-sm uppercase tracking-[0.2em] text-[#EF9F27]">Scene 3 / 6</p>
        <h1 className="text-3xl font-semibold text-white">Pick a hub</h1>
        <p className="text-sm text-zinc-400">Theme: {themeId}. Choose one hub to continue.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {hubs.map((hub) => (
          <button
            key={hub.id}
            type="button"
            disabled={pending}
            onClick={() => onAdvance(4, themeId, hub.id)}
            className="rounded-xl border border-white/10 px-4 py-3 text-left transition hover:border-white/25 disabled:opacity-50"
          >
            <span className="block text-sm font-semibold text-zinc-100">{hub.label}</span>
            <span className="mt-1 block text-xs text-zinc-500">{hub.id}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
