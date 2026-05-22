"use client";

import { getLifeArea } from "@/lib/life-areas";
import type { LifeAreaId } from "@/lib/types";
import type { OnboardingScene } from "@/lib/onboarding-progress";
import type { OnboardingHubOption } from "../onboarding-scene-router";

type SceneHubPickProps = {
  themeId: string | null;
  hubs: OnboardingHubOption[];
  onAdvance: (nextScene: OnboardingScene, themeId?: string | null, hubSlug?: string | null) => void;
  pending: boolean;
};

export function SceneHubPick({ themeId, hubs, onAdvance, pending }: SceneHubPickProps) {
  if (!themeId) {
    return (
      <section className="space-y-6 rounded-2xl border border-white/10 bg-[#151515] p-6">
        <p className="text-sm text-zinc-400">Choose a theme first.</p>
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

  const lifeArea = getLifeArea(themeId as LifeAreaId);
  const themeLabel = lifeArea?.label ?? themeId;
  const hubCount = hubs.length;

  return (
    <section className="space-y-6 rounded-2xl border border-white/10 bg-[#151515] p-6">
      <div className="space-y-3">
        <p className="text-base text-zinc-200">
          Inside {themeLabel} there are {hubCount} {hubCount === 1 ? "hub" : "hubs"}.
        </p>
        <p className="text-sm text-zinc-400">Tap the one that fits what&apos;s on your mind.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {hubs.map((hub) => (
          <button
            key={hub.id}
            type="button"
            disabled={pending}
            onClick={() => onAdvance(4, themeId, hub.slug)}
            className="rounded-xl border border-white/10 px-4 py-3 text-left transition hover:border-white/25 disabled:opacity-50"
          >
            <span className="block text-sm font-semibold text-zinc-100">{hub.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
