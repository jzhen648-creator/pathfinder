"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { AreaData } from "@/components/tree/tree-types";
import type { LifeAreaId } from "@/lib/types";
import type { OnboardingProgress, OnboardingScene } from "@/lib/onboarding-progress";
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
};

/** Scenes that escape the card layout and take over the viewport. */
function isFullscreenScene(scene: OnboardingScene): boolean {
  return scene === 1 || scene === 2 || scene === 3 || scene === 6;
}

export function OnboardingSceneRouter({
  initialProgress,
  hubs,
  syntheticAreas,
  activeAreas,
  unlockedLimbIds,
}: OnboardingSceneRouterProps) {
  const router = useRouter();
  const { update: refreshSession } = useSession();
  const [progress, setProgress] = useState<OnboardingProgress>(initialProgress);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedThemeHubs = useMemo(
    () => hubs.filter((hub) => hub.limbId === progress.themeId),
    [hubs, progress.themeId],
  );

  async function onAdvance(
    nextScene: OnboardingScene,
    themeId?: string | null,
    hubSlug?: string | null,
  ) {
    setPending(true);
    setError(null);
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
        setError(data.error ?? "Could not save onboarding progress.");
        return;
      }

      setProgress((current) => ({
        scene: nextScene,
        themeId: themeId !== undefined ? themeId : current.themeId,
        hubSlug: hubSlug !== undefined ? hubSlug : current.hubSlug,
      }));
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
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
      router.push("/tree");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  // Fullscreen scenes (2, 6) render fixed-position content that escapes the card container.
  // Card scenes (1, 3, 4, 5) render inside the centered max-w-2xl wrapper.
  const fullscreen = isFullscreenScene(progress.scene);

  return (
    <>
      {/* Fullscreen scenes — all scenes escape card layout */}
      {progress.scene === 4 ? (
        <div className="mx-auto w-full max-w-2xl px-4 py-10">
          <SceneStream
            themeId={progress.themeId}
            hubSlug={progress.hubSlug}
            hubs={hubs}
            onAdvance={onAdvance}
            pending={pending}
          />
          {error ? <p className="mt-5 text-sm text-rose-400">{error}</p> : null}
        </div>
      ) : null}

      {progress.scene === 1 ? (
        <SceneThreshold
          syntheticAreas={syntheticAreas}
          onAdvance={onAdvance}
          pending={pending}
        />
      ) : null}
      {progress.scene === 2 ? (
        <SceneThemePick areas={syntheticAreas} onAdvance={onAdvance} pending={pending} />
      ) : null}
      {progress.scene === 3 ? (
        <SceneHubPick
          themeId={progress.themeId}
          hubs={selectedThemeHubs}
          syntheticAreas={syntheticAreas}
          onAdvance={onAdvance}
          pending={pending}
        />
      ) : null}
      {progress.scene === 6 ? (
        <SceneHorizon
          areas={activeAreas}
          unlockedLimbIds={unlockedLimbIds}
          onAdvance={onAdvance}
          onComplete={onComplete}
          pending={pending}
        />
      ) : null}
      {error && progress.scene !== 4 ? <p className="fixed bottom-4 left-1/2 -translate-x-1/2 text-sm text-rose-400">{error}</p> : null}
    </>
  );
}
