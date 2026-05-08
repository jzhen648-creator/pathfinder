/**
 * Pathfinder Type Definitions
 *
 * HIERARCHY:
 * Self → Life area (catalog) → Branch (DB)
 *   → Moment (DB) → Turning Point (special Moment)
 *
 * `Branch.limbId` stores the life area id (same string ids as `LifeAreaId`).
 *
 * Path = visual only, no data
 * Gap = calculated only, no data
 */

// ── SELF ─────────────────────────────────
export type Self = {
  id: string;
  name: string;
  birthYear: number | null;
  birthPlace: string | null;
  email: string;
};

// ── LIFE AREA (catalog) ───────────
// Config only — never stored in database
export type LifeAreaId =
  | "work"
  | "health"
  | "becoming"
  | "people"
  | "finance";

/** @deprecated Use `LifeAreaId`. */
export type LimbId = LifeAreaId;

export type LifeArea = {
  id: LifeAreaId;
  label: string;
  sublabel: string;
  color: string;
  angle: number;
  emptyPrompt: string;
  /** One warm question for a brand-new map when the user picks this life area first. */
  firstMarkQuestion: string;
  addPrompt: string;
  examples: string[];
};

/** @deprecated Use `LifeArea`. */
export type Limb = LifeArea;

// ── BRANCH ───────────────────────────────
// Stored in database
// One per life area by default
// More created at Turning Points
export type Branch = {
  id: string;
  userId: string;
  limbId: LifeAreaId;
  label: string | null;
  name?: string | null;
  goal?: string | null;
  goalValue?: number | null;
  currentValue?: number | null;
  unit?: string | null;
  status?: "active" | "paused" | "achieved" | "abandoned";
  order?: number;
  parentBranchId: string | null;
  turningPointId: string | null;
  mapAngleOffset: number; // 0 for first branch
  // ±25 for splits
  createdAt: string;
  updatedAt?: string;
};

// ── MOMENT ───────────────────────────────
// Stored in database
// A specific life event on a Branch
// @deprecated — timeline data lives in Prisma `Goal` with goalType `moment` | `event`. Marks remain separate for dated branch marks.
export type Moment = {
  id: string;
  userId: string;
  limbId: LifeAreaId;
  branchId: string;
  label: string; // max 5 words
  description: string | null;
  year: number; // actual year
  month: number | null; // 1-12
  mapPosition: number; // controls map order
  // independent of year
  significance: 1 | 2 | 3;
  future: boolean;
  isTurningPoint: boolean;
  location: string | null;
  timelineNote: string | null;
  // Optional tag inside a life area (e.g. People → family | friends | romance | community).
  // Free-form string so new life areas can define their own vocabulary later.
  subtype?: string | null;
  createdAt: string;
  updatedAt: string;
};

// ── MARK ─────────────────────────────────
// Stored in database (new canonical checkpoint entity).
export type Mark = {
  id: string;
  branchId: string;
  limbId: LifeAreaId;
  userId: string;
  title: string;
  description: string | null;
  date: string;
  type: "milestone" | "setback" | "realisation" | "decision" | "achievement";
  value?: number | null;
  sentiment: "positive" | "neutral" | "negative";
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

// ── REFRAME ──────────────────────────────
export type Reframe = {
  id: string;
  markId: string;
  note: string;
  date: string;
  createdAt: string;
};

// Curated subtype vocabulary per life area. Used by the detail panel picker.
// Keep short; free-form values are still allowed at the type level.
export const LIFE_AREA_SUBTYPES: Record<LifeAreaId, string[]> = {
  people: ["family", "friends", "romance", "community"],
  work: [],
  health: [],
  finance: [],
  becoming: [],
};

/** @deprecated Use `LIFE_AREA_SUBTYPES`. */
export const LIMB_SUBTYPES = LIFE_AREA_SUBTYPES;

// ── TURNING POINT ────────────────────────
// A Moment where isTurningPoint is true
// Creates two child Branches when confirmed
export type TurningPoint = Moment & {
  isTurningPoint: true;
  leftBranchId: string | null;
  rightBranchId: string | null;
};

// ── PATH ─────────────────────────────────
// Visual only — never stored
// Rendered between two Moments
export type Path = {
  fromPos: { x: number; y: number };
  toPos: { x: number; y: number };
  color: string;
  future: boolean;
  isExtension: boolean; // dashed line beyond
  // last moment
};

// ── GAP ──────────────────────────────────
// Calculated only — never stored
// The clickable space between Moments
export type Gap = {
  id: string;
  limbId: LifeAreaId;
  branchId: string;
  insertIndex: number;
  prevMomentId: string | null;
  nextMomentId: string | null;
  fromPos: { x: number; y: number };
  toPos: { x: number; y: number };
  midPos: { x: number; y: number };
  promptContext: {
    prevMomentLabel: string | null;
    nextMomentLabel: string | null;
  };
};

// ── MAP GEOMETRY ─────────────────────────
export type MapPosition = {
  x: number;
  y: number;
};

// ── PRACTICAL DATA ───────────────────────
// Optional financial data on Moments
export type PracticalData = {
  type: "income" | "savings_goal" |
        "debt" | "investment" | "milestone";
  amount?: number;
  targetAmount?: number;
  currentAmount?: number;
  currency?: string;
};

// ── DEV PANEL ────────────────────────────
export type DevHoverInfo = {
  type: "self" | "limb" | "branch" |
        "moment" | "gap" | "path";
  data: Record<string, unknown>;
  position: MapPosition;
};
