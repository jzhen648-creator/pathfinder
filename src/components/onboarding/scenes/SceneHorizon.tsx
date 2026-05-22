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
 * Shows the real tree with the first pursuit visible. Encourages adding more.
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
      {/* Live tree — shows the new pursuit in context */}
      <OnboardingTreeBackground
        areas={areas}
        dormantLimbIds={dormantLimbIds}
        unlockedLimbIds={unlockedLimbIds}
        nonInteractive
      />

      {/* Soft vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at center, transparent 40%, rgba(7,6,10,0.50) 100%)",
          zIndex: 1,
          pointerEvents: "none",
        }}
      />

      {/* Overlay card */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-end",
          padding: "0 24px 48px",
        }}
      >
        <div
          style={{
            maxWidth: 440,
            width: "100%",
            textAlign: "center",
            background: "rgba(7, 6, 10, 0.80)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderRadius: 20,
            border: "1px solid rgba(255,255,255,0.08)",
            padding: "28px 28px 24px",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "clamp(20px, 4.5vw, 26px)",
              fontWeight: 600,
              color: "rgba(245, 243, 250, 0.95)",
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
            }}
          >
            Your map has started.
          </p>
          <p
            style={{
              margin: "12px 0 0",
              fontSize: "clamp(13px, 2.5vw, 14px)",
              lineHeight: 1.65,
              color: "rgba(245, 243, 250, 0.50)",
            }}
          >
            Come back whenever something changes — a decision, a milestone, a setback. Just open Stream and talk.
          </p>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginTop: 24,
            }}
          >
            {/* Primary: keep going on the same hub */}
            <button
              type="button"
              disabled={pending}
              onClick={() => onAdvance(2, null, null)}
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
              {pending ? "…" : "What else is on your mind?"}
            </button>

            {/* Secondary: finish for now */}
            <button
              type="button"
              disabled={pending}
              onClick={onComplete}
              style={{
                width: "100%",
                padding: "12px 20px",
                background: "transparent",
                color: "rgba(245, 243, 250, 0.55)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 12,
                fontSize: 14,
                cursor: pending ? "wait" : "pointer",
                opacity: pending ? 0.5 : 1,
              }}
            >
              I&apos;m done for now — take me to my map
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
