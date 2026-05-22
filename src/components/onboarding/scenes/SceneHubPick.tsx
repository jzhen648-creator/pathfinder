"use client";

import { getLifeArea } from "@/lib/life-areas";
import type { LifeAreaId } from "@/lib/types";
import type { OnboardingScene } from "@/lib/onboarding-progress";
import type { OnboardingHubOption } from "../onboarding-scene-router";
import type { AreaData } from "@/components/tree/tree-types";
import { OnboardingTreeBackground } from "@/components/onboarding/onboarding-tree-background";
import { LIFE_AREA_IDS } from "@/lib/taxonomy";
import { hubPanelCopy } from "@/lib/hub-catalog";

type SceneHubPickProps = {
  themeId: string | null;
  hubs: OnboardingHubOption[];
  syntheticAreas: AreaData[];
  onAdvance: (nextScene: OnboardingScene, themeId?: string | null, hubSlug?: string | null) => void;
  pending: boolean;
};

export function SceneHubPick({ themeId, hubs, syntheticAreas, onAdvance, pending }: SceneHubPickProps) {
  const lifeArea = themeId ? getLifeArea(themeId as LifeAreaId) : null;
  const accentColor = lifeArea?.color ?? "#EF9F27";
  const themeLabel = lifeArea?.label ?? themeId ?? "this area";
  const dormantLimbIds = LIFE_AREA_IDS.filter((id) => id !== themeId) as readonly LifeAreaId[];

  if (!themeId) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#07060a",
        }}
      >
        <div style={{ textAlign: "center", padding: 24 }}>
          <p style={{ fontSize: 14, color: "rgba(245,243,250,0.52)", marginBottom: 20 }}>
            Choose a theme first.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => onAdvance(2)}
            style={{
              border: "1px solid rgba(255,255,255,0.15)",
              background: "transparent",
              color: "rgba(245,243,250,0.72)",
              borderRadius: 10,
              padding: "10px 20px",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Back to themes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, overflow: "hidden" }}>
      {/* Tree with selected theme lit, others dormant */}
      <OnboardingTreeBackground
        areas={syntheticAreas}
        dormantLimbIds={dormantLimbIds}
        unlockedLimbIds={themeId ? [themeId as LifeAreaId] : []}
        nonInteractive
      />

      {/* Gradient darkens the background so cards are readable */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(7,6,10,0.55)",
          zIndex: 1,
          pointerEvents: "none",
        }}
      />

      {/* Floating hub picker */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 480, width: "100%" }}>
          <p
            style={{
              margin: "0 0 6px",
              fontSize: "clamp(18px, 3.5vw, 22px)",
              fontWeight: 600,
              color: "rgba(245,243,250,0.95)",
              textAlign: "center",
              letterSpacing: "-0.01em",
            }}
          >
            Inside{" "}
            <span style={{ color: accentColor }}>{themeLabel}</span>
            {" "}there are {hubs.length} tracks.
          </p>
          <p
            style={{
              margin: "0 0 24px",
              fontSize: 14,
              color: "rgba(245,243,250,0.48)",
              textAlign: "center",
            }}
          >
            Which one is most on your mind right now?
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: hubs.length <= 3 ? "1fr" : "1fr 1fr",
              gap: 10,
            }}
          >
            {hubs.map((hub) => {
              const catalog = hubPanelCopy(hub.limbId, hub.label);
              const oneLiner = catalog.about.split(".")[0] + ".";
              return (
                <button
                  key={hub.id}
                  type="button"
                  disabled={pending}
                  onClick={() => onAdvance(4, themeId, hub.slug)}
                  style={{
                    textAlign: "left",
                    background: "rgba(12,11,18,0.78)",
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    border: `1px solid rgba(255,255,255,0.10)`,
                    borderRadius: 14,
                    padding: "14px 16px",
                    cursor: pending ? "wait" : "pointer",
                    transition: "border-color 120ms",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = `${accentColor}60`;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.10)";
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      fontSize: 15,
                      fontWeight: 600,
                      color: "rgba(245,243,250,0.95)",
                      marginBottom: 4,
                    }}
                  >
                    {hub.label}
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: 12.5,
                      color: "rgba(245,243,250,0.45)",
                      lineHeight: 1.45,
                    }}
                  >
                    {oneLiner}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            disabled={pending}
            onClick={() => onAdvance(2)}
            style={{
              marginTop: 16,
              display: "block",
              width: "100%",
              background: "transparent",
              border: "none",
              color: "rgba(245,243,250,0.35)",
              fontSize: 13,
              cursor: "pointer",
              textAlign: "center",
              padding: "8px 0",
            }}
          >
            ← Different area
          </button>
        </div>
      </div>
    </div>
  );
}
