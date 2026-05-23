"use client";

import { startTransition, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { AreaData } from "@/components/tree/tree-types";
import type { LifeAreaId } from "@/lib/types";
import type { OnboardingProgress, OnboardingScene } from "@/lib/onboarding-progress";
import { useBackgroundMapPrefetch } from "@/hooks/use-background-map-prefetch";
import { ONBOARDING_SCENE_ENTER_CSS } from "./onboarding-scene-motion";
import { ONBOARDING_UI_CSS } from "./onboarding-ui";
import { SceneHorizon } from "./scenes/SceneHorizon";
import { SceneHubPick } from "./scenes/SceneHubPick";
import { SceneStream } from "./scenes/SceneStream";
import { SceneThemePick } from "./scenes/SceneThemePick";
import { SceneThreshold } from "./scenes/SceneThreshold";

export type OnboardingHubOption = {
  id: string;
  limbId: string;
  label: string;
  slug: string;
};

type OnboardingSceneRouterProps = {
  initialProgress: OnboardingProgress;
  hubs: OnboardingHubOption[];
  syntheticAreas: AreaData[];
  activeAreas: AreaData[];
  unlockedLimbIds: readonly LifeAreaId[];
  /** Called when onboarding completes — dismiss overlay in-place (no navigation). */
  onDismiss?: () => void;
};


export function OnboardingSceneRouter({
  initialProgress,
  hubs,
  syntheticAreas,
  activeAreas,
  unlockedLimbIds,
  onDismiss,
}: OnboardingSceneRouterProps) {
  const router = useRouter();
  const { update: refreshSession } = useSession();
  const prefetchMapData = useBackgroundMapPrefetch();
  const [progress, setProgress] = useState<OnboardingProgress>(initialProgress);
  const progressRef = useRef(initialProgress);
  progressRef.current = progress;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prefetchOnboardingData = () => {
    prefetchMapData();
    startTransition(() => {
      router.refresh();
    });
  };

  async function onAdvance(
    nextScene: OnboardingScene,
    themeId?: string | null,
    hubSlug?: string | null,
  ) {
    setError(null);
    const previous = progressRef.current;
    const nextProgress: OnboardingProgress = {
      scene: nextScene,
      themeId: themeId !== undefined ? themeId : previous.themeId,
      hubSlug: hubSlug !== undefined ? hubSlug : previous.hubSlug,
    };

    setProgress(nextProgress);

    if (nextScene === 6) {
      prefetchOnboardingData();
    }

    try {
      const payload: {
        scene: number;
        themeId?: string | null;
        hubSlug?: string | null;
      } = { scene: nextScene };
      if (themeId !== undefined) payload.themeId = themeId;
      if (hubSlug !== undefined) payload.hubSlug = hubSlug;

      const response = await fetch("/api/onboarding/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setProgress(previous);
        setError(data.error ?? "Could not save onboarding progress.");
        return;
      }

      if (nextScene !== 4 && nextScene !== 6) {
        prefetchOnboardingData();
      }
    } catch {
      setProgress(previous);
      setError("Something went wrong. Please try again.");
    }
  }

  async function onComplete() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complete: true }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not complete onboarding.");
        return;
      }

      await refreshSession();
      prefetchMapData();
      if (onDismiss) {
        onDismiss();
      } else {
        router.push("/tree");
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }


  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ONBOARDING_SCENE_ENTER_CSS + ONBOARDING_UI_CSS }} />
      {/* Fullscreen scenes — all scenes escape card layout */}
      {progress.scene === 4 ? (
        <div key="scene-4" className="ob-scene-enter">
          <SceneStream
            themeId={progress.themeId}
            hubSlug={progress.hubSlug}
            hubs={hubs}
            syntheticAreas={syntheticAreas}
            unlockedLimbIds={unlockedLimbIds}
            onAdvance={onAdvance}
            prefetchOnboardingData={prefetchOnboardingData}
          />
        </div>
      ) : null}

      {progress.scene === 1 ? (
        <div key="scene-1" className="ob-scene-enter">
          <SceneThreshold
            syntheticAreas={syntheticAreas}
            onAdvance={onAdvance}
          />
        </div>
      ) : null}
      {progress.scene === 2 ? (
        <div key="scene-2" className="ob-scene-enter">
          <SceneThemePick
            areas={syntheticAreas}
            hubs={hubs}
            onAdvance={onAdvance}
          />
        </div>
      ) : null}
      {progress.scene === 3 ? (
        <div key="scene-3" className="ob-scene-enter">
          <SceneHubPick
            themeId={progress.themeId}
            allHubs={hubs}
            syntheticAreas={syntheticAreas}
            onAdvance={onAdvance}
          />
        </div>
      ) : null}
      {progress.scene === 6 ? (
        <div key="scene-6" className="ob-scene-enter">
          <SceneHorizon
            areas={activeAreas}
            unlockedLimbIds={unlockedLimbIds}
            themeId={progress.themeId}
            hubBranchId={
              progress.themeId && progress.hubSlug
                ? (hubs.find((h) => h.limbId === progress.themeId && h.slug === progress.hubSlug)?.id ??
                  null)
                : null
            }
            onAdvance={onAdvance}
            onComplete={onComplete}
            pending={pending}
          />
        </div>
      ) : null}
      {error ? <p className="fixed bottom-4 left-1/2 -translate-x-1/2 text-sm text-rose-400">{error}</p> : null}
    </>
  );
}
