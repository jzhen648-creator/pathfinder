import type { ReactNode } from "react";
import type { Metadata } from "next";
import { BranchCareer, LimbWork } from "@/components/icons";

export const metadata: Metadata = {
  title: "Icon preview (v2)",
  description: "Pathfinder icon system v2 — full sheet + LimbWork / BranchCareer pixel checks",
};

const SPEC_STROKE = "#e8e4dc";
const BG = "#111210";

/** Locked paths from pathfinder-icons-v2 (Work limb + Career ladder), design-space coords. */
function SpecLimbWork() {
  return (
    <>
      <rect
        x={-13}
        y={1}
        width={8}
        height={11}
        fill="none"
        stroke={SPEC_STROKE}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <rect
        x={-3}
        y={-6}
        width={8}
        height={18}
        fill="none"
        stroke={SPEC_STROKE}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <rect
        x={7}
        y={-13}
        width={8}
        height={25}
        fill="none"
        stroke={SPEC_STROKE}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </>
  );
}

function SpecBranchCareer() {
  return (
    <g>
      <line x1={-6} y1={-11} x2={-6} y2={11} stroke={SPEC_STROKE} strokeWidth={1.3} strokeLinecap="round" />
      <line x1={6} y1={-11} x2={6} y2={11} stroke={SPEC_STROKE} strokeWidth={1.3} strokeLinecap="round" />
      <line x1={-6} y1={-7} x2={6} y2={-7} stroke={SPEC_STROKE} strokeWidth={1.1} strokeLinecap="round" />
      <line x1={-6} y1={0} x2={6} y2={0} stroke={SPEC_STROKE} strokeWidth={1.1} strokeLinecap="round" />
      <line x1={-6} y1={7} x2={6} y2={7} stroke={SPEC_STROKE} strokeWidth={1.1} strokeLinecap="round" />
    </g>
  );
}

function IconTile({
  label,
  px,
  spec,
  implementation,
}: {
  label: string;
  px: number;
  spec: ReactNode;
  implementation: ReactNode;
}) {
  const s = px / 24;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
      <div style={{ fontSize: 11, opacity: 0.65 }}>{label}</div>
      <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 10, opacity: 0.45, marginBottom: 6 }}>Locked spec</div>
          <svg width={px} height={px} style={{ display: "block", background: BG, borderRadius: 6 }}>
            <g transform={`translate(${px / 2},${px / 2}) scale(${s})`}>
              {spec}
            </g>
          </svg>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 10, opacity: 0.45, marginBottom: 6 }}>React component</div>
          <svg width={px} height={px} style={{ display: "block", background: BG, borderRadius: 6 }}>
            <g transform={`translate(${px / 2},${px / 2})`}>{implementation}</g>
          </svg>
        </div>
      </div>
    </div>
  );
}

export default function IconsPreviewPage() {
  return (
    <div style={{ padding: 40, fontFamily: "system-ui, sans-serif", color: SPEC_STROKE, background: "#0c0c0b", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>Pathfinder icon system — v2 preview</h1>
      <p style={{ fontSize: 12, opacity: 0.45, marginBottom: 32, maxWidth: 560 }}>
        Compare locked SVG (<code style={{ opacity: 0.75 }}>pathfinder-icons-v2.html</code>) to TSX components at 16px and 24px.
        Overlays should match when inspected side-by-side.
      </p>

      <section style={{ marginBottom: 48 }}>
        <h2
          style={{
            fontSize: 12,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            marginBottom: 10,
            opacity: 0.9,
          }}
        >
          Complete system — 30 symbols (locked spec)
        </h2>
        <p style={{ fontSize: 12, opacity: 0.45, marginBottom: 16, maxWidth: 640 }}>
          Six limb icons (top row) and twenty-four branch icons (four rows × six columns). Served from{" "}
          <code style={{ opacity: 0.75 }}>/dev/pathfinder-icon-system.svg</code> — generated from{" "}
          <code style={{ opacity: 0.75 }}>reference/pathfinder-icons-v2.html</code>.
        </p>
        <div
          style={{
            background: BG,
            borderRadius: 8,
            padding: 16,
            overflow: "auto",
            border: "1px solid rgba(232, 228, 220, 0.08)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG artboard */}
          <img
            src="/dev/pathfinder-icon-system.svg"
            width={720}
            height={470}
            alt="Pathfinder tree icon system: six life-area limb symbols and twenty-four branch symbols in a reference grid"
            style={{ display: "block", width: "100%", maxWidth: 720, height: "auto" }}
          />
        </div>
      </section>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 20, opacity: 0.8 }}>
          LimbWork — Rising blocks
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 48 }}>
          <IconTile label={`${24}px`} px={24} spec={<SpecLimbWork />} implementation={<LimbWork size={24} color={SPEC_STROKE} />} />
          <IconTile label={`${16}px`} px={16} spec={<SpecLimbWork />} implementation={<LimbWork size={16} color={SPEC_STROKE} />} />
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 20, opacity: 0.8 }}>
          BranchCareer — Ladder
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 48 }}>
          <IconTile
            label={`${24}px`}
            px={24}
            spec={<SpecBranchCareer />}
            implementation={<BranchCareer size={24} color={SPEC_STROKE} />}
          />
          <IconTile
            label={`${16}px`}
            px={16}
            spec={<SpecBranchCareer />}
            implementation={<BranchCareer size={16} color={SPEC_STROKE} />}
          />
        </div>
      </section>
    </div>
  );
}
