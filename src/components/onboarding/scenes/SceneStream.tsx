"use client";



import { useMemo, useState } from "react";

import { StreamOverlay } from "@/components/stream/stream-overlay";

import { buildPreviewAreasFromNodes } from "@/components/stream/stream-hub-preview-data";

import { StreamPreviewProvider, useStreamPreview } from "@/contexts/stream-preview-context";

import { OnboardingTreeBackground } from "@/components/onboarding/onboarding-tree-background";

import {

  obBackButtonStyle,

} from "@/components/onboarding/onboarding-ui";

import { canonicalHubDisplayLabel, hubFirstTimeQuestion } from "@/lib/category-catalog";

import { getLifeArea } from "@/lib/life-areas";

import { LIFE_AREA_IDS } from "@/lib/taxonomy";

import type { LifeAreaId } from "@/lib/types";

import type { OnboardingScene } from "@/lib/onboarding-progress";

import type { StreamHubUiContext } from "@/types/stream";

import type { AreaData } from "@/components/tree/tree-types";

import type { OnboardingHubOption } from "../onboarding-scene-router";



type SceneStreamProps = {

  themeId: string | null;

  hubSlug: string | null;

  hubs: OnboardingHubOption[];

  syntheticAreas: AreaData[];

  unlockedLimbIds: readonly LifeAreaId[];

  onAdvance: (

    nextScene: OnboardingScene,

    themeId?: string | null,

    hubSlug?: string | null,

  ) => void;

  prefetchOnboardingData: () => void;

};



function SceneStreamInner({

  themeId,

  hubSlug,

  hubs,

  syntheticAreas,

  onAdvance,

  prefetchOnboardingData,

}: SceneStreamProps) {

  const { previewNodes, pendingPreviewNode } = useStreamPreview();



  const selectedHub = useMemo(

    () =>

      themeId && hubSlug

        ? hubs.find((h) => h.limbId === themeId && h.slug === hubSlug) ?? null

        : null,

    [hubs, hubSlug, themeId],

  );



  const hubUi: StreamHubUiContext | null = useMemo(() => {

    if (!selectedHub || !themeId) return null;

    const lifeArea = getLifeArea(themeId as LifeAreaId);

    const branchLabel = canonicalHubDisplayLabel(themeId, selectedHub.label);

    return {

      branchId: selectedHub.id,

      areaId: themeId,

      branchLabel,

      areaLabel: lifeArea?.label ?? themeId,

      areaColor: lifeArea?.color ?? "#7B68C8",

      hubSlug: selectedHub.slug,

      existingGoals: [],

    };

  }, [selectedHub, themeId]);



  const onboardingQuestion =

    themeId && selectedHub

      ? hubFirstTimeQuestion(themeId, selectedHub.label)

      : "What's on your mind right now?";



  const previewNodesForTree = useMemo(() => {

    if (!pendingPreviewNode) return previewNodes;

    const withoutPending = previewNodes.filter((n) => n.id !== pendingPreviewNode.id);

    return [...withoutPending, pendingPreviewNode];

  }, [previewNodes, pendingPreviewNode]);



  const previewAreas = useMemo(

    () => buildPreviewAreasFromNodes(syntheticAreas, previewNodesForTree),

    [syntheticAreas, previewNodesForTree],

  );



  const [streamPanFocus, setStreamPanFocus] = useState<{

    areaId: string;

    branchId: string;

    key: number;

  } | null>(null);



  const handleBack = () => {

    onAdvance(3, themeId, null);

  };



  if (!hubUi) {

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

            Pick a track first, then come back to talk.

          </p>

          <button type="button" onClick={() => onAdvance(3, null, null)} style={obBackButtonStyle}>

            ← Back to tracks

          </button>

        </div>

      </div>

    );

  }



  return (

    <div style={{ position: "fixed", inset: 0, zIndex: 50, overflow: "hidden", background: "#07060a" }}>

      <div

        style={{

          position: "absolute",

          top: 0,

          left: 0,

          right: 0,

          bottom: 0,

          zIndex: 0,

        }}

      >

        <OnboardingTreeBackground

          areas={syntheticAreas}

          previewAreas={previewAreas.length > 0 ? previewAreas : undefined}

          dormantLimbIds={[]}

          unlockedLimbIds={LIFE_AREA_IDS as readonly LifeAreaId[]}

          nonInteractive

          streamPanFocus={streamPanFocus}

        />

      </div>



      <button
        type="button"
        onClick={handleBack}
        style={{
          ...obBackButtonStyle,
          position: "fixed",
          top: 24,
          left: 24,
          zIndex: 200001,
          pointerEvents: "auto",
        }}
      >
        ← Different track
      </button>

      <StreamOverlay
        mode="hub"
        hub={hubUi}
        onboardingMode
        onboardingQuestion={onboardingQuestion}
        onClose={handleBack}
        onCommitted={() => {}}
        onCardFocusHub={(areaId, branchId) => {
          setStreamPanFocus({ areaId, branchId, key: Date.now() });
        }}
        onOnboardingCommitSuccess={prefetchOnboardingData}
        onOnboardingFirstCardConfirmed={() => onAdvance(6)}
      />



      {process.env.NODE_ENV === "development" ? (

        <button

          type="button"

          onClick={() => onAdvance(6)}

          style={{

            position: "fixed",

            right: 22,

            bottom: 22,

            zIndex: 5,

            border: "1px dashed rgba(255,255,255,0.25)",

            background: "rgba(7,6,10,0.72)",

            color: "rgba(245,243,250,0.55)",

            borderRadius: 10,

            padding: "8px 14px",

            fontSize: 12,

            cursor: "pointer",

            pointerEvents: "auto",

          }}

        >

          Skip for now (dev only)

        </button>

      ) : null}

    </div>

  );

}



export function SceneStream(props: SceneStreamProps) {

  return (

    <StreamPreviewProvider>

      <SceneStreamInner {...props} />

    </StreamPreviewProvider>

  );

}
