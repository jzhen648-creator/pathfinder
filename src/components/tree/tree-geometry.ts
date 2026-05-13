import {
  deriveTrunkPressureLayers,
  deriveTrunkSurfaceAttach,
  TRUNK_BASE_Y as TRUNK_BOLE_BASE_Y,
  TRUNK_CROWN_Y as TRUNK_BOLE_CROWN_Y,
} from "./tree-trunk-geometry";
import {
  TREE_LIFE_AREA_TITLE_FONT_PX,
  TREE_THEME_GATEWAY_ICON_PX,
  TREE_THEME_GATEWAY_LABEL_GAP_PX,
} from "./tree-view-constants";
import { iconMedallionRadii } from "./tree-icon-medallion";

export type Point = { x: number; y: number }

export const TRUNK_BASE_Y = 1220
export const TRUNK_TOP_Y = 120
/** SVG canvas — large enough for wide theme spacing + hub spokes when panning. */
export const VIEWBOX_WIDTH = 2600
export const VIEWBOX_HEIGHT = 2600

/** Vertical axis pairing left life areas (finance, work) with right life areas (people, health) in fork data. */
export const TREE_TRUNK_MIRROR_X = VIEWBOX_WIDTH / 2

/**
 * Four evenly spaced trunk attach points for Work & Learning, People & Relationships,
 * Money & Finance, and Health & Body (slot 0 = highest toward crown, 3 = lowest toward the base).
 * {@link TREE_MAIN_LIMB_SHIFT_Y} moves the whole ladder down the trunk without changing relative gaps.
 */
const TREE_MAIN_LIMB_SHIFT_Y = 108

const TREE_MAIN_FOUR_BAND_TOP = 488 + TREE_MAIN_LIMB_SHIFT_Y
const TREE_MAIN_FOUR_BAND_BOT = 788 + TREE_MAIN_LIMB_SHIFT_Y

/** Extra +Y for the main four trunk forks (work, people, finance, health) and pleasures; Becoming crown stays put via {@link TREE_FORK_TOP}. */
const TREE_MAIN_FOUR_EXTRA_DROP_PX = 52

/**
 * Trunk→conduit attach **Y** never sits above this fraction of the bole (0 = crown, 1 = base).
 * SVG y increases downward, so this is a **floor** on attach Y — origins read lower on the trunk.
 * (Becoming crown uses {@link TREE_FORK_TOP} and is **not** clamped here.)
 */
const TREE_CONDUIT_TRUNK_ORIGIN_MIN_T = 0.22

function conduitTrunkAttachY(nominalY: number): number {
  const span = TRUNK_BOLE_BASE_Y - TRUNK_BOLE_CROWN_Y
  const yFloor = TRUNK_BOLE_CROWN_Y + span * TREE_CONDUIT_TRUNK_ORIGIN_MIN_T
  return Math.max(nominalY, yFloor)
}

function treeForkMainFourSlotY(slot: 0 | 1 | 2 | 3): number {
  return (
    TREE_MAIN_FOUR_BAND_TOP +
    (slot / 3) * (TREE_MAIN_FOUR_BAND_BOT - TREE_MAIN_FOUR_BAND_TOP) +
    TREE_MAIN_FOUR_EXTRA_DROP_PX
  )
}

const TREE_WORK_PEOPLE_FORK_LIFT_PX = 60
/** Extra +Y on Work / People trunk forks only (SVG y grows downward). */
const TREE_WORK_PEOPLE_FORK_DROP_PX = 80

const FORK_Y_WORK =
  treeForkMainFourSlotY(0) - TREE_WORK_PEOPLE_FORK_LIFT_PX + TREE_WORK_PEOPLE_FORK_DROP_PX
const FORK_Y_PEOPLE =
  treeForkMainFourSlotY(1) - TREE_WORK_PEOPLE_FORK_LIFT_PX + TREE_WORK_PEOPLE_FORK_DROP_PX
const FORK_Y_FINANCE = treeForkMainFourSlotY(2)
const FORK_Y_HEALTH = treeForkMainFourSlotY(3)

/** Main limbs emerge from vascular trunk contour (not the center axis). */
export const TREE_FORK_WORK: Point = deriveTrunkSurfaceAttach(conduitTrunkAttachY(FORK_Y_WORK), "left")
export const TREE_FORK_PEOPLE: Point = deriveTrunkSurfaceAttach(
  conduitTrunkAttachY(FORK_Y_PEOPLE),
  "right",
)
export const TREE_FORK_FINANCE: Point = deriveTrunkSurfaceAttach(
  conduitTrunkAttachY(FORK_Y_FINANCE),
  "left",
)
export const TREE_FORK_HEALTH: Point = deriveTrunkSurfaceAttach(
  conduitTrunkAttachY(FORK_Y_HEALTH),
  "right",
)

/** Pleasures — slightly below the Health & Body fork on the trunk; stem aims toward lower-right. */
export const TREE_FORK_PLEASURES: Point = deriveTrunkSurfaceAttach(
  conduitTrunkAttachY(FORK_Y_HEALTH + 52),
  "right",
)

/**
 * Crown fork: Who I'm Becoming — one Work→People step above Work, plus a small gap so the crown
 * stays visually separated when the four limbs are shifted lower.
 */
const TREE_BECOMING_CLEARANCE_ABOVE_WORK = -50

export const TREE_FORK_TOP: Point = deriveTrunkSurfaceAttach(
  FORK_Y_WORK -
    (FORK_Y_PEOPLE - FORK_Y_WORK) -
    TREE_BECOMING_CLEARANCE_ABOVE_WORK -
    TREE_MAIN_FOUR_EXTRA_DROP_PX,
  "center",
)

/** Midpoint between Work & People — x follows contour midpoint, not a fixed axis. */
export const TREE_FORK_MIDDLE: Point = {
  x: (TREE_FORK_WORK.x + TREE_FORK_PEOPLE.x) / 2,
  y: (TREE_FORK_WORK.y + TREE_FORK_PEOPLE.y) / 2,
}

/** Midpoint between Finance & Health. */
export const TREE_FORK_LOWER: Point = {
  x: (TREE_FORK_FINANCE.x + TREE_FORK_HEALTH.x) / 2,
  y: (TREE_FORK_FINANCE.y + TREE_FORK_HEALTH.y) / 2,
}

/**
 * Layered vascular trunk silhouettes + legacy single-path alias ({@link TREE_TRUNK_FILL_PATH}).
 */
export const TREE_TRUNK_PRESSURE_LAYERS = deriveTrunkPressureLayers()

/** Primary trunk mass path — alias for body layer. */
export const TREE_TRUNK_FILL_PATH = TREE_TRUNK_PRESSURE_LAYERS.bodyD

/**
 * Hub constellation + limb directions are authored in `tree-area-anchors.ts` (single source of truth).
 * Trunk fork points above remain for labels / icons; do not use legacy `BRANCH_SLOTS` / `SPINE_ORIGIN`.
 */

/** Horizontal inset from trunk centerline toward the outward side (limb side), in SVG px. */
const LIFE_AREA_LABEL_TRUNK_GAP_X = 12;

/** Crown title sits this many px above the becoming fork (smaller y = higher on screen). */
const LIFE_AREA_LABEL_BECOMING_DY = 20;

export type LifeAreaTrunkForkLabelOptions = {
  /**
   * **Hub** topology: anchor title + limb icon at the **gateway** (conduit node) where the transport
   * stroke meets radial channels — not at the trunk fork.
   */
  hubGatewayNode?: Point;
};

/**
 * Life-area title at the trunk fork (`trunkAttach`): outward of the bole for the four main limbs,
 * centred and above the fork for Becoming. Not derived from hull geometry.
 * When {@link LifeAreaTrunkForkLabelOptions.hubGatewayNode} is set, layout is gateway-local (all hub limbs).
 */
export function lifeAreaTrunkForkLabelLayout(
  areaId: string,
  trunkAttach: Point | null,
  options?: LifeAreaTrunkForkLabelOptions,
): { x: number; y: number; textAnchor: "start" | "end" | "middle" } {
  const cx = TREE_TRUNK_MIRROR_X;
  if (!trunkAttach) {
    return { x: cx, y: 560, textAnchor: "middle" };
  }
  const g = options?.hubGatewayNode;
  if (g) {
    const { discR } = iconMedallionRadii(TREE_THEME_GATEWAY_ICON_PX, "theme");
    const labelHalf = TREE_LIFE_AREA_TITLE_FONT_PX * 0.5;
    return {
      x: g.x,
      y: g.y + discR + TREE_THEME_GATEWAY_LABEL_GAP_PX + labelHalf,
      textAnchor: "middle",
    };
  }
  if (areaId === "becoming") {
    return {
      x: trunkAttach.x,
      y: trunkAttach.y - LIFE_AREA_LABEL_BECOMING_DY,
      textAnchor: "middle",
    };
  }
  if (areaId === "work" || areaId === "finance") {
    return {
      x: cx - LIFE_AREA_LABEL_TRUNK_GAP_X,
      y: trunkAttach.y,
      textAnchor: "end",
    };
  }
  if (areaId === "people" || areaId === "health" || areaId === "pleasures") {
    return {
      x: cx + LIFE_AREA_LABEL_TRUNK_GAP_X,
      y: trunkAttach.y,
      textAnchor: "start",
    };
  }
  return { x: trunkAttach.x, y: trunkAttach.y, textAnchor: "middle" };
}

export type LifeAreaTrunkForkLabel = ReturnType<typeof lifeAreaTrunkForkLabelLayout>;

/** ~width for life-area title at fontSize ~22 / fontWeight 600 (SVG px). */
const LIFE_AREA_LABEL_CHAR_WIDTH_EST = 13;
const LIFE_AREA_LABEL_TEXT_HALF_HEIGHT = 14;
const LIFE_AREA_LABEL_ICON_GAP = 5;
const LIFE_AREA_LABEL_ICON_HULL_PAD = 1;

/**
 * Limb icon centered above the trunk life-area title; hit targets use {@link limbLabelDecorHullCorners}.
 */
export function limbIconCenterNearLifeAreaLabel(
  layout: LifeAreaTrunkForkLabel,
  labelText: string,
  iconSizePx: number,
): { x: number; y: number } {
  const tw = Math.max(48, labelText.length * LIFE_AREA_LABEL_CHAR_WIDTH_EST);
  const iconR = iconSizePx / 2;
  const th = LIFE_AREA_LABEL_TEXT_HALF_HEIGHT;
  const { x, y, textAnchor } = layout;

  let textCenterX: number;
  if (textAnchor === "end") {
    textCenterX = x - tw / 2;
  } else if (textAnchor === "start") {
    textCenterX = x + tw / 2;
  } else {
    textCenterX = x;
  }

  // Top of text ≈ y − th; icon centered above that band (smaller y = higher on screen).
  const iconY = y - th - LIFE_AREA_LABEL_ICON_GAP - iconR;
  return { x: textCenterX, y: iconY };
}

/** Click-target bounds for theme gateway medallion + life-area title (use bloom radius so glow is tappable). */
export function themeGatewayClusterHitBounds(
  gateway: Point,
  labelLayout: LifeAreaTrunkForkLabel,
  labelText: string,
  medallionR: number,
  fontPx = TREE_LIFE_AREA_TITLE_FONT_PX,
  padPx = 8,
): { x0: number; y0: number; x1: number; y1: number } {
  const tw = Math.max(48, labelText.length * LIFE_AREA_LABEL_CHAR_WIDTH_EST);
  const labelHalf = fontPx * 0.5;
  return {
    x0: Math.min(gateway.x - medallionR, gateway.x - tw / 2) - padPx,
    y0: gateway.y - medallionR - padPx,
    x1: Math.max(gateway.x + medallionR, gateway.x + tw / 2) + padPx,
    y1: labelLayout.y + labelHalf + padPx,
  };
}

/** Axis-aligned box corners (CCW) covering label text + limb icon — merged into limb backdrop hull. */
export function limbLabelDecorHullCorners(
  layout: LifeAreaTrunkForkLabel,
  labelText: string,
  iconSizePx: number,
): Point[] {
  const tw = Math.max(48, labelText.length * LIFE_AREA_LABEL_CHAR_WIDTH_EST);
  const icon = limbIconCenterNearLifeAreaLabel(layout, labelText, iconSizePx);
  const iconR = iconSizePx / 2 + LIFE_AREA_LABEL_ICON_HULL_PAD;
  const th = LIFE_AREA_LABEL_TEXT_HALF_HEIGHT;

  let tx0: number;
  let tx1: number;
  if (layout.textAnchor === "end") {
    tx1 = layout.x;
    tx0 = layout.x - tw;
  } else if (layout.textAnchor === "start") {
    tx0 = layout.x;
    tx1 = layout.x + tw;
  } else {
    tx0 = layout.x - tw / 2;
    tx1 = layout.x + tw / 2;
  }
  const ty0 = layout.y - th;
  const ty1 = layout.y + th;
  const ix0 = icon.x - iconR;
  const ix1 = icon.x + iconR;
  const iy0 = icon.y - iconR;
  const iy1 = icon.y + iconR;
  const minX = Math.min(tx0, tx1, ix0, ix1);
  const maxX = Math.max(tx0, tx1, ix0, ix1);
  const minY = Math.min(ty0, ty1, iy0, iy1);
  const maxY = Math.max(ty0, ty1, iy0, iy1);
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

