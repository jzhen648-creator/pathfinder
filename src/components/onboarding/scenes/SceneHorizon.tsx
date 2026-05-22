"use client";

import type { AreaData } from "@/components/tree/tree-types";
import type { LifeAreaId } from "@/lib/types";
import type { OnboardingScene } from "@/lib/onboarding-progress";
import { LIFE_AREA_IDS } from "@/lib/taxonomy";
import { OnboardingTreeBackground } from "@/components/onboarding/onboarding-tree-background";

type SceneHorizonProps = {
  areas: AreaData[];
  unlockedLimbIds: readonly LifeAreaId[];
  onAdvance: (nextScene: OnboardingScene, themeId?: string | null, hubSlug?: string | null) => void;
  onComplete: () => void;
  pending: boolean;
};

/**
 * Scene 6 — The map is alive.
 * Shows the real tree with the first pursuit visible. Two exit paths: add more or finish.
 */
export function SceneHorizon({
  areas,
  unlockedLimbIds,
  onAdvance,
  onComplete,
  pending,
}: SceneHorizonProps) {
  const dormantLimbIds = LIFE_AREA_IDS.filter(
    (id) => !unlockedLimbIds.includes(id),
  ) as readonly LifeAreaId[];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        overflow: "hidden",
      }}
    >
      {/* Live tree — non-interactive backdrop showing the new pursuit */}
      <OnboardingTreeBackground
        areas={areas}
        dormantLimbIds={dormantLimbIds}
        unlockedLimbIds={unlockedLimbIds}
        nonInteractive
      />

      {/* Centred overlay with text and action buttons */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 24px",
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: 440,
            width: "100%",
            textAlign: "center",
            background: "rgba(7, 6, 10, 0.72)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderRadius: 20,
            border: "1px solid rgba(255,255,255,0.08)",
            padding: "36px 32px 32px",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "clamp(22px, 5vw, 28px)",
              fontWeight: 600,
              color: "rgba(245, 243, 250, 0.94)",
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
            }}
          >
            Your map has started.
          </p>
          <p
            style={{
              margin: "14px 0 0",
              fontSize: "clamp(13px, 2.5vw, 15px)",
              lineHeight: 1.65,
              color: "rgba(245, 243, 250, 0.52)",
            }}
          >
            Come back whenever something happens, changes, or you want to think it through.
          </p>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              marginTop: 28,
            }}
          >
            <button
              type="button"
              disabled={pending}
              onClick={onComplete}
              style={{
                width: "100%",
                padding: "13px 20px",
                background: "#EF9F27",
                color: "#07060A",
                border: "none",
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 600,
                cursor: pending ? "wait" : "pointer",
                opacity: pending ? 0.6 : 1,
                letterSpacing: "0.01em",
              }}
            >
              {pending ? "…" : "I'm done for now"}
            </button>

            <button
              type="button"
              disabled={pending}
              onClick={() => onAdvance(2, null, null)}
              style={{
                width: "100%",
                padding: "12px 20px",
                background: "transparent",
                color: "rgba(245, 243, 250, 0.62)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 12,
                fontSize: 14,
                cursor: pending ? "wait" : "pointer",
                opacity: pending ? 0.5 : 1,
              }}
            >
              Add another area
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
