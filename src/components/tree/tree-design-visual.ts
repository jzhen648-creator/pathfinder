/**
 * Visual tokens and SVG helpers from Claude Design · Pathfinder poster tree
 * (`Pathfinder CD/pf-tree.jsx`, `pf-data.jsx`). Used for canvas styling only — layout
 * stays in tree-branch-geometry / tree-forks.
 */

import type { Point } from "./tree-types";
import type { LifeAreaId } from "@/lib/types";

/** Canvas surface — matches design `PF_T.bg`. */
export const TREE_DESIGN_CANVAS_BG = "#07060A";

/** Dark node fill — matches design `PF_T.core`. */
export const TREE_DESIGN_NODE_CORE = "#0B0A11";

/** Short gateway labels on the poster (design uses italic Lora). */
export const TREE_THEME_SHORT_LABEL: Record<LifeAreaId, string> = {
  work: "Work",
  finance: "Money",
  becoming: "Self & Mind",
  pleasures: "Play",
  people: "People",
  health: "Health",
};

export const TREE_THEME_CANVAS_SERIF =
  'var(--font-pf-roadmap-serif), "Lora", Georgia, serif';

/** Pointy-top hex path (SVG `d`) — circumradius `r`, optional rotation (rad). */
export function pointyTopHexPathD(cx: number, cy: number, r: number, rotationRad = 0): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const th = -Math.PI / 2 + (i * Math.PI) / 3 + rotationRad;
    pts.push(`${cx + r * Math.cos(th)},${cy + r * Math.sin(th)}`);
  }
  return `M ${pts.join(" L ")} Z`;
}

/** Inscribed pentagon — trunk anchor (design §11). */
export function pentagonPathD(cx: number, cy: number, r: number, rotationRad = -Math.PI / 2): string {
  const pts: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    const th = rotationRad + (i * 2 * Math.PI) / 5;
    pts.push(`${cx + r * Math.cos(th)},${cy + r * Math.sin(th)}`);
  }
  return `M ${pts.join(" L ")} Z`;
}

export function pentagonAnchorAt(center: Point): {
  outerD: string;
  innerD: string;
  cx: number;
  cy: number;
} {
  const cx = center.x;
  const cy = center.y;
  return {
    cx,
    cy,
    outerD: pentagonPathD(cx, cy, 14),
    innerD: pentagonPathD(cx, cy, 7),
  };
}
