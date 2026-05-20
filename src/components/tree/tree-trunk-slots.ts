/**
 * Trunk-relative theme gateway layout — slot table + attach math for the five current themes.
 */
import { FLAGS } from "@/lib/flags";
import type { StraightLifeAreaId } from "./tree-area-anchors";
import { THEME_STAR_CENTER } from "./tree-area-anchors";
import { TREE_TRUNK_MIRROR_X } from "./tree-geometry";
import type { Point } from "./tree-types";
import {
  TRUNK_BASE_Y,
  TRUNK_CROWN_Y,
  deriveTrunkEmergenceDirection,
  deriveTrunkSurfaceAttach,
  type TrunkEmergenceSide,
} from "./tree-trunk-geometry";
import {
  DOMAIN_CLUSTER_HUB_RADIAL_RING_PX,
  DOMAIN_CLUSTER_BASE_RADIUS_PX,
  DOMAIN_CLUSTER_GOAL_RING_MAX_RADIUS_PX,
  DOMAIN_CLUSTER_HUB_GATEWAY_ARC_SPREAD_PX,
  DOMAIN_CLUSTER_HUB_SLOT_RADIAL_SPREAD_PX,
  THEME_GATEWAY_HUB_SPOKE_LENGTH_PX,
  TRUNK_LIMB_DROOP_BIAS_FRAC,
  TRUNK_LIMB_END_HANDLE_FRAC,
  TRUNK_LIMB_MIN_HANDLE_PX,
  TRUNK_LIMB_START_HANDLE_FRAC,
} from "./tree-view-constants";

export type TrunkThemeSlotSpec = {
  id: StraightLifeAreaId;
  attachT: number;
  side: TrunkEmergenceSide;
  /** Horizontal gateway offset from trunk attach (px); defaults to {@link TREE_TRUNK_LIMB_OFFSET_X_PX}. */
  limbOffsetX?: number;
  /** Extra gateway Y nudge (px, negative = up). Applied on top of `limbRiseY`. */
  gatewayYNudge?: number;
  /**
   * Vertical lift from trunk attach to gateway (px). Positive raises the gateway above attach;
   * negative lets the limb droop below attach. Defaults to {@link TREE_TRUNK_LIMB_RISE_Y_PX}.
   */
  limbRiseY?: number;
  /**
   * Per-limb rotation of the domain-hub fan center, in radians (positive = clockwise on screen).
   * Applied on top of the limb-following bisector (or -PI/2 for center side). Default 0.
   */
  hubFanCenterOffsetRad?: number;
  /**
   * Per-limb total angular size of the 4-hub fan, in degrees. Maps to the internal `FanSpec.halfSpan`
   * (named for legacy reasons; treat as total angular spread, not half).
   * Default unified span derived from {@link TRUNK_HUB_FAN_OUTWARD_HALF_SPAN_RAD}.
   */
  hubFanHalfSpanDeg?: number;
  /**
   * Per-limb domain-hub orbit radius (px). Replaces the shared base + lower-pair lane.
   * Default {@link TREE_TRUNK_DOMAIN_HUB_RING_PX} + side lane for finance/health.
   */
  hubOrbitRadius?: number;
  /**
   * Per-limb length of the visible gateway-to-domain-hub spoke (px).
   * Default {@link TREE_TRUNK_GATEWAY_SPOKE_LENGTH_PX}.
   */
  hubSpokeLength?: number;
};

type FanSpec = { center: number; halfSpan: number };

const TRUNK_STROKE_HALF_W_PX = 24;
/** Minimum center-to-center gap between adjacent domain hubs. Tuned so hubs read as local gateway clusters. */
const TRUNK_HUB_MIN_CENTER_GAP_PX = 168;
/** Fraction of fan arc allowed on the trunk (inward) side of the outward ray — keeps sibling domain hubs on the outer arc. */
const TRUNK_HUB_FAN_INWARD_FRAC = 0.06;
/** Angular half-span of the domain-hub fan on the outward side (~108° at default). */
const TRUNK_HUB_FAN_OUTWARD_HALF_SPAN_RAD = Math.PI * 0.34;
/** Shared angular half-span for every theme (equal arc chord spacing at hub radius). */
function computeUnifiedHubHalfSpanRad(): number {
  const n = 4;
  const r = TREE_TRUNK_DOMAIN_HUB_RING_PX + TRUNK_SIDE_HUB_LOWER_THEME_LANE_PX;
  const outward = TRUNK_HUB_FAN_OUTWARD_HALF_SPAN_RAD;
  const total = outward * (1 + TRUNK_HUB_FAN_INWARD_FRAC);
  return hubFanHalfSpanRadForCount(n, total, r);
}

export const TREE_TRUNK_LIMB_OFFSET_X_PX = 828;
export const TREE_TRUNK_LIMB_RISE_Y_PX = 72;
export const TREE_TRUNK_GATEWAY_SPOKE_LENGTH_PX = 620;
/** Hub orbit radius from theme gateway (constant per theme; lower pair adds lane only). */
export const TREE_TRUNK_DOMAIN_HUB_RING_PX = 498;
export const TREE_TRUNK_HUB_GATEWAY_ARC_SPREAD_PX = 188;
export const TREE_TRUNK_HUB_SLOT_RADIAL_OFFSETS_N4: readonly [number, number, number, number] = [
  0, 22, 0, 22,
];

/**
 * Finance 4-hub fan: taxonomy order is Income → Assets → Safety net → Liabilities, but the
 * left-limb arc curvature places fan indices 1 and 3 inverted on screen. Remap arc index only
 * (data order unchanged) so the stack reads earn → grow → protect → owe top to bottom.
 */
const FINANCE_FOUR_HUB_FAN_ARC_SLOT: readonly number[] = [0, 3, 2, 1];

/**
 * Becoming 3-hub fan: taxonomy order is Purpose → Inner life → Joy, but the crown arc places
 * slot 0 left and slot 1 centre. Remap arc index only (data order unchanged) so Purpose reads
 * centre, Inner life left, Joy right.
 */
const BECOMING_THREE_HUB_FAN_ARC_SLOT: readonly number[] = [1, 0, 2];

/** Taxonomy slot index → position along the trunk fan arc (for angle + radial lane). */
function hubFanArcSlotIndex(
  areaId: StraightLifeAreaId,
  taxonomySlotIndex: number,
  slotCount: number,
): number {
  if (areaId === "finance" && slotCount === 4) {
    return FINANCE_FOUR_HUB_FAN_ARC_SLOT[taxonomySlotIndex] ?? taxonomySlotIndex;
  }
  if (areaId === "becoming" && slotCount === 3) {
    return BECOMING_THREE_HUB_FAN_ARC_SLOT[taxonomySlotIndex] ?? taxonomySlotIndex;
  }
  return taxonomySlotIndex;
}
/** Extra radius for lower same-side themes (finance, health) so clusters do not stack. */
const TRUNK_SIDE_HUB_LOWER_THEME_LANE_PX = 118;
export const TREE_TRUNK_GOAL_BASE_RADIUS_PX = 150;
export const TREE_TRUNK_GOAL_RING_MAX_PX = 214;
/** Hub medallion + pursuit hex clearance — close enough to read as goals gathered by the hub. */
const TRUNK_GOAL_MIN_RADIUS_FROM_HUB_PX = 154;
/** 1–2 goals: narrow wedge along hub spoke (legacy default). */
const TRUNK_GOAL_WEDGE_HALF_RAD_BASE = Math.PI * 0.09;
/** Odd-index pursuits sit one ring farther out (staggered arc). */
const TRUNK_GOAL_RADIAL_STAGGER_PX = 40;
/** Minimum center-to-center gap between pursuit hexes on the same hub. */
const TRUNK_GOAL_MIN_CENTER_GAP_PX = 55;
/** Per-iteration uniform radius bump when spacing guard fires. */
const TRUNK_GOAL_SPACING_GUARD_STEP_PX = 8;
/** Soft cap for spacing-guard expansion (above {@link TREE_TRUNK_GOAL_RING_MAX_PX}). */
const TRUNK_GOAL_SPACING_GUARD_MAX_RADIUS_PX = TREE_TRUNK_GOAL_RING_MAX_PX + 48;

const TRUNK_SPAN_Y = TRUNK_BASE_Y - TRUNK_CROWN_Y;

/** Extra vertical lift for the crown (Becoming) gateway above the standard limb rise. */
const BECOMING_CROWN_EXTRA_RISE_PX = 32;

/**
 * Per-limb art direction. Each theme has a distinct angle, reach, and hub spread so the tree reads
 * as five different branches, not a mechanically symmetric diagram. Tuned against the reference
 * tree in 2026-05-15 design review. See `pathfinder/DECISIONS.md` ("Tree Layout Terminology").
 */
export const TRUNK_THEME_SLOTS: readonly TrunkThemeSlotSpec[] = [
  {
    id: "becoming",
    attachT: 0,
    side: "center",
    limbRiseY: 520,
    hubOrbitRadius: 236,
    hubSpokeLength: 600,
  },
  {
    id: "work",
    attachT: 0.15,
    side: "left",
    limbOffsetX: 530,
    limbRiseY: 380,
    hubFanHalfSpanDeg: 92,
    hubFanCenterOffsetRad: -0.34,
    hubOrbitRadius: 236,
    hubSpokeLength: 680,
  },
  {
    id: "people",
    attachT: 0.2,
    side: "right",
    limbOffsetX: 510,
    limbRiseY: 420,
    hubFanHalfSpanDeg: 88,
    hubFanCenterOffsetRad: 0.12,
    hubOrbitRadius: 232,
    hubSpokeLength: 640,
  },
  {
    id: "finance",
    attachT: 0.5,
    side: "left",
    limbOffsetX: 450,
    limbRiseY: -100,
    hubFanHalfSpanDeg: 80,
    hubOrbitRadius: 248,
    hubSpokeLength: 540,
  },
  {
    id: "health",
    attachT: 0.56,
    side: "right",
    limbOffsetX: 510,
    limbRiseY: -60,
    hubFanHalfSpanDeg: 72,
    hubOrbitRadius: 252,
    hubSpokeLength: 580,
  },
] as const;

export const TRUNK_THEME_SLOT_BY_ID: Record<StraightLifeAreaId, TrunkThemeSlotSpec> =
  Object.fromEntries(TRUNK_THEME_SLOTS.map((s) => [s.id, s] as const)) as Record<
    StraightLifeAreaId,
    TrunkThemeSlotSpec
  >;

const DEG_TO_RAD = Math.PI / 180;

/**
 * Hub fans follow the trunk→gateway ray (outward along the limb), not fixed screen quadrants.
 * That keeps domain hubs on the outer arc away from the trunk instead of curling back inward.
 *
 * Per-limb overrides:
 * - `hubFanHalfSpanDeg` replaces the unified default (subject to 4-hub clearance widening).
 * - `hubFanCenterOffsetRad` rotates the fan center on top of the limb bisector.
 * - `hubOrbitRadius` is used for clearance computation here so a wider orbit can carry a tighter span.
 */
function hubFanHalfSpanRadForSlot(id: StraightLifeAreaId): number {
  const slot = TRUNK_THEME_SLOT_BY_ID[id];
  const orbitR = slot.hubOrbitRadius ?? hubOrbitRadiusPx(id);
  const baseHalfSpan =
    slot.hubFanHalfSpanDeg !== undefined
      ? slot.hubFanHalfSpanDeg * DEG_TO_RAD
      : computeUnifiedHubHalfSpanRad();
  return hubFanHalfSpanRadForCount(4, baseHalfSpan, orbitR);
}

/** Fan spec from resolved trunk→gateway anchors (layout edit / rotation). */
export function buildHubFanSpecAtAnchors(
  id: StraightLifeAreaId,
  trunkAttach: Point,
  gateway: Point,
): FanSpec {
  const slot = TRUNK_THEME_SLOT_BY_ID[id];
  const halfSpan = hubFanHalfSpanRadForSlot(id);
  const centerOffset = slot.hubFanCenterOffsetRad ?? 0;
  if (slot.side === "center") {
    return { center: -Math.PI / 2 + centerOffset, halfSpan };
  }
  return {
    center: Math.atan2(gateway.y - trunkAttach.y, gateway.x - trunkAttach.x) + centerOffset,
    halfSpan,
  };
}

function buildHubFanSpecForTheme(id: StraightLifeAreaId): FanSpec {
  return buildHubFanSpecAtAnchors(
    id,
    computeTrunkAttachForTheme(id),
    computeThemeGatewayFromTrunkSlot(id),
  );
}

const TRUNK_THEME_BRANCH_FAN: Record<StraightLifeAreaId, FanSpec> = {
  becoming: buildHubFanSpecForTheme("becoming"),
  work: buildHubFanSpecForTheme("work"),
  people: buildHubFanSpecForTheme("people"),
  finance: buildHubFanSpecForTheme("finance"),
  health: buildHubFanSpecForTheme("health"),
};

export type TrunkLayoutAnchorPair = {
  trunkAttach: Point;
  gateway: Point;
};

export function trunkLayoutEnabled(): boolean {
  return FLAGS.TREE_TRUNK_LAYOUT === true;
}

function fanAngle(spec: FanSpec, slotIndex: number, slotCount: number): number {
  const n = Math.max(1, slotCount);
  const t = n <= 1 ? 0.5 : slotIndex / (n - 1);
  const inward = spec.halfSpan * TRUNK_HUB_FAN_INWARD_FRAC;
  const outward = spec.halfSpan - inward;
  return spec.center - inward + t * (inward + outward);
}

/**
 * Crown theme (Becoming) fallback fan — upper arc -0.9pi to -0.1pi. Used only when the
 * `becoming` slot has no explicit `hubFanHalfSpanDeg`; with an override, the symmetric distribution
 * in {@link domainHubFanAngleRad} takes over.
 */
function becomingCrownFanAngleRad(slotIndex: number, slotCount: number): number {
  const slot = TRUNK_THEME_SLOT_BY_ID.becoming;
  const centerOffset = slot.hubFanCenterOffsetRad ?? 0;
  const n = Math.max(1, slotCount);
  const t = n <= 1 ? 0.5 : slotIndex / (n - 1);
  const a0 = -Math.PI * 0.9 + centerOffset;
  const a1 = -Math.PI * 0.1 + centerOffset;
  return a0 + t * (a1 - a0);
}

/**
 * Symmetric distribution around the fan center — used for the center-side crown theme when a
 * `hubFanHalfSpanDeg` override is provided. Side themes keep the slightly asymmetric inward/outward
 * split in {@link fanAngle} so hubs stay on the outer arc of the limb.
 */
function symmetricFanAngle(spec: FanSpec, slotIndex: number, slotCount: number): number {
  const n = Math.max(1, slotCount);
  const t = n <= 1 ? 0.5 : slotIndex / (n - 1);
  return spec.center - spec.halfSpan / 2 + t * spec.halfSpan;
}

function domainHubFanAngleRad(areaId: StraightLifeAreaId, slotIndex: number, slotCount: number): number {
  const arcSlot = hubFanArcSlotIndex(areaId, slotIndex, slotCount);
  if (areaId === "becoming") {
    const slot = TRUNK_THEME_SLOT_BY_ID.becoming;
    if (slot.hubFanHalfSpanDeg !== undefined) {
      return symmetricFanAngle(TRUNK_THEME_BRANCH_FAN.becoming, arcSlot, slotCount);
    }
    return becomingCrownFanAngleRad(arcSlot, slotCount);
  }
  return fanAngle(TRUNK_THEME_BRANCH_FAN[areaId], arcSlot, slotCount);
}

/** Hub fan angle using live gateway + trunk attach (keeps even spread under layout edit). */
export function domainHubFanAngleRadAtAnchors(
  areaId: StraightLifeAreaId,
  trunkAttach: Point,
  gateway: Point,
  slotIndex: number,
  slotCount: number,
): number {
  const arcSlot = hubFanArcSlotIndex(areaId, slotIndex, slotCount);
  if (areaId === "becoming") {
    const slot = TRUNK_THEME_SLOT_BY_ID.becoming;
    const spec = buildHubFanSpecAtAnchors(areaId, trunkAttach, gateway);
    if (slot.hubFanHalfSpanDeg !== undefined) {
      return symmetricFanAngle(spec, arcSlot, slotCount);
    }
    return becomingCrownFanAngleRad(arcSlot, slotCount);
  }
  return fanAngle(buildHubFanSpecAtAnchors(areaId, trunkAttach, gateway), arcSlot, slotCount);
}

/**
 * Domain-hub position on the trunk fan at resolved anchors — same even arc as default trunk layout,
 * but gateway and fan center follow layout overrides (rotation, dragged gateway).
 */
export function trunkLayoutDomainHubPointAtAnchors(
  areaId: StraightLifeAreaId,
  gateway: Point,
  trunkAttach: Point,
  slotIndex: number,
  slotCount: number,
): Point {
  const arcSlot = hubFanArcSlotIndex(areaId, slotIndex, slotCount);
  const angle = domainHubFanAngleRadAtAnchors(areaId, trunkAttach, gateway, slotIndex, slotCount);
  const lane =
    arcSlot >= 0 && arcSlot < TREE_TRUNK_HUB_SLOT_RADIAL_OFFSETS_N4.length
      ? TREE_TRUNK_HUB_SLOT_RADIAL_OFFSETS_N4[arcSlot]!
      : 0;
  const slot = TRUNK_THEME_SLOT_BY_ID[areaId];
  const baseR = slot.hubOrbitRadius ?? hubOrbitRadiusPx(areaId);
  const r = baseR + lane;
  return {
    x: gateway.x + Math.cos(angle) * r,
    y: gateway.y + Math.sin(angle) * r,
  };
}

/** Widen the fan until N hubs clear each other at the given orbit radius. */
function hubFanHalfSpanRadForCount(slotCount: number, baseHalfSpan: number, orbitRadiusPx: number): number {
  const n = Math.max(1, slotCount);
  if (n <= 1) return baseHalfSpan;
  const minStep = 2 * Math.asin(Math.min(1, TRUNK_HUB_MIN_CENTER_GAP_PX / (2 * orbitRadiusPx)));
  return Math.max(baseHalfSpan, (minStep * (n - 1)) / 2);
}

function hubOrbitRadiusPx(areaId: StraightLifeAreaId): number {
  return TREE_TRUNK_DOMAIN_HUB_RING_PX + sideThemeHubLanePx(areaId);
}

function sideThemeHubLanePx(areaId: StraightLifeAreaId): number {
  if (areaId === "finance" || areaId === "health") return TRUNK_SIDE_HUB_LOWER_THEME_LANE_PX;
  return 0;
}

/**
 * Canonical domain-hub position — equal arc around gateway for every theme.
 */
export function trunkLayoutDomainHubPoint(
  areaId: StraightLifeAreaId,
  gateway: Point,
  slotIndex: number,
  slotCount: number,
): Point {
  const arcSlot = hubFanArcSlotIndex(areaId, slotIndex, slotCount);
  const angle = domainHubFanAngleRad(areaId, slotIndex, slotCount);
  const lane =
    arcSlot >= 0 && arcSlot < TREE_TRUNK_HUB_SLOT_RADIAL_OFFSETS_N4.length
      ? TREE_TRUNK_HUB_SLOT_RADIAL_OFFSETS_N4[arcSlot]!
      : 0;
  const slot = TRUNK_THEME_SLOT_BY_ID[areaId];
  const baseR = slot.hubOrbitRadius ?? hubOrbitRadiusPx(areaId);
  const r = baseR + lane;
  return {
    x: gateway.x + Math.cos(angle) * r,
    y: gateway.y + Math.sin(angle) * r,
  };
}

export function trunkAttachYForSlot(attachT: number): number {
  const t = Math.max(0, Math.min(1, attachT));
  return TRUNK_CROWN_Y + t * TRUNK_SPAN_Y;
}

/** Centerline attach — used for gateway offset math and connective bow origins. */
export function computeTrunkAttachForTheme(id: StraightLifeAreaId): Point {
  const slot = TRUNK_THEME_SLOT_BY_ID[id];
  const y = trunkAttachYForSlot(slot.attachT);
  const cx = TREE_TRUNK_MIRROR_X;
  if (slot.side === "center") return { x: cx, y };
  return {
    x: cx + (slot.side === "left" ? -TRUNK_STROKE_HALF_W_PX : TRUNK_STROKE_HALF_W_PX),
    y,
  };
}

/** Trunk mass surface — limb emergence root for fork geometry (`AreaForkSpec.trunkAttach`). */
export function computeTrunkSurfaceAttachForTheme(id: StraightLifeAreaId): Point {
  const slot = TRUNK_THEME_SLOT_BY_ID[id];
  return deriveTrunkSurfaceAttach(trunkAttachYForSlot(slot.attachT), slot.side);
}

export type TrunkEmergentLimbProfile = {
  startHandleFrac: number;
  endHandleFrac: number;
  minHandlePx: number;
  droopBiasFrac: number;
  crown: boolean;
};

export function trunkEmergentLimbProfileForArea(id: StraightLifeAreaId): TrunkEmergentLimbProfile {
  const slot = TRUNK_THEME_SLOT_BY_ID[id];
  if (slot.side === "center") {
    return {
      startHandleFrac: TRUNK_LIMB_START_HANDLE_FRAC * 0.72,
      endHandleFrac: TRUNK_LIMB_END_HANDLE_FRAC * 0.8,
      minHandlePx: TRUNK_LIMB_MIN_HANDLE_PX * 0.78,
      droopBiasFrac: 0,
      crown: true,
    };
  }
  if (id === "finance" || id === "health") {
    return {
      startHandleFrac: TRUNK_LIMB_START_HANDLE_FRAC * 0.92,
      endHandleFrac: TRUNK_LIMB_END_HANDLE_FRAC,
      minHandlePx: TRUNK_LIMB_MIN_HANDLE_PX,
      droopBiasFrac: TRUNK_LIMB_DROOP_BIAS_FRAC,
      crown: false,
    };
  }
  return {
    startHandleFrac: TRUNK_LIMB_START_HANDLE_FRAC,
    endHandleFrac: TRUNK_LIMB_END_HANDLE_FRAC,
    minHandlePx: TRUNK_LIMB_MIN_HANDLE_PX,
    droopBiasFrac: 0,
    crown: false,
  };
}

export function computeThemeGatewayFromTrunkSlot(id: StraightLifeAreaId): Point {
  const slot = TRUNK_THEME_SLOT_BY_ID[id];
  const trunkAttach = computeTrunkAttachForTheme(id);
  const rise = slot.limbRiseY ?? TREE_TRUNK_LIMB_RISE_Y_PX;
  const yNudge = slot.gatewayYNudge ?? 0;
  if (slot.side === "center") {
    return {
      x: trunkAttach.x,
      y: trunkAttach.y - rise - BECOMING_CROWN_EXTRA_RISE_PX + yNudge,
    };
  }
  const sign = slot.side === "left" ? -1 : 1;
  const offsetX = slot.limbOffsetX ?? TREE_TRUNK_LIMB_OFFSET_X_PX;
  return {
    x: trunkAttach.x + sign * offsetX,
    y: trunkAttach.y - rise + yNudge,
  };
}

export function computeTrunkLayoutAnchorPair(id: StraightLifeAreaId): TrunkLayoutAnchorPair {
  return {
    trunkAttach: computeTrunkSurfaceAttachForTheme(id),
    gateway: computeThemeGatewayFromTrunkSlot(id),
  };
}

/** Branch spoke angle for one hub thread under trunk layout. */
export function hubBranchAngleRadForTrunkTheme(
  areaId: StraightLifeAreaId,
  slotIndex: number,
  slotCount: number,
): number {
  return domainHubFanAngleRad(areaId, slotIndex, slotCount);
}

/** @deprecated Use {@link hubBranchAngleRadForTrunkTheme}. */
export function hubBranchAngleRadForTrunkSide(
  slotIndex: number,
  slotCount: number,
  side: TrunkEmergenceSide,
): number {
  const id = TRUNK_THEME_SLOTS.find((s) => s.side === side)?.id ?? "becoming";
  return hubBranchAngleRadForTrunkTheme(id, slotIndex, slotCount);
}

/** Unit vector for domain-hub placement — locked to theme fan, not catalog tangent. */
export function trunkBranchOutwardUnit(
  areaId: StraightLifeAreaId,
  slotIndex: number,
  slotCount: number,
  layoutAnchors?: TrunkLayoutAnchorPair,
): Point {
  const ang =
    layoutAnchors != null
      ? domainHubFanAngleRadAtAnchors(
          areaId,
          layoutAnchors.trunkAttach,
          layoutAnchors.gateway,
          slotIndex,
          slotCount,
        )
      : hubBranchAngleRadForTrunkTheme(areaId, slotIndex, slotCount);
  return { x: Math.cos(ang), y: Math.sin(ang) };
}

export function connectiveBowOriginForArea(areaId: string): Point {
  if (trunkLayoutEnabled() && areaId in TRUNK_THEME_SLOT_BY_ID) {
    return computeTrunkAttachForTheme(areaId as StraightLifeAreaId);
  }
  return THEME_STAR_CENTER;
}

export function gatewaySpokeLengthPx(areaId?: StraightLifeAreaId): number {
  if (!trunkLayoutEnabled()) return THEME_GATEWAY_HUB_SPOKE_LENGTH_PX;
  if (areaId !== undefined) {
    const slot = TRUNK_THEME_SLOT_BY_ID[areaId];
    if (slot?.hubSpokeLength !== undefined) return slot.hubSpokeLength;
  }
  return TREE_TRUNK_GATEWAY_SPOKE_LENGTH_PX;
}

export function domainClusterHubRingPx(): number {
  return trunkLayoutEnabled() ? TREE_TRUNK_DOMAIN_HUB_RING_PX : DOMAIN_CLUSTER_HUB_RADIAL_RING_PX;
}

export function domainClusterGoalBaseRadiusPx(): number {
  return trunkLayoutEnabled() ? TREE_TRUNK_GOAL_BASE_RADIUS_PX : DOMAIN_CLUSTER_BASE_RADIUS_PX;
}

export function domainClusterGoalRingMaxPx(): number {
  return trunkLayoutEnabled() ? TREE_TRUNK_GOAL_RING_MAX_PX : DOMAIN_CLUSTER_GOAL_RING_MAX_RADIUS_PX;
}

/** Dynamic half-wedge (radians) — widens with pursuit count, capped at 5+. */
function trunkGoalWedgeHalfRad(goalsOnThreadCount: number): number {
  const n = Math.max(1, goalsOnThreadCount);
  if (n <= 2) return TRUNK_GOAL_WEDGE_HALF_RAD_BASE;
  if (n === 3) return Math.PI * 0.13;
  if (n === 4) return Math.PI * 0.17;
  return Math.PI * 0.2;
}

function trunkGoalBaseRadiusPx(ringNeighborMul: number, magBump: number): number {
  let r = (TREE_TRUNK_GOAL_BASE_RADIUS_PX + magBump * 0.28) * ringNeighborMul;
  r = Math.max(TRUNK_GOAL_MIN_RADIUS_FROM_HUB_PX * ringNeighborMul, r);
  r = Math.min(TREE_TRUNK_GOAL_RING_MAX_PX * ringNeighborMul, r);
  return r;
}

/** Even index: base ring; odd index: base + 40px (scaled by neighbor density). */
function trunkGoalRadiusPx(goalIndex: number, ringNeighborMul: number, magBump: number): number {
  const base = trunkGoalBaseRadiusPx(ringNeighborMul, magBump);
  const stagger = goalIndex % 2 === 1 ? TRUNK_GOAL_RADIAL_STAGGER_PX * ringNeighborMul : 0;
  return base + stagger;
}

function dist2(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function slotToPoint(hub: Point, theta: number, r: number): Point {
  return { x: hub.x + Math.cos(theta) * r, y: hub.y + Math.sin(theta) * r };
}

/**
 * Build all pursuit slots on the wedge, then uniformly push outward until every pair
 * is at least TRUNK_GOAL_MIN_CENTER_GAP_PX apart (angles fixed).
 */
function trunkGoalSlotsWithSpacingGuard(
  hub: Point,
  branchAng: number,
  goalsOnThreadCount: number,
  ringNeighborMul: number,
  magBump: number,
): Array<{ theta: number; r: number }> {
  const wedgeHalf = trunkGoalWedgeHalfRad(goalsOnThreadCount);
  const n = Math.max(1, goalsOnThreadCount);
  const slots: Array<{ theta: number; r: number }> = [];

  for (let i = 0; i < n; i++) {
    const t = n <= 1 ? 0.5 : i / (n - 1);
    const theta = branchAng - wedgeHalf + t * (2 * wedgeHalf);
    slots.push({ theta, r: trunkGoalRadiusPx(i, ringNeighborMul, magBump) });
  }

  if (n <= 1) return slots;

  let radiusBump = 0;
  const maxIter = 40;
  for (let iter = 0; iter < maxIter; iter++) {
    const pts = slots.map((s) => slotToPoint(hub, s.theta, s.r + radiusBump));
    let minGap = Infinity;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        minGap = Math.min(minGap, dist2(pts[i], pts[j]));
      }
    }
    if (minGap >= TRUNK_GOAL_MIN_CENTER_GAP_PX) break;
    const nextBump = radiusBump + TRUNK_GOAL_SPACING_GUARD_STEP_PX;
    const maxR = Math.max(...slots.map((s) => s.r)) + nextBump;
    if (maxR > TRUNK_GOAL_SPACING_GUARD_MAX_RADIUS_PX * ringNeighborMul) break;
    radiusBump = nextBump;
  }

  return slots.map((s) => ({ theta: s.theta, r: s.r + radiusBump }));
}

/** Shared trunk wedge layout (recomputes full arc per call so spacing guard is consistent). */
function trunkLayoutGoalPositionCore(
  hub: Point,
  branchAng: number,
  goalIndex: number,
  goalsOnThreadCount: number,
  ringNeighborMul: number,
  magBump: number,
): Point {
  const slots = trunkGoalSlotsWithSpacingGuard(
    hub,
    branchAng,
    goalsOnThreadCount,
    ringNeighborMul,
    magBump,
  );
  const idx = Math.min(Math.max(0, goalIndex), slots.length - 1);
  const { theta, r } = slots[idx]!;
  return slotToPoint(hub, theta, r);
}

export function trunkLayoutGoalPositionFromHubAtAnchors(
  areaId: StraightLifeAreaId,
  hub: Point,
  gateway: Point,
  trunkAttach: Point,
  goalIndex: number,
  goalsOnThreadCount: number,
  _goalId: string,
  ringNeighborMul: number,
  magBump: number,
  slotIndex: number,
  slotCount: number,
): Point {
  const branchAng = domainHubFanAngleRadAtAnchors(areaId, trunkAttach, gateway, slotIndex, slotCount);
  return trunkLayoutGoalPositionCore(
    hub,
    branchAng,
    goalIndex,
    goalsOnThreadCount,
    ringNeighborMul,
    magBump,
  );
}

export function trunkLayoutGoalPositionFromHub(
  areaId: StraightLifeAreaId,
  hub: Point,
  goalIndex: number,
  goalsOnThreadCount: number,
  _goalId: string,
  ringNeighborMul: number,
  magBump: number,
  slotIndex: number,
  slotCount: number,
): Point {
  const branchAng = hubBranchAngleRadForTrunkTheme(areaId, slotIndex, slotCount);
  return trunkLayoutGoalPositionCore(
    hub,
    branchAng,
    goalIndex,
    goalsOnThreadCount,
    ringNeighborMul,
    magBump,
  );
}

export function domainClusterHubGatewayArcSpreadPx(): number {
  return trunkLayoutEnabled()
    ? TREE_TRUNK_HUB_GATEWAY_ARC_SPREAD_PX
    : DOMAIN_CLUSTER_HUB_GATEWAY_ARC_SPREAD_PX;
}

export function domainClusterHubSlotRadialOffsetPxForLayout(slot: number, n: number): number {
  if (trunkLayoutEnabled()) return 0;
  if (n === 4 && slot >= 0 && slot < 4) return 0;
  if (n === 6) return 0;
  const median = (n - 1) / 2;
  const signed = n <= 1 ? 0 : (median - slot) / median;
  return signed * DOMAIN_CLUSTER_HUB_SLOT_RADIAL_SPREAD_PX;
}

export type DomainHubLabelLayout = {
  x: number;
  y: number;
  textAnchor: "start" | "end" | "middle";
  dominantBaseline: "hanging" | "middle";
};

/** Domain-hub title centered under the medallion; slight horizontal stagger on dense fans. */
export function domainHubLabelLayout(
  areaId: StraightLifeAreaId,
  hub: Point,
  slotIndex: number,
  hubDiscR: number,
  labelGapPx: number,
  _fontSizePx: number,
): DomainHubLabelLayout {
  const labelY = hub.y + hubDiscR + labelGapPx;
  let staggerX = 0;
  if (trunkLayoutEnabled()) {
    const slotCount = 4;
    const ang = hubBranchAngleRadForTrunkTheme(areaId, slotIndex, slotCount);
    const tangentX = -Math.sin(ang);
    const arcSlot = hubFanArcSlotIndex(areaId, slotIndex, slotCount);
    staggerX = (arcSlot - 1.5) * 14 * (Math.abs(tangentX) > 0.25 ? Math.sign(tangentX) : 1);
  }
  return {
    x: hub.x + staggerX,
    y: labelY,
    textAnchor: "middle",
    dominantBaseline: "hanging",
  };
}

export function domainClusterRingNeighborMulForLayout(branchCountOnLimb: number): number {
  const extra = Math.max(0, (branchCountOnLimb | 0) - 2);
  return Math.max(0.78, 1 - extra * 0.05);
}

export function trunkCenterlineStrokePathD(): string {
  const x = TREE_TRUNK_MIRROR_X;
  return `M${x},${TRUNK_CROWN_Y} L${x},${TRUNK_BASE_Y}`;
}
