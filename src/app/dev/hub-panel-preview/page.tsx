"use client";

import { HubCatalogPanelPreview } from "@/components/tree/hub-catalog-panel-sections";
import { getLifeArea } from "@/lib/life-areas";

export default function HubPanelPreviewDevPage() {
  const work = getLifeArea("work");
  const becoming = getLifeArea("becoming");

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 32,
        background: "var(--color-background-primary, #0f1012)",
        color: "var(--color-text-primary, #e8eaed)",
      }}
    >
      <h1 style={{ marginBottom: 8, fontSize: 20, fontWeight: 600 }}>Hub panel preview (dev)</h1>
      <p style={{ marginBottom: 32, maxWidth: 480, fontSize: 14, opacity: 0.7 }}>
        Visual check for renamed hubs.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 32, alignItems: "flex-start" }}>
        {work ? (
          <HubCatalogPanelPreview
            themeId="work"
            hubLabel="Builds & Launches"
            themeLabel={work.label}
            areaColor={work.color}
          />
        ) : null}
        {becoming ? (
          <HubCatalogPanelPreview
            themeId="becoming"
            hubLabel="Inner life"
            themeLabel={becoming.label}
            areaColor={becoming.color}
          />
        ) : null}
      </div>
    </div>
  );
}
