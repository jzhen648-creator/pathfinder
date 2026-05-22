"use client";

import { PF_ROADMAP_THEME_CSS } from "@/components/shell/pf-roadmap-theme";
import { IssuesEmptyState } from "./issues-empty-state";
import { IssuesList } from "./issues-list";
import { useMapIssues } from "./use-map-issues";

export function IssuesShell() {
  const { snapshot, loading, error, refetch } = useMapIssues();

  const issues = snapshot?.issues ?? [];
  const hasIssues = issues.length > 0;

  return (
    <div className="pf-roadmap h-full overflow-hidden text-(--rm-text1)">
      <style>{PF_ROADMAP_THEME_CSS}</style>
      <div className="pf-roadmap-shell bg-(--rm-canvas)">
        <main className="rm-main flex min-h-0 flex-col overflow-hidden">
          <div
            className="shrink-0 border-b px-7 py-5"
            style={{
              borderColor: "var(--rm-border, #D8D9DC)",
              background: "var(--rm-bgEl, #FFFFFF)",
            }}
          >
            <h1
              className="text-[22px] font-medium"
              style={{ fontFamily: "var(--font-pf-roadmap-serif), Lora, Georgia, serif" }}
            >
              Issues
            </h1>
            <p className="mt-1 text-[14px] text-(--rm-text3)">Data quality on your map</p>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
            {loading ? (
              <p className="px-5 py-8 text-[14px] text-(--rm-text3)">Loading issues…</p>
            ) : error ? (
              <div className="px-5 py-8">
                <p className="text-[14px] text-red-600 dark:text-red-400">{error}</p>
                <button
                  type="button"
                  className="mt-3 text-[14px] font-medium text-(--rm-text1) underline"
                  onClick={() => void refetch()}
                >
                  Try again
                </button>
              </div>
            ) : hasIssues ? (
              <IssuesList issues={issues} />
            ) : (
              <IssuesEmptyState />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
