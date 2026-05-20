"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import type { LifeAreaId } from "@/lib/types";
import { OnboardingLimbCard } from "./onboarding-limb-card";
import { ONBOARDING_LIMB_OPTIONS } from "./onboarding-limbs";

export function OnboardingFlow() {
  const router = useRouter();
  const { update: refreshSession } = useSession();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [selectedLimbIds, setSelectedLimbIds] = useState<LifeAreaId[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const canContinueStep1 = trimmedName.length > 0;
  const selectedCount = selectedLimbIds.length;
  const canFinish = selectedCount >= 2;
  const limbsNeeded = Math.max(0, 2 - selectedCount);

  function toggleLimb(limbId: LifeAreaId) {
    setSelectedLimbIds((prev) =>
      prev.includes(limbId) ? prev.filter((id) => id !== limbId) : [...prev, limbId],
    );
  }

  async function finish() {
    setError(null);
    setIsSaving(true);
    try {
      const response = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          activeLimbIds: selectedLimbIds,
          confirm: true,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not finish setup.");
        setIsSaving(false);
        return;
      }
      await refreshSession();
      router.push("/tree");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setIsSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      {step === 1 ? (
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-sm text-zinc-300">
              Your life, mapped. Talk freely — I&apos;ll find the structure.
            </p>
            <h1 className="text-2xl font-semibold text-white">What should we call you?</h1>
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            autoComplete="given-name"
            className="w-full rounded-xl border border-white/10 bg-[#151515] px-4 py-3 text-base text-zinc-100 outline-none ring-[#EF9F27]/40 transition focus:ring"
            onKeyDown={(e) => {
              if (e.key === "Enter" && canContinueStep1) setStep(2);
            }}
          />
          <button
            type="button"
            disabled={!canContinueStep1}
            onClick={() => setStep(2)}
            className="w-full rounded-xl bg-[#EF9F27] px-4 py-3 text-sm font-semibold text-[#07060A] transition hover:bg-[#f5b34d] disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-white">
              Which parts of your life matter most right now?
            </h1>
            <p className="text-sm text-zinc-400">
              Pick at least 2. You can turn on the others later from your tree.
            </p>
          </div>
          <p
            className={`text-sm font-medium ${canFinish ? "text-emerald-400" : "text-zinc-300"}`}
            aria-live="polite"
          >
            {canFinish
              ? `${selectedCount} selected — you’re good to go`
              : selectedCount === 0
                ? "Select 2 areas to continue"
                : `${selectedCount} selected — pick ${limbsNeeded} more`}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {ONBOARDING_LIMB_OPTIONS.map((limb) => (
              <OnboardingLimbCard
                key={limb.id}
                limb={limb}
                selected={selectedLimbIds.includes(limb.id)}
                onToggle={() => toggleLimb(limb.id)}
              />
            ))}
          </div>
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep(1);
              }}
              className="rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-300 transition hover:border-white/20 hover:text-white"
            >
              Back
            </button>
            <button
              type="button"
              disabled={!canFinish || isSaving}
              onClick={() => void finish()}
              className="flex-1 rounded-xl bg-[#EF9F27] px-4 py-3 text-sm font-semibold text-[#07060A] transition hover:bg-[#f5b34d] disabled:opacity-50"
            >
              {isSaving ? "Setting up…" : "Let's go"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
