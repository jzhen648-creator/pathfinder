"use client";

import { useState } from "react";
import type { StreamEnrichItemType } from "@/lib/ai/stream-enrich";
import { MARK_TREE_AMBER } from "./tree-view-constants";

export type SparseContextPromptProps = {
  itemType: StreamEnrichItemType;
  itemId: string;
  accentColor?: string;
  onDone: () => void | Promise<void>;
  compact?: boolean;
};

export function SparseContextPrompt({
  itemType,
  itemId,
  accentColor = MARK_TREE_AMBER,
  onDone,
  compact = false,
}: SparseContextPromptProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const additionalContext = text.trim();
    if (!additionalContext) {
      setError("Add a few words about what this means to you.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/stream/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemType, itemId, additionalContext }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(data?.error ?? `Could not enrich (${res.status})`));
        return;
      }
      setOpen(false);
      setText("");
      await onDone();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          border: "none",
          background: "transparent",
          padding: 0,
          fontSize: compact ? 13 : 14,
          fontWeight: 500,
          color: accentColor,
          cursor: "pointer",
          textDecoration: "underline",
          textUnderlineOffset: 3,
          textAlign: "left",
        }}
      >
        Want to add more context?
      </button>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8, marginTop: compact ? 4 : 8 }}>
      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: "var(--color-text-tertiary, #8a8680)",
          lineHeight: 1.4,
        }}
      >
        What happened, or what does this mean to you?
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
        rows={compact ? 3 : 4}
        placeholder="A few sentences is enough…"
        autoFocus
        style={{
          width: "100%",
          resize: "vertical",
          minHeight: compact ? 72 : 88,
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid var(--color-border-secondary, rgba(255,255,255,0.12))",
          background: "var(--color-background-primary, #121210)",
          color: "var(--color-text-primary, #f0ede6)",
          fontSize: 14,
          lineHeight: 1.45,
          boxSizing: "border-box",
        }}
      />
      {error ? (
        <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-danger, #f87171)" }}>{error}</p>
      ) : null}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setText("");
            setError(null);
          }}
          style={{
            border: "none",
            background: "transparent",
            fontSize: 13,
            color: "var(--color-text-tertiary, #8a8680)",
            cursor: busy ? "wait" : "pointer",
            padding: "6px 0",
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={() => void submit()}
          style={{
            border: "none",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 600,
            background: accentColor,
            color: "#1a1a18",
            cursor: busy || !text.trim() ? "not-allowed" : "pointer",
            opacity: busy || !text.trim() ? 0.55 : 1,
          }}
        >
          {busy ? "Saving…" : "Save context"}
        </button>
      </div>
    </div>
  );
}
