import type { Limb, Branch, Moment, Path, Gap } from "./types";

export const PROMPT_DISTANCE = 260;
export const MOMENT_SPACING = 120;
export const FORK_ANGLE_OFFSET = 25;

/**
 * Core position formula
 * angle: 0 = straight up
 * negative = left
 * positive = right
 */
export function getPos(
  angle: number,
  distance: number,
): { x: number; y: number } {
  const rad = angle * Math.PI / 180;
  return {
    x: Math.sin(rad) * distance,
    y: -Math.abs(Math.cos(rad)) * distance,
  };
}

/**
 * Get position of a Moment on a Branch
 * based on its mapPosition index
 */
export function getMomentPos(
  limb: Limb,
  branch: Branch,
  mapPositionIndex: number,
): { x: number; y: number } {
  const effectiveAngle = limb.angle + branch.mapAngleOffset;
  return getPos(
    effectiveAngle,
    PROMPT_DISTANCE + mapPositionIndex * MOMENT_SPACING,
  );
}

/**
 * Get the prompt endpoint for an empty
 * Branch (where the + circle shows)
 */
export function getBranchPromptPos(
  limb: Limb,
  branch: Branch,
): { x: number; y: number } {
  const effectiveAngle = limb.angle + branch.mapAngleOffset;
  return getPos(effectiveAngle, PROMPT_DISTANCE);
}

/**
 * Build all Path visuals for a Branch
 */
export function buildPaths(
  limb: Limb,
  branch: Branch,
  moments: Moment[],
): Path[] {
  const sorted = [...moments]
    .sort((a, b) => a.mapPosition - b.mapPosition);
  const paths: Path[] = [];
  const color = limb.color;

  if (sorted.length === 0) {
    // Empty branch — path to prompt
    paths.push({
      fromPos: { x: 0, y: 0 },
      toPos: getBranchPromptPos(limb, branch),
      color,
      future: false,
      isExtension: false,
    });
    return paths;
  }

  // Root to first moment
  paths.push({
    fromPos: { x: 0, y: 0 },
    toPos: getMomentPos(limb, branch, 0),
    color,
    future: false,
    isExtension: false,
  });

  // Moment to moment
  sorted.forEach((_, i) => {
    if (i === sorted.length - 1) return;
    paths.push({
      fromPos: getMomentPos(limb, branch, i),
      toPos: getMomentPos(limb, branch, i + 1),
      color,
      future: sorted[i + 1].future,
      isExtension: false,
    });
  });

  // Extension beyond last moment
  const last = sorted.length - 1;
  paths.push({
    fromPos: getMomentPos(limb, branch, last),
    toPos: getMomentPos(limb, branch, last + 1),
    color,
    future: true,
    isExtension: true,
  });

  return paths;
}

/**
 * Build all Gaps for a Branch
 */
export function buildGaps(
  limb: Limb,
  branch: Branch,
  moments: Moment[],
): Gap[] {
  const sorted = [...moments]
    .sort((a, b) => a.mapPosition - b.mapPosition);
  const gaps: Gap[] = [];

  // Gap before first moment
  const firstPos = sorted.length > 0
    ? getMomentPos(limb, branch, 0)
    : getBranchPromptPos(limb, branch);

  gaps.push({
    id: `gap-${branch.id}-0`,
    limbId: limb.id,
    branchId: branch.id,
    insertIndex: 0,
    prevMomentId: null,
    nextMomentId: sorted[0]?.id ?? null,
    fromPos: { x: 0, y: 0 },
    toPos: firstPos,
    midPos: {
      x: firstPos.x / 2,
      y: firstPos.y / 2,
    },
    promptContext: {
      prevMomentLabel: null,
      nextMomentLabel: sorted[0]?.label ?? null,
    },
  });

  // Gaps between moments
  sorted.forEach((m, i) => {
    if (i === sorted.length - 1) return;
    const fromPos = getMomentPos(limb, branch, i);
    const toPos = getMomentPos(limb, branch, i + 1);
    gaps.push({
      id: `gap-${branch.id}-${i + 1}`,
      limbId: limb.id,
      branchId: branch.id,
      insertIndex: i + 1,
      prevMomentId: m.id,
      nextMomentId: sorted[i + 1].id,
      fromPos,
      toPos,
      midPos: {
        x: (fromPos.x + toPos.x) / 2,
        y: (fromPos.y + toPos.y) / 2,
      },
      promptContext: {
        prevMomentLabel: m.label,
        nextMomentLabel: sorted[i + 1].label,
      },
    });
  });

  // Gap after last moment
  if (sorted.length > 0) {
    const last = sorted.length - 1;
    const fromPos = getMomentPos(limb, branch, last);
    const toPos = getMomentPos(limb, branch, last + 1);
    gaps.push({
      id: `gap-${branch.id}-end`,
      limbId: limb.id,
      branchId: branch.id,
      insertIndex: sorted.length,
      prevMomentId: sorted[last].id,
      nextMomentId: null,
      fromPos,
      toPos,
      midPos: {
        x: (fromPos.x + toPos.x) / 2,
        y: (fromPos.y + toPos.y) / 2,
      },
      promptContext: {
        prevMomentLabel: sorted[last].label,
        nextMomentLabel: null,
      },
    });
  }

  return gaps;
}

/**
 * Calculate mapPosition for a new Moment
 * being inserted at a given index
 */
export function calculateMapPosition(
  insertIndex: number,
  existingMoments: Moment[],
): number {
  const sorted = [...existingMoments]
    .sort((a, b) => a.mapPosition - b.mapPosition);

  if (sorted.length === 0) return 0;

  if (insertIndex === 0) {
    return sorted[0].mapPosition - 1;
  }

  if (insertIndex >= sorted.length) {
    return sorted[sorted.length - 1].mapPosition + 1;
  }

  return (sorted[insertIndex - 1].mapPosition + sorted[insertIndex].mapPosition) / 2;
}
