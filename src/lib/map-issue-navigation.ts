import type { MapIssueTarget } from "@/lib/map-issues";

export function mapIssueGoToHref(target: MapIssueTarget): string {
  if (target.entity === "goal") {
    return `/tree?goalId=${encodeURIComponent(target.goalId)}`;
  }
  return `/tree?markId=${encodeURIComponent(target.markId)}`;
}
