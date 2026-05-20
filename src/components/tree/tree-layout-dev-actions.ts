import {
  arcLengthMomentStationSegment,
  momentPositionAtArcOffsetFromStationLo,
} from "./tree-branch-geometry";
import { applyLayoutOverrides, type AreaLayoutOverride, type LayoutOverrides } from "./tree-layout-edit";
import { buildAreaForksRecord, getAreaSlotRender } from "./tree-forks";
import type { AreaData } from "./tree-types";
import { hasAreaOverride, upsertAreaLayout } from "./tree-view-layout-overrides";

/** Evenly space timeline marks along each branch using the densest branch as the spacing reference. */
export function distributeAllMomentsEvenly(
  areas: AreaData[],
  prev: LayoutOverrides,
  allAreasForForkGeometry: AreaData[],
): LayoutOverrides {
  const mergedForks = applyLayoutOverrides(buildAreaForksRecord(allAreasForForkGeometry), prev);
  let maxMoments = 0;
  let shortestArc = Infinity;
  for (const area of areas) {
    const slots = getAreaSlotRender(area.id, mergedForks);
    if (!slots) continue;
    for (let ti = 0; ti < area.branches.length; ti += 1) {
      const thread = area.branches[ti];
      const n = thread.moments.length;
      maxMoments = Math.max(maxMoments, n);
      if (n < 2) continue;
      const path = slots.branchStrokes[ti]?.path;
      if (!path) continue;
      const L = arcLengthMomentStationSegment(path);
      if (L > 1e-9) shortestArc = Math.min(shortestArc, L);
    }
  }
  if (maxMoments < 2 || shortestArc === Infinity || shortestArc < 1e-9) return prev;
  const D = shortestArc / (maxMoments - 1);
  const next = { ...prev };
  for (const area of areas) {
    const slots = getAreaSlotRender(area.id, mergedForks);
    if (!slots) continue;
    const momentPositions: Record<string, { x: number; y: number }> = {};
    for (let ti = 0; ti < area.branches.length; ti += 1) {
      const thread = area.branches[ti];
      const path = slots.branchStrokes[ti]?.path;
      if (!path) continue;
      for (let mi = 0; mi < thread.moments.length; mi += 1) {
        const m = thread.moments[mi];
        const arcOffset = mi * D;
        momentPositions[m.id] = momentPositionAtArcOffsetFromStationLo(path, arcOffset);
      }
    }
    if (Object.keys(momentPositions).length === 0) continue;
    const areaPrev = { ...(next[area.id] ?? {}) } as AreaLayoutOverride;
    areaPrev.momentPositions = momentPositions;
    if (hasAreaOverride(areaPrev)) next[area.id] = areaPrev;
    else delete next[area.id];
  }
  return next;
}

/** Clear custom timeline-mark positions for every branch (marks return to path sampling). */
export function clearAllMomentPositionOverrides(areas: AreaData[], prev: LayoutOverrides): LayoutOverrides {
  const next = { ...prev };
  for (const ar of areas) {
    const areaPrev = { ...(next[ar.id] ?? {}) } as AreaLayoutOverride;
    const mp = { ...(areaPrev.momentPositions ?? {}) };
    for (const th of ar.branches) {
      for (const m of th.moments) delete mp[m.id];
    }
    const areaNext = { ...areaPrev };
    if (Object.keys(mp).length === 0) delete areaNext.momentPositions;
    else areaNext.momentPositions = mp;
    if (hasAreaOverride(areaNext)) next[ar.id] = areaNext;
    else delete next[ar.id];
  }
  return next;
}

export function clearAreaLayoutOverride(prev: LayoutOverrides, areaId: string): LayoutOverrides {
  const next = { ...prev };
  delete next[areaId];
  return next;
}

export type LayoutOverrideSummary = {
  areasWithOverrides: number;
  momentOverrides: number;
  hubOverrides: number;
  branchOverrides: number;
  editingLimbCount: number;
};

export function summarizeLayoutOverrides(
  overrides: LayoutOverrides,
  editingByAreaId: Record<string, boolean>,
): LayoutOverrideSummary {
  let momentOverrides = 0;
  let hubOverrides = 0;
  let branchOverrides = 0;
  let areasWithOverrides = 0;
  for (const ov of Object.values(overrides)) {
    if (!hasAreaOverride(ov)) continue;
    areasWithOverrides += 1;
    momentOverrides += Object.keys(ov.momentPositions ?? {}).length;
    hubOverrides += Object.keys(ov.hubPositions ?? {}).length;
    branchOverrides += Object.keys(ov.branches ?? ov.threads ?? {}).length;
  }
  return {
    areasWithOverrides,
    momentOverrides,
    hubOverrides,
    branchOverrides,
    editingLimbCount: Object.keys(editingByAreaId).length,
  };
}

export function formatLayoutOverrideSummary(summary: LayoutOverrideSummary): string {
  const parts: string[] = [];
  if (summary.editingLimbCount > 0) {
    parts.push(`${summary.editingLimbCount} editing`);
  }
  if (summary.areasWithOverrides > 0) {
    parts.push(`${summary.areasWithOverrides} overridden`);
  }
  return parts.length > 0 ? parts.join(" · ") : "No overrides";
}
