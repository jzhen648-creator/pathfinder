"use client";

import type { AreaData } from "@/components/tree/tree-types";
import type { OnboardingScene } from "@/lib/onboarding-progress";
import { LIFE_AREA_IDS } from "@/lib/taxonomy";
import { OnboardingTreeBackground } from "@/components/onboarding/onboarding-tree-background";

const THRESHOLD_CSS = `
@keyframes obFadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.ob-threshold-text {
  animation: obFadeIn 900ms ease forwards;
  opacity: 0;
}
.ob-threshold-btn {
  animation: obFadeIn 400ms ease forwards;
  animation-delay: 1300ms;
  opacity: 0;
  animation-fill-mode: forwards;
}
`;

type SceneThresholdProps = {
  syntheticAreas: AreaData[];
  onAdvance: (nextScene: OnboardingScene) => void;
};

export function SceneThreshold({ syntheticAreas, onAdvance }: SceneThresholdProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        overflow: "hidden",
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: THRESHOLD_CSS }} />

      {/* Dormant tree breathing in the background */}
      <OnboardingTreeBackground
        areas={syntheticAreas}
        dormantLimbIds={LIFE_AREA_IDS}
        unlockedLimbIds={[]}
        nonInteractive
      />

      {/* Dark gradient so text stays readable */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at center, rgba(7,6,10,0.72) 30%, rgba(7,6,10,0.40) 100%)",
          zIndex: 1,
          pointerEvents: "none",
        }}
      />

      {/* Centred framing text */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 24px",
        }}
      >
        <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
          <p
            className="ob-threshold-text"
            style={{
              margin: 0,
              fontSize: "clamp(18px, 4vw, 24px)",
              lineHeight: 1.55,
              color: "rgba(245, 243, 250, 0.92)",
              fontFamily: "'Lora', Georgia, serif",
              fontStyle: "italic",
            }}
          >
            In a few minutes, we&apos;ll turn one thing on your mind into the start of your life map.
          </p>

          <div className="ob-threshold-btn" style={{ marginTop: 40 }}>
            <button
              type="button"
              onClick={() => onAdvance(2)}
              style={{
                display: "inline-block",
                background: "#EF9F27",
                color: "#07060A",
                border: "none",
                borderRadius: 12,
                padding: "13px 40px",
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                letterSpacing: "0.02em",
              }}
            >
              I&apos;m ready
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
