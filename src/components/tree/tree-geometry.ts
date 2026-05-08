export type Point = { x: number; y: number }

export const TRUNK_BASE_Y = 1220
export const TRUNK_TOP_Y = 120
/** SVG canvas width — geometry stays ~x≤1150; avoid drawing empty space beyond ~1200. */
export const VIEWBOX_WIDTH = 1200
export const VIEWBOX_HEIGHT = 1500

/** Vertical axis pairing left life areas (finance, work) with right life areas (people, health) in fork data. */
export const TREE_TRUNK_MIRROR_X = 600

/** First branch height: Money & Health (outward, slightly up — not into the ground). */
export const TREE_FORK_LOWER: Point = { x: 600, y: 728 }

/** Second branch height: Work & People. */
export const TREE_FORK_MIDDLE: Point = { x: 600, y: 568 }

/** Third branch height: Becoming (continues upward). */
export const TREE_FORK_TOP: Point = { x: 600, y: 452 }

/** Closed path for the filled trunk body (tapers up the center; life areas attach at the three fork heights). */
export const TREE_TRUNK_FILL_PATH = `M599,432 C596,520 590,700 586,950 C583,1100 582,1220 584,1340 C588,1348 594,1354 600,1356 C606,1354 612,1348 616,1340 C618,1220 617,1100 614,950 C610,700 604,520 601,432 Z`

/** Reflect a point across the trunk centerline (x = {@link TREE_TRUNK_MIRROR_X}). */
export function mirrorPointAcrossTrunkX(p: Point): Point {
  return { x: 2 * TREE_TRUNK_MIRROR_X - p.x, y: p.y };
}

const PEOPLE_BRANCH_SLOTS: Array<{ defaultFromT: number; p1: Point; p2: Point; sw: number }> = [
  { defaultFromT: 0.56, p1: { x: 620, y: 595 }, p2: { x: 760, y: 520 }, sw: 4.5 },
  { defaultFromT: 0.74, p1: { x: 815, y: 545 }, p2: { x: 900, y: 600 }, sw: 3.5 },
  { defaultFromT: 0.9, p1: { x: 810, y: 455 }, p2: { x: 980, y: 345 }, sw: 2.8 },
  { defaultFromT: 0.96, p1: { x: 828, y: 498 }, p2: { x: 998, y: 368 }, sw: 2.5 },
];

// Spine origins — staggered fork heights; angles (deg) align with straight life-area stem directions.
export const SPINE_ORIGIN: Record<string, {
  p0: Point
  angle: number
}> = {
  finance: { p0: { ...TREE_FORK_LOWER }, angle: -179 },
  health: { p0: { ...TREE_FORK_LOWER }, angle: -1 },
  work: { p0: { ...TREE_FORK_MIDDLE }, angle: -159 },
  people: { p0: { ...TREE_FORK_MIDDLE }, angle: -20 },
  becoming: { p0: { ...TREE_FORK_TOP }, angle: -90 },
}

export const BRANCH_SLOTS: Record<string, Array<{
  defaultFromT: number
  p1: Point
  p2: Point
  sw: number
}>> = {
  /** Mirrored {@link BRANCH_SLOTS.health} so finance is an exact left reflection of health. */
  finance: [
    { defaultFromT: 0.56, p1: mirrorPointAcrossTrunkX({ x: 640, y: 740 }), p2: mirrorPointAcrossTrunkX({ x: 800, y: 670 }), sw: 4.5 },
    { defaultFromT: 0.74, p1: mirrorPointAcrossTrunkX({ x: 760, y: 670 }), p2: mirrorPointAcrossTrunkX({ x: 980, y: 560 }), sw: 3.5 },
    { defaultFromT: 0.9, p1: mirrorPointAcrossTrunkX({ x: 900, y: 620 }), p2: mirrorPointAcrossTrunkX({ x: 1150, y: 500 }), sw: 2.8 },
    { defaultFromT: 0.96, p1: mirrorPointAcrossTrunkX({ x: 920, y: 582 }), p2: mirrorPointAcrossTrunkX({ x: 1138, y: 418 }), sw: 2.5 },
  ],
  /** Mirrored {@link PEOPLE_BRANCH_SLOTS} (same defaultFromT / stroke weights). */
  work: PEOPLE_BRANCH_SLOTS.map((s) => ({
    defaultFromT: s.defaultFromT,
    sw: s.sw,
    p1: mirrorPointAcrossTrunkX(s.p1),
    p2: mirrorPointAcrossTrunkX(s.p2),
  })),
  becoming: [
    { defaultFromT: 0.56, p1: { x: 420, y: 510 }, p2: { x: 320, y: 440 }, sw: 4.5 },
    { defaultFromT: 0.74, p1: { x: 500, y: 470 }, p2: { x: 500, y: 360 }, sw: 3.5 },
    { defaultFromT: 0.9, p1: { x: 580, y: 510 }, p2: { x: 680, y: 440 }, sw: 2.8 },
    { defaultFromT: 0.96, p1: { x: 520, y: 398 }, p2: { x: 500, y: 276 }, sw: 2.6 },
  ],
  people: PEOPLE_BRANCH_SLOTS,
  health: [
    { defaultFromT: 0.56, p1: { x: 640, y: 740 }, p2: { x: 800, y: 670 }, sw: 4.5 },
    { defaultFromT: 0.74, p1: { x: 760, y: 670 }, p2: { x: 980, y: 560 }, sw: 3.5 },
    { defaultFromT: 0.9, p1: { x: 900, y: 620 }, p2: { x: 1150, y: 500 }, sw: 2.8 },
    { defaultFromT: 0.96, p1: { x: 920, y: 582 }, p2: { x: 1138, y: 418 }, sw: 2.5 },
  ],
}

/**
 * Offset from stem base (`trunkAttach`). Larger lateral pushes keep titles out of thick strokes and
 * separate left/right pairs across the trunk.
 */
export const AREA_LABEL_CONFIG: Record<string, {
  anchor: 'start' | 'end' | 'middle'
  dx: number
  dy: number
}> = {
  finance:  { anchor: "end", dx: -34, dy: 6 },
  work:     { anchor: "end", dx: -32, dy: 2 },
  becoming: { anchor: "middle", dx: 0, dy: -24 },
  people:   { anchor: "start", dx: 32, dy: 2 },
  health:   { anchor: "start", dx: 34, dy: 6 },
}

