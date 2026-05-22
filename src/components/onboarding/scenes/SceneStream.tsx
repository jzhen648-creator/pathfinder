"use client";

import { useMemo } from "react";
import { StreamOverlay } from "@/components/stream/stream-overlay";
import { StreamPreviewProvider } from "@/contexts/stream-preview-context";
import { canonicalHubDisplayLabel, hubFirstTimeQuestion } from "@/lib/hub-catalog";
import { getLifeArea } from "@/lib/life-areas";
import type { LifeAreaId } from "@/lib/types";
import type { OnboardingScene } from "@/lib/onboarding-progress";
import type { StreamHubUiContext } from "@/types/stream";
import type { OnboardingHubOption } from "../onboarding-scene-router";

type SceneStreamProps = {
  themeId: string | null;
  hubSlug: string | null;
  hubs: OnboardingHubOption[];
  onAdvance: (nextScene: OnboardingScene) => void;
  pending: boolean;
};

export function SceneStream({ themeId, hubSlug, hubs, onAdvance, pending }: SceneStreamProps) {
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

  if (!hubUi) {
    return (
      <section className="space-y-6 rounded-2xl border border-white/10 bg-[#151515] p-6">
        <p className="text-sm text-zinc-400">Pick a hub first, then come back to talk.</p>
        <button
          type="button"
          disabled={pending}
          onClick={() => onAdvance(3)}
          className="rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-300 hover:border-white/20 disabled:opacity-50"
        >
          Back to hubs
        </button>
      </section>
    );
  }

  return (
    <section className="w-full max-w-2xl space-y-4">
      <StreamPreviewProvider>
        <StreamOverlay
          embed
          mode="hub"
          hub={hubUi}
          onboardingMode
          onboardingQuestion={onboardingQuestion}
          onClose={() => {}}
          onCommitted={() => {}}
          onOnboardingFirstCardConfirmed={() => onAdvance(6)}
        />
      </StreamPreviewProvider>
      {process.env.NODE_ENV === "development" ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => onAdvance(6)}
          className="w-full rounded-xl border border-dashed border-white/20 px-4 py-3 text-sm text-zinc-500 hover:border-white/35 disabled:opacity-50"
        >
          Skip for now (dev only)
        </button>
      ) : null}
    </section>
  );
}
