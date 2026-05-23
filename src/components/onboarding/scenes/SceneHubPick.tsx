"use client";

import { useCallback, useMemo } from "react";
import { getLifeArea } from "@/lib/life-areas";
import type { LifeAreaId } from "@/lib/types";
import type { OnboardingScene } from "@/lib/onboarding-progress";
import type { OnboardingHubOption } from "../onboarding-scene-router";
import type { AreaData } from "@/components/tree/tree-types";
import { OnboardingThemeChips } from "@/components/onboarding/onboarding-theme-chips";
import { OnboardingTreeBackground } from "@/components/onboarding/onboarding-tree-background";
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
  const hubs = useMemo(
    () => (themeId ? allHubs.filter((hub) => hub.limbId === themeId) : []),
    [allHubs, themeId],
  );
  const lifeArea = themeId ? getLifeArea(themeId as LifeAreaId) : null;
  const accentColor = lifeArea?.color ?? "#EF9F27";
  const themeLabel = lifeArea?.label ?? "this area";
  const unlockedLimbIds = LIFE_AREA_IDS as readonly LifeAreaId[];

  const handleHubSelect = useCallback(
    (slug: string) => {
      if (!themeId) return;
      onAdvance(4, themeId, slug);
    },
    [onAdvance, themeId],
  );

  const handleThemeSwitch = useCallback(
    (id: LifeAreaId) => {
      if (id === themeId) return;
      onAdvance(3, id, null);
    },
    [onAdvance, themeId],
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
            themeId: (themeId as LifeAreaId | null) ?? null,
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
          {themeId ? (
            <>
              Inside <span style={{ color: accentColor }}>{themeLabel}</span> there are {hubs.length}{" "}
              tracks.
            </>
          ) : (
            "Tap a theme on the map, or pick one above."
          )}
        </p>
        {themeId ? (
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
        ) : null}

        <OnboardingThemeChips selectedId={themeId} onSelect={handleThemeSwitch} />
      </div>
    </div>
  );
}
