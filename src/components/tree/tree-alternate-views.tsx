"use client";

import { getOpacity } from "./tree-branch-geometry";
import type { MomentNode } from "./tree-types";
import type { BranchViewProps } from "./tree-view-types";

/** Tree-only padding moments — exclude from list / alternate views. */
function realMoments(moments: MomentNode[]): MomentNode[] {
  return moments.filter((m) => m.synthetic !== true);
}

/** Hub / thread list + moment detail for one hub (Timeline tab lives in `SwimlaneTimeline`). */
export function BranchView({
  areas,
  selectedThreadId,
  onSelectThread,
  onMarkPointerEnter,
  onMarkPointerLeave,
  onMarkClick,
  focused,
  onAreaClick,
}: BranchViewProps) {
  const allThreads = areas.flatMap((area) => area.branches.map((thread) => ({ area, thread })));
  const selected = allThreads.find((entry) => entry.thread.id === selectedThreadId) ?? allThreads[0] ?? null;
  const moments = [...realMoments(selected?.thread.moments ?? [])].sort((a, b) => (a.year ?? 0) - (b.year ?? 0));

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
                fontSize: 13,
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
          <div style={{ color: selected.area.color, fontWeight: 600, fontSize: 16, marginBottom: 8 }}>
            {selected.thread.type} · {selected.area.label}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {moments.length === 0 ? (
              <p style={{ margin: 0, fontSize: 14, color: "var(--color-text-tertiary)" }}>No marks on this hub yet.</p>
            ) : (
              moments.map((moment) => (
                <button
                  key={moment.id}
                  type="button"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    onMarkClick(moment, selected.area, rect.left + rect.width / 2, rect.top);
                  }}
                  onPointerEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    onMarkPointerEnter?.(moment, selected.area, rect.left + rect.width / 2, rect.top);
                  }}
                  onPointerLeave={() => onMarkPointerLeave?.(moment.id)}
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
                    <span style={{ color: "var(--color-text-primary)", fontSize: 15, fontWeight: 600 }}>{moment.label}</span>
                    <span style={{ color: "var(--color-text-tertiary)", fontSize: 13 }}>{moment.year ?? "Unknown"}</span>
                  </div>
                  <div style={{ color: "var(--color-text-secondary)", fontSize: 14, marginBottom: 6 }}>
                    {moment.description ?? "No description yet."}
                  </div>
                  <div style={{ color: "var(--color-text-tertiary)", fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em" }}>
                    significance {moment.significance}
                    {moment.year != null ? ` · ${moment.year}` : ""}
                    {moment.value !== null ? ` · value ${moment.value}` : ""}
                  </div>
                </button>
              ))
            )}
          </div>
          {moments.length >= 3 ? (
            <div
              style={{
                marginTop: 12,
                borderTop: "1px solid var(--color-border-tertiary)",
                paddingTop: 10,
                color: "var(--color-text-secondary)",
                fontSize: 14,
                lineHeight: 1.6,
              }}
            >
              This hub lists a stretch from <strong>{moments[0]?.label ?? "the start"}</strong> to{" "}
              <strong>{moments[moments.length - 1]?.label ?? "now"}</strong>
              — use the <strong>Timeline</strong> tab for a cross-theme swimlane with pursuits visible.
            </div>
          ) : null}
        </div>
      ) : (
        <div style={{ color: "var(--color-text-tertiary)", fontSize: 14 }}>No hubs yet.</div>
      )}
    </div>
  );
}
