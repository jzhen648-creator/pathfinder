"use client";

import { hubPanelCopy } from "@/lib/hub-catalog";
import type { OnboardingHubOption } from "./onboarding-scene-router";

const PANEL_WIDTH_PX = 220;
const DESCRIPTION_LIMIT = 60;

type OnboardingHubCalloutsProps = {
  themeId: string;
  hubs: OnboardingHubOption[];
  accentColor: string;
  onSelect: (slug: string) => void;
};

function truncateDescription(text: string): string {
  const firstLine = text.replace(/\s+/g, " ").trim();
  if (firstLine.length <= DESCRIPTION_LIMIT) return firstLine;
  return `${firstLine.slice(0, DESCRIPTION_LIMIT - 3).trimEnd()}...`;
}

/**
 * Onboarding Scene 3 only — compact hub picker beside the map.
 * Never imported from main tree routes.
 */
export function OnboardingHubCallouts({
  themeId,
  hubs,
  accentColor,
  onSelect,
}: OnboardingHubCalloutsProps) {
  if (hubs.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 24,
        top: "50%",
        width: PANEL_WIDTH_PX,
        transform: "translateY(-50%)",
        zIndex: 4,
        pointerEvents: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 10,
        borderRadius: 16,
        border: "1px solid rgba(245,243,250,0.12)",
        background: "rgba(9,8,14,0.82)",
        boxShadow: "0 18px 48px rgba(0,0,0,0.42)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
      }}
      aria-hidden={false}
      aria-label={`${themeId} hub choices`}
    >
      {hubs.map((hub) => {
        const catalog = hubPanelCopy(themeId, hub.label);
        const description = truncateDescription(catalog.about);

        return (
          <button
            key={hub.slug}
            type="button"
            onClick={() => onSelect(hub.slug)}
            style={{
              width: "100%",
              textAlign: "left",
              background: "rgba(18,16,26,0.74)",
              border: `1px solid ${accentColor}30`,
              borderRadius: 12,
              padding: "10px 11px",
              cursor: "pointer",
              boxShadow: `0 0 18px ${accentColor}10`,
              transition: "border-color 120ms, background 120ms, transform 120ms",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = `${accentColor}80`;
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(24,21,34,0.9)";
              (e.currentTarget as HTMLButtonElement).style.transform = "translateX(2px)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = `${accentColor}30`;
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(18,16,26,0.74)";
              (e.currentTarget as HTMLButtonElement).style.transform = "translateX(0)";
            }}
          >
            <span
              style={{
                display: "block",
                fontSize: 14,
                fontWeight: 700,
                color: accentColor,
                marginBottom: 4,
              }}
            >
              {hub.label}
            </span>
            <span
              style={{
                display: "block",
                fontSize: 12,
                lineHeight: 1.45,
                color: "rgba(245,243,250,0.58)",
              }}
            >
              {description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
