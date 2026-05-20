"use client";

import { useState } from "react";
import { LIFE_AREAS } from "@/lib/life-areas";
import type { LifeAreaId } from "@/lib/types";

type AddAreaModalProps = {
  open: boolean;
  dormantLimbIds: LifeAreaId[];
  onClose: () => void;
  onActivated: () => void;
};

export function AddAreaModal({
  open,
  dormantLimbIds,
  onClose,
  onActivated,
}: AddAreaModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<LifeAreaId | null>(null);

  const options = LIFE_AREAS.filter((area) => dormantLimbIds.includes(area.id));

  if (!open) return null;

  async function activateLimb(limbId: LifeAreaId) {
    setError(null);
    setActivatingId(limbId);
    try {
      const res = await fetch("/api/branches/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limbIds: [limbId] }),
      });
      const data = (await res.json()) as { error?: string; activated?: number };
      if (!res.ok) {
        setError(data.error ?? "Could not add this area.");
        return;
      }
      if ((data.activated ?? 0) === 0) {
        setError("No hubs were found for this area. Try refreshing the page.");
        return;
      }
      onActivated();
      onClose();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setActivatingId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Add another life area"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-white/10 bg-[#141414] p-5 shadow-xl"
        onClick={(event: React.MouseEvent) => event.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-white">Add another area</h2>
        <p className="mt-1 text-sm text-zinc-400">Choose a theme to show on your tree.</p>

        {options.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">All themes are already on your tree.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {options.map((area) => (
              <li key={area.id}>
                <button
                  type="button"
                  disabled={activatingId !== null}
                  className="w-full rounded-lg border border-white/10 bg-[#151515] px-3 py-2.5 text-left text-sm text-zinc-200 transition hover:border-indigo-400/40 hover:bg-indigo-500/10 disabled:opacity-50"
                  onClick={() => void activateLimb(area.id)}
                >
                  <span className="font-medium">{area.label}</span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    {activatingId === area.id ? "Adding…" : area.sublabel}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}

        <button
          type="button"
          className="mt-4 w-full rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
