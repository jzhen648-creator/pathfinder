"use client";

import { useEffect, useMemo, useState } from "react";
import { OB_FONT_SANS, OB_PRIMARY, obCardStyle } from "@/components/onboarding/onboarding-ui";
import { hubPanelCopy } from "@/lib/hub-catalog";
import type { CoachMarkStep } from "@/components/tree/tree-view-types";

type TargetRect = {
  top: number;
  left: number;
  width: number;
  height: number;
  radius: number;
};

export type OnboardingCoachMarkProps = {
  step: CoachMarkStep;
  targetSelector: string;
  instruction: string;
  onDismiss?: () => void;
  accentColor?: string;
  areaId?: string;
  hubLabel?: string;
  hubSlug?: string;
};

const COACH_MARK_CSS = `
@keyframes obCoachPulse {
  0%, 100% { opacity: 0.82; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.035); }
}
`;

function readTargetRect(targetSelector: string): TargetRect | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(targetSelector);
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

export function OnboardingCoachMark({
  step,
  targetSelector,
  instruction,
  onDismiss,
  accentColor = OB_PRIMARY,
  areaId,
  hubLabel,
}: OnboardingCoachMarkProps) {
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const effectiveInstruction =
    step === "open_stream" && areaId && hubLabel
      ? hubPanelCopy(areaId, hubLabel).coachMarkHubInstruction
      : instruction;

  useEffect(() => {
    if (!step || !targetSelector) {
      setTargetRect(null);
      return;
    }

    let raf = 0;
    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;

    const update = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        setTargetRect(readTargetRect(targetSelector));
      });
    };

    const initialDelay = window.setTimeout(update, 100);
    const el = document.querySelector(targetSelector);
    if (el instanceof Element && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(update);
      resizeObserver.observe(el);
    }
    if (typeof MutationObserver !== "undefined") {
      mutationObserver = new MutationObserver(update);
      mutationObserver.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    }

    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const retry = window.setTimeout(update, 240);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(initialDelay);
      window.clearTimeout(retry);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step, targetSelector]);

  const cardPosition = useMemo(() => {
    if (!targetRect) return null;
    const gap = 12;
    const cardWidth = Math.min(280, Math.max(220, targetRect.width + 64));
    const left = Math.min(
      Math.max(16, targetRect.left + targetRect.width / 2 - cardWidth / 2),
      Math.max(16, window.innerWidth - cardWidth - 16),
    );
    const top = Math.min(targetRect.top + targetRect.height + gap, window.innerHeight - 76);
    return { top, left, width: cardWidth };
  }, [targetRect]);

  if (!step || !targetRect || !cardPosition) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: COACH_MARK_CSS }} />
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: targetRect.top - 8,
          left: targetRect.left - 8,
          width: targetRect.width + 16,
          height: targetRect.height + 16,
          borderRadius: targetRect.radius + 8,
          border: `2px solid ${accentColor}`,
          color: accentColor,
          boxShadow: `0 0 12px color-mix(in srgb, currentColor 40%, transparent)`,
          pointerEvents: "none",
          zIndex: 250000,
          animation: "obCoachPulse 1.25s ease-in-out infinite",
          transformOrigin: "center",
        }}
      />
      <div
        role="note"
        style={{
          ...obCardStyle,
          position: "fixed",
          top: cardPosition.top,
          left: cardPosition.left,
          width: cardPosition.width,
          zIndex: 250001,
          maxWidth: 280,
          padding: "12px 16px",
          color: "rgba(245, 243, 250, 0.90)",
          fontFamily: OB_FONT_SANS,
          boxShadow: "0 18px 52px rgba(0,0,0,0.42)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          pointerEvents: onDismiss ? "auto" : "none",
        }}
      >
        <p style={{ margin: 0, fontSize: 14, fontWeight: 500, lineHeight: 1.4 }}>{effectiveInstruction}</p>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            style={{
              marginTop: 8,
              padding: 0,
              border: "none",
              background: "transparent",
              color: "rgba(245,243,250,0.55)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Dismiss
          </button>
        ) : null}
      </div>
    </>
  );
}
