"use client";

import Link from "next/link";
import type { MapIssue } from "@/lib/map-issues";
import { mapIssueGoToHref } from "@/lib/map-issue-navigation";

type Props = {
  issue: MapIssue;
};

export function IssuesRow({ issue }: Props) {
  return (
    <article
      className="flex items-start justify-between gap-4 border-b px-5 py-4"
      style={{ borderColor: "var(--rm-border, #D8D9DC)" }}
      data-testid={`issue-row-${issue.kind}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-(--rm-text3)">{issue.description}</p>
        <p className="mt-0.5 truncate text-[15px] font-medium text-(--rm-text1)">{issue.title}</p>
      </div>
      <Link
        href={mapIssueGoToHref(issue.target)}
        className="shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors"
        style={{
          color: "var(--rm-text1)",
          background: "var(--rm-ink100, #ECEEF0)",
        }}
      >
        Go to
      </Link>
    </article>
  );
}
