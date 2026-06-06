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
  "becoming",
  "people",
  "health",
  "finance",
  "work",
] as const;

export type StraightLifeAreaId = (typeof STRAIGHT_LIFE_AREA_IDS)[number];

/**
 * Hub **theme** gateways orbit {@link THEME_STAR_CENTER} on exact pentagon points.
 */
export const THEME_STAR_CENTER: Point = {
  x: VIEWBOX_WIDTH * 0.5,
  y: VIEWBOX_HEIGHT * 0.455,
};

/** Distance from {@link THEME_STAR_CENTER} to each theme gateway (px). */
export const THEME_STAR_RADIUS_PX = 1180;

/**
 * Pentagon slot order, clockwise from top. This keeps the old radial neighborhoods while making
 * the geometry exact: Becoming at 12 o'clock, then People / Health / Finance / Work clockwise.
 */
const THEME_PENTAGON_SLOT: Record<StraightLifeAreaId, number> = {
  becoming: 0,
  people: 1,
  health: 2,
  finance: 3,
  work: 4,
};

const AREA_LIMB_STROKE_WIDTH: Record<StraightLifeAreaId, number> = {
  finance: 7.95,
  work: 7.95,
  becoming: 7.42,
  people: 7.95,
  health: 7.95,
};

export const THEME_PENTAGON_STEP_RAD = (2 * Math.PI) / STRAIGHT_LIFE_AREA_IDS.length;

export function themePentagonAngleRad(id: StraightLifeAreaId): number {
  return -Math.PI / 2 + THEME_PENTAGON_SLOT[id] * THEME_PENTAGON_STEP_RAD;
}

export function themeOutwardUnit(id: StraightLifeAreaId): Point {
  const theta = themePentagonAngleRad(id);
  return { x: Math.cos(theta), y: Math.sin(theta) };
}

/** Theme gateway in SVG space — exact pentagon, uniform radius. */
export function computeThemeGateway(id: StraightLifeAreaId): Point {
  const theta = themePentagonAngleRad(id);
  return {
    x: THEME_STAR_CENTER.x + THEME_STAR_RADIUS_PX * Math.cos(theta),
    y: THEME_STAR_CENTER.y + THEME_STAR_RADIUS_PX * Math.sin(theta),
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
