"use client";

import { useState } from "react";
import type { AreaData } from "@/components/tree/tree-types";
import type { LifeAreaId } from "@/lib/types";
import type { OnboardingScene } from "@/lib/onboarding-progress";
import { LIFE_AREA_IDS } from "@/lib/taxonomy";
import { LIFE_AREAS } from "@/lib/life-areas";
import { themePanelCopy } from "@/lib/theme-catalog";
import { OnboardingTreeBackground } from "@/components/onboarding/onboarding-tree-background";

const THEME_INTRO_CSS = `
@keyframes obSlideUp {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
.ob-theme-intro { animation: obSlideUp 320ms ease forwards; }
`;

type Phase = "intro" | "pick";

type SceneThemePickProps = {
  areas: AreaData[];
  onAdvance: (nextScene: OnboardingScene, themeId?: string | null) => void;
  pending: boolean;
};

/**
 * Scene 2 — Introduce each theme then let the user pick.
 * Phase "intro": card strip briefly presents each theme (name + one-line vision).
 * Phase "pick": tap directly on the tree or on a theme card to select.
 */
export function SceneThemePick({ areas, onAdvance, pending }: SceneThemePickProps) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [introIdx, setIntroIdx] = useState(0);
  const [tappedId, setTappedId] = useState<LifeAreaId | null>(null);

  const currentTheme = LIFE_AREAS[introIdx];
  const catalog = currentTheme ? themePanelCopy(currentTheme.id) : null;

  function handleAreaClick(area: AreaData) {
    if (phase === "intro") {
      setPhase("pick");
      return;
    }
    if (tappedId !== null || pending) return;
    const id = area.id as LifeAreaId;
    setTappedId(id);
    window.setTimeout(() => onAdvance(3, id), 400);
  }

  function advanceIntro() {
    if (introIdx < LIFE_AREAS.length - 1) {
      setIntroIdx((i) => i + 1);
    } else {
      setPhase("pick");
    }
  }

  function selectTheme(id: LifeAreaId) {
    if (tappedId !== null || pending) return;
    setTappedId(id);
    window.setTimeout(() => onAdvance(3, id), 380);
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, overflow: "hidden" }}>
      <style dangerouslySetInnerHTML={{ __html: THEME_INTRO_CSS }} />

      {/* Dormant tree — fills the viewport */}
      <OnboardingTreeBackground
        areas={areas}
        dormantLimbIds={LIFE_AREA_IDS}
        unlockedLimbIds={[]}
        activatingLimbId={tappedId}
        onAreaClick={handleAreaClick}
      />

      {/* ── Intro phase: theme cards ── */}
      {phase === "intro" && currentTheme && catalog ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-end",
            padding: "0 24px 56px",
            pointerEvents: "none",
          }}
        >
          <div
            key={introIdx}
            className="ob-theme-intro"
            style={{
              pointerEvents: "auto",
              maxWidth: 440,
              width: "100%",
              background: "rgba(9,8,14,0.84)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              borderRadius: 18,
              border: `1px solid ${currentTheme.color}40`,
              padding: "22px 22px 18px",
            }}
          >
            {/* Progress dots */}
            <div style={{ display: "flex", gap: 5, marginBottom: 14, justifyContent: "center" }}>
              {LIFE_AREAS.map((_, i) => (
                <span
                  key={i}
                  style={{
                    width: i === introIdx ? 18 : 6,
                    height: 6,
                    borderRadius: 3,
                    background: i === introIdx ? currentTheme.color : "rgba(255,255,255,0.18)",
                    transition: "width 200ms, background 200ms",
                  }}
                />
              ))}
            </div>

            <p
              style={{
                margin: "0 0 6px",
                fontSize: 18,
                fontWeight: 700,
                color: currentTheme.color,
                letterSpacing: "-0.01em",
              }}
            >
              {currentTheme.label}
            </p>
            <p
              style={{
                margin: "0 0 18px",
                fontSize: 13.5,
                lineHeight: 1.55,
                color: "rgba(245,243,250,0.60)",
              }}
            >
              {catalog.vision.split(".")[0]}.
            </p>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => selectTheme(currentTheme.id as LifeAreaId)}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  background: currentTheme.color,
                  color: "#07060A",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 13.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Start here
              </button>
              <button
                type="button"
                onClick={advanceIntro}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(245,243,250,0.72)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 10,
                  fontSize: 13.5,
                  cursor: "pointer",
                }}
              >
                {introIdx < LIFE_AREAS.length - 1 ? "Next →" : "See all →"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Pick phase: floating prompt + theme chips ── */}
      {phase === "pick" ? (
        <div
          style={{
            position: "absolute",
            top: "9%",
            left: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
            padding: "0 24px",
            zIndex: 10,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "clamp(15px, 3vw, 18px)",
              fontWeight: 500,
              color: "rgba(245, 243, 250, 0.90)",
              textAlign: "center",
              letterSpacing: "0.01em",
            }}
          >
            {tappedId ? "Opening…" : "Tap the area that is most on your mind."}
          </p>

          {/* Quick-pick chips as fallback to tapping the tree */}
          {!tappedId ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              {LIFE_AREAS.map((area) => (
                <button
                  key={area.id}
                  type="button"
                  disabled={pending}
                  onClick={() => selectTheme(area.id as LifeAreaId)}
                  style={{
                    background: "rgba(9,8,14,0.72)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    border: `1px solid ${area.color}55`,
                    borderRadius: 999,
                    padding: "6px 14px",
                    fontSize: 13,
                    color: area.color,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  {area.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
