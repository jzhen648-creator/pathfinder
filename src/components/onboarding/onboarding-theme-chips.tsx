"use client";

import type { LifeAreaId } from "@/lib/types";
import { obThemeChipStyle } from "./onboarding-ui";
import { ONBOARDING_DEFAULT_THEME_ID, ONBOARDING_THEME_AREAS } from "./onboarding-theme-order";

type OnboardingThemeChipsProps = {
  selectedId: string | null;
  onSelect: (id: LifeAreaId) => void;
  disabled?: boolean;
};

export function OnboardingThemeChips({ selectedId, onSelect, disabled }: OnboardingThemeChipsProps) {
  const highlightedId = selectedId ?? ONBOARDING_DEFAULT_THEME_ID;

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        justifyContent: "center",
        pointerEvents: disabled ? "none" : "auto",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {ONBOARDING_THEME_AREAS.map((area) => {
        const isSelected = highlightedId === area.id;
        return (
          <button
            key={area.id}
            type="button"
            aria-pressed={isSelected}
            disabled={disabled}
            onClick={() => onSelect(area.id as LifeAreaId)}
            style={obThemeChipStyle(area.color, isSelected)}
          >
            {area.label}
          </button>
        );
      })}
    </div>
  );
}
