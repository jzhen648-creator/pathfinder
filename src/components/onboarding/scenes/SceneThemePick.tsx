"use client";

import type { OnboardingScene } from "@/lib/onboarding-progress";
import { ONBOARDING_LIMB_OPTIONS } from "../onboarding-limbs";

type SceneThemePickProps = {
  onAdvance: (nextScene: OnboardingScene, themeId?: string | null) => void;
  pending: boolean;
};

export function SceneThemePick({ onAdvance, pending }: SceneThemePickProps) {
  return (
    <section className="space-y-6 rounded-2xl border border-white/10 bg-[#151515] p-6">
      <div className="space-y-3">
        <p className="text-base text-zinc-200">Your life moves across five areas.</p>
        <p className="text-sm text-zinc-400">Tap whichever one is most on your mind.</p>
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
          </button>
        ))}
      </div>
    </section>
  );
}
