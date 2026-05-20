import type { AreaLayoutOverride } from "./tree-layout-edit";
import { LAYOUT_DRAG_THRESHOLD_PX } from "./tree-view-constants";

export function hasCrossedLayoutDragThreshold(
  d: { startClientX: number; startClientY: number },
  clientX: number,
  clientY: number,
): boolean {
  return Math.hypot(clientX - d.startClientX, clientY - d.startClientY) >= LAYOUT_DRAG_THRESHOLD_PX;
}

export function hasAreaOverride(ov: AreaLayoutOverride): boolean {
  return (
    (ov.limbRotateDeg != null && Math.abs(ov.limbRotateDeg) > 1e-6) ||
    ov.limbTip != null ||
    ov.limbFirstC2 != null ||
    (ov.limbForkTiltDeg != null && Math.abs(ov.limbForkTiltDeg) > 1e-6) ||
    (ov.limbTipTiltDeg != null && Math.abs(ov.limbTipTiltDeg) > 1e-6) ||
    ((ov.branches != null && Object.keys(ov.branches).length > 0) ||
      (ov.threads != null && Object.keys(ov.threads).length > 0)) ||
    (ov.momentPositions != null && Object.keys(ov.momentPositions).length > 0) ||
    (ov.hubPositions != null && Object.keys(ov.hubPositions).length > 0)
  );
}

export function upsertAreaLayout(
  prev: Record<string, AreaLayoutOverride>,
  areaId: string,
  areaOverride: AreaLayoutOverride,
): Record<string, AreaLayoutOverride> {
  const next = { ...prev };
  if (hasAreaOverride(areaOverride)) next[areaId] = areaOverride;
  else delete next[areaId];
  return next;
}
