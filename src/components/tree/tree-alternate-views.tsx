"use client";

import { getOpacity } from "./tree-branch-geometry";
import { statusFromMoment } from "./tree-view-badges";
import type { BranchViewProps, TimelineViewProps } from "./tree-view-types";

export function TimelineView({ areas, focused, onAreaClick, onMomentClick }: TimelineViewProps) {
  const years = areas
    .flatMap((area) => area.branches.flatMap((thread) => thread.moments.map((moment) => moment.year).filter((y): y is number => typeof y === "number")))
    .sort((a, b) => a - b);
  const minYear = years[0] ?? new Date().getFullYear() - 5;
  const maxYear = years[years.length - 1] ?? new Date().getFullYear() + 1;
  const span = Math.max(1, maxYear - minYear);

  return (
    <div style={{ overflowX: "auto", padding: "14px 12px 16px" }}>
      <div style={{ minWidth: Math.max(1200, span * 80 + 260) }}>
        <div style={{ position: "sticky", top: 0, zIndex: 1, background: "var(--color-background-primary)", paddingBottom: 8 }}>
          <div style={{ position: "relative", height: 28, marginLeft: 160 }}>
            {Array.from({ length: span + 1 }).map((_, idx) => {
              const year = minYear + idx;
              const x = (idx / span) * (Math.max(1200, span * 80 + 260) - 200);
              return (
                <span
                  key={year}
                  style={{
                    position: "absolute",
                    left: x,
                    fontSize: 10,
                    color: "var(--color-text-tertiary)",
                    transform: "translateX(-50%)",
                  }}
                >
                  {year}
                </span>
              );
            })}
          </div>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          {areas.map((area) => (
            <div
              key={area.id}
              style={{
                opacity: getOpacity(focused, area.id),
                border: "0.5px solid var(--color-border-tertiary)",
                borderRadius: 10,
                padding: "10px 10px 8px",
                background: "var(--color-background-primary)",
              }}
            >
              <button
                type="button"
                onClick={() => onAreaClick(area)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: area.color,
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 8,
                  cursor: "pointer",
                }}
              >
                {area.label}
              </button>
              <div style={{ position: "relative", height: 64, marginLeft: 150 }}>
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: 32,
                    borderTop: "1px dashed var(--color-border-tertiary)",
                    opacity: 0.7,
                  }}
                />
                {area.branches.flatMap((thread) =>
                  thread.moments.map((moment) => {
                    const fallbackYear = minYear;
                    const year = typeof moment.year === "number" ? moment.year : fallbackYear;
                    const t = (year - minYear) / span;
                    const x = t * (Math.max(1200, span * 80 + 260) - 220);
                    return (
                      <span key={moment.id} style={{ position: "absolute", left: x, top: 26, transform: "translate(-50%, -50%)" }}>
                        <button
                          type="button"
                          onClick={() => onMomentClick(moment, area)}
                          title={`${moment.label}${moment.year ? ` (${moment.year})` : ""}`}
                          style={{
                            display: "block",
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            border: `2px solid ${area.color}`,
                            background: "var(--color-background-primary)",
                            padding: 0,
                            cursor: "pointer",
                          }}
                        />
                      </span>
                    );
                  }),
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BranchView({ areas, selectedThreadId, onSelectThread, onMomentClick, focused, onAreaClick }: BranchViewProps) {
  const allThreads = areas.flatMap((area) => area.branches.map((thread) => ({ area, thread })));
  const selected = allThreads.find((entry) => entry.thread.id === selectedThreadId) ?? allThreads[0] ?? null;
  const moments = [...(selected?.thread.moments ?? [])].sort((a, b) => (a.year ?? 0) - (b.year ?? 0));

  return (
    <div style={{ padding: "14px 16px 18px", overflowY: "auto", maxHeight: "calc(100vh - 180px)" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {allThreads.map(({ area, thread }) => {
          const active = selected?.thread.id === thread.id;
          return (
            <button
              key={thread.id}
              type="button"
              onClick={() => {
                onSelectThread(thread.id);
                onAreaClick(area);
              }}
              style={{
                borderRadius: 999,
                border: `1px solid ${active ? area.color : "var(--color-border-secondary)"}`,
                background: active ? "var(--color-background-secondary)" : "transparent",
                color: active ? area.color : "var(--color-text-secondary)",
                padding: "6px 10px",
                fontSize: 11,
                cursor: "pointer",
                opacity: getOpacity(focused, area.id),
              }}
            >
              {thread.type}
            </button>
          );
        })}
      </div>

      {selected ? (
        <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: 12 }}>
          <div style={{ color: selected.area.color, fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
            {selected.thread.type} · {selected.area.label}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {moments.map((moment) => (
                <button
                  key={moment.id}
                  type="button"
                  onClick={() => onMomentClick(moment, selected.area)}
                  style={{
                    textAlign: "left",
                    border: "1px solid var(--color-border-tertiary)",
                    borderRadius: 8,
                    padding: "10px 11px",
                    background: "var(--color-background-primary)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                    <span style={{ color: "var(--color-text-primary)", fontSize: 13, fontWeight: 600 }}>{moment.label}</span>
                    <span style={{ color: "var(--color-text-tertiary)", fontSize: 11 }}>{moment.year ?? "Unknown"}</span>
                  </div>
                  <div style={{ color: "var(--color-text-secondary)", fontSize: 12, marginBottom: 6 }}>
                    {moment.description ?? "No description yet."}
                  </div>
                  <div style={{ color: "var(--color-text-tertiary)", fontSize: 10, textTransform: "uppercase", letterSpacing: ".04em" }}>
                    significance {moment.significance} · status {statusFromMoment(moment)}
                    {moment.value !== null ? ` · value ${moment.value}` : ""}
                  </div>
                </button>
            ))}
          </div>
          {moments.length >= 3 ? (
            <div
              style={{
                marginTop: 12,
                borderTop: "1px solid var(--color-border-tertiary)",
                paddingTop: 10,
                color: "var(--color-text-secondary)",
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              AI reflection: This thread shows a coherent arc from
              {" "}
              <strong>{moments[0]?.label ?? "early goals"}</strong>
              {" "}
              to
              {" "}
              <strong>{moments[moments.length - 1]?.label ?? "recent goals"}</strong>
              , with meaning accumulating through repeated choices and turning points.
            </div>
          ) : null}
        </div>
      ) : (
        <div style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>No branches yet.</div>
      )}
    </div>
  );
}