import type { CSSProperties } from "react";
import type { MomentNode, TreeGoalNode } from "./tree-types";

export function statusFromMoment(moment: MomentNode): "bloomed" | "growing" | "ended" {
  if (moment.bloomStatus === "ENDED") return "ended";
  if (moment.bloomStatus === "GROWING" || moment.future) return "growing";
  return "bloomed";
}

export function badgeStatusFromGoalBloom(s: TreeGoalNode["bloomStatus"]): "bloomed" | "growing" | "ended" {
  if (s === "ENDED") return "ended";
  if (s === "GROWING" || s === "BUD") return "growing";
  return "bloomed";
}

export function roadmapGoalShowsProgressPulse(status: TreeGoalNode["bloomStatus"]): boolean {
  return status === "BUD" || status === "GROWING";
}

export function statusBadgeStyle(status: "bloomed" | "growing" | "ended"): CSSProperties {
  if (status === "growing") {
    return {
      background: "var(--color-background-success, rgba(34,197,94,0.12))",
      color: "var(--color-text-success, #16A34A)",
    };
  }
  if (status === "ended") {
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
  if (sig >= 3) return "defining goal";
  if (sig === 2) return "meaningful chapter";
  return "part of the journey";
}
