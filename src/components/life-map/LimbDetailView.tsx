"use client";

type LimbMoment = {
  id: string;
  label?: string;
  title?: string;
  description?: string | null;
  year?: number | null;
  month?: number | null;
  createdAt?: string;
};

type LimbDetailViewProps = {
  limbId: string;
  limbLabel: string;
  limbColor: string;
  moments: LimbMoment[];
  onBack: () => void;
  onAddMoment: () => void;
};

function toSortTimestamp(moment: LimbMoment) {
  const y = Number(moment.year ?? 0);
  const m = Number(moment.month ?? 1);
  if (Number.isFinite(y) && y > 0) {
    return Date.parse(`${y}-${String(Math.max(1, m)).padStart(2, "0")}-01`);
  }
  return Date.parse(String(moment.createdAt ?? "")) || 0;
}

function formatMomentDate(moment: LimbMoment) {
  const y = Number(moment.year ?? 0);
  const m = Number(moment.month ?? 0);
  if (Number.isFinite(y) && y > 0 && Number.isFinite(m) && m >= 1 && m <= 12) {
    return `${String(m).padStart(2, "0")}/${y}`;
  }
  if (Number.isFinite(y) && y > 0) return String(y);
  return "Unknown date";
}

export function LimbDetailView({
  limbId,
  limbLabel,
  limbColor,
  moments,
  onBack,
  onAddMoment,
}: LimbDetailViewProps) {
  const sorted = [...moments].sort((a, b) => toSortTimestamp(a) - toSortTimestamp(b));

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        padding: "96px 24px 28px",
        overflowY: "auto",
        background: "radial-gradient(circle at top, rgba(15,23,42,0.45) 0%, transparent 42%)",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <button onClick={onBack} style={{ borderRadius: 8, border: "1px solid #334155", background: "#0B1220", color: "#E2E8F0", padding: "8px 12px", cursor: "pointer" }}>
            ← Back to map
          </button>
          <button onClick={onAddMoment} style={{ borderRadius: 8, border: `1px solid ${limbColor}88`, background: `${limbColor}22`, color: limbColor, padding: "8px 12px", cursor: "pointer", fontWeight: 600 }}>
            + Add moment
          </button>
        </div>

        <div style={{ color: limbColor, fontFamily: "'DM Sans', sans-serif", letterSpacing: 1.6, fontSize: 11, textTransform: "uppercase" }}>
          {limbId}
        </div>
        <h2 style={{ color: "white", fontFamily: "'Cormorant Garamond', serif", fontSize: 34, fontWeight: 400, marginTop: 4, marginBottom: 16 }}>
          {limbLabel}
        </h2>

        {sorted.length === 0 ? (
          <div style={{ border: "1px dashed rgba(148,163,184,0.35)", borderRadius: 12, padding: 20, color: "rgba(226,232,240,0.75)" }}>
            No moments yet in this limb.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {sorted.map((moment) => (
              <article
                key={moment.id}
                style={{
                  border: "1px solid rgba(148,163,184,0.25)",
                  borderLeft: `3px solid ${limbColor}`,
                  borderRadius: 12,
                  background: "rgba(2,8,16,0.8)",
                  padding: "12px 14px",
                }}
              >
                <div style={{ color: "rgba(203,213,225,0.8)", fontSize: 11, marginBottom: 4 }}>
                  {formatMomentDate(moment)}
                </div>
                <div style={{ color: "white", fontFamily: "'Cormorant Garamond', serif", fontSize: 22 }}>
                  {moment.title ?? moment.label ?? "Untitled"}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    color: "rgba(203,213,225,0.72)",
                    fontSize: 13,
                    lineHeight: 1.5,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {String(moment.description ?? "").trim() || "No description"}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

