import type { Point } from "./tree-types";
import { VIEWBOX_HEIGHT, VIEWBOX_WIDTH } from "./tree-geometry";

/**
 * Authored layout for one life area: **theme gateway** + stroke weight. Hub branch directions are
 * derived in `buildAreaForkFromAnchors` (four spokes at square-corner directions, 90° apart).
 *
 * **Live path:** radial theme-star (`computeThemeGateway` below).
 * **Future path (flagged):** trunk slot ladder in `tree-trunk-slots.ts` when `FLAGS.TREE_TRUNK_LAYOUT`.
 */
export type AreaAnchors = {
  gateway: Point;
  limbStrokeWidth: number;
};

/** Life areas that use straight hub-and-spoke fork geometry in the tree SVG. */
export const STRAIGHT_LIFE_AREA_IDS = [
  "finance",
  "work",
  "becoming",
  "people",
  "health",
] as const;

export type StraightLifeAreaId = (typeof STRAIGHT_LIFE_AREA_IDS)[number];

/**
 * Hub **theme** gateways orbit {@link THEME_STAR_CENTER} on irregular sectors (not a regular
 * pentagon). Radial depth is authored here.
 */
export const THEME_STAR_CENTER: Point = {
  x: VIEWBOX_WIDTH * 0.5,
  /** Slightly above mid-view — crown (Becoming) needs headroom above the lower theme band. */
  y: VIEWBOX_HEIGHT * 0.455,
};

/** Distance from {@link THEME_STAR_CENTER} to each theme gateway (px). */
export const THEME_STAR_RADIUS_PX = 1180;

/**
 * Per-theme radial stretch. Becoming sits higher; the lower band pushes outward so crown hub
 * spokes do not crowd People / Work / Health gateways beneath.
 */
const THEME_STAR_RADIUS_SCALE: Record<StraightLifeAreaId, number> = {
  becoming: 1.16,
  people: 1.12,
  health: 1.14,
  finance: 1.14,
  work: 1.12,
};

/**
 * Sector centre angles (clockwise from top). Irregular spacing breaks the 72° flower symmetry
 * while keeping each limb in its familiar band around the map.
 */
const THEME_SECTOR_CW_FROM_TOP_DEG: Record<StraightLifeAreaId, number> = {
  becoming: 0,
  people: 84,
  health: 158,
  finance: 236,
  work: 310,
};

const AREA_LIMB_STROKE_WIDTH: Record<StraightLifeAreaId, number> = {
  finance: 7.95,
  work: 7.95,
  becoming: 7.42,
  people: 7.95,
  health: 7.95,
};

/** Stable 0…1 hash for per-limb angular jitter (no runtime randomness). */
function stableLimbLayout01(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function sectorCenterRad(id: StraightLifeAreaId): number {
  const cwDeg = THEME_SECTOR_CW_FROM_TOP_DEG[id];
  const jitterDeg = (stableLimbLayout01(`${id}:sector`) - 0.5) * 13;
  return -Math.PI / 2 + ((cwDeg + jitterDeg) * Math.PI) / 180;
}

/** Extra lift for the crown theme on the radial star layout (smaller y = higher). */
const BECOMING_STAR_EXTRA_UP_PX = 72;

/** Theme gateway in SVG space — irregular sectors, authored radial depth. */
export function computeThemeGateway(id: StraightLifeAreaId): Point {
  const theta = sectorCenterRad(id);
  const r = THEME_STAR_RADIUS_PX * THEME_STAR_RADIUS_SCALE[id];
  const y =
    THEME_STAR_CENTER.y +
    r * Math.sin(theta) -
    (id === "becoming" ? BECOMING_STAR_EXTRA_UP_PX : 0);
  return {
    x: THEME_STAR_CENTER.x + r * Math.cos(theta),
    y,
  };
}

export function resolveAreaAnchors(id: StraightLifeAreaId): AreaAnchors {
  return {
    gateway: computeThemeGateway(id),
    limbStrokeWidth: AREA_LIMB_STROKE_WIDTH[id],
  };
}

export const AREA_ANCHORS: Record<StraightLifeAreaId, AreaAnchors> = Object.fromEntries(
  STRAIGHT_LIFE_AREA_IDS.map((id) => [id, resolveAreaAnchors(id)] as const),
) as Record<StraightLifeAreaId, AreaAnchors>;
