"use client";

import type { OnboardingScene } from "@/lib/onboarding-progress";
import { ONBOARDING_LIMB_OPTIONS } from "../onboarding-limbs";

type SceneThemePickProps = {
  onAdvance: (nextScene: OnboardingScene, themeId?: string) => void;
  pending: boolean;
};

export function SceneThemePick({ onAdvance, pending }: SceneThemePickProps) {
  return (
    <section className="space-y-6 rounded-2xl border border-white/10 bg-[#151515] p-6">
      <div className="space-y-2">
        <p className="text-sm uppercase tracking-[0.2em] text-[#EF9F27]">Scene 2 / 6</p>
        <h1 className="text-3xl font-semibold text-white">Pick a theme</h1>
        <p className="text-sm text-zinc-400">Map placeholder. Choose one theme to continue.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ONBOARDING_LIMB_OPTIONS.map((theme) => (
          <button
            key={theme.id}
            type="button"
            disabled={pending}
            onClick={() => onAdvance(3, theme.id)}
            className="rounded-xl border border-white/10 px-4 py-3 text-left transition hover:border-white/25 disabled:opacity-50"
            style={{ backgroundColor: `${theme.color}14` }}
          >
            <span className="block text-sm font-semibold text-zinc-100">{theme.label}</span>
            <span className="mt-1 block text-xs text-zinc-400">{theme.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
