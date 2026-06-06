"use client";



import { useMemo, useState } from "react";

import type { AreaData } from "@/components/tree/tree-types";

import type { LifeAreaId } from "@/lib/types";

import type { OnboardingScene } from "@/lib/onboarding-progress";

import { LIFE_AREA_IDS } from "@/lib/taxonomy";

import { LIFE_AREAS } from "@/lib/life-areas";

import { themePanelCopy } from "@/lib/theme-catalog";

import { hubPanelCopy } from "@/lib/hub-catalog";

import { OnboardingTreeBackground } from "@/components/onboarding/onboarding-tree-background";

import {

  OB_FONT_SERIF,

  OB_TEXT_MUTED,

  OB_TEXT_PRIMARY,

  OB_TEXT_SECONDARY,

  OB_VIGNETTE,

  obCardStyle,

  obPrimaryButtonStyle,

  obSecondaryButtonStyle,

} from "@/components/onboarding/onboarding-ui";

import type { OnboardingHubOption } from "../onboarding-scene-router";



const THEME_INTRO_CSS = `

@keyframes obSlideUp {

  from { opacity: 0; transform: translateY(12px); }

  to   { opacity: 1; transform: translateY(0); }

}

.ob-theme-intro { animation: obSlideUp 320ms ease forwards; }

`;



type SceneThemePickProps = {

  areas: AreaData[];

  hubs: OnboardingHubOption[];

  onAdvance: (nextScene: OnboardingScene, themeId?: string | null, hubSlug?: string | null) => void;

};



/**

 * Scene 2 — Walk through each theme, then hand off to the combined theme + track picker (scene 3).

 */

export function SceneThemePick({ areas, hubs, onAdvance }: SceneThemePickProps) {

  const [introIdx, setIntroIdx] = useState(0);



  const currentTheme = LIFE_AREAS[introIdx];

  const catalog = currentTheme ? themePanelCopy(currentTheme.id) : null;

  const introThemeId = currentTheme ? (currentTheme.id as LifeAreaId) : null;



  const themeHubs = useMemo(

    () => (introThemeId ? hubs.filter((h) => h.limbId === introThemeId) : []),

    [hubs, introThemeId],

  );



  const dormantForIntro = useMemo(

    () => (introThemeId ? LIFE_AREA_IDS.filter((id) => id !== introThemeId) : LIFE_AREA_IDS),

    [introThemeId],

  );



  function goToTrackPicker(themeId: LifeAreaId | null) {

    onAdvance(3, themeId, null);

  }



  function advanceIntro() {

    if (introIdx < LIFE_AREAS.length - 1) {

      setIntroIdx((i) => i + 1);

    } else {

      goToTrackPicker(null);

    }

  }



  return (

    <div style={{ position: "fixed", inset: 0, zIndex: 50, overflow: "hidden" }}>

      <style dangerouslySetInnerHTML={{ __html: THEME_INTRO_CSS }} />



      <OnboardingTreeBackground

        areas={areas}

        dormantLimbIds={dormantForIntro}

        unlockedLimbIds={introThemeId ? [introThemeId] : []}

        focusedLimbId={introThemeId}

        initialFitAreaIds={introThemeId ? [introThemeId] : undefined}

        onAreaClick={() => goToTrackPicker(null)}

      />



      <div

        style={{

          position: "absolute",

          inset: 0,

          background: OB_VIGNETTE,

          zIndex: 1,

          pointerEvents: "none",

        }}

      />



      {currentTheme && catalog ? (

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

              ...obCardStyle,

              pointerEvents: "auto",

              maxWidth: 440,

              width: "100%",

              padding: "28px 28px 24px",

              boxShadow: `inset 3px 0 0 ${currentTheme.color}`,

            }}

          >

            <div style={{ display: "flex", gap: 5, marginBottom: 16, justifyContent: "center" }}>

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

                margin: "0 0 4px",

                fontSize: "clamp(20px, 4vw, 24px)",

                fontWeight: 600,

                color: OB_TEXT_PRIMARY,

                letterSpacing: "-0.02em",

                lineHeight: 1.2,

              }}

            >

              {currentTheme.label}

            </p>

            <p

              style={{

                margin: "0 0 16px",

                fontSize: "clamp(15px, 3vw, 17px)",

                lineHeight: 1.65,

                color: OB_TEXT_SECONDARY,

                fontFamily: OB_FONT_SERIF,

                fontStyle: "italic",

              }}

            >

              {catalog.vision}

            </p>



            {themeHubs.length > 0 ? (

              <div style={{ marginBottom: 20 }}>

                <p

                  style={{

                    margin: "0 0 8px",

                    fontSize: 11,

                    fontWeight: 600,

                    letterSpacing: "0.06em",

                    textTransform: "uppercase",

                    color: OB_TEXT_MUTED,

                  }}

                >

                  Tracks inside this theme

                </p>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>

                  {themeHubs.map((hub) => {

                    const hubCopy = hubPanelCopy(hub.limbId, hub.label);

                    const hint = hubCopy.about.split(".")[0] + ".";

                    return (

                      <span

                        key={hub.id}

                        title={hint}

                        style={{

                          fontSize: 12,

                          fontWeight: 500,

                          color: "rgba(245,243,250,0.88)",

                          background: `${currentTheme.color}18`,

                          border: `1px solid ${currentTheme.color}35`,

                          borderRadius: 8,

                          padding: "5px 10px",

                          lineHeight: 1.3,

                        }}

                      >

                        {hub.label}

                      </span>

                    );

                  })}

                </div>

              </div>

            ) : null}



            <div style={{ display: "flex", gap: 8 }}>

              <button

                type="button"

                onClick={() => goToTrackPicker(currentTheme.id as LifeAreaId)}

                style={{

                  ...obPrimaryButtonStyle,

                  flex: 1,

                  padding: "13px 0",

                }}

              >

                Start here

              </button>

              <button

                type="button"

                onClick={advanceIntro}

                style={{

                  ...obSecondaryButtonStyle,

                  flex: 1,

                  padding: "12px 0",

                }}

              >

                {introIdx < LIFE_AREAS.length - 1 ? "Next →" : "See all →"}

              </button>

            </div>

          </div>

        </div>

      ) : null}

    </div>

  );

}


