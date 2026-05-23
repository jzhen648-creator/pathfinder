"use client";

import { useEffect, useMemo, useState } from "react";
import {
  OB_FONT_SANS,
  OB_TEXT_MUTED,
  OB_TEXT_PRIMARY,
  OB_TEXT_SECONDARY,
  obCardStyle,
  obSecondaryButtonStyle,
} from "@/components/onboarding/onboarding-ui";
import { TREE_THEME_SHORT_LABEL } from "@/components/tree/tree-design-visual";
import { getLifeArea } from "@/lib/life-areas";
import type { LifeAreaId } from "@/lib/types";

type ActivateThemeConfirmModalProps = {
  open: boolean;
  limbId: LifeAreaId | null;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
};

type TargetRect = {
  top: number;
  left: number;
  width: number;
  height: number;
  radius: number;
};

const COACH_RING_CSS = `
@keyframes activateThemeCoachPulse {
  0%, 100% { opacity: 0.82; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.035); }
}
`;

function readGatewayRect(limbId: LifeAreaId): TargetRect | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(`[data-tree-gateway-node][data-area-id="${limbId}"]`);
  if (!(el instanceof Element)) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const styles = window.getComputedStyle(el);
  const parsedRadius = Number.parseFloat(styles.borderRadius || "0");
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    radius: Number.isFinite(parsedRadius) && parsedRadius > 0 ? parsedRadius : Math.min(rect.height / 2, 18),
  };
}

export function ActivateThemeConfirmModal({
  open,
  limbId,
  onConfirm,
  onCancel,
  busy = false,
}: ActivateThemeConfirmModalProps) {
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);

  useEffect(() => {
    if (!open || !limbId) {
      setTargetRect(null);
      return;
    }

    let raf = 0;
    const update = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        setTargetRect(readGatewayRect(limbId));
      });
    };

    const initialDelay = window.setTimeout(update, 80);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const retry = window.setTimeout(update, 200);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(initialDelay);
      window.clearTimeout(retry);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, limbId]);

  const layout = useMemo(() => {
    if (!targetRect || typeof window === "undefined") return null;
    const gap = 14;
    const cardWidth = Math.min(300, Math.max(248, targetRect.width + 72));
    const left = Math.min(
      Math.max(16, targetRect.left + targetRect.width / 2 - cardWidth / 2),
      Math.max(16, window.innerWidth - cardWidth - 16),
    );
    const preferredTop = targetRect.top + targetRect.height + gap;
    const maxTop = window.innerHeight - 200;
    const top = Math.min(preferredTop, maxTop);
    return { top, left, width: cardWidth };
  }, [targetRect]);

  if (!open || !limbId) return null;

  const lifeArea = getLifeArea(limbId);
  const shortLabel = TREE_THEME_SHORT_LABEL[limbId] ?? lifeArea?.label ?? limbId;
  const themeLabel = lifeArea?.label ?? shortLabel;
  const accent = lifeArea?.color ?? "#7B68C8";

  const primaryCtaStyle = {
    flex: 1,
    borderRadius: 12,
    padding: "10px 14px",
    fontSize: 14,
    fontWeight: 600,
    fontFamily: OB_FONT_SANS,
    cursor: busy ? "default" : "pointer",
    border: `1px solid color-mix(in srgb, ${accent} 55%, transparent)`,
    background: `color-mix(in srgb, ${accent} 24%, rgba(11, 10, 15, 0.9))`,
    color: OB_TEXT_PRIMARY,
    boxShadow: `0 0 18px color-mix(in srgb, ${accent} 22%, transparent)`,
    opacity: busy ? 0.6 : 1,
  } as const;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: COACH_RING_CSS }} />
      <div
        className="fixed inset-0 z-[250000] bg-black/55"
        role="presentation"
        aria-hidden={busy}
        onClick={busy ? undefined : onCancel}
      />
      {targetRect ? (
        <div
          aria-hidden
          style={{
            position: "fixed",
            top: targetRect.top - 8,
            left: targetRect.left - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
            borderRadius: targetRect.radius + 8,
            border: `2px solid ${accent}`,
            boxShadow: `0 0 14px color-mix(in srgb, ${accent} 42%, transparent)`,
            pointerEvents: "none",
            zIndex: 250001,
            animation: "activateThemeCoachPulse 1.25s ease-in-out infinite",
            transformOrigin: "center",
          }}
        />
      ) : null}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="activate-theme-title"
        style={{
          position: "fixed",
          zIndex: 250002,
          ...obCardStyle,
          padding: "16px 18px 14px",
          boxShadow: `0 22px 56px rgba(0,0,0,0.48), 0 0 0 1px color-mix(in srgb, ${accent} 18%, transparent)`,
          ...(layout
            ? { top: layout.top, left: layout.left, width: layout.width }
            : {
                top: "50%",
                left: "50%",
                width: "min(300px, calc(100vw - 32px))",
                transform: "translate(-50%, -50%)",
              }),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="activate-theme-title"
          style={{
            margin: 0,
            fontFamily: OB_FONT_SANS,
            fontSize: 17,
            fontWeight: 600,
            lineHeight: 1.3,
            color: OB_TEXT_PRIMARY,
          }}
        >
          Add {shortLabel}?
        </h2>
        <p
          style={{
            margin: "8px 0 0",
            fontFamily: OB_FONT_SANS,
            fontSize: 14,
            lineHeight: 1.5,
            color: OB_TEXT_SECONDARY,
          }}
        >
          Start here with{" "}
          <span style={{ color: accent }}>{themeLabel}</span>. Next, you&apos;ll open one hub and add your
          first pursuit with Stream.
        </p>
        <p
          style={{
            margin: "10px 0 0",
            fontFamily: OB_FONT_SANS,
            fontSize: 12,
            lineHeight: 1.4,
            color: OB_TEXT_MUTED,
          }}
        >
          Next: choose your first {shortLabel} hub
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button
            type="button"
            disabled={busy}
            style={{
              ...obSecondaryButtonStyle,
              flex: 1,
              padding: "10px 14px",
              opacity: busy ? 0.5 : 1,
            }}
            onClick={onCancel}
          >
            Not now
          </button>
          <button type="button" disabled={busy} style={primaryCtaStyle} onClick={onConfirm}>
            {busy ? "Adding…" : `Add ${shortLabel}`}
          </button>
        </div>
      </div>
    </>
  );
}
