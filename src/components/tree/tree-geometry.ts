export type Point = { x: number; y: number }

export const TRUNK_BASE_Y = 1220
export const TRUNK_TOP_Y = 120
/** SVG canvas width — geometry stays ~x≤1150; avoid drawing empty space beyond ~1200. */
export const VIEWBOX_WIDTH = 1200
export const VIEWBOX_HEIGHT = 1500

/** Vertical axis pairing left limbs (finance, work) with right limbs (people, health) in fork data. */
export const TREE_TRUNK_MIRROR_X = 600

/** Reflect a point across the trunk centerline (x = {@link TREE_TRUNK_MIRROR_X}). */
export function mirrorPointAcrossTrunkX(p: Point): Point {
  return { x: 2 * TREE_TRUNK_MIRROR_X - p.x, y: p.y };
}

/** People & Relationships — canonical right-side limb; Work & Learning mirrors this in fork + slot data. */
const PEOPLE_SPINE = { p0: { x: 516, y: 620 } as Point, angle: -15 };
/** Health & Body — canonical lower-right limb; Finance mirrors this across trunk centerline. */
const HEALTH_SPINE = { p0: { x: 512, y: 780 } as Point, angle: -5 };

const PEOPLE_THREAD_SLOTS: Array<{ defaultFromT: number; p1: Point; p2: Point; sw: number }> = [
  { defaultFromT: 0.56, p1: { x: 620, y: 595 }, p2: { x: 760, y: 520 }, sw: 4.5 },
  { defaultFromT: 0.74, p1: { x: 815, y: 545 }, p2: { x: 900, y: 600 }, sw: 3.5 },
  { defaultFromT: 0.9, p1: { x: 810, y: 455 }, p2: { x: 980, y: 345 }, sw: 2.8 },
  { defaultFromT: 0.96, p1: { x: 828, y: 498 }, p2: { x: 998, y: 368 }, sw: 2.5 },
];

// Spine origins — staggered vertically along trunk
// Finance and Health attach lowest, Becoming highest
export const SPINE_ORIGIN: Record<string, {
  p0: Point
  angle: number
}> = {
  finance:  { p0: mirrorPointAcrossTrunkX(HEALTH_SPINE.p0), angle: -180 - HEALTH_SPINE.angle },
  health:   HEALTH_SPINE,
  /** Mirror of {@link PEOPLE_SPINE} across the trunk (same convention as fork JSON). */
  work:     { p0: mirrorPointAcrossTrunkX(PEOPLE_SPINE.p0), angle: -180 - PEOPLE_SPINE.angle },
  people:   PEOPLE_SPINE,
  becoming: { p0:{x:500,y:500}, angle:-90  },
}

export const THREAD_SLOTS: Record<string, Array<{
  defaultFromT: number
  p1: Point
  p2: Point
  sw: number
}>> = {
  /** Mirrored {@link THREAD_SLOTS.health} so finance is an exact left reflection of health. */
  finance: [
    { defaultFromT: 0.56, p1: mirrorPointAcrossTrunkX({ x: 640, y: 740 }), p2: mirrorPointAcrossTrunkX({ x: 800, y: 670 }), sw: 4.5 },
    { defaultFromT: 0.74, p1: mirrorPointAcrossTrunkX({ x: 760, y: 670 }), p2: mirrorPointAcrossTrunkX({ x: 980, y: 560 }), sw: 3.5 },
    { defaultFromT: 0.9, p1: mirrorPointAcrossTrunkX({ x: 900, y: 620 }), p2: mirrorPointAcrossTrunkX({ x: 1150, y: 500 }), sw: 2.8 },
    { defaultFromT: 0.96, p1: mirrorPointAcrossTrunkX({ x: 920, y: 582 }), p2: mirrorPointAcrossTrunkX({ x: 1138, y: 418 }), sw: 2.5 },
  ],
  /** Mirrored {@link PEOPLE_THREAD_SLOTS} (same defaultFromT / stroke weights). */
  work: PEOPLE_THREAD_SLOTS.map((s) => ({
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
  people: PEOPLE_THREAD_SLOTS,
  health: [
    { defaultFromT: 0.56, p1: { x: 640, y: 740 }, p2: { x: 800, y: 670 }, sw: 4.5 },
    { defaultFromT: 0.74, p1: { x: 760, y: 670 }, p2: { x: 980, y: 560 }, sw: 3.5 },
    { defaultFromT: 0.9, p1: { x: 900, y: 620 }, p2: { x: 1150, y: 500 }, sw: 2.8 },
    { defaultFromT: 0.96, p1: { x: 920, y: 582 }, p2: { x: 1138, y: 418 }, sw: 2.5 },
  ],
}

export const AREA_LABEL_CONFIG: Record<string, {
  anchor: 'start' | 'end' | 'middle'
  dx: number
  dy: number
}> = {
  finance:  { anchor:'end',    dx:-16, dy:6  },
  work:     { anchor:'end',    dx:-16, dy:6  },
  becoming: { anchor:'middle', dx:0,   dy:-18 },
  people:   { anchor:'start',  dx:16,  dy:6  },
  health:   { anchor:'start',  dx:16,  dy:6  },
}

export const bp = (t: number, p0: Point, p1: Point,
  p2: Point): Point => ({
  x: (1-t)**2*p0.x + 2*(1-t)*t*p1.x + t**2*p2.x,
  y: (1-t)**2*p0.y + 2*(1-t)*t*p1.y + t**2*p2.y
})

export function computeSpine(
  origin: { p0: Point; angle: number },
  threads: Array<{ p1: Point; p2: Point; strokeWidth: number; fromT: number }>
): { p0: Point; p1: Point; p2: Point } {
  if (threads.length === 0) {
    const rad = (origin.angle * Math.PI) / 180
    return {
      p0: origin.p0,
      p1: { x: origin.p0.x + Math.cos(rad)*80,
            y: origin.p0.y + Math.sin(rad)*80 },
      p2: { x: origin.p0.x + Math.cos(rad)*140,
            y: origin.p0.y + Math.sin(rad)*140 },
    }
  }
  const totalWeight = threads.reduce((s,t) => s+t.strokeWidth, 0)
  const avgTip = {
    x: threads.reduce((s,t) => s+t.p2.x*t.strokeWidth, 0)/totalWeight,
    y: threads.reduce((s,t) => s+t.p2.y*t.strokeWidth, 0)/totalWeight,
  }
  const avgCtrl = {
    x: threads.reduce((s,t) => s+t.p1.x*t.strokeWidth, 0)/totalWeight,
    y: threads.reduce((s,t) => s+t.p1.y*t.strokeWidth, 0)/totalWeight,
  }
  const rad = (origin.angle * Math.PI) / 180
  const dirPull = {
    x: origin.p0.x + Math.cos(rad)*120,
    y: origin.p0.y + Math.sin(rad)*120,
  }
  const branchLengthScale = 1.28
  const scaledTip = {
    x: origin.p0.x + (avgTip.x - origin.p0.x) * branchLengthScale,
    y: origin.p0.y + (avgTip.y - origin.p0.y) * branchLengthScale,
  }
  return {
    p0: origin.p0,
    p1: { x: avgCtrl.x*0.7+dirPull.x*0.3,
          y: avgCtrl.y*0.7+dirPull.y*0.3 },
    p2: scaledTip,
  }
}
