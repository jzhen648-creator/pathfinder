"use client";

import type { CSSProperties } from "react";
import {
  canonicalHubDisplayLabel,
  hubMapGoalNoun,
  hubPanelCopy,
  parseHubRedirectTarget,
  type HubCatalogEntry,
} from "@/lib/category-catalog";
import { getLifeArea } from "@/lib/life-areas";
import { LOCKED_HUB_TEMPLATES } from "@/lib/taxonomy";
import type { AreaData } from "./tree-types";

const hubSectionLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: ".07em",
  textTransform: "uppercase",
  color: "var(--color-text-tertiary)",
  marginBottom: 8,
};

function colorForHubRedirectTarget(
  areas: AreaData[] | undefined,
  targetHubName: string,
  fallbackColor: string,
): string {
  if (areas) {
    for (const a of areas) {
      for (const thread of a.branches) {
        if (canonicalHubDisplayLabel(a.id, thread.type.trim()) === targetHubName) return a.color;
      }
    }
  }
  const template = LOCKED_HUB_TEMPLATES.find((t) => t.threadType === targetHubName);
  if (template) return getLifeArea(template.limbId)?.color ?? fallbackColor;
  return "var(--color-text-tertiary)";
}

function HubDoesNotBelongLine({
  line,
  areas,
  fallbackColor,
}: {
  line: string;
  areas?: AreaData[];
  fallbackColor: string;
}) {
  const target = parseHubRedirectTarget(line);
  if (!target) {
    return (
      <li style={{ marginBottom: 4, fontSize: 13, lineHeight: 1.5, color: "var(--color-text-tertiary)" }}>
        {line}
      </li>
    );
  }
  const prefix = line.replace(/\s*\(→\s*[^)]+\)\s*$/, "").trim();
  const redirectColor = colorForHubRedirectTarget(areas, target, fallbackColor);
  return (
    <li style={{ marginBottom: 4, fontSize: 13, lineHeight: 1.5, color: "var(--color-text-tertiary)" }}>
      {prefix}{" "}
      <span style={{ whiteSpace: "nowrap" }}>
        (→ <span style={{ color: redirectColor, fontWeight: 600 }}>{target}</span>)
      </span>
    </li>
  );
}

export function HubCatalogPanelSections({
  copy,
  areaColor,
  areas,
  compact = false,
}: {
  copy: HubCatalogEntry;
  areaColor: string;
  areas?: AreaData[];
  compact?: boolean;
}) {
  if (compact) {
    return (
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "var(--color-text-secondary)" }}>
        {copy.about}
      </p>
    );
  }
  return (
    <div
      style={{
        padding: "14px 14px 12px",
        borderRadius: 12,
        border: "1px solid var(--color-border-tertiary)",
        background: "var(--color-background-secondary, rgba(255,255,255,0.02))",
        display: "grid",
        gap: 14,
      }}
    >
      <div>
        <div style={hubSectionLabelStyle}>What this hub is for</div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "var(--color-text-secondary)" }}>
          {copy.about}
        </p>
      </div>
      <div>
        <div style={hubSectionLabelStyle}>Why it matters</div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "var(--color-text-secondary)" }}>
          {copy.why}
        </p>
      </div>
      <div>
        <div style={hubSectionLabelStyle}>Belongs here</div>
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            fontSize: 13,
            lineHeight: 1.5,
            color: "var(--color-text-tertiary)",
          }}
        >
          {copy.belongsHere.map((item) => (
            <li key={item} style={{ marginBottom: 4 }}>
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div style={hubSectionLabelStyle}>Doesn&apos;t belong here</div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {copy.doesNotBelongHere.map((item) => (
            <HubDoesNotBelongLine
              key={item}
              line={item}
              areas={areas}
              fallbackColor={areaColor}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Dev / docs helper — render catalog copy for a theme + hub label. */
export function HubCatalogPanelPreview({
  themeId,
  hubLabel,
  themeLabel,
  areaColor,
}: {
  themeId: string;
  hubLabel: string;
  themeLabel: string;
  areaColor: string;
}) {
  const copy = hubPanelCopy(themeId, hubLabel);
  return (
    <section
      style={{
        maxWidth: 420,
        borderRight: `4px solid ${areaColor}`,
        background: "var(--color-background-primary)",
        padding: "16px 18px 20px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: ".08em",
          textTransform: "uppercase",
          color: areaColor,
          marginBottom: 6,
        }}
      >
        {themeLabel} · Hub
      </div>
      <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 600, color: "var(--color-text-primary)" }}>
        {hubLabel}
      </h2>
      <p style={{ margin: "0 0 18px", fontSize: 13, color: "var(--color-text-tertiary)" }}>
        0 {hubMapGoalNoun(themeId, true)}
      </p>
      <HubCatalogPanelSections copy={copy} areaColor={areaColor} />
    </section>
  );
}
