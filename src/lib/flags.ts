import type { TreeRenderQuality } from "@/components/tree/tree-render-quality";

const TREE_TRUNK_LAYOUT_RAW = process.env.NEXT_PUBLIC_TREE_TRUNK_LAYOUT?.toLowerCase();

/** Inlined at compile time; restart `next dev` after changing `.env.local`. */
const TREE_DEBUG_MOMENT_CHAIN_RAW = process.env.NEXT_PUBLIC_DEBUG_TREE_MOMENT_CHAIN;
const TREE_THREAD_MARKER_VISUALS_RAW = process.env.NEXT_PUBLIC_TREE_THREAD_MARKER_VISUALS?.toLowerCase();

export const FLAGS = {
  DEV_PANEL: true,
  PERF_MONITOR: true,
  FOCUS_MODE: true,
  /** Pointy-top hex goals, orbital milestone dots, thread stroke gap through hex interior. */
  GOAL_MILESTONES: false,
  /**
   * Goal bloom luminous preset: restrained / balanced / cinematic.
   * Cinematic explores tighter fields + jewel cores (deterministic SVG only — no particles).
   */
  TREE_GOAL_RENDER_QUALITY: "restrained" as TreeRenderQuality,
  /** Tree: NL + Gemini parse → confirm, for goals (`/api/goals/parse`) and moments (`/api/marks/parse`) instead of full modals. */
  CONVERSATIONAL_GOAL_CREATE: true,
  /**
   * Central vascular trunk mass (silhouette + flow + post-stroke blend) behind life-area stems.
   * On while judging full trunk proposal look; set false for flatter hub-forward composition.
   */
  TREE_TRUNK_VISIBLE: true,
  /**
   * Trunk-relative theme gateway layout (`tree-trunk-slots.ts`) instead of radial theme-star
   * (`tree-area-anchors.ts` / `computeThemeGateway`). Default **on** while trunk layout is in active development.
   * Dev: `NEXT_PUBLIC_TREE_TRUNK_LAYOUT=0` or `false` in `.env.local` reverts to theme-star instantly.
   */
  TREE_TRUNK_LAYOUT:
    TREE_TRUNK_LAYOUT_RAW === "0" || TREE_TRUNK_LAYOUT_RAW === "false"
      ? false
      : true,
  /**
   * Sequence-driven longitudinal branch layout for all themes (vs domain-cluster orbit). **Off**
   * until the visual is ready — set to `true` here to work on it; ordering APIs and `sequencedNodes`
   * stay in the tree regardless.
   */
  BRANCH_LONGITUDINAL_ALL: false,
  /**
   * Tree: `[moment-chain]` placement logs in `tree-branch-geometry` and marks payload logging in `TreeView`.
   * Set `NEXT_PUBLIC_DEBUG_TREE_MOMENT_CHAIN=1` in `.env.local`, then **restart** `next dev`.
   */
  TREE_DEBUG_MOMENT_CHAIN: TREE_DEBUG_MOMENT_CHAIN_RAW === "1",
} as const;

export type FeatureFlag = keyof typeof FLAGS;

export function isEnabled(flag: FeatureFlag): boolean {
  return FLAGS[flag] === true;
}

if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  const threadMarkersOn =
    TREE_THREAD_MARKER_VISUALS_RAW !== "0" && TREE_THREAD_MARKER_VISUALS_RAW !== "false";
  // eslint-disable-next-line no-console -- intentional startup env probe for tree debugging
  console.log("[flags] tree client env (NEXT_PUBLIC_* inlined at compile; restart dev server if stale)", {
    NEXT_PUBLIC_DEBUG_TREE_MOMENT_CHAIN:
      TREE_DEBUG_MOMENT_CHAIN_RAW === undefined ? "(undefined)" : TREE_DEBUG_MOMENT_CHAIN_RAW,
    FLAGS_TREE_DEBUG_MOMENT_CHAIN: FLAGS.TREE_DEBUG_MOMENT_CHAIN,
    NEXT_PUBLIC_TREE_THREAD_MARKER_VISUALS:
      TREE_THREAD_MARKER_VISUALS_RAW === undefined ? "(undefined)" : String(TREE_THREAD_MARKER_VISUALS_RAW),
    threadMomentDotsEnabled: threadMarkersOn,
  });
  // eslint-disable-next-line no-console -- intentional startup env probe for tree debugging
  console.log(
    `[flags] confirm FLAGS_TREE_DEBUG_MOMENT_CHAIN: ${FLAGS.TREE_DEBUG_MOMENT_CHAIN}; threadMomentDotsEnabled: ${threadMarkersOn}`,
  );
}
