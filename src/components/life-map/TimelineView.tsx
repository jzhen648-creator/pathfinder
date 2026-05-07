"use client";

export type TimelineNode = {
  id: string;
  label: string;
  description?: string;
  branch: string;
  year: number;
  month?: number | null;
  future?: boolean;
  connectedTo?: string[];
  significance?: number;
  synthetic?: boolean;
};

type BranchMeta = {
  label: string;
  icon: string;
  color: string;
};

type TimelineViewProps = {
  nodes: TimelineNode[];
  branchMetaByLabel: Record<string, BranchMeta>;
  onStartBranch?: (branchLabel: string) => void;
};

export function TimelineView({ nodes, branchMetaByLabel, onStartBranch }: TimelineViewProps) {
  const currentYear = new Date().getFullYear();
  const normalized = nodes
    .map((node) => ({
      ...node,
      year: Number(node.year),
      month: node.month ?? null,
      significance: Math.max(1, Math.min(3, Number(node.significance ?? 1))),
      connectedTo: Array.isArray(node.connectedTo) ? node.connectedTo : [],
    }))
    .filter((node) => Number.isFinite(node.year))
    .sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return (a.month ?? 0) - (b.month ?? 0);
    });

  const byYear = normalized.reduce<Record<string, TimelineNode[]>>((acc, node) => {
    const key = String(node.year);
    if (!acc[key]) acc[key] = [];
    acc[key].push(node);
    return acc;
  }, {});
  const years = Object.keys(byYear)
    .map((y) => Number(y))
    .sort((a, b) => a - b);

  const emptyBranches = Object.keys(branchMetaByLabel).slice(0, 5);

  if (normalized.length === 0) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10,
        }}
      >
        <div style={{ textAlign: "center", color: "rgba(255,255,255,0.45)" }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 34, fontWeight: 300 }}>
            Your timeline begins when you add your first moment
          </div>
          <div
            style={{
              marginTop: 10,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              opacity: 0.5,
              letterSpacing: 0.4,
            }}
          >
            <span style={{ animation: "timeline-caret 1s steps(1,end) infinite" }}>|</span>
          </div>
          <div
            style={{
              marginTop: 20,
              display: "flex",
              gap: 10,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            {emptyBranches.map((branchLabel) => {
              const meta = branchMetaByLabel[branchLabel];
              if (!meta) return null;
              return (
                <button
                  key={`timeline-empty-${branchLabel}`}
                  onClick={() => onStartBranch?.(branchLabel)}
                  style={{
                    borderRadius: 999,
                    border: `1px solid ${meta.color}55`,
                    background: `${meta.color}1A`,
                    color: meta.color,
                    fontSize: 13,
                    padding: "6px 12px",
                    cursor: "pointer",
                  }}
                >
                  {meta.icon}
                </button>
              );
            })}
          </div>
        </div>
        <style>{`@keyframes timeline-caret{0%,49%{opacity:1}50%,100%{opacity:0}}`}</style>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflowY: "auto",
        padding: "110px 24px 40px 24px",
        zIndex: 10,
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto", position: "relative" }}>
        <div
          style={{
            position: "absolute",
            left: 28,
            top: 0,
            bottom: 0,
            width: 1,
            background: "rgba(255,255,255,0.1)",
          }}
        />

        {years.map((year) => (
          <div key={`timeline-year-${year}`} style={{ marginBottom: 80 }}>
            <div
              style={{
                marginLeft: 0,
                color: "rgba(255,255,255,0.15)",
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 32,
                lineHeight: 1,
                marginBottom: 24,
              }}
            >
              {year}
            </div>

            <div style={{ marginLeft: 80, display: "grid", gap: 40 }}>
              {byYear[String(year)].map((node, index) => {
                const meta = branchMetaByLabel[node.branch] ?? {
                  label: node.branch,
                  icon: "✦",
                  color: "#94A3B8",
                };
                const significance = Number(node.significance ?? 1);
                const indicatorSize = significance === 1 ? 6 : significance === 2 ? 9 : 12;
                const bloom = significance === 3 ? `0 0 14px ${meta.color}` : significance === 2 ? `0 0 6px ${meta.color}` : "none";
                return (
                  <article
                    key={node.id}
                    style={{
                      position: "relative",
                      width: "100%",
                      maxWidth: 600,
                      margin: "0 auto",
                      borderRadius: 12,
                      border: "1px solid rgba(148,163,184,0.2)",
                      borderLeft: node.future ? "3px dashed rgba(255,255,255,0.35)" : `3px solid ${meta.color}`,
                      background: "rgba(2,8,16,0.82)",
                      padding: "14px 16px",
                      animation: `timeline-card-in 0.35s ease ${index * 50}ms both`,
                    }}
                  >
                    <div
                      style={{
                        color: meta.color,
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 9,
                        letterSpacing: 2,
                        textTransform: "uppercase",
                      }}
                    >
                      {meta.icon} {meta.label}
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        color: "white",
                        fontFamily: "'Cormorant Garamond', serif",
                        fontSize: 18,
                        fontWeight: 400,
                      }}
                    >
                      {node.label}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        color: "rgba(255,255,255,0.5)",
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 11,
                        lineHeight: 1.6,
                      }}
                    >
                      {node.description || node.label}
                    </div>
                    {node.year === currentYear && (node.month ?? null) === null ? (
                      <div
                        style={{
                          marginTop: 4,
                          color: "rgba(255,255,255,0.3)",
                          fontFamily: "'DM Sans', sans-serif",
                          fontSize: 10,
                        }}
                      >
                        Year not set — tap to edit
                      </div>
                    ) : null}

                    <div
                      style={{
                        position: "absolute",
                        right: 12,
                        top: 12,
                        width: indicatorSize,
                        height: indicatorSize,
                        borderRadius: "50%",
                        background: meta.color,
                        opacity: significance === 1 ? 0.5 : 0.75,
                        boxShadow: bloom,
                      }}
                    />

                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {Array.isArray(node.connectedTo) && node.connectedTo.length > 0 ? (
                        <span
                          style={{
                            borderRadius: 999,
                            border: "1px solid rgba(255,255,255,0.2)",
                            color: "rgba(255,255,255,0.3)",
                            fontSize: 10,
                            padding: "3px 8px",
                            fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          ↔ Connected
                        </span>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <style>{`@keyframes timeline-card-in{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </div>
  );
}

