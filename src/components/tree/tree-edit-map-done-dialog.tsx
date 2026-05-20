"use client";

import { useEffect, type MouseEvent } from "react";
import type { EditMapDraftOp } from "./tree-edit-map-draft";

type Props = {
  open: boolean;
  ops: EditMapDraftOp[];
  applying: boolean;
  onApply: () => void;
  onDiscard: () => void;
  onDiscussInStream: () => void;
  onClose: () => void;
};

export function TreeEditMapDoneDialog({
  open,
  ops,
  applying,
  onApply,
  onDiscard,
  onDiscussInStream,
  onClose,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !applying) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applying, onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200000] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      role="presentation"
      onMouseDown={(e: MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && !applying) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-xl border p-5 shadow-xl"
        style={{
          borderColor: "var(--color-border-secondary)",
          background: "var(--color-background-primary)",
          color: "var(--color-text-primary)",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tree-edit-map-done-title"
      >
        <h2 id="tree-edit-map-done-title" className="text-lg font-medium">
          Apply map changes?
        </h2>
        <p className="mt-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
          {ops.length === 1
            ? "One change from this edit session:"
            : `${ops.length} changes from this edit session:`}
        </p>
        <ul
          className="mt-3 max-h-48 list-disc overflow-y-auto pl-5 text-sm"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {ops.map((op, i) => (
            <li key={`${op.goalId}-${i}`} className="mb-1">
              {op.summaryLine}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button
            type="button"
            disabled={applying}
            onClick={onDiscard}
            className="rounded-lg border px-4 py-2 text-sm"
            style={{
              borderColor: "var(--color-border-secondary)",
              color: "var(--color-text-secondary)",
              cursor: applying ? "not-allowed" : "pointer",
              opacity: applying ? 0.6 : 1,
            }}
          >
            Discard
          </button>
          <button
            type="button"
            disabled={applying}
            onClick={onDiscussInStream}
            className="rounded-lg border px-4 py-2 text-sm"
            style={{
              borderColor: "rgba(129, 140, 248, 0.45)",
              background: "rgba(99, 102, 241, 0.12)",
              color: "var(--color-text-primary)",
              cursor: applying ? "wait" : "pointer",
            }}
          >
            Discuss in Stream
          </button>
          <button
            type="button"
            disabled={applying}
            onClick={onApply}
            className="rounded-lg border-0 px-4 py-2 text-sm font-medium"
            style={{
              background: "rgba(99, 102, 241, 0.85)",
              color: "#fff",
              cursor: applying ? "wait" : "pointer",
            }}
          >
            {applying ? "Applying…" : "Apply changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
