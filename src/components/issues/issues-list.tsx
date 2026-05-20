import type { MapIssue } from "@/lib/map-issues";
import { IssuesRow } from "./issues-row";

type Props = {
  issues: MapIssue[];
};

export function IssuesList({ issues }: Props) {
  return (
    <div className="flex flex-col" data-testid="issues-list">
      {issues.map((issue) => (
        <IssuesRow key={issue.id} issue={issue} />
      ))}
    </div>
  );
}
