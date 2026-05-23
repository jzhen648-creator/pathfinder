"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TreeView } from "@/components/tree/tree-view";
import {
  OnboardingSceneRouter,
  type OnboardingHubOption,
} from "@/components/onboarding/onboarding-scene-router";
import { ONBOARDING_SCENE_EXIT_CSS } from "@/components/onboarding/onboarding-scene-motion";
import type { OnboardingProgress } from "@/lib/onboarding-progress";
import type { AreaData } from "@/components/tree/tree-types";
import type { CoachMarkStep } from "@/components/tree/tree-view-types";
import type { LifeAreaId } from "@/lib/types";
import type { TreeFirstRunConfig } from "@/types/first-run";

export type TreePageShellProps = {
  onboardingCompleted: boolean;
  firstRun: TreeFirstRunConfig;
  onboarding?: {
    initialProgress: OnboardingProgress;
    hubs: OnboardingHubOption[];
    syntheticAreas: AreaData[];
    activeAreas: AreaData[];
    unlockedLimbIds: readonly LifeAreaId[];
  };
};

function coachMarkStepForScene(scene: number): CoachMarkStep {
  if (scene === 2) return "tap_theme";
  if (scene === 3) return "tap_hub";
  if (scene === 4) return "open_stream";
  return null;
}

export function TreePageShell({
  onboardingCompleted,
  firstRun,
  onboarding,
}: TreePageShellProps) {
  const router = useRouter();
  const [overlayVisible, setOverlayVisible] = useState(
    !onboardingCompleted && onboarding != null,
  );
  const [exiting, setExiting] = useState(false);
  const [currentScene, setCurrentScene] = useState(onboarding?.initialProgress.scene ?? 1);
  const onboardingScene = currentScene;
  const isOnboardingGuideActive =
    !onboardingCompleted && overlayVisible && onboardingScene >= 2 && onboardingScene <= 5;
  const showOnboardingSceneOverlay =
    overlayVisible && onboarding != null && !isOnboardingGuideActive;

  useEffect(() => {
    setCurrentScene(onboarding?.initialProgress.scene ?? 1);
  }, [onboarding?.initialProgress.scene]);

  const handleDismiss = () => {
    setExiting(true);
    window.setTimeout(() => {
      setOverlayVisible(false);
      setExiting(false);
      router.refresh();
    }, 400);
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ONBOARDING_SCENE_EXIT_CSS }} />
      <TreeView
        firstRun={firstRun}
        onboardingLocked={overlayVisible}
        isOnboardingGuideActive={isOnboardingGuideActive}
        initialCoachMarkStep={coachMarkStepForScene(onboardingScene)}
      />
      {showOnboardingSceneOverlay ? (
        <div
          className={exiting ? "ob-scene-exit" : undefined}
          style={{ position: "fixed", inset: 0, zIndex: 200, pointerEvents: "auto" }}
        >
          <OnboardingSceneRouter
            initialProgress={onboarding.initialProgress}
            hubs={onboarding.hubs}
            syntheticAreas={onboarding.syntheticAreas}
            activeAreas={onboarding.activeAreas}
            unlockedLimbIds={onboarding.unlockedLimbIds}
            onDismiss={handleDismiss}
            onProgressChange={(nextProgress) => setCurrentScene(nextProgress.scene)}
          />
        </div>
      ) : null}
    </>
  );
}
