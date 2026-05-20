"use client";

import { useEffect, useMemo, useRef } from "react";

export type DevHoverInfo = {
  type: "node" | "gap" | "branch" | "subbranch";
  data: Record<string, unknown>;
  position: { x: number; y: number };
};

type DevPanelProps = {
  isOpen: boolean;
  hoverInfo: DevHoverInfo | null;
  moments: Array<{ id: string; label?: string; title?: string; branchLabel?: string; branch?: string }>;
  // Canonical Branch records (one or more per Limb). Surfaced in dev panel so
  // new branches created via the gap chooser can be inspected immediately,
  // even before Slice 2 wires them into the render loop.
  branches?: Array<{
    id: string;
    limbId: string;
    label?: string | null;
    mapAngleOffset: number;
    parentBranchId?: string | null;
  }>;
  selectedNode: Record<string, unknown> | null;
  selectedNodeRaw: Record<string, unknown> | null;
  mapState: {
    zoom: number;
    panX: number;
    panY: number;
    activeView: "map" | "timeline";
    focusedBranch: string | null;
    hoveredGap: string | null;
    totalNodes: number;
    totalGapZones: number;
    visibleBranches: number;
  };
  perfState: {
    renderCount: number;
    nodesRendered: number;
    gapZonesRendered: number;
    edgesRendered: number;
  };
  branchBreakdown: Array<{
    id: string;
    label: string;
    angle: number;
    subbranches: Array<{
      id: string;
      label: string;
      angleOffset: number;
      effectiveAngle: number;
      nodes: Array<{ id: string; label: string; year: number }>;
    }>;
  }>;
  showGapZones: boolean;
  onToggleGapZones: () => void;
  onResetMockData: () => void;
  onClearRealNodes: () => void;
  onLogState: () => void;
  onCopyState: () => void;
  onToggleBranchLabels: () => void;
  onHighlightItem: (item: { type: "branch" | "subbranch" | "node"; id: string }) => void;
  onRefreshSnapshot: () => void;
  health?: {
    rps: number | null;
    fps: number | null;
    memoryMB: number | null;
    interaction: string | null;
  };
};

export function DevPanel({
  isOpen,
  hoverInfo,
  moments,
  branches = [],
  selectedNode,
  selectedNodeRaw,
  mapState,
  perfState,
  branchBreakdown,
  showGapZones,
  onToggleGapZones,
  onResetMockData,
  onClearRealNodes,
  onLogState,
  onCopyState,
  onToggleBranchLabels,
  onHighlightItem,
  onRefreshSnapshot,
  health,
}: DevPanelProps) {
  const frameCount = useRef(0);
  const lastSecondTs = useRef<number | null>(null);
  const fpsValueRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let rafId = 0;
    const tick = (ts: number) => {
      if (lastSecondTs.current === null) {
        lastSecondTs.current = ts;
      }
      frameCount.current += 1;
      if (ts - (lastSecondTs.current ?? ts) >= 1000) {
        const elapsed = ts - (lastSecondTs.current ?? ts);
        const fps = Math.round((frameCount.current * 1000) / elapsed);
        if (fpsValueRef.current) fpsValueRef.current.textContent = `fps: ${fps}`;
        frameCount.current = 0;
        lastSecondTs.current = ts;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isOpen]);

  const selectedRawJson = useMemo(
    () => JSON.stringify(selectedNodeRaw ?? selectedNode ?? null, null, 2),
    [selectedNodeRaw, selectedNode],
  );
  const hoveredGapContext = useMemo(() => {
    if (!hoverInfo || hoverInfo.type !== "gap") return null;
    const data = (hoverInfo.data ?? {}) as Record<string, unknown>;
    const prevId = String(data.prevMomentId ?? "");
    const nextId = String(data.nextMomentId ?? "");
    const prevMoment = moments.find((m) => m.id === prevId);
    const nextMoment = moments.find((m) => m.id === nextId);
    return {
      branch:
        String(data.branchLabel ?? data.branchId ?? "").trim() || "Unknown",
      insertIndex: String(data.insertIndex ?? "?"),
      after: prevMoment?.label ?? prevMoment?.title ?? "Start of hub",
      before: nextMoment?.label ?? nextMoment?.title ?? "End of hub",
    };
  }, [hoverInfo, moments]);
  const toFlatLines = (value: Record<string, unknown> | null) => {
    if (!value) return ["none"];
    return Object.entries(value).map(([k, v]) => {
      if (k === "isTurningPoint") {
        return `Turning point: ${v === true ? "yes" : "no"}`;
      }
      const text =
        typeof v === "string"
          ? v
          : typeof v === "number" || typeof v === "boolean"
            ? String(v)
            : v === null
              ? "null"
              : JSON.stringify(v);
      const normalizedType =
        k === "type"
          ? text.toUpperCase() === "NODE"
            ? "MOMENT"
            : text.toUpperCase() === "SUBBRANCH"
              ? "BRANCH"
              : text.toUpperCase() === "BRANCH LINE"
                ? "LIMB"
                : text.toUpperCase() === "GAP ZONE"
                  ? "GAP"
            : text.toUpperCase() === "GAP ZONE"
              ? "GAP"
              : text
          : text;
      const compact = normalizedType.length > 30 ? `${normalizedType.slice(0, 30)}...` : normalizedType;
      const displayKey = k === "type" ? "Type" : k;
      return `${displayKey}: ${compact}`;
    });
  };

  const isDev = true;
  if (!isDev) return null;
  if (!isOpen) return null;

  return (
    <aside
      style={{
        position: "relative",
        width: 280,
        maxHeight: "55vh",
        background: "rgba(4,10,20,0.88)",
        backdropFilter: "blur(10px)",
        border: "1px solid #1E293B",
        borderRadius: 10,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
        overflowY: "auto",
        color: "#E2E8F0",
        padding: 8,
      }}
    >
      <div style={{ color: "#60A5FA", marginBottom: 10, letterSpacing: 1.1 }}>DEV PANEL</div>

      <section style={{ marginBottom: 10, border: "1px solid #1E293B", borderRadius: 8, padding: 8 }}>
        <div style={{ color: "#93C5FD", marginBottom: 6 }}>HEALTH</div>
        <div style={{ lineHeight: 1.45 }}>
          <div>{`RPS: ${health?.rps ?? "n/a"}`}</div>
          <div>{`FPS: ${health?.fps ?? "n/a"}`}</div>
          <div>{`Memory: ${health?.memoryMB != null ? `${health.memoryMB.toFixed(1)} MB` : "n/a"}`}</div>
          <div>{`Interaction: ${health?.interaction ?? "n/a"}`}</div>
        </div>
      </section>
      <details style={{ marginBottom: 8 }}>
        <summary style={{ cursor: "pointer", color: "#93C5FD" }}>Clicked Element</summary>
        {!hoverInfo ? <div style={{ opacity: 0.6, marginTop: 6 }}>none</div> : (
          <div style={{ lineHeight: 1.45, marginTop: 6 }}>
            {toFlatLines(hoverInfo as unknown as Record<string, unknown>).map((line) => (
              <div key={`hover-${line}`}>{line}</div>
            ))}
          </div>
        )}
        {hoveredGapContext ? (
          <div style={{ lineHeight: 1.5, marginTop: 6, opacity: 0.9 }}>
            <div>{`hub: ${hoveredGapContext.branch}`}</div>
            <div>{`insert position: ${hoveredGapContext.insertIndex}`}</div>
            <div>{`after: ${hoveredGapContext.after}`}</div>
            <div>{`before: ${hoveredGapContext.before}`}</div>
          </div>
        ) : null}
      </details>

      <details style={{ marginBottom: 8 }}>
        <summary style={{ cursor: "pointer", color: "#93C5FD" }}>Branches (raw)</summary>
        {branches.length === 0 ? (
          <div style={{ opacity: 0.6, marginTop: 6 }}>none loaded</div>
        ) : (
          <div style={{ lineHeight: 1.5, marginTop: 6 }}>
            {(() => {
              const byLimb: Record<string, typeof branches> = {};
              branches.forEach((b) => {
                (byLimb[b.limbId] ||= []).push(b);
              });
              return Object.entries(byLimb).map(([limbId, list]) => (
                <div key={`limb-${limbId}`} style={{ marginBottom: 6 }}>
                  <div style={{ color: "#CBD5E1" }}>{`${limbId} (${list.length})`}</div>
                  {list.map((b) => (
                    <div key={`br-${b.id}`} style={{ opacity: 0.75, paddingLeft: 8 }}>
                      {`${b.label ?? "—"} · offset ${b.mapAngleOffset}° · id ${b.id.slice(0, 14)}`}
                    </div>
                  ))}
                </div>
              ));
            })()}
          </div>
        )}
      </details>

      <details style={{ marginBottom: 8 }}>
        <summary style={{ cursor: "pointer", color: "#93C5FD" }}>Selected Pursuit</summary>
        {!selectedNode ? (
          <div style={{ opacity: 0.6, marginTop: 6 }}>none</div>
        ) : (
          <>
            <div style={{ lineHeight: 1.45, marginTop: 6 }}>
              {toFlatLines(selectedNode).map((line) => (
                <div key={`sel-${line}`}>{line}</div>
              ))}
            </div>
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: "pointer", color: "#60A5FA" }}>Raw JSON</summary>
              <div style={{ marginTop: 6, lineHeight: 1.45 }}>
                {selectedRawJson
                  .replace(/[{}]/g, "")
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line) => (
                    <div key={`raw-${line}`}>{line.length > 30 ? `${line.slice(0, 30)}...` : line}</div>
                  ))}
              </div>
            </details>
          </>
        )}
      </details>

      <details style={{ marginBottom: 8 }}>
        <summary style={{ cursor: "pointer", color: "#93C5FD" }}>Map State</summary>
        <div style={{ lineHeight: 1.45, marginTop: 6 }}>
          {toFlatLines(mapState as unknown as Record<string, unknown>).map((line) => (
            <div key={`map-${line}`}>{line}</div>
          ))}
        </div>
      </details>

      <details style={{ marginBottom: 8 }}>
        <summary style={{ cursor: "pointer", color: "#93C5FD" }}>Performance</summary>
        <div style={{ lineHeight: 1.45, marginTop: 6 }}>
          {toFlatLines(perfState as unknown as Record<string, unknown>).map((line) => (
            <div key={`perf-${line}`}>{line}</div>
          ))}
          <div ref={fpsValueRef}>fps: 0</div>
        </div>
      </details>

      <details style={{ marginBottom: 8 }}>
        <summary style={{ cursor: "pointer", color: "#93C5FD" }}>Thread Breakdown</summary>
        {branchBreakdown.map((branch) => {
          return (
            <div key={branch.id} style={{ marginBottom: 6 }}>
              <button
                onClick={() => onHighlightItem({ type: "branch", id: branch.id })}
                style={{ width: "100%", textAlign: "left", cursor: "pointer", background: "transparent", color: "#E2E8F0", border: "1px solid #1E293B", borderRadius: 6, padding: "4px 6px", fontSize: 10 }}
              >
                {branch.label} ({branch.angle}deg)
              </button>
              {branch.subbranches.map((sub) => (
                    <div key={sub.id} style={{ marginLeft: 10, marginTop: 4 }}>
                      <button
                        onClick={() => onHighlightItem({ type: "subbranch", id: sub.id })}
                        style={{ cursor: "pointer", background: "transparent", color: "#93C5FD", border: "none", padding: 0, fontSize: 10 }}
                      >
                        - {sub.id} ({sub.effectiveAngle}deg) - {sub.nodes.length} nodes
                      </button>
                      {sub.nodes.map((node, idx) => (
                        <div key={node.id} style={{ marginLeft: 8 }}>
                          <button
                            onClick={() => onHighlightItem({ type: "node", id: node.id })}
                            style={{ cursor: "pointer", background: "transparent", color: "#CBD5E1", border: "none", padding: 0, fontSize: 10 }}
                          >
                            [{idx}] {node.label} ({node.year})
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}
            </div>
          );
        })}
      </details>

      <details style={{ marginBottom: 8 }}>
        <summary style={{ cursor: "pointer", color: "#93C5FD" }}>Quick Actions</summary>
        <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
          <button onClick={onRefreshSnapshot}>Refresh Snapshot</button>
          <button onClick={onResetMockData}>Reset Mock Data</button>
          <button onClick={onClearRealNodes}>Clear Real Nodes</button>
          <button onClick={onLogState}>Log Full State to Console</button>
          <button onClick={onCopyState}>Copy State as JSON</button>
          <button onClick={onToggleBranchLabels}>Toggle All Thread Labels</button>
        </div>
      </details>

      <details>
        <summary style={{ cursor: "pointer", color: "#93C5FD" }}>Gap Visualiser</summary>
        <button onClick={onToggleGapZones}>{showGapZones ? "Hide Gaps" : "Show Gaps"}</button>
      </details>
    </aside>
  );
}

