export const TREE_LAYOUT_EDIT_ENABLED =
  process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_TREE_LAYOUT_EDITOR === "1";

export const TREE_RENDER_STATS_ENABLED =
  process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_TREE_RENDER_STATS === "1";

export const TREE_MOMENT_DEV_LABELS_ENABLED =
  process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_TREE_MOMENT_DEV_LABELS === "1";

export const TREE_ELEMENT_GUIDE_ENABLED =
  process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_TREE_ELEMENT_GUIDE === "1";

export const TREE_RENDER_STATS_WINDOW_MS = 60_000;

export const TREE_LAYOUT_WORLD_SCALE = 1.14;
export const TREE_LAYOUT_SCALE_ORIGIN_Y = 680;

export const LAYOUT_DRAG_THRESHOLD_PX = 3;

export const MOCK_USER_STORAGE_KEY = "pathfinder.tree.mockUserId";

export const GOAL_T_MARGIN = 0.042;
export const GOAL_T_SPAN = 0.945;
export const GOAL_T_FORK_PAD = 0.22;
export const GOAL_BRANCH_SPACING_REF_GOALS = 8;

export const TREE_THREAD_VISIBLE_MOMENTS = 5;
export const TREE_GOAL_MAX_CHILDREN_PER_NODE = 3;
export const TREE_GOAL_RENDER_MAX_DEPTH = 1;

export const BRANCH_T_PAST_LAST_MOMENT = 0.038;

export const THREAD_GLOBAL_SHORTEN = 1;

export const MOMENT_STATION_RAW_LO = 0.02;
export const MOMENT_STATION_RAW_HI = 1;

export const MOMENT_STATION_T_LO = MOMENT_STATION_RAW_LO * THREAD_GLOBAL_SHORTEN;
export const MOMENT_STATION_T_HI = MOMENT_STATION_RAW_HI * THREAD_GLOBAL_SHORTEN;

export const MOMENT_SINGLE_RAW_T = 0.52;

export const MOMENT_ARC_GAP_STRETCH = 2;
export const MOMENT_ARC_LAYOUT_REVISION = 11;
export const MOMENT_ARC_STATION_CACHE_MAX = 96;

export function nodeRadius(sig: number): number {
  return sig === 3 ? 5 : sig === 2 ? 4 : 3;
}
