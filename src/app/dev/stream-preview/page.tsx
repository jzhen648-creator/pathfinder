"use client";

import { useCallback, useMemo, useState } from "react";
import { mergePreviewItemsIntoHub } from "@/components/stream/stream-hub-preview-data";
import { StreamHubPreview } from "@/components/stream/stream-hub-preview";
import {
  STREAM_PREVIEW_FIXTURE_CAREER,
  STREAM_PREVIEW_FIXTURE_MINIMAL,
  createCareerHubDevBaseThread,
  previewLayoutToApprovedItems,
  streamPreviewFixtureCareerLayout,
  streamPreviewFixtureMinimalLayout,
} from "@/components/stream/stream-preview-fixtures";
import { layoutStreamPreview } from "@/components/stream/stream-preview-layout";
import type { PreviewLayoutInput } from "@/components/stream/stream-preview-layout";
import { PF_ROADMAP_THEME_CSS } from "@/components/shell/pf-roadmap-theme";

/** Matches production domain-cluster layout (Career → work life area). */
const DEV_AREA_ID = "work";
const DEV_BRANCH_ID = "dev-career-hub";
const ACCENT = "#c9a227";

function cloneInput(input: PreviewLayoutInput): PreviewLayoutInput {
  return {
    hubLabel: input.hubLabel,
    marks: [...input.marks],
    pursuits: input.pursuits.map((p) => ({ ...p })),
    milestones: [...input.milestones],
  };
}

export default function StreamPreviewDevPage() {
  const [variant, setVariant] = useState<"career" | "minimal">("career");
  const [input, setInput] = useState<PreviewLayoutInput>(() =>
    cloneInput(STREAM_PREVIEW_FIXTURE_CAREER),
  );

  const reset = useCallback((v: "career" | "minimal") => {
    setVariant(v);
    setInput(
      cloneInput(v === "career" ? STREAM_PREVIEW_FIXTURE_CAREER : STREAM_PREVIEW_FIXTURE_MINIMAL),
    );
  }, []);

  const bundle = useMemo(() => {
    const baseThread = createCareerHubDevBaseThread(DEV_BRANCH_ID);
    const approved = previewLayoutToApprovedItems(input);
    return mergePreviewItemsIntoHub(baseThread, approved, {
      id: DEV_AREA_ID,
      label: input.hubLabel,
      color: ACCENT,
    });
  }, [input]);

  const columnLayout = useMemo(() => layoutStreamPreview(input), [input]);

  return (
    <div className="pf-roadmap min-h-screen bg-[var(--rm-bg0,#0f1012)] p-8 text-[var(--rm-text1,#e8eaed)]">
      <style dangerouslySetInnerHTML={{ __html: PF_ROADMAP_THEME_CSS }} />
      <h1 className="mb-2 text-xl font-semibold">Stream hub preview (dev)</h1>
      <p className="mb-6 max-w-lg text-sm text-[var(--color-text-secondary)]">
        Career hub: three committed pursuits, two marks, plus three Stream preview pursuits (50%
        opacity + pulse). &quot;Get executive presence coach&quot; is a child of &quot;Become Head
        of Product&quot;.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          className="rounded-md border border-[var(--color-border-tertiary)] px-3 py-1.5 text-sm"
          onClick={() => reset("career")}
          style={{ opacity: variant === "career" ? 1 : 0.6 }}
        >
          Career hub
        </button>
        <button
          type="button"
          className="rounded-md border border-[var(--color-border-tertiary)] px-3 py-1.5 text-sm"
          onClick={() => reset("minimal")}
          style={{ opacity: variant === "minimal" ? 1 : 0.6 }}
        >
          Preview only
        </button>
      </div>
      <StreamHubPreview bundle={bundle} areaColor={ACCENT} />
      <details className="mt-8 max-w-xl text-xs text-[var(--color-text-tertiary)]">
        <summary className="cursor-pointer">Legacy column layout (reference)</summary>
        <pre className="mt-2 overflow-auto rounded bg-black/30 p-3">
          career: {streamPreviewFixtureCareerLayout.nodes.length} preview rows
          {"\n"}
          minimal: {streamPreviewFixtureMinimalLayout.nodes.length} preview rows
          {"\n"}
          current input: {columnLayout.nodes.length} preview rows
        </pre>
      </details>
    </div>
  );
}