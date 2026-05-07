export type Point = { x: number; y: number }

/** φ — used for branch spacing, fork progression, and non-uniform spacing that reads as organic growth. */
export const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;

/**
 * Monotonic spread in [0, 1] for index `i` of `count` siblings: successive powers of (φ−1) = 1/φ
 * so gaps grow in golden proportion from the trunk toward the tips.
 */
export function goldenSequentialUnit(i: number, count: number): number {
  if (count <= 1) return 0.5;
  const rho = GOLDEN_RATIO - 1;
  const num = 1 - Math.pow(rho, i + 1);
  const den = 1 - Math.pow(rho, count);
  return den > 1e-12 ? num / den : (i + 1) / (count + 1);
}

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
  /* Upper pair: tips fan with φ-based separation so strokes do not stack. */
  { defaultFromT: 0.88, p1: { x: 798, y: 448 }, p2: { x: 1008, y: 322 }, sw: 2.8 },
  { defaultFromT: 0.94, p1: { x: 842, y: 478 }, p2: { x: 1075, y: 398 }, sw: 2.5 },
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
    { defaultFromT: 0.88, p1: mirrorPointAcrossTrunkX({ x: 880, y: 648 }), p2: mirrorPointAcrossTrunkX({ x: 1120, y: 520 }), sw: 2.8 },
    { defaultFromT: 0.94, p1: mirrorPointAcrossTrunkX({ x: 918, y: 622 }), p2: mirrorPointAcrossTrunkX({ x: 1168, y: 468 }), sw: 2.5 },
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
    { defaultFromT: 0.88, p1: { x: 562, y: 518 }, p2: { x: 646, y: 452 }, sw: 2.8 },
    { defaultFromT: 0.94, p1: { x: 440, y: 405 }, p2: { x: 378, y: 268 }, sw: 2.6 },
  ],
  people: PEOPLE_THREAD_SLOTS,
  health: [
    { defaultFromT: 0.56, p1: { x: 640, y: 740 }, p2: { x: 800, y: 670 }, sw: 4.5 },
    { defaultFromT: 0.74, p1: { x: 760, y: 670 }, p2: { x: 980, y: 560 }, sw: 3.5 },
    { defaultFromT: 0.88, p1: { x: 880, y: 648 }, p2: { x: 1120, y: 520 }, sw: 2.8 },
    { defaultFromT: 0.94, p1: { x: 918, y: 622 }, p2: { x: 1168, y: 468 }, sw: 2.5 },
  ],
}

/** Slot anchors for spine + data layer when a limb has `totalThreads` roots (any count). */
export function deriveThreadSlotForIndex(
  limbId: string,
  index: number,
  totalThreads: number,
  origin: { p0: Point; angle: number },
): { defaultFromT: number; p1: Point; p2: Point; sw: number } {
  const catalog = THREAD_SLOTS[limbId] ?? [];
  const g = goldenSequentialUnit(index, totalThreads);

  if (catalog.length === 0) {
    const span = 0.38 + 0.56 * g;
    return { defaultFromT: span, p1: origin.p0, p2: origin.p0, sw: 2 };
  }

  const slotFrac = g * (catalog.length - 1);
  const i0 = Math.min(catalog.length - 1, Math.floor(slotFrac));
  const i1 = Math.min(catalog.length - 1, i0 + 1);
  const f = slotFrac - i0;
  const A = catalog[i0]!;
  const B = catalog[i1]!;
  const lerp = (u: number, v: number) => u + (v - u) * f;

  const chordX = B.p2.x - A.p1.x;
  const chordY = B.p2.y - A.p1.y;
  const chordLen = Math.hypot(chordX, chordY) || 1;
  const px = -chordY / chordLen;
  const py = chordX / chordLen;
  const fan = (index - (totalThreads - 1) / 2) * (11 + (GOLDEN_RATIO - 1) * 8);

  const blendedFromT = lerp(A.defaultFromT, B.defaultFromT);
  const alongLimb = 0.38 + 0.58 * g;
  return {
    defaultFromT: Math.min(0.97, Math.max(0.36, (blendedFromT + alongLimb + g) / 3)),
    p1: { x: lerp(A.p1.x, B.p1.x) + px * fan * 0.45, y: lerp(A.p1.y, B.p1.y) + py * fan * 0.45 },
    p2: { x: lerp(A.p2.x, B.p2.x) + px * fan, y: lerp(A.p2.y, B.p2.y) + py * fan },
    sw: lerp(A.sw, B.sw),
  };
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
