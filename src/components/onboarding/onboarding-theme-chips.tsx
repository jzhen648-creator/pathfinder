"use client";

import { LIFE_AREAS } from "@/lib/life-areas";
import type { LifeAreaId } from "@/lib/types";
import { obThemeChipStyle } from "./onboarding-ui";

type OnboardingThemeChipsProps = {
  selectedId: string | null;
  onSelect: (id: LifeAreaId) => void;
  disabled?: boolean;
};

export function OnboardingThemeChips({ selectedId, onSelect, disabled }: OnboardingThemeChipsProps) {
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
      {LIFE_AREAS.map((area) => {
        const isSelected = selectedId === area.id;
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
