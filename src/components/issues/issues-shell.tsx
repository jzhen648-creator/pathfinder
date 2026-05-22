"use client";

import { useEffect, useMemo, useState } from "react";
import { MAP_ISSUE_LABELS, type MapIssueKind } from "@/lib/map-issues";
import { IssuesEmptyState } from "./issues-empty-state";
import { IssuesList } from "./issues-list";
import { useMapIssues } from "./use-map-issues";

const REVIEW_SHELL_CSS = `
  .pf-ns {
    --ns-canvas: #07060a;
    --ns-canvas2: #07060a;
    --ns-ink900: #e8e4dc;
    --ns-ink700: rgba(232, 228, 220, 0.68);
    --ns-ink500: rgba(232, 228, 220, 0.46);
    --ns-ink300: rgba(232, 228, 220, 0.32);
    --ns-ink100: rgba(255, 255, 255, 0.06);
    --ns-bgEl: rgba(255, 255, 255, 0.03);
    --ns-bgElHover: rgba(255, 255, 255, 0.06);
    --ns-border: rgba(255, 255, 255, 0.08);
    --ns-text1: var(--ns-ink900);
    --ns-text2: var(--ns-ink700);
    --ns-text3: var(--ns-ink500);
    --ns-ai: #7B68C8;
  }
  .pf-ns .ns-shell {
    display: block;
    height: 100%;
    min-height: 0;
    width: 100%;
  }
  .pf-ns .ns-main {
    background: var(--ns-canvas2);
    height: 100%;
    overflow-x: hidden;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .pf-ns .ns-page-header {
    background: var(--ns-bgEl);
    border-bottom: 1px solid var(--ns-border);
    padding: 20px 28px 0;
  }
  .pf-ns .ns-page-title {
    font-family: var(--font-pf-ns-serif), serif;
    font-size: 24px;
    font-weight: 400;
    color: var(--ns-text1);
    margin-bottom: 4px;
  }
  .pf-ns .ns-page-sub {
    font-size: 13px;
    color: var(--ns-text3);
    margin-bottom: 16px;
  }
  .pf-ns .ns-filter-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding-bottom: 16px;
    overflow-x: hidden;
  }
  .pf-ns .ns-filter-chip {
    height: 30px;
    padding: 0 12px;
    border-radius: 100px;
    font-size: 12px;
    font-weight: 500;
    border: 1px solid var(--ns-border);
    background: transparent;
    color: var(--ns-text2);
    cursor: pointer;
    white-space: nowrap;
    font-family: var(--font-pf-ns-sans), sans-serif;
  }
  .pf-ns .ns-filter-chip:hover {
    background: var(--ns-bgElHover);
    border-color: rgba(255, 255, 255, 0.14);
    color: var(--ns-text1);
  }
  .pf-ns .ns-filter-chip.ns-chip-active {
    background: rgba(255, 255, 255, 0.08);
    color: var(--ns-text1);
    border-color: rgba(255, 255, 255, 0.14);
  }
  .pf-ns .ns-content {
    padding: 20px 28px;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .pf-ns .ns-section-label {
    font-size: 11px;
    font-weight: 500;
    color: var(--ns-text3);
    text-transform: uppercase;
    letter-spacing: 0.07em;
    margin-top: 4px;
  }
  .pf-ns .ns-empty-card,
  .pf-ns .ns-review-card {
    background: var(--ns-bgEl);
    border-radius: 14px;
    border: 1px solid var(--ns-border);
  }
  .pf-ns .ns-empty-card {
    padding: 24px 20px;
    display: flex;
    align-items: center;
    gap: 14px;
    opacity: 0.72;
  }
  .pf-ns .ns-review-card {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px 20px;
    transition: box-shadow 200ms, border-color 200ms;
  }
  .pf-ns .ns-review-card:hover {
    box-shadow: 0 18px 54px rgba(0, 0, 0, 0.28);
    border-color: var(--ns-ink300);
  }
  .pf-ns .ns-review-icon {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: rgba(123, 104, 200, 0.16);
    color: #a998ee;
  }
  .pf-ns .ns-review-title {
    font-size: 15px;
    font-weight: 500;
    color: var(--ns-text1);
    margin-bottom: 3px;
  }
  .pf-ns .ns-review-description {
    font-size: 12px;
    color: var(--ns-text3);
    margin-bottom: 8px;
  }
  .pf-ns .ns-review-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .pf-ns .ns-review-tag {
    display: inline-flex;
    align-items: center;
    border-radius: 100px;
    padding: 3px 9px;
    background: var(--ns-ink100);
    color: var(--ns-text2);
    font-size: 11px;
    font-weight: 500;
  }
  .pf-ns .ns-review-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 34px;
    padding: 0 14px;
    border-radius: 9px;
    border: 1px solid var(--ns-border);
    background: transparent;
    color: var(--ns-text2);
    font-size: 13px;
    font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
  }
  .pf-ns .ns-review-action:hover {
    background: var(--ns-bgElHover);
    color: var(--ns-text1);
  }
`;

export function IssuesShell() {
  const { snapshot, loading, error, refetch } = useMapIssues();
  const [kindFilter, setKindFilter] = useState<MapIssueKind | "all">("all");

  const issues = snapshot?.issues ?? [];
  const visibleIssues = useMemo(
    () => (kindFilter === "all" ? issues : issues.filter((issue) => issue.kind === kindFilter)),
    [issues, kindFilter],
  );
  const kindCounts = useMemo(
    () => (Object.entries(snapshot?.byKind ?? {}) as [MapIssueKind, number][]).filter(([, count]) => count > 0),
    [snapshot?.byKind],
  );
  const hasIssues = visibleIssues.length > 0;

  useEffect(() => {
    if (kindFilter === "all") return;
    if (issues.some((issue) => issue.kind === kindFilter)) return;
    setKindFilter("all");
  }, [issues, kindFilter]);

  return (
    <div className="pf-ns h-full overflow-hidden bg-(--ns-canvas) text-(--ns-text1)">
      <style>{REVIEW_SHELL_CSS}</style>
      <div className="ns-shell">
        <main className="ns-main">
          <div className="ns-page-header">
            <div className="mb-0.5 flex items-center justify-between gap-3">
              <h1 className="ns-page-title">Review</h1>
            </div>
            <p className="ns-page-sub">Map checks that need attention.</p>
            <div className="ns-filter-row">
              <button
                type="button"
                className={`ns-filter-chip${kindFilter === "all" ? " ns-chip-active" : ""}`}
                aria-pressed={kindFilter === "all"}
                onClick={() => setKindFilter("all")}
              >
                All{snapshot ? ` · ${snapshot.total}` : ""}
              </button>
              {kindCounts.map(([kind, count]) => (
                <button
                  key={kind}
                  type="button"
                  className={`ns-filter-chip${kindFilter === kind ? " ns-chip-active" : ""}`}
                  aria-pressed={kindFilter === kind}
                  onClick={() => setKindFilter(kind)}
                >
                  {MAP_ISSUE_LABELS[kind]} · {count}
                </button>
              ))}
            </div>
          </div>

          <div className="ns-content">
            {loading ? (
              <div className="ns-empty-card">
                <div className="text-[13px] text-(--ns-text3)">Loading review...</div>
              </div>
            ) : error ? (
              <div className="ns-empty-card">
                <div className="min-w-0">
                  <div className="text-[13px] text-red-300">{error}</div>
                  <button
                    type="button"
                    className="mt-2 text-[12px] font-medium text-(--ns-text2) underline"
                    onClick={() => void refetch()}
                  >
                    Try again
                  </button>
                </div>
              </div>
            ) : hasIssues ? (
              <>
                <div className="ns-section-label">
                  Map review · {visibleIssues.length}
                </div>
                <IssuesList issues={visibleIssues} />
              </>
            ) : (
              <IssuesEmptyState />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
