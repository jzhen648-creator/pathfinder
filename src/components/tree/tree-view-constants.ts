export const TREE_LAYOUT_EDIT_ENABLED =
  process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_TREE_LAYOUT_EDITOR === "1";

export const TREE_RENDER_STATS_ENABLED =
  process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_TREE_RENDER_STATS === "1";

/**
 * Tree map canvas (SVG + PDF export). Limb backdrop tints in `tree-color-accents` mix toward
 * `TREE_MAP_SURFACE_RGB` so wedges stay coherent with the surface.
 */
export const TREE_MAP_SURFACE_FILL = "#07060A";

/** Same base as `TREE_MAP_SURFACE_FILL` — used by `limbBackdropSurfaceTint` mixing. */
export const TREE_MAP_SURFACE_RGB = { r: 7, g: 6, b: 10 };

/** Thread / branch name labels on the SVG (e.g. Income, Fitness). Opt-in for prod via `NEXT_PUBLIC_TREE_THREAD_LABELS`. */
export const TREE_THREAD_LABELS_ENABLED =
  process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_TREE_THREAD_LABELS === "1";

/**
 * Thread **moments** (mark-backed shapes on the stroke) and roadmap **goal** nodes on the tree.
 * On by default; set `NEXT_PUBLIC_TREE_THREAD_MARKER_VISUALS=0` or `false` to hide (e.g. perf / minimal tree).
 */
const TREE_THREAD_MARKER_VISUALS_RAW = process.env.NEXT_PUBLIC_TREE_THREAD_MARKER_VISUALS?.toLowerCase();
export const TREE_THREAD_MARKER_VISUALS_ENABLED =
  TREE_THREAD_MARKER_VISUALS_RAW !== "0" && TREE_THREAD_MARKER_VISUALS_RAW !== "false";

export const TREE_ELEMENT_GUIDE_ENABLED =
  process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_TREE_ELEMENT_GUIDE === "1";

/**
 * Grid + fork/spine debug circles on the tree SVG. Dev-only; opt-in via `NEXT_PUBLIC_TREE_DEBUG_GEOM=1`
 * so local `next dev` stays clean by default.
 */
export const TREE_DEBUG_GEOM_ENABLED =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_TREE_DEBUG_GEOM === "1";

export const TREE_RENDER_STATS_WINDOW_MS = 60_000;

export const TREE_LAYOUT_WORLD_SCALE = 1.4;
export const TREE_LAYOUT_SCALE_ORIGIN_Y = 1110;

/**
 * Global multiplier for **branch conduit** strokes authored in fork geometry (`BranchForkSpec.strokeWidth`).
 * Relative major/minor ranks are unchanged; only rendered tube thickness increases.
 */
export const CONDUIT_THREAD_STROKE_SCALE = 1.18;

/**
 * Hub layout: straight conduit length from the **theme gateway** to each thread’s tip (fork→tip chord).
 * Larger = more separation between the theme node and hub / thread geometry (watch viewbox top for Becoming).
 */
export const THEME_GATEWAY_HUB_SPOKE_LENGTH_PX = 540;

/**
 * **Connective-only** bow on hub-first conduits: amplitude as a fraction of chord length, capped in px.
 * Deterministic geometry (no noise, routing, or ecology). Bulge faces **away** from the theme
 * pentagon centre (`THEME_STAR_CENTER` in `tree-area-anchors`).
 */
export const CONDUIT_CONNECTIVE_BOW_FRACTION_OF_CHORD = 0.036;
export const CONDUIT_CONNECTIVE_BOW_MAX_PX = 12;
/** How strongly Bézier controls are pulled along the outward normal (restrained ≈0.35–0.55). */
export const CONDUIT_CONNECTIVE_BOW_CONTROL_BLEND = 0.48;

/**
 * Life-area stem / trunk→gateway stroke (`AreaForkSpec.limbStrokeWidth`). Slightly lower than
 * {@link CONDUIT_THREAD_STROKE_SCALE} so the trunk transport doesn’t overpower the crown.
 */
export const CONDUIT_LIMB_STEM_STROKE_SCALE = 1.06;

export const LAYOUT_DRAG_THRESHOLD_PX = 3;

/**
 * Snap a scalar to the nearest 0.5 in SVG user space. Pan/zoom stacks often leave fractional
 * coordinates; stroke-based glyphs then pick up a faint “double edge” when rasterized — most
 * noticeable zoomed in. Use for painted origins (goal centres, moment anchors, pan translate).
 */
export function snapTreeSvgScalar(n: number): number {
  return Math.round(n * 2) / 2;
}

export const MOCK_USER_STORAGE_KEY = "pathfinder.tree.mockUserId";

/** Dev-only: persisted preset for tree goal luminous rendering (`restrained` | `balanced` | `cinematic`). */
export const TREE_RENDER_QUALITY_DEV_STORAGE_KEY = "pathfinder.tree.renderQualityDev";

/** Circumradius (centre → vertex) for pointy-top roadmap goal hex (`FLAGS.GOAL_MILESTONES`). */
export const TREE_GOAL_HEX_VERTEX_RADIUS_PX = 48;

/** Radius around each root goal centre where the thread stroke is cut (no hex geometry). */
export const TREE_GOAL_BRANCH_STROKE_GAP_RADIUS_PX = 29;

/**
 * Shift the gap disc **from the goal centre toward the catalog rail** so the conduit meets the node on the
 * side like fruit on a branch (not through the middle).
 */
export const GOAL_BRANCH_STROKE_GAP_INSET_FROM_GOAL_CENTER_PX = 31;

/**
 * Thread spline knots: blend from catalog rail toward goal (0 = stay on branch rail; higher = pull toward node).
 * Kept low so the stroke reads as the branch; gaps attach on the goal side via {@link GOAL_BRANCH_STROKE_GAP_INSET_FROM_GOAL_CENTER_PX}.
 */
export const GOAL_THREAD_STROKE_KNOT_TOWARD_SCREEN_01 = 0.18;

/**
 * Roadmap centre dot when the goal has orbital milestones (`FLAGS.GOAL_MILESTONES`).
 * `p` = completed / total (total = orbitals present, max 6). Piecewise-linear through
 * p=0 → r≈9 opacity=0.6, p=0.5 → r≈11 opacity=0.75, p=1 → r≈13 opacity=1.
 */
export function orbitalCentreDotRadiusOpacity(p: number): { r: number; fillOpacity: number } {
  const pc = Math.max(0, Math.min(1, p));
  const r = pc <= 0.5 ? 10.5 + 3.0 * pc : 12.0 + 5.8 * (pc - 0.5);
  const fillOpacity = pc <= 0.5 ? 0.6 + 0.3 * pc : 0.75 + 0.5 * (pc - 0.5);
  return { r, fillOpacity };
}

export const GOAL_T_MARGIN = 0.042;
export const GOAL_T_SPAN = 0.945;
export const GOAL_T_FORK_PAD = 0.22;
export const GOAL_BRANCH_SPACING_REF_GOALS = 8;

/**
 * Root goals use **fixed catalog‑parameter `t`** slots per goal index (append‑only layout): adding a
 * goal extends the branch toward the next slot without moving earlier goals (see `rootGoalCatalogT`).
 * `FIRST` keeps the first goal / empty placeholder **clear of the hub** (gateway fork); `STEP` spaces
 * consecutive goals farther apart along the branch so the conduit read stays uncluttered.
 */
/** First root goal / empty placeholder: catalog `t` from fork — kept well clear of hub / gateway. */
export const ROOT_GOAL_CATALOG_T_FIRST = 0.48;
/** Catalog `t` between consecutive root goals (append next slot = previous + `STEP`). */
export const ROOT_GOAL_CATALOG_T_STEP = 0.19;
/**
 * After {@link ROOT_GOAL_CATALOG_T_CAP}, further goals advance by this delta (monotonic, append‑safe)
 * so neighbors are not stacked at one `t` when many goals share a thread.
 */
export const ROOT_GOAL_CATALOG_TAIL_STEP = 0.026;
/** Hard ceiling for tail `t` (placeholder / tip still need headroom below 1). */
export const ROOT_GOAL_CATALOG_T_APPEND_MAX = 0.988;
/** Do not place root goals past this catalog `t` before tail stepping kicks in. */
export const ROOT_GOAL_CATALOG_T_CAP = 0.94;

/**
 * Alternating how far root goals sit from the **conduit** (tangent–normal offset magnitude): even indices
 * 0,2,4… × {@link ROOT_GOAL_LATERAL_ALT_NEAR_MUL}, odd × {@link ROOT_GOAL_LATERAL_ALT_FAR_MUL} — half / full ladder.
 */
export const ROOT_GOAL_LATERAL_ALT_NEAR_MUL = 0.5;
export const ROOT_GOAL_LATERAL_ALT_FAR_MUL = 1;

/**
 * Legacy: synthetic stem length toward the trunk when a visible trunk→gateway bridge was authored.
 * Fork geometry no longer uses this; kept for exports / tooling that still reference the constant.
 */
export const LIFE_AREA_SYNTHETIC_STEM_LENGTH_PX = 60;

/**
 * Legacy: nudge gateways outward along the stem axis. Fork geometry no longer applies this shift.
 */
export const LIFE_AREA_GATEWAY_OUTWARD_CLUSTER_SHIFT_PX = 150;

/** Gap (px) before hub / theme medallions where domain-cluster conduits terminate. */
export const DOMAIN_CLUSTER_ICON_STROKE_INSET_PX = 34;

/** Truncate rendered conduit / catalog chord — goals occupy space around the hub, not a long axial tail. */
export const DOMAIN_CLUSTER_STROKE_TIP_CAP = 0.58;
/**
 * Nominal distance from the branch **fork** (theme gateway) to the domain **hub** along the outward
 * branch direction (same px target for every branch on every limb — shared “ring” depth).
 */
export const DOMAIN_CLUSTER_HUB_RADIAL_RING_PX = 395;
/** Never place the hub closer than this to the fork (keeps the hub readable at tight forks). */
export const DOMAIN_CLUSTER_HUB_RADIAL_MIN_PX = 36;
/**
 * Soft ceiling on hub radius as a multiple of fork→{@link DOMAIN_CLUSTER_STROKE_TIP_CAP} chord length.
 *
 * In the anchor-authored hub-centric model, hubs are **independent semantic centers** — they no
 * longer have to live inside the rendered stroke. The chord cap used to clamp curvy-branch hubs
 * to the visible stroke; setting it to `8` effectively disables it for our straight-stroke layout
 * while keeping a safety bound against pathological inputs.
 */
export const DOMAIN_CLUSTER_HUB_RADIAL_MAX_FRACTION_OF_CHORD = 8.0;
/**
 * Per-slot radial offset (px) from {@link DOMAIN_CLUSTER_HUB_RADIAL_RING_PX} for the fixed
 * **4-hub-per-area invariant**.
 *
 * With four hub threads at square-corner directions around the theme gateway, use a **uniform** radial step so sibling
 * domain hubs sit on the same ring (no bisector / trunk-axis ladder).
 */
export const DOMAIN_CLUSTER_HUB_SLOT_RADIAL_OFFSETS_PX_N4: readonly [
  number,
  number,
  number,
  number,
] = [0, 0, 0, 0];
/**
 * Fallback radial stratification spread for slot counts other than 4 — kept for any non-domain-cluster
 * call sites or future variable-N layouts. The fixed 4-hub invariant uses
 * {@link DOMAIN_CLUSTER_HUB_SLOT_RADIAL_OFFSETS_PX_N4} instead.
 */
export const DOMAIN_CLUSTER_HUB_SLOT_RADIAL_SPREAD_PX = 30;
/**
 * **Hub limbs only** (gateway topology): all branch forks coincide at {@link AreaForkSpec.limbTip},
 * so hubs that share a similar branch-outward ray still stack. This adds a slot ladder along the
 * gateway tangent (orthogonal to the first hub spoke when the stem is degenerate) so sibling hubs
 * separate cleanly without ecology or spline drift.
 */
export const DOMAIN_CLUSTER_HUB_GATEWAY_ARC_SPREAD_PX = 36;
/**
 * Each sibling above two shrinks the orbital goal ring by this fraction so neighbouring ecosystems
 * keep breathing room as branch density grows. Composition-only — no negotiation, no force balancing.
 */
export const DOMAIN_CLUSTER_RING_NEIGHBOR_SHRINK_PER_EXTRA = 0.05;
/** Floor for {@link DOMAIN_CLUSTER_RING_NEIGHBOR_SHRINK_PER_EXTRA} — orbital ring never shrinks below this multiplier. */
export const DOMAIN_CLUSTER_RING_NEIGHBOR_SHRINK_FLOOR_MUL = 0.78;
/** Base radius from hub to root goal centres (px). Scale with domain hub disc sizing in `tree-svg`. */
export const DOMAIN_CLUSTER_BASE_RADIUS_PX = 168;
/** Hard ceiling on hub→goal orbit radius before neighbor-density shrink (`goalScreenPositionDomainCluster`). */
export const DOMAIN_CLUSTER_GOAL_RING_MAX_RADIUS_PX = 268;
/**
 * Extra rotation (rad) after equal division around the full circle — shifts where index `0` sits in the
 * tangent–normal plane without changing spacing.
 */
export const DOMAIN_CLUSTER_GOAL_RING_PHASE_OFFSET_RAD = 0;

export const TREE_THREAD_VISIBLE_MOMENTS = 5;
export const TREE_GOAL_MAX_CHILDREN_PER_NODE = 3;
export const TREE_GOAL_RENDER_MAX_DEPTH = 1;

export const BRANCH_T_PAST_LAST_MOMENT = 0.038;

/** Branch-slot icons on roadmap goals (design grid scales with tree). */
export const TREE_BRANCH_ICON_SIZE_PX = 46;

/** Limb hub icon at stem → branch fan join (`AreaForkSpec.limbTip`). */
export const TREE_LIMB_ICON_SIZE_PX = 42;

/** Theme gateway (life-area) icon at the hub node on the tree map SVG. */
export const TREE_THEME_GATEWAY_ICON_PX = 96;

/** Gap (px) between theme gateway glyph bottom and life-area title (middle baseline). */
export const TREE_THEME_GATEWAY_LABEL_GAP_PX = 12;

/** Domain hub glyph on each thread row (`tree-svg` domain cluster). */
export const TREE_DOMAIN_HUB_GLYPH_PX = 72;

/** Thread type label under the domain hub glyph. */
export const TREE_DOMAIN_HUB_LABEL_FONT_PX = 21;

/** Gap (px) between hub glyph bottom and label baseline anchor. */
export const TREE_DOMAIN_HUB_LABEL_GAP_PX = 6;

/** Thread name along branch paths when {@link TREE_THREAD_LABELS_ENABLED}. */
export const TREE_THREAD_PATH_LABEL_FONT_PX = 18;

/** Life-area title beside the limb icon on the tree map. */
export const TREE_LIFE_AREA_TITLE_FONT_PX = 26;

/** Goal title under hex nodes on the tree map. */
export const TREE_GOAL_SURFACE_TITLE_FONT_PX = 18;

/** Vertical gap (px) from hex bottom to goal title (`dominantBaseline: hanging`). */
export const TREE_GOAL_SURFACE_TITLE_GAP_PX = 18;

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
  return sig === 3 ? 7 : sig === 2 ? 6 : 5;
}
