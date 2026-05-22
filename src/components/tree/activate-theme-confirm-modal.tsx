"use client";

import { getLifeArea } from "@/lib/life-areas";
import { TREE_THEME_SHORT_LABEL } from "@/components/tree/tree-design-visual";
import type { LifeAreaId } from "@/lib/types";

type ActivateThemeConfirmModalProps = {
  open: boolean;
  limbId: LifeAreaId | null;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
};

export function ActivateThemeConfirmModal({
  open,
  limbId,
  onConfirm,
  onCancel,
  busy = false,
}: ActivateThemeConfirmModalProps) {
  if (!open || !limbId) return null;

  const lifeArea = getLifeArea(limbId);
  const shortLabel = TREE_THEME_SHORT_LABEL[limbId] ?? lifeArea?.label ?? limbId;
  const accent = lifeArea?.color ?? "#7B68C8";

  return (
    <div
      className="fixed inset-0 z-[230] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="activate-theme-title"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl border border-white/10 bg-[#141414] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="activate-theme-title" className="text-lg font-semibold text-white">
          Add {shortLabel} to your map?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          This puts the <span style={{ color: accent }}>{lifeArea?.label ?? shortLabel}</span> theme on your
          life tree. Hubs like Income or Career stay closed until you choose to open them — they will not all
          appear at once.
        </p>
        <p className="mt-3 text-sm text-zinc-500">
          After you confirm, pick which hub to open first from the panel, or use Stream when you are ready.
        </p>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={busy}
            className="flex-1 rounded-lg border border-white/10 px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5 disabled:opacity-50"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            className="flex-1 rounded-lg px-3 py-2.5 text-sm font-semibold text-[#0c0a09] disabled:opacity-50"
            style={{ background: accent }}
            onClick={onConfirm}
          >
            {busy ? "Adding…" : "Add to map"}
          </button>
        </div>
      </div>
    </div>
  );
}
