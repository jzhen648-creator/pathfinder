"use client";

import { useCallback, useMemo } from "react";
import { getLifeArea } from "@/lib/life-areas";
import type { LifeAreaId } from "@/lib/types";
import type { OnboardingScene } from "@/lib/onboarding-progress";
import type { OnboardingHubOption } from "../onboarding-scene-router";
import type { AreaData } from "@/components/tree/tree-types";
import { OnboardingThemeChips } from "@/components/onboarding/onboarding-theme-chips";
import { OnboardingTreeBackground } from "@/components/onboarding/onboarding-tree-background";
import { ONBOARDING_DEFAULT_THEME_ID } from "@/components/onboarding/onboarding-theme-order";
import { LIFE_AREA_IDS } from "@/lib/taxonomy";

/** Keep the tree between the header chips and the bottom edge. */
const HEADER_INSET_PX = 192;

type SceneHubPickProps = {
  themeId: string | null;
  allHubs: OnboardingHubOption[];
  syntheticAreas: AreaData[];
  onAdvance: (nextScene: OnboardingScene, themeId?: string | null, hubSlug?: string | null) => void;
};

/**
 * Scene 3 — Combined theme + track picker.
 * Phase 1: theme gateways only. Phase 2: one theme zoomed with hub spokes + side list.
 */
export function SceneHubPick({ themeId, allHubs, syntheticAreas, onAdvance }: SceneHubPickProps) {
  const activeThemeId = (themeId as LifeAreaId | null) ?? ONBOARDING_DEFAULT_THEME_ID;
  const hubs = useMemo(
    () => allHubs.filter((hub) => hub.limbId === activeThemeId),
    [activeThemeId, allHubs],
  );
  const lifeArea = getLifeArea(activeThemeId);
  const accentColor = lifeArea?.color ?? "#EF9F27";
  const themeLabel = lifeArea?.label ?? "this area";
  const unlockedLimbIds = LIFE_AREA_IDS as readonly LifeAreaId[];

  const handleHubSelect = useCallback(
    (slug: string) => {
      onAdvance(4, activeThemeId, slug);
    },
    [activeThemeId, onAdvance],
  );

  const handleThemeSwitch = useCallback(
    (id: LifeAreaId) => {
      if (id === activeThemeId) return;
      onAdvance(3, id, null);
    },
    [activeThemeId, onAdvance],
  );

  const handleAreaClick = useCallback(
    (area: AreaData) => {
      handleThemeSwitch(area.id as LifeAreaId);
    },
    [handleThemeSwitch],
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          top: HEADER_INSET_PX,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 0,
        }}
      >
        <OnboardingTreeBackground
          areas={syntheticAreas}
          dormantLimbIds={[]}
          unlockedLimbIds={unlockedLimbIds}
          onAreaClick={handleAreaClick}
          onboardingHubPick={{
            themeId: activeThemeId,
            onHubSelect: handleHubSelect,
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 3,
          padding: "28px 24px 0",
          pointerEvents: "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: 14,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "clamp(17px, 3.2vw, 21px)",
            fontWeight: 600,
            color: "rgba(245,243,250,0.95)",
            letterSpacing: "-0.01em",
            textShadow: "0 2px 12px rgba(0,0,0,0.65)",
          }}
        >
          <>
            Inside <span style={{ color: accentColor }}>{themeLabel}</span> there are {hubs.length}{" "}
            tracks.
          </>
        </p>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            color: "rgba(245,243,250,0.55)",
            textShadow: "0 2px 10px rgba(0,0,0,0.55)",
          }}
        >
          Tap a track on the map.
        </p>

        <OnboardingThemeChips selectedId={activeThemeId} onSelect={handleThemeSwitch} />
      </div>
    </div>
  );
}
