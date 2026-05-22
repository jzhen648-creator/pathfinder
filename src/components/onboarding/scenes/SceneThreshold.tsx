"use client";

import type { OnboardingScene } from "@/lib/onboarding-progress";

const THRESHOLD_CSS = `
@keyframes obFadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.ob-threshold-text {
  animation: obFadeIn 800ms ease forwards;
  opacity: 0;
}
.ob-threshold-btn {
  animation: obFadeIn 400ms ease forwards;
  animation-delay: 1200ms;
  opacity: 0;
  animation-fill-mode: forwards;
}
`;

type SceneThresholdProps = {
  onAdvance: (nextScene: OnboardingScene) => void;
  pending: boolean;
};

export function SceneThreshold({ onAdvance, pending }: SceneThresholdProps) {
  return (
    <section
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#07060a",
        padding: "0 24px",
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: THRESHOLD_CSS }} />

      <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
        <p
          className="ob-threshold-text"
          style={{
            margin: 0,
            fontSize: "clamp(18px, 4vw, 24px)",
            lineHeight: 1.55,
            color: "rgba(245, 243, 250, 0.88)",
            fontFamily: "'Lora', Georgia, serif",
            fontStyle: "italic",
          }}
        >
          In a few minutes, we&apos;ll turn one thing on your mind into the start of your life map.
        </p>

        <div className="ob-threshold-btn" style={{ marginTop: 40 }}>
          <button
            type="button"
            disabled={pending}
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
              cursor: pending ? "wait" : "pointer",
              opacity: pending ? 0.6 : 1,
              letterSpacing: "0.02em",
            }}
          >
            {pending ? "…" : "I'm ready"}
          </button>
        </div>
      </div>
    </section>
  );
}
