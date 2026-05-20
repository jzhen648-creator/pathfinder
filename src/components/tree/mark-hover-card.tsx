"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { StreamAmbiguousResolution } from "@/types/stream";
import type { AreaData, MomentNode } from "./tree-types";
import { isSparseContextItem } from "@/lib/sparse-context";
import { SparseContextPrompt } from "./sparse-context-prompt";
import { MARK_TREE_AMBER } from "./tree-view-constants";

export type MarkInteractionAnchor = {
  moment: MomentNode;
  area: AreaData;
  hubLabel: string;
  clientX: number;
  clientY: number;
};

export function formatMarkDateDisplay(m: MomentNode): string | null {
  const iso = m.calendarDateIso?.trim();
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [ys, ms, ds] = iso.split("-");
    const y = Number(ys);
    const mo = Number(ms);
    const d = Number(ds);
    if (y && mo && d) {
      return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString(undefined, {
        dateStyle: "medium",
        timeZone: "UTC",
      });
    }
  }
  if (m.year != null) return String(m.year);
  return null;
}

function MarkDiamondIcon({ size = 10 }: { size?: number }) {
  const h = size;
  return (
    <svg width={size * 2} height={size * 2} viewBox={`${-h} ${-h} ${h * 2} ${h * 2}`} aria-hidden>
      <path d={`M 0 ${-h} L ${h} 0 L 0 ${h} L ${-h} 0 Z`} fill={MARK_TREE_AMBER} />
    </svg>
  );
}

export type MarkHoverCardProps = {
  anchor: MarkInteractionAnchor;
  areas: AreaData[];
  pinned: boolean;
  onDismiss: () => void;
  onRemoveMark: (momentId: string) => Promise<{ ok: boolean; error?: string }>;
  onEnriched?: () => void | Promise<void>;
  onResolveAmbiguous?: (
    markId: string,
    resolution: StreamAmbiguousResolution,
    targetBranchId?: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  onHoverZoneEnter?: () => void;
  onHoverZoneLeave?: () => void;
};

export function MarkHoverCard({
  anchor,
  areas,
  pinned,
  onDismiss,
  onRemoveMark,
  onEnriched,
  onResolveAmbiguous,
  onHoverZoneEnter,
  onHoverZoneLeave,
}: MarkHoverCardProps) {
  const { moment, area, hubLabel, clientX, clientY } = anchor;
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [resolveBusy, setResolveBusy] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState(moment.branchId);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    placement: "above" | "below";
  }>({ left: clientX, top: clientY - 8, placement: "above" });

  const dateLabel = formatMarkDateDisplay(moment);
  const unresolved = moment.needsResolution === true;
  const sparse = !unresolved && isSparseContextItem(moment.label, moment.description);
  const description = moment.description?.trim();
  const hubOptions = areas.map((optionArea) => ({
    area: optionArea,
    hubs: optionArea.branches,
  }));

  useEffect(() => {
    setSelectedBranchId(moment.branchId);
  }, [moment.id, moment.branchId]);

  useLayoutEffect(() => {
    const card = cardRef.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 12;
    const gap = 10;
    const cardW = Math.min(288, vw - pad * 2);
    const cardH = card?.offsetHeight ?? 120;

    let left = clientX - cardW / 2;
    left = Math.max(pad, Math.min(left, vw - cardW - pad));

    const spaceAbove = clientY - gap;
    const spaceBelow = vh - clientY - gap;
    const placeAbove = spaceAbove >= cardH || spaceAbove >= spaceBelow;

    let top: number;
    if (placeAbove) {
      top = clientY - gap - cardH;
      top = Math.max(pad, top);
    } else {
      top = clientY + gap;
      top = Math.min(top, vh - cardH - pad);
    }

    setPosition({ left, top, placement: placeAbove ? "above" : "below" });
  }, [clientX, clientY, moment.id, description, sparse, pinned]);

  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinned, onDismiss]);

  useEffect(() => {
    if (!pinned) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = cardRef.current;
      if (el && !el.contains(e.target as Node)) onDismiss();
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [pinned, onDismiss]);

  const shell = (
    <div
      ref={cardRef}
      role={pinned ? "dialog" : "tooltip"}
      aria-label={`Mark: ${moment.label}`}
      onClick={(e) => e.stopPropagation()}
      onPointerEnter={onHoverZoneEnter}
      onPointerLeave={onHoverZoneLeave}
      style={{
        position: "fixed",
        left: position.left,
        top: position.top,
        width: "min(288px, calc(100vw - 24px))",
        zIndex: 80,
        boxSizing: "border-box",
        padding: "14px 16px 12px",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.1)",
        borderLeft: `3px solid ${MARK_TREE_AMBER}`,
        background: "rgba(22, 22, 20, 0.97)",
        backdropFilter: "blur(10px)",
        boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          width: 10,
          height: 10,
          marginLeft: -5,
          background: "rgba(22, 22, 20, 0.97)",
          border: "1px solid rgba(255,255,255,0.1)",
          transform: "rotate(45deg)",
          ...(position.placement === "above"
            ? { bottom: -6, borderLeft: "none", borderTop: "none" }
            : { top: -6, borderRight: "none", borderBottom: "none" }),
        }}
      />

      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: description ? 8 : 10 }}>
        <div style={{ flexShrink: 0, paddingTop: 2 }}>
          <MarkDiamondIcon size={9} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 500,
              color: "var(--color-text-primary, #f0ede6)",
              lineHeight: 1.35,
              letterSpacing: "-0.01em",
            }}
          >
            {moment.label}
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 12,
              color: "var(--color-text-tertiary, #8a8680)",
              lineHeight: 1.4,
            }}
          >
            {dateLabel ? (
              <span style={{ color: "var(--color-text-secondary, #c8c4bc)" }}>{dateLabel}</span>
            ) : null}
            {dateLabel ? " · " : null}
            {hubLabel} · {area.label}
          </div>
        </div>
        {pinned ? (
          <button
            type="button"
            aria-label="Close"
            onClick={onDismiss}
            style={{
              flexShrink: 0,
              border: "none",
              background: "transparent",
              color: "var(--color-text-tertiary, #8a8680)",
              fontSize: 20,
              lineHeight: 1,
              padding: 0,
              width: 28,
              height: 28,
              cursor: "pointer",
              borderRadius: 6,
            }}
          >
            ×
          </button>
        ) : null}
      </div>

      {description ? (
        <p
          style={{
            margin: "0 0 12px",
            paddingLeft: 28,
            fontSize: 13,
            color: "var(--color-text-secondary, #c8c4bc)",
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
      ) : null}

      {unresolved && onResolveAmbiguous ? (
        <div style={{ marginBottom: 12, paddingLeft: 28 }}>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--color-text-tertiary, #8a8680)", lineHeight: 1.45 }}>
            What is this on your map?
          </p>
          <label
            style={{
              display: "grid",
              gap: 4,
              marginBottom: 10,
              fontSize: 12,
              color: "var(--color-text-tertiary, #8a8680)",
            }}
          >
            Hub
            <select
              value={selectedBranchId}
              disabled={resolveBusy}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              style={{
                width: "100%",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(12, 12, 10, 0.95)",
                color: "var(--color-text-primary, #f0ede6)",
                padding: "7px 8px",
                fontSize: 13,
              }}
            >
              {hubOptions.map(({ area: optionArea, hubs }) => (
                <optgroup key={optionArea.id} label={optionArea.label}>
                  {hubs.map((hub) => (
                    <option key={hub.id} value={hub.id}>
                      {(hub.type.trim() || "Hub")} ({optionArea.label})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(
              [
                ["done", "Done"],
                ["in_progress", "In progress"],
                ["not_started", "Not started"],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                disabled={resolveBusy}
                onClick={async () => {
                  setResolveError(null);
                  setResolveBusy(true);
                  const result = await onResolveAmbiguous(moment.id, val, selectedBranchId);
                  setResolveBusy(false);
                  if (!result.ok) {
                    setResolveError(result.error ?? "Could not resolve.");
                    return;
                  }
                  onDismiss();
                }}
                style={{
                  flex: "1 1 88px",
                  padding: "8px 10px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: resolveBusy ? "wait" : "pointer",
                  border: `1px solid ${area.color}55`,
                  background: "transparent",
                  color: "var(--color-text-primary, #f0ede6)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {resolveError ? (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "#f87171" }}>{resolveError}</p>
          ) : null}
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          paddingLeft: 28,
          flexWrap: "wrap",
        }}
      >
        {sparse && onEnriched ? (
          <SparseContextPrompt
            itemType="mark"
            itemId={moment.id}
            accentColor={MARK_TREE_AMBER}
            compact
            onDone={onEnriched}
          />
        ) : null}
        <button
          type="button"
          disabled={removeBusy}
          onClick={async () => {
            if (
              !window.confirm(
                `Remove “${moment.label}” from your map? It will be archived (hidden from the tree).`,
              )
            ) {
              return;
            }
            setRemoveBusy(true);
            const result = await onRemoveMark(moment.id);
            setRemoveBusy(false);
            if (result.ok) onDismiss();
          }}
          style={{
            marginLeft: sparse && onEnriched ? "auto" : undefined,
            border: "none",
            background: "transparent",
            padding: 0,
            fontSize: 13,
            color: "var(--color-text-tertiary, #8a8680)",
            cursor: removeBusy ? "wait" : "pointer",
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          {removeBusy ? "Removing…" : "Remove from map"}
        </button>
      </div>
    </div>
  );

  if (typeof document === "undefined") return shell;
  return createPortal(shell, document.body);
}