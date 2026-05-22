"use client";

import { useState } from "react";
import type { AreaData } from "@/components/tree/tree-types";
import type { LifeAreaId } from "@/lib/types";
import type { OnboardingScene } from "@/lib/onboarding-progress";
import { LIFE_AREA_IDS } from "@/lib/taxonomy";
import { OnboardingTreeBackground } from "@/components/onboarding/onboarding-tree-background";

type SceneThemePickProps = {
  areas: AreaData[];
  onAdvance: (nextScene: OnboardingScene, themeId?: string | null) => void;
  pending: boolean;
};

/**
 * Scene 2 — The tree IS the onboarding.
 * All 5 themes breathe as dormant nodes. Tapping one lights it up and advances.
 */
export function SceneThemePick({ areas, onAdvance, pending }: SceneThemePickProps) {
  const [tappedId, setTappedId] = useState<LifeAreaId | null>(null);

  function handleAreaClick(area: AreaData) {
    if (tappedId !== null || pending) return;
    const id = area.id as LifeAreaId;
    setTappedId(id);
    window.setTimeout(() => onAdvance(3, id), 400);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        overflow: "hidden",
      }}
    >
      {/* Dormant tree fills the viewport */}
      <OnboardingTreeBackground
        areas={areas}
        dormantLimbIds={LIFE_AREA_IDS}
        unlockedLimbIds={[]}
        activatingLimbId={tappedId}
        onAreaClick={handleAreaClick}
      />

      {/* Floating prompt — pointer events off so clicks reach the tree */}
      <div
        style={{
          position: "absolute",
          top: "9%",
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          padding: "0 24px",
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "clamp(16px, 3.5vw, 20px)",
            fontWeight: 500,
            color: "rgba(245, 243, 250, 0.90)",
            textAlign: "center",
            letterSpacing: "0.01em",
          }}
        >
          Your life moves across five areas.
        </p>
        <p
          style={{
            margin: 0,
            fontSize: "clamp(13px, 2.5vw, 15px)",
            color: "rgba(245, 243, 250, 0.52)",
            textAlign: "center",
          }}
        >
          {tappedId ? "Opening…" : "Tap whichever one is most on your mind."}
        </p>
      </div>
    </div>
  );
}
