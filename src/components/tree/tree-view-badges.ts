import type { CSSProperties } from "react";
import { badgeBucketFromBloom, type BloomBadgeBucket } from "@/lib/bloom-display";
import type { TreeGoalNode } from "./tree-types";

export function badgeStatusFromGoalBloom(s: TreeGoalNode["bloomStatus"]): BloomBadgeBucket {
  return badgeBucketFromBloom(s);
}

export function roadmapGoalShowsProgressPulse(status: TreeGoalNode["bloomStatus"]): boolean {
  return status === "ACTIVE";
}

export function statusBadgeStyle(status: BloomBadgeBucket): CSSProperties {
  if (status === "active") {
    return {
      background: "var(--color-background-success, rgba(34,197,94,0.12))",
      color: "var(--color-text-success, #16A34A)",
    };
  }
  if (status === "on_hold") {
    return {
      background: "var(--color-background-secondary, rgba(148,163,184,0.15))",
      color: "var(--color-text-tertiary, #64748B)",
    };
  }
  return {
    background: "var(--color-background-warning, rgba(245,158,11,0.14))",
    color: "var(--color-text-warning, #B45309)",
  };
}

export function sigLabel(sig: number): string {
  if (sig >= 3) return "defining pursuit";
  if (sig === 2) return "meaningful chapter";
  return "part of the journey";
}
