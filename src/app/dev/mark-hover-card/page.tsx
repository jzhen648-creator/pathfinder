"use client";

import { useCallback, useRef, useState } from "react";
import { MarkHoverCard, type MarkInteractionAnchor } from "@/components/tree/mark-hover-card";
import type { AreaData, MomentNode } from "@/components/tree/tree-types";

const DEV_AREA: AreaData = {
  id: "work",
  label: "Work",
  color: "#c9a227",
  summary: null,
  branches: [
    {
      id: "dev-hub",
      type: "Career",
      goals: [],
      moments: [],
      sequencedNodes: [],
    },
  ],
};

const SAMPLE_MARKS: { label: string; moment: MomentNode }[] = [
  {
    label: "Full mark (dated, described)",
    moment: {
      id: "dev-mark-full",
      branchId: "dev-hub",
      label: "Promoted to Head of Product",
      description: "Took the role after eighteen months leading platform.",
      year: 2024,
      calendarDateIso: "2024-06-15",
      significance: 4,
      bloomStatus: "ACTIVE",
      isTurningPoint: true,
      future: false,
      value: null,
      type: "mark",
    },
  },
  {
    label: "Sparse mark (Add context)",
    moment: {
      id: "dev-mark-sparse",
      branchId: "dev-hub",
      label: "Big win",
      description: null,
      year: 2023,
      calendarDateIso: "2023-11-01",
      significance: 3,
      bloomStatus: "ACTIVE",
      isTurningPoint: false,
      future: false,
      value: null,
      type: "mark",
    },
  },
];

function MarkDot({
  moment,
  area,
  hubLabel,
  onHover,
  onPin,
}: {
  moment: MomentNode;
  area: AreaData;
  hubLabel: string;
  onHover: (a: MarkInteractionAnchor | null) => void;
  onPin: (a: MarkInteractionAnchor) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  const anchorAtDot = useCallback((): MarkInteractionAnchor | null => {
    const el = ref.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      moment,
      area,
      hubLabel,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
  }, [area, hubLabel, moment]);

  return (
    <button
      ref={ref}
      type="button"
      aria-label={moment.label}
      onPointerEnter={() => {
        const a = anchorAtDot();
        if (a) onHover(a);
      }}
      onPointerLeave={() => onHover(null)}
      onClick={() => {
        const a = anchorAtDot();
        if (a) onPin(a);
      }}
      style={{
        width: 14,
        height: 14,
        borderRadius: "50%",
        border: "2px solid #d97706",
        background: "#d97706",
        cursor: "pointer",
        padding: 0,
      }}
    />
  );
}

export default function MarkHoverCardDevPage() {
  const [anchor, setAnchor] = useState<MarkInteractionAnchor | null>(null);
  const [pinned, setPinned] = useState(false);

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 48,
        background: "#121210",
        color: "var(--color-text-primary, #e8eaed)",
      }}
    >
      <h1 style={{ marginBottom: 8, fontSize: 20, fontWeight: 600 }}>Mark hover card (dev)</h1>
      <p style={{ marginBottom: 32, maxWidth: 520, fontSize: 14, color: "var(--color-text-tertiary)" }}>
        Hover or click an amber dot to preview the production mark card. Matches tree / timeline behaviour.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 48, alignItems: "flex-start" }}>
        {SAMPLE_MARKS.map(({ label, moment }) => (
          <div key={moment.id}>
            <div style={{ fontSize: 13, color: "var(--color-text-tertiary)", marginBottom: 12 }}>{label}</div>
            <MarkDot
              moment={moment}
              area={DEV_AREA}
              hubLabel="Career"
              onHover={(a) => {
                if (!pinned) setAnchor(a);
              }}
              onPin={(a) => {
                setAnchor(a);
                setPinned(true);
              }}
            />
          </div>
        ))}
      </div>

      {anchor ? (
        <MarkHoverCard
          anchor={anchor}
          pinned={pinned}
          onDismiss={() => {
            setAnchor(null);
            setPinned(false);
          }}
          onRemoveMark={async () => ({ ok: true })}
          onEnriched={() => window.alert("Context saved (dev)")}
        />
      ) : null}
    </div>
  );
}
