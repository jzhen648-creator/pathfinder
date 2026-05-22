"use client";

import Link from "next/link";
import type { MapIssue, MapIssueKind } from "@/lib/map-issues";
import { mapIssueGoToHref } from "@/lib/map-issue-navigation";

type Props = {
  issue: MapIssue;
};

const ISSUE_ICON_LABEL: Record<MapIssueKind, string> = {
  mark_needs_resolution: "?",
  pursuit_missing_deadline: "!",
  mark_missing_date: "D",
  pursuit_missing_short_label: "T",
  broken_continuation_chain: "C",
  continuation_date_order: "^",
};

export function IssuesRow({ issue }: Props) {
  return (
    <article
      className="ns-review-card"
      data-testid={`issue-row-${issue.kind}`}
    >
      <div className="ns-review-icon" aria-hidden>
        <span className="font-(family-name:--font-pf-ns-mono) text-[13px] font-medium">
          {ISSUE_ICON_LABEL[issue.kind]}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="ns-review-title truncate">{issue.title}</p>
        <p className="ns-review-description">{issue.description}</p>
        <div className="ns-review-meta">
          {issue.themeLabel ? <span className="ns-review-tag">{issue.themeLabel}</span> : null}
          {issue.hubLabel ? <span className="ns-review-tag">{issue.hubLabel}</span> : null}
        </div>
      </div>
      <Link
        href={mapIssueGoToHref(issue.target)}
        className="ns-review-action shrink-0"
      >
        Go to
      </Link>
    </article>
  );
}
