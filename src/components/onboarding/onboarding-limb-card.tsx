"use client";

import type { OnboardingLimbOption } from "./onboarding-limbs";

type OnboardingLimbCardProps = {
  limb: OnboardingLimbOption;
  selected: boolean;
  onToggle: () => void;
};

export function OnboardingLimbCard({ limb, selected, onToggle }: OnboardingLimbCardProps) {
  const { Icon } = limb;

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className="flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-center transition"
      style={{
        borderColor: selected ? `${limb.color}99` : "rgba(255,255,255,0.1)",
        backgroundColor: selected ? `${limb.color}18` : `${limb.color}14`,
        boxShadow: selected ? `0 0 0 1px ${limb.color}55` : undefined,
      }}
    >
      <span className="flex h-10 w-10 items-center justify-center" style={{ color: limb.color }}>
        <svg width={32} height={32} viewBox="-16 -16 32 32" aria-hidden="true" focusable="false">
          <Icon color="currentColor" />
        </svg>
      </span>
      <div className="space-y-0.5">
        <span className="block text-sm font-medium text-zinc-100">{limb.label}</span>
        <span className="block text-xs text-zinc-400">{limb.description}</span>
      </div>
    </button>
  );
}
