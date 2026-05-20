"use client";

import { linkBtnStyle, primaryBtn } from "./stream-confirmation-styles";

type Props = {
  added: number;
  skipped: number;
  accent: string;
  commitInFlight: boolean;
  commitError: string | null;
  onAddToTree: () => void;
  onStartOver: () => void;
};

export function StreamConfirmationSummary({
  added,
  skipped,
  accent,
  commitInFlight,
  commitError,
  onAddToTree,
  onStartOver,
}: Props) {
  const addedLabel = added === 1 ? "1 item added to your map" : `${added} items added to your map`;

  return (
    <article className="pf-stream-card pf-stream-card--pursuit-peer" style={{ width: "100%", maxWidth: 420 }}>
      <h3
        style={{
          margin: 0,
          fontSize: 22,
          fontWeight: 600,
          color: "var(--color-text-primary)",
        }}
      >
        {added > 0 ? `✓ ${addedLabel}` : "Nothing to add"}
      </h3>
      <p
        style={{
          margin: "10px 0 0",
          fontSize: 14,
          lineHeight: 1.5,
          color: "var(--color-text-secondary)",
        }}
      >
        {added > 0
          ? "Your confirmed items have been added to your map."
          : "No new items were added to your map."}
      </p>
      {skipped > 0 ? (
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 15,
            color: "var(--color-text-secondary)",
          }}
        >
          {skipped} skipped
        </p>
      ) : null}

      {commitError ? (
        <p style={{ margin: "14px 0 0", fontSize: 14, color: "#b91c1c", lineHeight: 1.45 }}>{commitError}</p>
      ) : null}

      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 14 }}>
        {!commitError ? (
          <button
            type="button"
            onClick={onAddToTree}
            disabled={commitInFlight}
            style={{
              ...primaryBtn(accent),
              opacity: commitInFlight ? 0.65 : 1,
              cursor: commitInFlight ? "wait" : "pointer",
            }}
          >
            Done
          </button>
        ) : null}
        {commitError ? (
          <button
            type="button"
            onClick={onAddToTree}
            disabled={commitInFlight || added === 0}
            style={{
              ...primaryBtn(accent),
              opacity: commitInFlight || added === 0 ? 0.65 : 1,
            }}
          >
            Retry
          </button>
        ) : null}
        <button type="button" onClick={onStartOver} disabled={commitInFlight} style={linkBtnStyle}>
          Start over
        </button>
      </div>
    </article>
  );
}
