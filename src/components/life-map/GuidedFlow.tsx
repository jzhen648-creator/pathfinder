"use client";

import { memo, useCallback, useMemo, useState } from "react";

type GuidedFlowProps = {
  isOpen: boolean;
  branch: string | null;
  onClose: () => void;
  onComplete: (value: { label: string; description: string }) => void;
  parentContext?: unknown;
  insertContext?: {
    branchId: string;
    insertIndex: number;
    prevMomentId: string | null;
    nextMomentId: string | null;
  } | null;
};

function extractLabel(text: string): string {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 5) return trimmed;
  return words.slice(0, 5).join(" ");
}

export const GuidedFlow = memo(function GuidedFlow({
  isOpen,
  branch,
  onClose,
  onComplete,
}: GuidedFlowProps) {
  const [draft, setDraft] = useState("");
  const wordCount = useMemo(
    () => (draft.trim() ? draft.trim().split(/\s+/).length : 0),
    [draft],
  );
  const handleClose = useCallback(() => {
    setDraft("");
    onClose();
  }, [onClose]);
  const handleComplete = useCallback(() => {
    const inputText = draft.trim();
    if (!inputText) return;
    onComplete({
      label: extractLabel(inputText) || `My ${branch ?? "Life"} Story`,
      description: inputText,
    });
    setDraft("");
  }, [branch, draft, onComplete]);

  if (!isOpen) return null;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Tell your story..."
        rows={6}
      />
      <div style={{ fontSize: 12, opacity: 0.7 }}>{wordCount} words</div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={handleClose}>
          Close
        </button>
        <button type="button" onClick={handleComplete} disabled={!draft.trim()}>
          Map my story
        </button>
      </div>
    </div>
  );
});
