"use client";

type Props = {
  current: number;
  total: number;
};

export function StreamConfirmationProgress({ current, total }: Props) {
  if (total <= 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        padding: "0 22px 8px",
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--color-text-secondary)",
          letterSpacing: ".02em",
        }}
      >
        {current} of {total}
      </span>
      <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background:
                i < current
                  ? "var(--stream-accent, var(--color-text-tertiary))"
                  : "var(--color-border-tertiary)",
              opacity: i < current ? 1 : 0.5,
            }}
          />
        ))}
      </div>
    </div>
  );
}
