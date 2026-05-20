"use client";

import { useEffect, useRef, useState } from "react";
import type { StreamThemeUiContext } from "@/types/stream";

type Props = {
  theme: StreamThemeUiContext;
  hubSlug: string;
  onHubChange: (hubSlug: string) => void;
  disabled?: boolean;
};

export function StreamHubRoutePill({ theme, hubSlug, onHubChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const current = theme.hubs.find((h) => h.hubSlug === hubSlug);
  const label = current?.branchLabel ?? hubSlug;
  const others = theme.hubs.filter((h) => h.hubSlug !== hubSlug);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc, true);
    return () => document.removeEventListener("mousedown", onDoc, true);
  }, [open]);

  if (theme.hubs.length <= 1) {
    return (
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "var(--color-text-tertiary)",
          whiteSpace: "nowrap",
        }}
      >
        · {label}
      </span>
    );
  }

  return (
    <div ref={rootRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        style={{
          border: "none",
          background: "transparent",
          padding: "2px 4px",
          margin: 0,
          fontSize: 12,
          fontWeight: 500,
          color: "var(--color-text-tertiary)",
          cursor: disabled ? "not-allowed" : "pointer",
          whiteSpace: "nowrap",
        }}
      >
        · {label}
      </button>
      {open && others.length > 0 ? (
        <div
          role="listbox"
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            marginTop: 4,
            minWidth: 140,
            zIndex: 10,
            borderRadius: 8,
            border: "1px solid var(--color-border-tertiary)",
            background: "#1a1917",
            boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
            padding: 4,
          }}
        >
          {others.map((h) => (
            <button
              key={h.hubSlug ?? h.branchId}
              type="button"
              role="option"
              onClick={() => {
                if (h.hubSlug) onHubChange(h.hubSlug);
                setOpen(false);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                border: "none",
                background: "transparent",
                padding: "8px 10px",
                fontSize: 13,
                color: "var(--color-text-primary)",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              {h.branchLabel}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
