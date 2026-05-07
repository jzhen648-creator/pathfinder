/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any */
// @ts-nocheck
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DevPanel, type DevHoverInfo } from "@/components/dev/DevPanel";
import { getLegacyMockLifeData } from "@/data/mock-data";
import { LIMBS } from "@/lib/limbs";
import { LIMB_SUBTYPES } from "@/lib/types";
import { isEnabled } from "@/lib/flags";

/**
 * ============================================
 * FEATURE ROADMAP â€” NOT YET IMPLEMENTED
 * ============================================
 *
 * DRAG TO CONNECT (FLAGS.DRAG_TO_CONNECT)
 * Step 1: Make nodes draggable on the SVG
 *         â€” add onMouseDown/Move/Up to node g
 *         â€” track drag position in dragState
 * Step 2: Detect nearby branches and nodes
 *         â€” calculate distance from drag point
 *           to all branch lines and nodes
 *         â€” highlight when within 60px
 * Step 3: On drop trigger AI suggestion
 *         â€” call POST /api/life-map/drag-suggestion
 *         â€” show suggestion overlay on map
 * Step 4: User confirms or dismisses
 *         â€” confirmed â†’ creates NodeConnection
 *         â€” dismissed â†’ node snaps back
 *
 * NODE CONNECTIONS (FLAGS.NODE_CONNECTIONS)
 * Step 1: Render connection lines between nodes
 *         â€” curved bezier between two positions
 *         â€” colour gradient between branch colours
 *         â€” connection type label at midpoint
 * Step 2: Allow manual connection creation
 *         â€” right click â†’ Connect to...
 *         â€” select target node from list
 * Step 3: AI reads connections for insights
 *         â€” connected nodes inform pattern
 *           recognition and reflection prompts
 *
 * AI DRAG SUGGESTIONS (FLAGS.AI_DRAG_SUGGESTIONS)
 * Step 1: Activate POST /api/life-map/drag-suggestion
 *         â€” replace mock response with Groq call
 * Step 2: Build context-aware prompt
 *         â€” include both node full details
 *         â€” include surrounding map context
 *         â€” include year proximity
 * Step 3: Parse and display suggestion
 *         â€” show as floating tooltip near drag point
 *         â€” warm conversational tone
 *         â€” one sentence maximum
 * ============================================
 */

// RAW BRANCH DATA â€” never use directly in render
// Always use visibleBranches derived below.
const BRANCHES = [
  {
    id: "finance",
    label: "Money",
    color: "#34D399",
    angle: -70,
    emptyPrompt: "How has your financial situation evolved?",
    examples: ["First income", "Started saving", "Big financial decision"],
  },
  {
    id: "work",
    label: "Work & Learning",
    color: "#F59E0B",
    angle: -45,
    emptyPrompt: "What do you do and how did you get here?",
    examples: ["First job", "Career pivot", "New role"],
  },
  {
    id: "becoming",
    label: "Personal Growth",
    color: "#A78BFA",
    angle: 0,
    emptyPrompt: "How have you grown and changed?",
    examples: ["Changed my view on", "Learned that", "Became someone who"],
  },
  {
    id: "people",
    label: "Relationships",
    color: "#EC4899",
    angle: 45,
    emptyPrompt: "Who has shaped your story?",
    examples: ["Met my partner", "Found my people", "Lost someone"],
  },
  {
    id: "health",
    label: "Health",
    color: "#10B981",
    angle: 70,
    emptyPrompt: "How has your health evolved?",
    examples: ["Started training", "Built a habit", "Health turning point"],
  },
];
const ALL_BRANCHES = BRANCHES;
const LIFE_AREA_COLORS = Object.fromEntries(
  ALL_BRANCHES.map((branch) => [branch.label, branch.color]),
);
const PROMPT_COPY = Object.fromEntries(ALL_BRANCHES.map((branch) => [branch.label, branch.emptyPrompt]));
const BRANCH_BY_LABEL = Object.fromEntries(ALL_BRANCHES.map((branch) => [branch.label, branch]));
const BRANCH_LABEL_BY_ID = Object.fromEntries(ALL_BRANCHES.map((branch) => [branch.id, branch.label]));
const BRANCH_ID_BY_LABEL = Object.fromEntries(ALL_BRANCHES.map((branch) => [branch.label, branch.id]));
const SIGNIFICANCE_OPTIONS = [
  { v: 1, label: "Just part of life", sym: "â—‹" },
  { v: 2, label: "A meaningful chapter", sym: "â—‰" },
  { v: 3, label: "A defining moment", sym: "â—" },
];
const NODE_SPACING = 120;
const PROMPT_DISTANCE = 260;
const LIMB_CARD_SIZE = 80;
const LIMB_CARD_HALF = LIMB_CARD_SIZE / 2;
const LIMB_LABEL_Y = 56;
const LIMB_LABEL_MIN_WIDTH = 86;
const LIMB_LABEL_CHAR_WIDTH = 6.6;
const LIMB_LABEL_PADDING_X = 10;
const LIMB_LABEL_HEIGHT = 18;
const MOMENT_STEP = 20;
const LIMB_STEM_MAX_LENGTH = 160;
const MOMENT_LABEL_FONT_SIZE = 9;
const MOMENT_LABEL_OFFSET_X = 14;
const LABELS_RIGHT_LIMBS = new Set(["becoming", "people", "health"]);
const BRANCH_STEM_LENGTH = 90;
const BRANCH_FAN_DEGREES = 45;
const RING_1 = PROMPT_DISTANCE * 0.2;
const RING_2 = PROMPT_DISTANCE * 0.55;
const RING_3 = PROMPT_DISTANCE * 0.9;
const FORK_ANGLE_OFFSET = 25;
const LABEL_MIN_VERTICAL_DISTANCE = 40;
const LABEL_DOWN_OFFSET = 20;
const SELF_VIEWPORT_HEIGHT_RATIO = 0.6;
const BOUNDS_PADDING = 200;
const SELF_GLOW_RADIUS = 68;
const SELF_OUTER_RING_RADIUS = 52;
const SELF_CORE_RADIUS = 40;
const SELF_X = 0;
const SELF_Y = 0;

const BRANCH_ANGLE_BY_AREA = Object.fromEntries(
  ALL_BRANCHES.map((branch) => [branch.label, branch.angle]),
);
const LIMB_LABEL_BY_ID = Object.fromEntries(
  LIMBS.map((limb) => [limb.id, limb.label]),
);
const LIMB_ID_BY_LABEL = Object.fromEntries(
  LIMBS.map((limb) => [limb.label, limb.id]),
);

function resolveLimbFromMomentLike(
  moment: any,
  branchLimbById: Record<string, string> = {},
): { limbId: string; limbLabel: string } {
  const fallbackLimbId = "becoming";
  const fromLimbId = String(moment?.limbId ?? "").trim();
  if (fromLimbId && LIMB_LABEL_BY_ID[fromLimbId]) {
    return { limbId: fromLimbId, limbLabel: LIMB_LABEL_BY_ID[fromLimbId] };
  }

  const fromBranchId = String(moment?.branchId ?? "").trim();
  if (fromBranchId && branchLimbById[fromBranchId] && LIMB_LABEL_BY_ID[branchLimbById[fromBranchId]]) {
    const mapped = branchLimbById[fromBranchId];
    return { limbId: mapped, limbLabel: LIMB_LABEL_BY_ID[mapped] };
  }

  const fromLabel =
    String(moment?.limb ?? "").trim() ||
    String(moment?.lifeArea ?? "").trim() ||
    String(moment?.branch ?? "").trim();
  if (fromLabel && LIMB_ID_BY_LABEL[fromLabel]) {
    const mapped = LIMB_ID_BY_LABEL[fromLabel];
    return { limbId: mapped, limbLabel: fromLabel };
  }

  return {
    limbId: fallbackLimbId,
    limbLabel: LIMB_LABEL_BY_ID[fallbackLimbId] ?? "Personal Growth",
  };
}

function getBranchPoint(angle, distance) {
  const rad = (angle * Math.PI) / 180;
  return {
    x: Math.sin(rad) * distance,
    y: -Math.cos(rad) * distance,
  };
}

function getMomentPosition(angle, distance) {
  const point = getPos(angle, distance);
  return {
    x: SELF_X + point.x,
    y: SELF_Y + point.y,
  };
}

function getPos(angleDeg, distance) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: Math.sin(rad) * distance,
    y: -Math.abs(Math.cos(rad)) * distance,
  };
}

function renderLimbGlyph(branchId, color) {
  switch (branchId) {
    case "becoming":
      // Circle + up arrow
      return (
        <g fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx={0} cy={0} r={8.8} />
          <path d="M0 5V-5" />
          <path d="M-3.5 -2.4 L0 -6.2 L3.5 -2.4" />
        </g>
      );
    case "work":
      // Briefcase
      return (
        <g fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <rect x={-9.2} y={-4.4} width={18.4} height={12.8} rx={2.6} />
          <path d="M-3.4 -4.4V-7.2H3.4V-4.4" />
          <path d="M-9.2 1.8H9.2" />
        </g>
      );
    case "people":
      // Interlinked rings
      return (
        <g fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx={-4.6} cy={0} r={5.8} />
          <circle cx={4.6} cy={0} r={5.8} />
        </g>
      );
    case "finance":
      // Circle chart with bars
      return (
        <g fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx={0} cy={0} r={9} />
          <path d="M-4.8 3.8V0.8" />
          <path d="M0 3.8V-1.8" />
          <path d="M4.8 3.8V-4.1" />
        </g>
      );
    case "health":
      // Medical plus
      return (
        <g fill="none" stroke={color} strokeWidth={3.1} strokeLinecap="round" strokeLinejoin="round">
          <path d="M0 -8V8" />
          <path d="M-8 0H8" />
        </g>
      );
    default:
      return (
        <text
          x={0}
          y={4}
          textAnchor="middle"
          fill={color}
          fontSize={12}
          fontFamily="'DM Sans', sans-serif"
          fontWeight={700}
        >
          âœ¦
        </text>
      );
  }
}

function sortByCreatedAtAsc<T extends { createdAt?: string; year?: number; month?: number | null }>(
  a: T,
  b: T,
) {
  const aTime = Date.parse(String(a.createdAt ?? "")) || Date.parse(
    `${Number(a.year ?? 1970)}-${String(a.month ?? 1).padStart(2, "0")}-01`,
  );
  const bTime = Date.parse(String(b.createdAt ?? "")) || Date.parse(
    `${Number(b.year ?? 1970)}-${String(b.month ?? 1).padStart(2, "0")}-01`,
  );
  return aTime - bTime;
}

function getForkPos(parentAngle, side, distanceFromParent, parentDistance) {
  const forkAngle = side === "left" ? parentAngle - 25 : parentAngle + 25;
  const parentPos = getPos(parentAngle, parentDistance);
  const forkOffset = getPos(forkAngle, distanceFromParent);
  return {
    x: parentPos.x + forkOffset.x - getPos(parentAngle, 0).x,
    y: parentPos.y + forkOffset.y - getPos(parentAngle, 0).y,
  };
}

function getBranchLabelPos(angle) {
  return getPos(angle, PROMPT_DISTANCE * 0.45);
}

function getBranchPromptPos(angle) {
  return getPos(angle, PROMPT_DISTANCE);
}

function getLimbBasisVectors(limbPos: { x: number; y: number }) {
  const len = Math.max(0.0001, Math.hypot(limbPos.x, limbPos.y));
  const nx = limbPos.x / len;
  const ny = limbPos.y / len;
  return {
    normal: { x: nx, y: ny },
    tangent: { x: -ny, y: nx },
  };
}

function getLimbEdgeAnchor(limbPos: { x: number; y: number }) {
  const { normal } = getLimbBasisVectors(limbPos);
  return {
    x: limbPos.x + normal.x * LIMB_CARD_HALF,
    y: limbPos.y + normal.y * LIMB_CARD_HALF,
  };
}

/** Bottom-center of limb card in map space (cards sit above Self; rect spans y±LIMB_CARD_HALF). */
function getLimbCardBottomCenterForSpoke(card: { x: number; y: number }) {
  // Slightly extend so spoke visually reaches card edge.
  return { x: card.x, y: card.y + LIMB_CARD_HALF + 2 };
}

function getMapPositionValue(moment, fallbackIndex = 0) {
  const raw = Number(moment?.mapPosition);
  if (Number.isFinite(raw)) return raw;
  return fallbackIndex;
}

function sortBranchMomentsForMap(branchMoments) {
  return [...branchMoments].sort(
    (a, b) => getMapPositionValue(a) - getMapPositionValue(b),
  );
}

function getNodeSubbranchId(node, branch) {
  if (node?.subbranch) return node.subbranch;
  if (node?.id) {
     
    const globalAny = globalThis as any;
    const warned: Set<string> =
      globalAny.__pathfinderMissingSubbranchWarned ??
      (globalAny.__pathfinderMissingSubbranchWarned = new Set<string>());
    if (!warned.has(node.id)) {
      warned.add(node.id);
      console.warn("Node missing subbranch assignment:", node.id, node.label ?? node.title ?? "");
    }
  }
  const fallback = branch?.subbranches?.[0]?.id;
  return fallback ?? null;
}

/** Shared trunk endpoint for all sub-branches of this main branch angle. */
function getForkPoint(branchAngle, branchId) {
  return getPos(branchAngle, RING_1);
}

function getSubbranchPromptPos(branchAngle, angleOffset, branchId) {
  const fork = getForkPoint(branchAngle, branchId);
  const effectiveAngle = branchAngle + angleOffset;
  const extension = getPos(effectiveAngle, RING_2);
  return {
    x: SELF_X + fork.x + extension.x,
    y: SELF_Y + fork.y + extension.y,
  };
}

/** Node position: fork along main angle, then outward along (branchAngle + offset). */
function getSubbranchMomentPos(branchAngle, angleOffset, nodeIndex, branchId) {
  const fork = getForkPoint(branchAngle, branchId);
  const effectiveAngle = branchAngle + angleOffset;
  const extension = getPos(
    effectiveAngle,
    RING_3 + nodeIndex * NODE_SPACING,
  );
  return {
    x: SELF_X + fork.x + extension.x,
    y: SELF_Y + fork.y + extension.y,
  };
}

function recalibrateAngles(branches) {
  const MIN_SEPARATION = 25;
  const adjusted = branches.map((branch) => ({ ...branch }));
  for (let i = 0; i < adjusted.length - 1; i += 1) {
    const currentCount = adjusted[i].nodes.length;
    const nextCount = adjusted[i + 1].nodes.length;
    if (currentCount < 3 || nextCount < 3) continue;
    const gap = adjusted[i + 1].angle - adjusted[i].angle;
    if (gap < MIN_SEPARATION) {
      const correction = (MIN_SEPARATION - gap) / 2;
      adjusted[i].angle -= correction;
      adjusted[i + 1].angle += correction;
    }
  }
  return adjusted.map((branch) => ({
    ...branch,
    angle: branch.angle,
  }));
}

function buildPositions(branches) {
  return { self: { x: SELF_X, y: SELF_Y } };
}

function buildEdges(branches, pos) {
  const edges = [];
  const limbCardPositions = buildLimbCardPositions(branches);
  branches.forEach((branch) => {
    const sorted = sortBranchMomentsForMap(branch.nodes);
    const limbPos = limbCardPositions[branch.id] ?? getPos(branch.angle, PROMPT_DISTANCE);
    const limbAnchor = getLimbEdgeAnchor(limbPos);
    edges.push({
      from: { x: 0, y: 0 },
      to: { x: limbAnchor.x, y: limbAnchor.y },
      color: branch.color,
      future: false,
      type: "selfLimb",
      angle: branch.angle,
    });
    sorted.forEach((m) => {
      const momentPos = pos[m.id];
      if (!momentPos) return;
      edges.push({
        from: { x: limbAnchor.x, y: limbAnchor.y },
        to: { x: momentPos.x, y: momentPos.y },
        color: branch.color,
        future: Boolean(m.future),
        type: "limbMoment",
      });
    });
  });
  return edges;
}

function branchEdge(x1, y1, x2, y2) {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
}

function rootEdge(angle, endX, endY) {
  const cp1 = getPos(angle, PROMPT_DISTANCE * 0.3);
  const cp2 = getPos(angle, PROMPT_DISTANCE * 0.7);
  return `M0,0 C${cp1.x},${cp1.y} ${cp2.x},${cp2.y} ${endX},${endY}`;
}

function transformGoals(goals, branchLabels) {
  const legacyToNewArea = {
    Career: "Work & Learning",
    Health: "Health",
    "Health & Fitness": "Health",
    "Personal Growth": "Personal Growth",
    Relationships: "Relationships",
    "Where I've Lived": "Personal Growth",
    Living: "Personal Growth",
    "Where I've Been": "Personal Growth",
    places: "Personal Growth",
    Finance: "Money",
  };
  const dedupedById = [];
  const seenIds = new Set();
  for (const goal of goals) {
    if (!goal?.id || seenIds.has(goal.id)) continue;
    seenIds.add(goal.id);
    dedupedById.push(goal);
  }

  const grouped = {};
  dedupedById.forEach((g) => {
    const sourceArea = g.limb ?? g.lifeArea ?? g.branch;
    const area = legacyToNewArea[sourceArea] ?? sourceArea ?? "Personal Growth";
    if (!grouped[area]) grouped[area] = [];
    grouped[area].push(g);
  });
  const areaWithAngles = branchLabels.map((area) => ({
    area,
    color: LIFE_AREA_COLORS[area] ?? "#9CA3AF",
    angle: BRANCH_ANGLE_BY_AREA[area] ?? 0,
    areaGoals: grouped[area] ?? [],
  }));
  return areaWithAngles.map(({ area, areaGoals, color, angle }) => {
    const sorted = [...areaGoals].sort(
      (a, b) => Number(a.mapPosition ?? 0) - Number(b.mapPosition ?? 0),
    );
    const mappedNodes = sorted.map((g) => ({
      id: g.id,
      label: g.title ?? g.label,
      year: Number(g.year ?? new Date(g.createdAt).getFullYear()),
      month: g.month ?? null,
      mapPosition: Number(g.mapPosition ?? 0),
      createdAt: g.createdAt,
      desc: g.description || g.title || g.label,
      progress: g.progress ?? 0,
      future: Boolean(g.future ?? ((g.progress ?? 0) < 100)),
      synthetic: Boolean(g.synthetic),
      practicalData: g.practicalData,
      significance: Math.max(1, Math.min(3, Number(g.significance ?? 1))),
      timelineNote: g.timelineNote ?? null,
      connectedTo: Array.isArray(g.connectedTo) ? g.connectedTo : [],
      subtype: g.subtype ?? null,
      subbranch: g.subbranch ?? null,
      location: g.location ?? null,
    }));
    const deduped: typeof mappedNodes = [];
    const dedupeIndex = new Map<string, number>();
    mappedNodes.forEach((node) => {
      const key = `${String(node.subbranch ?? "")}::${String(node.label ?? "").trim().toLowerCase()}`;
      const idx = dedupeIndex.get(key);
      if (idx === undefined) {
         
        (node as any).duplicateCount = 1;
         
        (node as any).duplicateNodeIds = [node.id];
        dedupeIndex.set(key, deduped.length);
        deduped.push(node);
      } else {
         
        const existing: any = deduped[idx];
        existing.duplicateCount = Number(existing.duplicateCount ?? 1) + 1;
        existing.duplicateNodeIds = [
          ...(Array.isArray(existing.duplicateNodeIds) ? existing.duplicateNodeIds : [existing.id]),
          node.id,
        ];
      }
    });
    const canonicalBranchId =
      BRANCH_ID_BY_LABEL[area] ??
      ALL_BRANCHES.find((b) => b.id === area || b.label === area)?.id ??
      area;
    return {
      id: canonicalBranchId,
      label: area,
      color,
      angle,
      nodes: deduped,
    };
  });
}

function resolveUnlockMiddleInsight(branch, _timelineGoals) {
  return branch.unlockMessage ?? "";
}

function deduplicateNodes(nodes) {
  const seen = new Set();
  const filtered = nodes.filter((node) => {
    if (!node) return false;
    if (node.id && seen.has(node.id)) return false;
    if (node.id) seen.add(node.id);
    const label = String(node.title ?? node.label ?? "").toLowerCase().trim();
    const branch = String(node.limb ?? node.lifeArea ?? node.branch ?? "").toLowerCase().trim();
    const key = `${label}-${branch}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return filtered;
}

function addOriginNodes(goals, _profile) {
  return goals;
}

const STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&family=DM+Sans:wght@300;400;500&display=swap');
  @keyframes shimmer { 0%,100% { stroke-opacity: 0.12; } 50% { stroke-opacity: 0.35; } }
  @keyframes glow-path { 0%,100% { stroke-opacity: 0.55; } 50% { stroke-opacity: 0.9; } }
  @keyframes dormant-branch-pulse { 0%,100% { stroke-opacity: 0.16; } 50% { stroke-opacity: 0.25; } }
  @keyframes node-grow { 0% { opacity: 0; transform: scale(0); } 100% { opacity: 1; transform: scale(1); } }
  @keyframes node-pulse {
    0%   { opacity: 0.5; transform: scale(1); }
    50%  { opacity: 0.15; transform: scale(1.3); }
    100% { opacity: 0.5; transform: scale(1); }
  }
  @keyframes overlay-shimmer { 0% { transform: translateX(-20%); opacity: 0.08; } 50% { opacity: 0.2; } 100% { transform: translateX(20%); opacity: 0.08; } }
  @keyframes overlay-float { 0%,100% { transform: translateY(0px); opacity: 0.25; } 50% { transform: translateY(-8px); opacity: 0.45; } }
  @keyframes unlock-prompt-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes unlock-prompt-out { to { opacity: 0; transform: translateY(10px); } }
  @keyframes unlock-countdown-bar { from { transform: scaleX(1); } to { transform: scaleX(0); } }
  @keyframes self-origin-pulse {
    0%, 100% { transform: scale(1); opacity: 0.48; }
    50% { transform: scale(1.08); opacity: 0.9; }
  }
  .unlock-prompt-panel-enter { animation: unlock-prompt-in 0.3s ease-out forwards; }
  .unlock-prompt-panel-leave { animation: unlock-prompt-out 0.2s ease forwards; }
  .unlock-prompt-countdown { transform-origin: left center; animation: unlock-countdown-bar 10s linear forwards; }
  @keyframes node-detail-slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
  .node-detail-panel-enter { animation: node-detail-slide-in 0.3s ease-out forwards; }
  @keyframes node-sig-pulse { 0%, 100% { opacity: 0.82; } 50% { opacity: 1; } }
  .node-sig-pulse { animation: node-sig-pulse 3.2s ease-in-out infinite; }
  .future-edge { animation: shimmer 3s ease-in-out infinite; }
  .done-edge { }
  .dormant-branch-line { animation: dormant-branch-pulse 4.5s ease-in-out infinite; }
  .node-grow { animation: node-grow 0.4s ease forwards; }
  .moment-label, .moment-location { opacity: 0; transition: opacity 0.15s ease; pointer-events: none; }
  .node-g:hover .moment-label, .node-g:hover .moment-location { opacity: 1; }
  .overlay-shimmer { animation: overlay-shimmer 7s ease-in-out infinite; }
  .overlay-particle { animation: overlay-float 4.5s ease-in-out infinite; }
  .self-origin-pulse { animation: self-origin-pulse 2.8s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
`;

function buildPromptCard(text) {
  const words = text.split(/\s+/);
  const maxCharsPerLine = 28;
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxCharsPerLine) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  const longest = lines.reduce((len, line) => Math.max(len, line.length), 0);
  const width = Math.min(150, Math.max(92, longest * 5.1 + 24));
  const lineHeight = 11;
  const height = lines.length * lineHeight + 16;
  return { lines, width, height, lineHeight };
}

function buildPromptPositions(branches) {
  const promptPos = {};
  branches.forEach((branch) => {
    const limbPos = getPos(branch.angle, PROMPT_DISTANCE);
    const anchor = getLimbEdgeAnchor(limbPos);
    promptPos[branch.id] = { x: SELF_X + anchor.x, y: SELF_Y + anchor.y };
  });
  return promptPos;
}

function buildSuggestionPositions(branches, positions, suggestionsByBranch) {
  const suggestionPositions = {};
  branches.forEach((branch) => {
    const branchSuggestions = suggestionsByBranch[branch.label] ?? [];
    if (branchSuggestions.length === 0) return;
    const sorted = sortBranchMomentsForMap(branch.nodes);
    const endpoint = sorted.length > 0 ? positions[sorted[sorted.length - 1].id] : positions.self;
    if (!endpoint) return;

    branchSuggestions.forEach((suggestion, index) => {
      const id = suggestion.id;
      const step = getBranchPoint(branch.angle, NODE_SPACING * (index + 1));
      suggestionPositions[id] = {
        x: endpoint.x + step.x,
        y: endpoint.y + step.y,
      };
    });
  });
  return suggestionPositions;
}

function buildExtractionPreviewPositions(branches, positions, previewNodes) {
  const byBranch = previewNodes.reduce((acc, node) => {
    if (!acc[node.branch]) acc[node.branch] = [];
    acc[node.branch].push(node);
    return acc;
  }, {});

  const pos = {};
  branches.forEach((branch) => {
    const branchPreview = byBranch[branch.label] ?? [];
    if (branchPreview.length === 0) return;
    const existingMain = sortBranchMomentsForMap(branch.nodes);
    const startIndex = existingMain.length;
    const sortedPreview = [...branchPreview].sort((a, b) => a.year - b.year);
    sortedPreview.forEach((node, idx) => {
      const distance = PROMPT_DISTANCE + NODE_SPACING * (startIndex + idx + 1);
      pos[node.id] = getMomentPosition(branch.angle, distance);
    });
  });
  return pos;
}

function buildLimbCardPositions(branches, worldLeft?: number, worldRight?: number) {
  const BRANCH_ROW_Y = -PROMPT_DISTANCE;
  const n = branches.length;
  if (n === 0) return {};

  const boundsOk =
    typeof worldLeft === "number" &&
    typeof worldRight === "number" &&
    Number.isFinite(worldLeft) &&
    Number.isFinite(worldRight) &&
    worldRight > worldLeft + LIMB_CARD_SIZE;

  if (boundsOk) {
    const W = worldRight - worldLeft;
    const C = LIMB_CARD_SIZE;
    const gap = Math.max(12, (W - n * C) / (n + 1));
    const used = n * C + (n + 1) * gap;
    const offset = worldLeft + Math.max(0, (W - used) / 2);
    return Object.fromEntries(
      branches.map((branch, i) => {
        const x = offset + gap + C / 2 + i * (C + gap);
        return [branch.id, { x, y: BRANCH_ROW_Y }];
      }),
    );
  }

  const labels = branches.map((branch) => {
    const p = getPos(branch.angle, PROMPT_DISTANCE);
    return {
      id: branch.id,
      x: p.x,
      y: BRANCH_ROW_Y,
    };
  });
  return Object.fromEntries(labels.map((label) => [label.id, { x: label.x, y: label.y }]));
}

function getYearChips() {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let i = 0; i < 12; i += 1) {
    years.push(String(currentYear - i));
  }
  return [...years, "Earlier", "Not sure"];
}

function getRecentYearChips(count = 10) {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let i = 0; i < count; i += 1) {
    years.push(String(currentYear - i));
  }
  return [...years, "Earlier"];
}

function resolveYearChipToNumber(value) {
  const now = new Date().getFullYear();
  if (!value) return now;
  if (/^\d{4}$/.test(String(value))) return Number(value);
  const map = {
    "Before 2010": 2009,
    "2010-2015": 2013,
    "2016-2019": 2018,
    "2020-2022": 2021,
    "2023-2025": 2024,
    "This year": now,
    Earlier: now - 12,
    "Not sure": now,
  };
  return map[value] ?? now;
}

function buildNodeLabel(selections) {
  const raw = selections.filter(Boolean).join(" ").trim();
  if (!raw) return "Moment";
  const words = raw.split(/\s+/);
  const deduped = words.filter(
    (word, index) => index === 0 || word.toLowerCase() !== words[index - 1].toLowerCase(),
  );
  const capped = deduped.slice(0, 5);
  if (capped.length === 0) return "Moment";
  return `${capped[0].charAt(0).toUpperCase()}${capped[0].slice(1)}${capped
    .slice(1)
    .map((w) => ` ${w}`)
    .join("")}`;
}

function isLikelyLocationOnlyLabel(input) {
  const text = String(input ?? "").trim();
  if (!text) return false;
  if (/\bmoved\s+(to|from)\b/i.test(text)) return true;
  const words = text
    .replace(/[^\p{L}\p{N}\s,.-]/gu, " ")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return false;
  if (text.includes(",") && words.length <= 4) return true;
  const locationLexicon = new Set([
    "bangkok",
    "london",
    "thailand",
    "uk",
    "united",
    "kingdom",
    "england",
    "online",
    "remote",
    "europe",
    "asia",
    "america",
  ]);
  return words.length <= 3 && words.every((w) => locationLexicon.has(w));
}

function extractLabel(text: string): string {
  const trimmed = String(text ?? "").trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 5) return trimmed;
  return words.slice(0, 5).join(" ");
}

function getDisplayName(profile: { name?: string | null; email?: string | null }) {
  const rawName = String(profile?.name ?? "").trim();
  if (rawName) {
    return rawName.split(/\s+/)[0];
  }
  const email = String(profile?.email ?? "").trim();
  if (email && email.includes("@")) {
    const emailName = email.split("@")[0] ?? "";
    if (emailName) {
      return `${emailName.charAt(0).toUpperCase()}${emailName.slice(1)}`;
    }
  }
  return "Explorer";
}

function getPossessive(name: string) {
  return name.toLowerCase().endsWith("s") ? `${name}' Map` : `${name}'s Map`;
}

function getYearChipsFrom(startYear, count = 12) {
  const years = [];
  const safeStart = Number.isFinite(Number(startYear))
    ? Math.trunc(Number(startYear))
    : new Date().getFullYear();
  for (let i = 0; i < count; i += 1) {
    years.push(String(safeStart - i));
  }
  return [...years, "Earlier", "Not sure"];
}

function buildFlowStepsWithOptionalMonth(steps, parentYear?: number) {
  return steps
    .filter((step) => !step.isYear)
    .map((step) => (parentYear ? { ...step } : step));
}

function getOptionalMonthFromGuidedAnswers(answers) {
  void answers;
  return null;
}

function stripTemporalQuestionsFromFlowBlueprints(blueprints) {
  const temporalQuestionPattern = /\b(when|year|date|time)\b/i;
  const entries = Object.entries(blueprints ?? {}).map(([branchLabel, branchFlows]) => {
    const sanitizedBranchFlows = Object.entries(branchFlows ?? {}).reduce(
      (acc, [flowLabel, flowConfig]) => {
        const steps = Array.isArray(flowConfig?.steps) ? flowConfig.steps : [];
        const filteredSteps = steps.filter((step) => {
          const question = String(step?.question ?? "");
          return !temporalQuestionPattern.test(question);
        });
        acc[flowLabel] = { ...flowConfig, steps: filteredSteps };
        return acc;
      },
      {},
    );
    return [branchLabel, sanitizedBranchFlows];
  });
  return Object.fromEntries(entries);
}

function pointToSegmentDistance(point, a, b) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = point.x - a.x;
  const wy = point.y - a.y;
  const lenSq = vx * vx + vy * vy;
  if (lenSq === 0) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / lenSq));
  const projX = a.x + t * vx;
  const projY = a.y + t * vy;
  return Math.hypot(point.x - projX, point.y - projY);
}

function getDragBranchAngle(
  parentSubbranchAngle: number,
  dragX: number,
  dragY: number,
  originX: number,
  originY: number,
): number {
  const dragAngle = (Math.atan2(dragY - originY, dragX - originX) * 180) / Math.PI;
  const relativeAngle = dragAngle - parentSubbranchAngle;
  const forkOffset = relativeAngle < 0 ? -25 : 25;
  return parentSubbranchAngle + forkOffset;
}

function getClickRatioOnLine(
  clickX: number,
  clickY: number,
  lineStartX: number,
  lineStartY: number,
  lineEndX: number,
  lineEndY: number,
): number {
  const lineLength = Math.hypot(lineEndX - lineStartX, lineEndY - lineStartY);
  if (lineLength <= 0.0001) return 0;
  const clickDist = Math.hypot(clickX - lineStartX, clickY - lineStartY);
  return Math.min(1, clickDist / lineLength);
}

function getClosestPointOnSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const lenSq = vx * vx + vy * vy;
  if (lenSq === 0) return { x: x1, y: y1, t: 0 };
  const t = Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / lenSq));
  return { x: x1 + vx * t, y: y1 + vy * t, t };
}

function getUnlockLastShownStorageKey(branchId: string) {
  return `pathfinder_unlock_last_shown_${branchId}`;
}

function wasUnlockShownRecently(branchId: string) {
  try {
    const lastShown = window.localStorage.getItem(getUnlockLastShownStorageKey(branchId));
    if (!lastShown) return false;
    const parsed = Number.parseInt(lastShown, 10);
    if (!Number.isFinite(parsed)) return false;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    return Date.now() - parsed < sevenDays;
  } catch {
    return false;
  }
}

const GUIDED_FLOW_BLUEPRINTS = stripTemporalQuestionsFromFlowBlueprints({
  "Work & Learning": {
    "First job": {
      steps: [
        { id: "field", question: "What field was it in?", options: ["Sales", "Tech", "Finance", "Healthcare", "Hospitality", "Other"], allowOther: true },
        { id: "when", question: "Roughly when?", options: ["Before 2010", "2010-2015", "2016-2019", "2020-2022", "2023-2025", "This year"] },
        { id: "outcome", question: "How did it go?", options: ["Loved it", "It was okay", "Hated it", "Learned a lot", "Just a stepping stone"] },
      ],
    },
    "Career pivot": {
      steps: [
        { id: "from", question: "What did you pivot from?", options: ["Corporate", "Sales", "Creative", "Tech", "Manual work", "Other"], allowOther: true },
        { id: "to", question: "What did you pivot to?", options: ["Corporate", "Sales", "Creative", "Tech", "Manual work", "Other"], allowOther: true },
        { id: "driver", question: "What drove the change?", options: ["Better money", "Passion", "Burnout", "Opportunity came up", "Life change"] },
        { id: "when", question: "When did this happen?", options: getRecentYearChips(10) },
      ],
    },
    "Started a business": {
      steps: [
        { id: "kind", question: "What kind of business?", options: ["Tech", "Service", "Product", "Freelance", "Creative", "Retail", "Other"], allowOther: true },
        { id: "when", question: "When did you start it?", options: getYearChips(), isYear: true },
        { id: "status", question: "How is it going?", options: ["Thriving", "Growing slowly", "Struggling", "I closed it", "Just getting started"] },
      ],
    },
  },
  Health: {
    "Started training": {
      steps: [
        { id: "type", question: "What kind of training?", options: ["Gym", "Running", "Martial arts", "Cycling", "Swimming", "Sport", "Yoga", "Other"], allowOther: true },
        { id: "when", question: "When did you start?", options: getYearChips(), isYear: true },
        { id: "status", question: "Are you still doing it?", options: ["Yes consistently", "On and off", "Stopped", "Just started"] },
      ],
    },
    "Lost weight": {
      steps: [
        { id: "amount", question: "How much approximately?", options: ["1-5kg", "5-10kg", "10-20kg", "20kg+"] },
        { id: "method", question: "How did you do it?", options: ["Diet", "Exercise", "Both", "Intermittent fasting", "Medical support", "Other"], allowOther: true },
        { id: "when", question: "When was this?", options: getYearChips(), isYear: true },
      ],
    },
    "Built a habit": {
      steps: [
        { id: "habit", question: "What habit did you build?", options: ["Exercise", "Diet", "Sleep", "Meditation", "Reading", "Cold exposure", "Other"], allowOther: true },
        { id: "when", question: "When did you start?", options: getYearChips(), isYear: true },
        { id: "consistency", question: "How consistent are you?", options: ["Daily", "Most days", "A few times a week", "Still building it", "Fell off and restarted"] },
      ],
    },
  },
  Relationships: {
    "Met my partner": {
      steps: [
        { id: "how", question: "How did you meet?", options: ["Through friends", "App", "Work", "School", "Travelling", "Just happened"] },
        { id: "when", question: "When?", options: getYearChips(), isYear: true },
        { id: "status", question: "Where are you now?", options: ["Together", "Married", "Long distance", "Complicated", "It ended"] },
      ],
    },
    "Found my people": {
      steps: [
        { id: "community", question: "What kind of community?", options: ["Friends group", "Work colleagues", "Sports team", "Online community", "Neighbours", "Spiritual group"] },
        { id: "when", question: "When?", options: getYearChips(), isYear: true },
      ],
    },
    "Lost someone": {
      steps: [
        { id: "lossType", question: "How would you describe this loss?", options: ["A relationship ended", "Lost a friend", "Grew apart", "They passed away", "Family estrangement"] },
        { id: "when", question: "When was this?", options: getYearChips(), isYear: true },
        { id: "impact", question: "How has it shaped you?", options: ["Made me stronger", "Still processing", "Changed my priorities", "Taught me a lot", "I don't talk about it"] },
      ],
    },
  },
  "Personal Growth": {
    "Mindset Shift": {
      steps: [
        {
          id: "beforeThink",
          question: "What did you used to think?",
          options: ["Money is everything", "I need approval", "Work defines me", "I can't change", "Other"],
          allowOther: true,
        },
        { id: "nowThink", question: "What do you think now?", isFreeText: true },
        {
          id: "cause",
          question: "What caused the shift?",
          options: ["A person", "An experience", "A failure", "Travel", "Time", "Reading", "Other"],
          allowOther: true,
        },
        { id: "when", question: "When did this shift happen?", options: getYearChips(), isYear: true },
      ],
    },
    "Lesson Learned": {
      steps: [
        {
          id: "area",
          question: "What area of life was the lesson in?",
          options: ["Career", "Money", "Relationships", "Health", "Myself", "Other"],
          allowOther: true,
        },
        { id: "lesson", question: "Finish this sentence: I learned that...", isFreeText: true },
        {
          id: "how",
          question: "How did you learn it?",
          options: [
            "Made a mistake",
            "Watched someone else",
            "Got advice",
            "Figured it out alone",
            "Painful experience",
          ],
        },
        { id: "when", question: "When?", options: getYearChips(), isYear: true },
      ],
    },
    "Identity Change": {
      steps: [
        {
          id: "usedTo",
          question: "I used to be someone who...",
          options: [
            "Avoided conflict",
            "Played it safe",
            "Needed validation",
            "Worked to live",
            "Followed the crowd",
            "Other",
          ],
          allowOther: true,
        },
        { id: "nowIdentity", question: "Now you are someone who...", isFreeText: true },
        { id: "when", question: "When did this shift start?", options: getYearChips(), isYear: true },
      ],
    },
  },
  Money: {
    "First income": {
      steps: [
        { id: "source", question: "What was it from?", options: ["Part time job", "First salary", "Freelance", "Business", "Inheritance"] },
        { id: "when", question: "When?", options: getYearChips(), isYear: true },
      ],
    },
    "Started saving": {
      steps: [
        { id: "goal", question: "What were you saving for?", options: ["Emergency fund", "Property", "Travel", "Retirement", "Just to save", "Big purchase"] },
        { id: "when", question: "When did you start?", options: getYearChips(), isYear: true },
        { id: "status", question: "Still going?", options: ["Yes on track", "Dipped into it", "Hit the moment", "Stopped for now"] },
      ],
    },
    "Big financial decision": {
      steps: [
        { id: "decision", question: "What was the decision?", options: ["Bought property", "Took out a loan", "Made an investment", "Quit a job", "Started saving seriously", "Other"], allowOther: true },
        { id: "when", question: "When was this?", options: getYearChips(), isYear: true },
        { id: "outcome", question: "How did it turn out?", options: ["Best decision I made", "Too early to tell", "Worked out eventually", "Didn't go to plan", "Still dealing with it"] },
      ],
    },
  },
});

type GuidedFlowConnection = {
  fromNodeId: string;
  toNodeId: string;
  fromBranch: string;
  toBranch: string;
  connectionType: "caused" | "led_to" | "happened_at" | "involved" | "affected";
  label?: string;
};

type UndoAction = {
  type: "ADD_NODE" | "DELETE_NODE" | "UNLOCK_BRANCH";
  payload: {
    nodeId?: string;
    branchId?: string;
    nodeData?: any;
    source?: "goals" | "guidedNodes";
  };
  timestamp: number;
  label: string;
};

export function PathfinderHome() {
  const legacyMockData = useMemo(() => getLegacyMockLifeData("alex", "extensive"), []);
  const useMockData = isEnabled("MOCK_DATA");
  const isDev = true;
  const devPanelFeatureEnabled = isEnabled("DEV_PANEL") && isDev;
  const [hovered, setHovered] = useState(null);
  const [hoveredMarkId, setHoveredMarkId] = useState<string | null>(null);
  const [selected, setSelected] = useState(null);
  const [selectedMomentId, setSelectedMomentId] = useState<string | null>(null);
  const [focusedBranch, setFocusedBranch] = useState<string | null>(null);
  const [focusedSubbranch, setFocusedSubbranch] = useState<string | null>(null);
  const [editSubbranch, setEditSubbranch] = useState<string | null>(null);
  const [nodeDetailEditMode, setNodeDetailEditMode] = useState(false);
  const [nodeDeleteConfirm, setNodeDeleteConfirm] = useState(false);
  const [reflectionDraft, setReflectionDraft] = useState("");
  const [reflectionSaveStatus, setReflectionSaveStatus] = useState("idle");
  const [nodeEditLabel, setNodeEditLabel] = useState("");
  const [nodeEditDesc, setNodeEditDesc] = useState("");
  const [nodeEditYear, setNodeEditYear] = useState("");
  const [detailPatchStatus, setDetailPatchStatus] = useState("idle");
  const [moveBranchOpen, setMoveBranchOpen] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.78);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [goals, setGoals] = useState([]);
  const [guidedNodes, setGuidedNodes] = useState([]);
  // Canonical Branch records (loaded from /api/branches or mock).
  // Used by DevPanel + multi-branch-per-limb creation flow (Slice 1).
  const [canonicalBranches, setCanonicalBranches] = useState<any[]>([]);
  // Ephemeral UI: gap chooser popover (shown on first-gap click when branch has moments).
  const [gapChooser, setGapChooser] = useState<{
    gap: any;
    screenX: number;
    screenY: number;
  } | null>(null);
  // When the next guided-flow save should land on a freshly-created Branch,
  // this holds its id. Cleared once the moment is created.
  const [pendingNewBranchId, setPendingNewBranchId] = useState<string | null>(null);
  const [recentNodeIds, setRecentNodeIds] = useState<string[]>([]);
  const [profile, setProfile] = useState({ name: "", email: "", birthYear: null, birthPlace: "" });
  const [guidedBranch, setGuidedBranch] = useState(null);
  const [guidedSubbranch, setGuidedSubbranch] = useState<string | null>(null);
  const [hoveredPromptBranch, setHoveredPromptBranch] = useState<string | null>(null);
  const [hoveredSubbranchPrompt, setHoveredSubbranchPrompt] = useState<string | null>(null);
  const [hoveredSubbranchLine, setHoveredSubbranchLine] = useState<string | null>(null);
  const [hoveredBranchLine, setHoveredBranchLine] = useState<string | null>(null);
  const [hoveredBranchIconId, setHoveredBranchIconId] = useState<string | null>(null);
  const [hoveredGapId, setHoveredGapId] = useState<string | null>(null);
  const [guidedMode, setGuidedMode] = useState("text");
  const [guidedEntryMode, setGuidedEntryMode] = useState<"guided" | "text">("guided");
  const [guidedInput, setGuidedInput] = useState("");
  const [guidedFlow, setGuidedFlow] = useState<any>(null);
  const [guidedPostStage, setGuidedPostStage] = useState<
    "none" | "location" | "significance" | "connections"
  >("none");
  const [guidedLocationDraft, setGuidedLocationDraft] = useState("");
  const [pendingGuidedOutcome, setPendingGuidedOutcome] = useState<any>(null);
  const [pendingSignificance, setPendingSignificance] = useState<number>(2);
  const [pendingConnectionIds, setPendingConnectionIds] = useState<string[]>([]);
  const [connections, setConnections] = useState<GuidedFlowConnection[]>([]);
  const [guidedFlowContext, setGuidedFlowContext] = useState<{
    parentNodeId: string;
    parentLabel: string;
    parentYear: number;
    subbranch: string | null;
    promptOverride: string;
    isBranching?: boolean;
    lateral?: "left" | "right";
    insertIndex?: number;
    insertAfterNodeId?: string | null;
    insertBeforeNodeId?: string | null;
  } | null>(null);
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    nodeId: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    nearBranch: null,
    nearNodeId: null,
  });
  const [nodeConnections, setNodeConnections] = useState<NodeConnection[]>([]);
  const [dragSuggestion, setDragSuggestion] = useState<AIDragSuggestion | null>(null);
  const [dragGhost, setDragGhost] = useState<{
    ghostX: number;
    ghostY: number;
    originalX: number;
    originalY: number;
    branchColor: string;
    branchLabel: string;
    lateral: "left" | "right";
  } | null>(null);
  const [guidedFlowInsertContext, setGuidedFlowInsertContext] = useState<{
    branchId: string;
    insertIndex: number;
    prevMomentId: string | null;
    nextMomentId: string | null;
  } | null>(null);
  const pendingInsertPositionRef = useRef<{
    kind: "trunk" | "sub";
    branchId: string;
    subbranchId: string | null;
    x: number;
    y: number;
    label: string;
    color: string;
    insertIndex: number;
    insertAfterNodeId: string | null;
    insertBeforeNodeId: string | null;
  } | null>(null);
  const pendingInsertLayerRef = useRef<SVGGElement | null>(null);
  const pendingInsertOuterDotRef = useRef<SVGCircleElement | null>(null);
  const pendingInsertInnerDotRef = useRef<SVGCircleElement | null>(null);
  const pendingInsertLabelRef = useRef<SVGTextElement | null>(null);
  const pendingInsertVisualRafRef = useRef<number | null>(null);
  const [devPanelOpen, setDevPanelOpen] = useState(false);
  const [devSnapshot, setDevSnapshot] = useState<{
    hoverInfo: DevHoverInfo | null;
    moments: Array<{ id: string; label?: string; title?: string; branchLabel?: string; branch?: string }>;
    branches: Array<{
      id: string;
      limbId: string;
      label?: string | null;
      mapAngleOffset: number;
      parentBranchId?: string | null;
    }>;
    selectedNode: Record<string, unknown> | null;
    selectedNodeRaw: Record<string, unknown> | null;
    mapState: {
      zoom: number;
      panX: number;
      panY: number;
      activeView: "map" | "timeline";
      focusedBranch: string | null;
      hoveredGap: string | null;
      totalNodes: number;
      totalGapZones: number;
      visibleBranches: number;
    };
    perfState: {
      renderCount: number;
      nodesRendered: number;
      gapZonesRendered: number;
      edgesRendered: number;
    };
    branchBreakdown: Array<{
      id: string;
      label: string;
      angle: number;
      subbranches: Array<{
        id: string;
        label: string;
        angleOffset: number;
        effectiveAngle: number;
        nodes: Array<{ id: string; label: string; year: number }>;
      }>;
    }>;
  } | null>(null);
  const [devShowGapZones, setDevShowGapZones] = useState(false);
  const [devShowAllBranchLabels, setDevShowAllBranchLabels] = useState(false);
  const [devHighlight, setDevHighlight] = useState<{
    type: "branch" | "subbranch" | "node";
    id: string;
  } | null>(null);
  const [activeView, setActiveView] = useState<"map" | "timeline">("map");
  const [mobilePreview, setMobilePreview] = useState(false);
  const [hasAutoFit, setHasAutoFit] = useState(false);
  const [viewport, setViewport] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1200,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  });
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoaded, setSuggestionsLoaded] = useState(false);
  const [suggestionHoverId, setSuggestionHoverId] = useState(null);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState(null);
  const [suggestionEditLabel, setSuggestionEditLabel] = useState("");
  const [suggestionEditYear, setSuggestionEditYear] = useState("");
  const [dismissedSuggestionTerms, setDismissedSuggestionTerms] = useState([]);
  const [extractionPreviewNodes, setExtractionPreviewNodes] = useState([]);
  const [previewMode, setPreviewMode] = useState<"edit" | "review">("edit");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const guidedFreeTextDraftRef = useRef("");
  const guidedOtherDraftRef = useRef("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [unlockedBranches, setUnlockedBranches] = useState<string[]>([]);
  const [showUnlockPanel, setShowUnlockPanel] = useState(false);
  const [unlockPrompt, setUnlockPrompt] = useState<any>(null);
  const [dismissedUnlocks, setDismissedUnlocks] = useState<string[]>([]);
  const [sessionSnoozedUnlocks, setSessionSnoozedUnlocks] = useState<string[]>([]);
  const [sessionSeenUnlocks, setSessionSeenUnlocks] = useState<string[]>([]);
  const [unlockQueue, setUnlockQueue] = useState<string[]>([]);
  const [unlockGateUntil, setUnlockGateUntil] = useState<number | null>(null);
  const [unlockPromptLeaving, setUnlockPromptLeaving] = useState(false);
  const [actionHistory, setActionHistory] = useState<UndoAction[]>([]);
  const [undoToast, setUndoToast] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    nodeId: string;
    x: number;
    y: number;
    label: string;
  } | null>(null);
  const [focusBranchIndex, setFocusBranchIndex] = useState(0);
  const [financeIncludeNumbers, setFinanceIncludeNumbers] = useState(false);
  const [financeType, setFinanceType] = useState("savings_goal");
  const [financeAmount, setFinanceAmount] = useState("");
  const [financeTargetAmount, setFinanceTargetAmount] = useState("");
  const [financeCurrentAmount, setFinanceCurrentAmount] = useState("");
  const [financeCurrency, setFinanceCurrency] = useState("GBP");
  const svgRef = useRef();
  const unlockDismissBranchIdRef = useRef<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const hasInitialisedViewFit = useRef(false);
  const panDraftRef = useRef({ x: 0, y: 0 });
  const panRafRef = useRef<number | null>(null);
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  useEffect(() => {
    if (!dragging) {
      panDraftRef.current = pan;
    }
  }, [pan, dragging]);
  useEffect(() => {
    return () => {
      if (panRafRef.current !== null) {
        window.cancelAnimationFrame(panRafRef.current);
      }
      if (pendingInsertVisualRafRef.current !== null) {
        window.cancelAnimationFrame(pendingInsertVisualRafRef.current);
      }
    };
  }, []);

  function commitPendingInsertVisual() {
    pendingInsertVisualRafRef.current = null;
    const layer = pendingInsertLayerRef.current;
    const outer = pendingInsertOuterDotRef.current;
    const inner = pendingInsertInnerDotRef.current;
    const label = pendingInsertLabelRef.current;
    if (!layer || !outer || !inner || !label) return;
    const pending = pendingInsertPositionRef.current;
    if (!pending) {
      layer.setAttribute("display", "none");
      return;
    }
    layer.setAttribute("display", "block");
    outer.setAttribute("cx", String(pending.x));
    outer.setAttribute("cy", String(pending.y));
    outer.setAttribute("fill", `${pending.color}22`);
    outer.setAttribute("stroke", pending.color);
    inner.setAttribute("cx", String(pending.x));
    inner.setAttribute("cy", String(pending.y));
    label.setAttribute("x", String(pending.x));
    label.setAttribute("y", String(pending.y - 12));
    label.setAttribute("fill", pending.color);
    label.textContent = pending.label;
  }

  function schedulePendingInsertVisual() {
    if (pendingInsertVisualRafRef.current !== null) return;
    pendingInsertVisualRafRef.current = window.requestAnimationFrame(commitPendingInsertVisual);
  }

  function updatePendingInsertPosition(
    next:
      | {
          kind: "trunk" | "sub";
          branchId: string;
          subbranchId: string | null;
          x: number;
          y: number;
          label: string;
          color: string;
          insertIndex: number;
          insertAfterNodeId: string | null;
          insertBeforeNodeId: string | null;
        }
      | null,
  ) {
    const prev = pendingInsertPositionRef.current;
    if (!next && !prev) return;
    if (!next) {
      pendingInsertPositionRef.current = null;
      schedulePendingInsertVisual();
      return;
    }
    if (
      prev &&
      prev.kind === next.kind &&
      prev.branchId === next.branchId &&
      prev.subbranchId === next.subbranchId &&
      prev.insertIndex === next.insertIndex &&
      prev.insertAfterNodeId === next.insertAfterNodeId &&
      prev.insertBeforeNodeId === next.insertBeforeNodeId &&
      Math.abs(prev.x - next.x) < 5 &&
      Math.abs(prev.y - next.y) < 5 &&
      prev.color === next.color
    ) {
      return;
    }
    pendingInsertPositionRef.current = next;
    schedulePendingInsertVisual();
  }

  function applyMockData() {
    const normalizedMockNodes = legacyMockData.moments.map((node) => {
      const resolved = resolveLimbFromMomentLike(node);
      return {
        id: node.id,
        title: node.label,
        limbId: resolved.limbId,
        limb: resolved.limbLabel,
        lifeArea: resolved.limbLabel,
        branch: resolved.limbLabel,
        branchId: node.branchId ?? null,
        createdAt: node.createdAt,
        year: node.year,
        month: node.month ?? null,
        description: node.description,
        future: node.future,
        progress: node.future ? 0 : 100,
        significance: node.significance ?? 1,
        connectedTo: [],
        practicalData: null,
        subbranch: null,
        subtype: node.subtype ?? null,
        location: node.location ?? null,
        synthetic: true,
        mapPosition: Number(node.mapPosition ?? 0),
      };
    });
    setGoals(deduplicateNodes(normalizedMockNodes) as any);
    setCanonicalBranches(legacyMockData.branches as any[]);
    setProfile({
      name: "Alex Carter",
      email: "alex.mock@example.com",
      birthYear: 1994,
      birthPlace: "Manchester, UK",
    });
    setUnlockedBranches([]);
  }

  useEffect(() => {
    const saved = window.localStorage.getItem("pathfinder-view");
    if (saved === "timeline" || saved === "map") {
      setActiveView(saved);
    }
  }, []);

  useEffect(() => {
    if (!devPanelFeatureEnabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const isPrimaryToggle =
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "d";
      const isFallbackToggle =
        (event.metaKey || event.ctrlKey) &&
        event.altKey &&
        event.key.toLowerCase() === "d";
      if (!isPrimaryToggle && !isFallbackToggle) return;
      event.preventDefault();
      setDevPanelOpen((prev) => !prev);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [devPanelFeatureEnabled]);

  useEffect(() => {
    window.localStorage.setItem("pathfinder-view", activeView);
  }, [activeView]);

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "m") {
        setMobilePreview((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  useEffect(() => {
    const updateViewport = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("pathfinder_dismissed_unlocks");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setDismissedUnlocks(parsed.filter((x) => typeof x === "string"));
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadGoals() {
      if (useMockData) {
        if (!mounted) return;
        applyMockData();
        return;
      }
      const [response, branchesResponse] = await Promise.all([
        fetch("/api/marks", { cache: "no-store" }),
        fetch("/api/branches", { cache: "no-store" }).catch(() => null),
      ]);
      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!response.ok) {
        throw new Error(`Failed to load goals (${response.status})`);
      }
      const data = await response.json();
      if (!mounted) return;
      const markItems = Array.isArray(data.marks) ? data.marks : [];
      let branchLimbById: Record<string, string> = {};
      if (branchesResponse && branchesResponse.ok) {
        try {
          const branchesData = await branchesResponse.json();
          if (mounted && Array.isArray(branchesData.branches)) {
            setCanonicalBranches(branchesData.branches);
          }
          if (Array.isArray(branchesData?.branches)) {
            branchLimbById = Object.fromEntries(
              branchesData.branches.map((b: any) => [String(b?.id ?? ""), String(b?.limbId ?? "")]),
            );
          }
        } catch (err) {
          console.error("[PathfinderHome] branches parse failed", err);
        }
      }
      const merged = markItems.map((item, idx) => {
        const resolved = resolveLimbFromMomentLike(item, branchLimbById);
        const parsedDate = Date.parse(String(item?.date ?? ""));
        const fallbackDate = new Date().toISOString();
        const safeDate = Number.isFinite(parsedDate)
          ? new Date(parsedDate).toISOString()
          : fallbackDate;
        const safeYear = Number.isFinite(new Date(safeDate).getFullYear())
          ? new Date(safeDate).getFullYear()
          : new Date().getFullYear();
        const safeMonth = new Date(safeDate).getMonth() + 1;
        return {
          ...item,
          limbId: resolved.limbId,
          limb: resolved.limbLabel,
          title: item?.title ?? item?.label,
          lifeArea: resolved.limbLabel,
          branch: resolved.limbLabel,
          year: Number(item?.year ?? safeYear),
          month: Number(item?.month ?? safeMonth),
          createdAt: item?.createdAt ?? safeDate,
          mapPosition: Number(item?.sequenceNumber ?? idx),
        };
      });
      setGoals(deduplicateNodes(merged));
      setProfile({
        name: data.user?.name ?? "",
        email: data.user?.email ?? "",
        birthYear: data.user?.birthYear ?? null,
        birthPlace: data.user?.birthPlace ?? "",
      });
    }
    loadGoals().catch((err) => console.error("[PathfinderHome] load goals failed", err));
    return () => {
      mounted = false;
    };
  }, [useMockData]);

  const timelineGoals = useMemo(() => [...goals, ...guidedNodes], [goals, guidedNodes]);
  const momentsByLimbId = useMemo(() => {
    return timelineGoals.reduce<Record<string, any[]>>((acc, goal) => {
      const resolved = resolveLimbFromMomentLike(goal);
      if (!acc[resolved.limbId]) acc[resolved.limbId] = [];
      acc[resolved.limbId].push({ ...goal, limbId: resolved.limbId, limbLabel: resolved.limbLabel });
      return acc;
    }, {});
  }, [timelineGoals]);
  const limbMomentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.entries(momentsByLimbId).forEach(([limbId, arr]) => {
      counts[limbId] = arr.length;
    });
    return counts;
  }, [momentsByLimbId]);
  const branchMarksForMap = useMemo(() => {
    const result: Record<
      string,
      Array<{
        id: string;
        branchId: string;
        title: string;
        yearLabel: string;
        dateValue: number;
        dateLabel: string;
        location?: string | null;
        description?: string | null;
      }>
    > = {};
    timelineGoals.forEach((markLike: any) => {
      const branchId = String(markLike?.branchId ?? "").trim();
      if (!branchId) return;
      const normalized = {
        id: String(markLike?.id ?? ""),
        branchId,
        title: "",
        yearLabel: "",
        dateValue: 0,
        dateLabel: "",
        location: null as string | null,
        description: null as string | null,
      };
      const fallbackYear = Number(markLike?.year ?? new Date().getFullYear());
      const parsedCreatedAt = Date.parse(String(markLike?.createdAt ?? ""));
      const parsedFallback = Date.parse(
        `${Number.isFinite(fallbackYear) ? fallbackYear : 1970}-${String(markLike?.month ?? 1).padStart(2, "0")}-01`,
      );
      normalized.dateValue =
        Number.isFinite(parsedCreatedAt) && parsedCreatedAt > 0
          ? parsedCreatedAt
          : Number.isFinite(parsedFallback) && parsedFallback > 0
            ? parsedFallback
            : 0;
      const yearNumber = Number(markLike?.year ?? new Date(markLike?.createdAt ?? "").getFullYear());
      normalized.dateLabel =
        Number.isFinite(parsedCreatedAt) && parsedCreatedAt > 0
          ? new Date(parsedCreatedAt).toLocaleDateString("en-GB", {
              year: "numeric",
              month: "short",
            })
          : Number.isFinite(yearNumber)
            ? String(yearNumber)
            : "Unknown";
      normalized.title = String(markLike?.title ?? markLike?.label ?? "Untitled");
      normalized.yearLabel = Number.isFinite(yearNumber) ? String(yearNumber) : "Unknown";
      normalized.location = markLike?.location ?? null;
      normalized.description = markLike?.description ?? null;
      if (!result[branchId]) result[branchId] = [];
      result[branchId].push(normalized);
    });
    Object.keys(result).forEach((branchId) => {
      const normalized = result[branchId] ?? [];
      normalized.sort((a, b) => b.dateValue - a.dateValue); // newest at highest index transform later
      result[branchId] = normalized;
    });
    return result;
  }, [timelineGoals]);
  const timelineMoments = useMemo(
    () =>
      timelineGoals.map((goal) => {
        const resolved = resolveLimbFromMomentLike(goal);
        return {
          id: goal.id,
          limbId: resolved.limbId,
          label: goal.title ?? goal.label,
          description: goal.description || goal.title || goal.label,
          limb: resolved.limbLabel,
          branch: resolved.limbLabel,
          year: Number(goal.year ?? new Date(goal.createdAt).getFullYear()),
          month: goal.month ?? null,
          future: Boolean(goal.future ?? false),
          significance: Math.max(1, Math.min(3, Number(goal.significance ?? 1))),
          connectedTo: Array.isArray(goal.connectedTo) ? goal.connectedTo : [],
          location: goal.location ?? null,
        };
      }),
    [timelineGoals],
  );
  const visibleBranches = useMemo(
    () =>
      ALL_BRANCHES.filter((branch) => {
        if (!branch.unlockable) return true;
        return unlockedBranches.includes(branch.id);
      }),
    [unlockedBranches],
  );
  const branchMetaByLabel = useMemo(
    () =>
      Object.fromEntries(
        visibleBranches.map((branch) => [
          branch.label,
          { label: branch.label, icon: branch.icon, color: branch.color },
        ]),
      ),
    [visibleBranches],
  );
  const renderBranches = visibleBranches;
  const eligibleUnlockableBranches = ALL_BRANCHES.filter((branch) => {
    if (!branch.unlockable) return false;
    if (unlockedBranches.includes(branch.id)) return false;
    if (dismissedUnlocks.includes(branch.id)) return false;
    const alreadyOnMap = goals.some((goal) => goal.lifeArea === branch.label);
    if (alreadyOnMap) return false;
    return goals.length >= (branch.unlockAfterNodes ?? 0);
  });
  const eligibleUnlockableForAddNode = ALL_BRANCHES.filter((branch) =>
    branch.unlockable &&
    !unlockedBranches.includes(branch.id) &&
    !dismissedUnlocks.includes(branch.id) &&
    goals.length >= (branch.unlockAfterNodes ?? 5),
  );
  const visibleLabels = visibleBranches.map((branch) => branch.label);
  const allGoalData = addOriginNodes(timelineGoals, profile);
  const displayName = getDisplayName(profile);
  const possessiveDisplayName = getPossessive(displayName);
  const firstName = displayName || "EXPLORER";
  const selfMonogram = (displayName || "Explorer")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  const numericBirthYear = Number(profile.birthYear);
  const selfYear =
    Number.isFinite(numericBirthYear) && numericBirthYear >= 1900 && numericBirthYear <= 2100
      ? String(Math.trunc(numericBirthYear))
      : "";
  const branches = transformGoals(allGoalData, visibleLabels);
  const positions = buildPositions(branches);
  const edges = buildEdges(branches, positions);
  const promptPositions = buildPromptPositions(branches);
  const allMoments = branches.flatMap((b) =>
    b.nodes.map((n) => ({ ...n, branchColor: b.color, branchLabel: b.label })),
  );
  const contentBounds = useMemo(() => {
    const points = allMoments
      .map((node) => positions[node.id])
      .filter(Boolean) as Array<{ x: number; y: number }>;
    const limbPoints = branches.flatMap((branch) => {
      const p = getPos(branch.angle, PROMPT_DISTANCE);
      return [
        { x: p.x - LIMB_CARD_HALF, y: p.y - LIMB_CARD_HALF },
        { x: p.x + LIMB_CARD_HALF, y: p.y + LIMB_CARD_HALF + LIMB_LABEL_Y + 8 },
      ];
    });
    const selfExtents = [
      { x: -SELF_GLOW_RADIUS, y: -SELF_GLOW_RADIUS },
      { x: SELF_GLOW_RADIUS, y: SELF_GLOW_RADIUS },
    ];
    const allPoints = [...points, ...limbPoints, ...selfExtents];
    if (allPoints.length === 0) {
      return {
        minX: -PROMPT_DISTANCE - BOUNDS_PADDING,
        maxX: PROMPT_DISTANCE + BOUNDS_PADDING,
        minY: -PROMPT_DISTANCE - BOUNDS_PADDING,
        maxY: BOUNDS_PADDING,
      };
    }
    const xs = allPoints.map((p) => p.x);
    const ys = allPoints.map((p) => p.y);
    return {
      minX: Math.min(...xs) - BOUNDS_PADDING,
      maxX: Math.max(...xs) + BOUNDS_PADDING,
      minY: Math.min(...ys) - BOUNDS_PADDING,
      maxY: Math.max(...ys) + BOUNDS_PADDING,
    };
  }, [allMoments, branches, positions]);
  const draggedNode = dragState.nodeId
    ? allMoments.find((node) => node.id === dragState.nodeId) ?? null
    : null;
  const draggedNodeOriginalPos =
    draggedNode && positions[draggedNode.id] ? positions[draggedNode.id] : null;
  const branchLabelGeometryKey = useMemo(
    () => branches.map((b) => `${b.id}:${Number(b.angle ?? 0)}`).join("|"),
    [branches],
  );
  const focusedBranchLabel = focusedBranch
    ? BRANCH_LABEL_BY_ID[focusedBranch] ?? focusedBranch
    : null;
  const branchOpacities = useMemo(() => {
    const opacities: Record<string, number> = {};
    visibleBranches.forEach((b) => {
      opacities[b.id] = !focusedBranch || focusedBranch === b.id ? 1 : 0.15;
    });
    return opacities;
  }, [focusedBranch, visibleBranches]);
  const getBranchFocusVisual = (branchId: string) => {
    return {
      opacity: branchOpacities[branchId] ?? 1,
      scale: !focusedBranch || branchId === focusedBranch ? 1 : 0.97,
    };
  };
  const getSubbranchOpacity = (branchId: string, subbranchId: string, hasNodes: boolean) => {
    if (!focusedBranch) return hasNodes ? 0.65 : 0.4;
    if (branchId !== focusedBranch) return 0.1;
    if (!focusedSubbranch) return hasNodes ? 0.65 : 0.4;
    return focusedSubbranch === subbranchId ? (hasNodes ? 0.75 : 0.55) : 0.2;
  };
  const devPanelWidth = 0;
  const selfX = viewport.width / 2 + pan.x;
  const selfY = viewport.height * SELF_VIEWPORT_HEIGHT_RATIO + pan.y;
  const limbCardPositions = useMemo(() => {
    const worldLeft = (0 - selfX) / zoom;
    const worldRight = (Math.max(1, viewport.width) - selfX) / zoom;
    return buildLimbCardPositions(branches, worldLeft, worldRight);
  }, [branches, branchLabelGeometryKey, selfX, zoom, viewport.width]);
  const visibleGridLines = useMemo(() => {
    const step = 200;
    const visibleWidth = Math.max(1, viewport.width);
    const worldLeft = (0 - selfX) / zoom;
    const worldRight = (visibleWidth - selfX) / zoom;
    const worldTop = (0 - selfY) / zoom;
    const worldBottom = (viewport.height - selfY) / zoom;
    const xStart = Math.floor(worldLeft / step) * step;
    const xEnd = Math.ceil(worldRight / step) * step;
    const yStart = Math.floor(worldTop / step) * step;
    const yEnd = Math.ceil(worldBottom / step) * step;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let x = xStart; x <= xEnd; x += step) xs.push(x);
    for (let y = yStart; y <= yEnd; y += step) ys.push(y);
    return {
      xs,
      ys,
      worldLeft,
      worldRight,
      worldTop,
      worldBottom,
    };
  }, [viewport.width, viewport.height, selfX, selfY, zoom]);

  const tooltipNodeId = hovered && hovered !== selected ? hovered : null;
  const tooltipNode = tooltipNodeId ? allMoments.find((n) => n.id === tooltipNodeId) : null;
  const detailPanelNode = selected ? allMoments.find((n) => n.id === selected) : null;
  const selectedSourceGoal = selected
    ? goals.find((g) => g.id === selected) ?? guidedNodes.find((g) => g.id === selected) ?? null
    : null;
  const timelineYearsChrono = timelineGoals
    .map((g) => Number(g.year ?? new Date(g.createdAt).getFullYear()))
    .filter((y) => Number.isFinite(y));
  const timelineMinY = timelineYearsChrono.length
    ? Math.min(...timelineYearsChrono)
    : Number(detailPanelNode?.year ?? new Date().getFullYear());
  const timelineMaxY = timelineYearsChrono.length
    ? Math.max(...timelineYearsChrono)
    : Number(detailPanelNode?.year ?? new Date().getFullYear());
  const timelineSpan = Math.max(1, timelineMaxY - timelineMinY);
  const timelineDotPct =
    detailPanelNode && Number.isFinite(Number(detailPanelNode.year))
      ? ((Number(detailPanelNode.year) - timelineMinY) / timelineSpan) * 100
      : 50;
  const significanceCurrent = Math.max(1, Math.min(3, Number(detailPanelNode?.significance ?? 1)));
  const totalGoals = timelineGoals.length;
  const doneGoals = timelineGoals.filter((g) => (g.progress ?? 0) === 100).length;
  const activeGoal = timelineGoals.find((g) => (g.progress ?? 0) > 0 && (g.progress ?? 0) < 100);
  const branchCount = visibleBranches.length;
  const rotatingBranch =
    branchCount > 0
      ? visibleBranches[focusBranchIndex % branchCount]
      : null;
  const focusLabel = rotatingBranch?.label ?? "";
  const focusText = activeGoal?.title
    ? activeGoal.title
    : focusLabel
      ? `Start your ${focusLabel} story \u2192`
      : "Add your first moment \u2192";
  const showGuidedTemplate = true;
  const filledBranches = new Set(allGoalData.map((goal) => goal.lifeArea).filter(Boolean));
  const promptOpacity = Math.max(0.18, 1 - filledBranches.size / Math.max(visibleLabels.length, 1));
  const guidedAreas = visibleLabels.filter(
    (area) => !filledBranches.has(area),
  );
  const branchNodeCounts = timelineGoals.reduce((acc, goal) => {
    if (!acc[goal.lifeArea]) acc[goal.lifeArea] = 0;
    acc[goal.lifeArea] += 1;
    return acc;
  }, {});
  const sparseOrEmptyBranches = new Set(
    visibleLabels.filter((area) => (branchNodeCounts[area] ?? 0) <= 2),
  );
  const suggestionsByBranch = suggestions.reduce((acc, suggestion) => {
    if (!visibleLabels.includes(suggestion.branch)) return acc;
    if (!sparseOrEmptyBranches.has(suggestion.branch)) return acc;
    const lower = suggestion.label.toLowerCase();
    if (dismissedSuggestionTerms.some((term) => lower.includes(term))) return acc;
    if (!acc[suggestion.branch]) acc[suggestion.branch] = [];
    if (acc[suggestion.branch].length < 3) acc[suggestion.branch].push(suggestion);
    return acc;
  }, {});
  const suggestionPositions = buildSuggestionPositions(branches, positions, suggestionsByBranch);
  const extractionPreviewPositions = buildExtractionPreviewPositions(
    branches,
    positions,
    extractionPreviewNodes,
  );
  const selectedSuggestion = suggestions.find((s) => s.id === selectedSuggestionId) ?? null;
  const guidedBranchConfig = guidedBranch ? BRANCH_BY_LABEL[guidedBranch] : null;
  const guidedSubbranches = guidedBranchConfig?.subbranches ?? [];
  const guidedFlowStep = guidedFlow?.steps?.[guidedFlow?.currentStep] ?? null;
  const guidedFlowOutcome = guidedFlow?.completed ? buildFlowOutcome(guidedFlow) : null;
  useEffect(() => {
    if (!guidedFlowStep?.id) return;
    const seededValue = String(
      guidedFlow?.otherTextByStep?.[guidedFlowStep.id] ??
        guidedFlow?.answers?.[guidedFlowStep.id] ??
        "",
    );
    guidedFreeTextDraftRef.current = seededValue;
    guidedOtherDraftRef.current = seededValue;
  }, [guidedFlowStep?.id, guidedFlow?.currentStep, guidedFlow?.answers, guidedFlow?.otherTextByStep]);
  const candidateConnectionNodes =
    pendingGuidedOutcome && guidedBranch
      ? timelineGoals
          .filter((node) => node.lifeArea !== guidedBranch)
          .filter((node) => {
            const nodeYear = Number(node.year ?? new Date(node.createdAt).getFullYear());
            return Math.abs(nodeYear - Number(pendingGuidedOutcome.year)) <= 2;
          })
          .slice(0, 6)
      : [];
  const branchLineData: any[] = [];
  const getSubbranchNodesByIds = (branchLabel: string, subbranchId: string) => {
    return timelineGoals
      .filter((n) => (n.limb ?? n.lifeArea ?? n.branch) === branchLabel)
      .filter((n) => (n.subbranch ?? BRANCH_BY_LABEL[branchLabel]?.subbranches?.[0]?.id) === subbranchId)
      .sort(sortByCreatedAtAsc);
  };
  const allGapZones = useMemo(() => [], []);
  const totalGapZones = allGapZones.length;
  const branchBreakdown = useMemo(
    () =>
      branches.map((branch) => ({
        id: branch.id,
        label: branch.label,
        angle: branch.angle,
        subbranches: (branch.subbranches ?? []).map((sub) => {
          const nodes = getSubbranchNodesByIds(branch.label, sub.id);
          return {
            id: sub.id,
            label: sub.label,
            angleOffset: sub.angleOffset ?? 0,
            effectiveAngle: branch.angle + (sub.angleOffset ?? 0),
            nodes: nodes.map((node) => ({
              id: node.id,
              label: node.title ?? node.label ?? "Untitled",
              year: Number(node.year ?? new Date(node.createdAt).getFullYear()),
            })),
          };
        }),
      })),
    [branches, getSubbranchNodesByIds],
  );
  const relatedAdjacentPairs = new Set([
    "Money|Work & Learning",
    "Work & Learning|Personal Growth",
    "Personal Growth|Relationships",
    "Relationships|Health",
  ]);

  function addConnection(connection: GuidedFlowConnection) {
    setConnections((prev) => [...prev, connection]);
  }

  function removeConnection(fromNodeId: string, toNodeId: string) {
    setConnections((prev) =>
      prev.filter(
        (connection) =>
          !(
            (connection.fromNodeId === fromNodeId && connection.toNodeId === toNodeId) ||
            (connection.fromNodeId === toNodeId && connection.toNodeId === fromNodeId)
          ),
      ),
    );
  }

  function pushHistory(action: UndoAction) {
    setActionHistory((prev) => [...prev.slice(-4), action]);
  }

  function showUndoneToast() {
    setUndoToast("Undone");
    window.setTimeout(() => setUndoToast(null), 2000);
  }

  async function handleDeleteNode(nodeId: string) {
    const guidedMatch = guidedNodes.find((node) => node.id === nodeId);
    const goalsMatch = goals.find((node) => node.id === nodeId);
    const nodeFromLocal = guidedMatch ?? goalsMatch;
    const source = guidedMatch ? "guidedNodes" : "goals";
    if (!nodeFromLocal) return;

    const isLocalOnly = /^(guided|suggested|preview-saved)-/.test(nodeId);
    if (!isLocalOnly) {
      try {
        await fetch(`/api/marks/${nodeId}`, { method: "DELETE" });
      } catch (err) {
        console.error("[PathfinderHome] node delete request failed", err);
      }
    }

    setGoals((prev) => prev.filter((node) => node.id !== nodeId));
    setGuidedNodes((prev) => prev.filter((node) => node.id !== nodeId));
    setConnections((prev) =>
      prev.filter(
        (connection) =>
          connection.fromNodeId !== nodeId && connection.toNodeId !== nodeId,
      ),
    );
    pushHistory({
      type: "DELETE_NODE",
      payload: { nodeId, nodeData: nodeFromLocal, source },
      timestamp: Date.now(),
      label: `Removed "${nodeFromLocal.title ?? nodeFromLocal.label ?? "moment"}"`,
    });
    setContextMenu(null);
    setSelected((s) => (s === nodeId ? null : s));
  }

  function findSourceGoal(nodeId) {
    return goals.find((g) => g.id === nodeId) ?? guidedNodes.find((g) => g.id === nodeId) ?? null;
  }

  function applyLocalPatch(nodeId, patch) {
    const merge = (node) => (node.id === nodeId ? { ...node, ...patch } : node);
    setGoals((prev) => prev.map(merge));
    setGuidedNodes((prev) => prev.map(merge));
  }

  async function patchLifeMapNodeApi(nodeId, payload) {
    const res = await fetch(`/api/marks/${nodeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(errText || `PATCH failed ${res.status}`);
    }
    return res.json();
  }

  // Pick the next available mapAngleOffset for a new sibling branch
  // on a given limb. Default branch sits at 0; siblings fan outward.
  function computeNextBranchOffset(limbId: string, existing: { limbId: string; mapAngleOffset: number }[]): number {
    const used = new Set(
      existing.filter((b) => b.limbId === limbId).map((b) => Number(b.mapAngleOffset ?? 0)),
    );
    const candidates = [-25, 25, -50, 50, -75, 75];
    return candidates.find((c) => !used.has(c)) ?? (used.size * 25);
  }

  // Create a new Branch record. Persists to /api/branches in real mode.
  // In mock mode, creates a local-only record with a synthetic id.
  async function createBranchLocal(params: { limbId: string; label?: string | null; mapAngleOffset: number }) {
    if (useMockData) {
      const branch = {
        id: `branch-new-${Date.now()}`,
        userId: "mock-user",
        limbId: params.limbId,
        label: params.label ?? null,
        parentBranchId: null,
        turningPointId: null,
        mapAngleOffset: params.mapAngleOffset,
        createdAt: new Date().toISOString(),
      };
      setCanonicalBranches((prev) => [...prev, branch]);
      return branch;
    }
    const res = await fetch("/api/branches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        limbId: params.limbId,
        label: params.label ?? null,
        parentBranchId: null,
        mapAngleOffset: params.mapAngleOffset,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(errText || `POST /api/branches failed ${res.status}`);
    }
    const { branch } = await res.json();
    setCanonicalBranches((prev) => [...prev, branch]);
    return branch;
  }

  // Handler called when user picks "Start new branch" from the gap chooser.
  // Creates a new sibling Branch on the same Limb, then opens the guided
  // flow pointed at the new branch so its first moment lands on it.
  async function handleStartNewBranchFromChooser(gap: any) {
    const limb = LIMBS.find((l) => l.label === gap.branchLabel);
    if (!limb) {
      setGapChooser(null);
      return;
    }
    try {
      const offset = computeNextBranchOffset(limb.id, canonicalBranches as any);
      const branch = await createBranchLocal({
        limbId: limb.id,
        label: null,
        mapAngleOffset: offset,
      });
      setPendingNewBranchId(branch.id);
      setGapChooser(null);
      openGuidedForBranch(gap.branchLabel, {
        insertIndex: Number.isFinite(Number(gap.insertIndex)) ? Number(gap.insertIndex) : 0,
        insertAfterNodeId: gap.prevNodeId ?? null,
        insertBeforeNodeId: gap.nextNodeId ?? null,
        isBranching: true,
        promptOverride: gap.prevNodeLabel
          ? `New thread from "${gap.prevNodeLabel}" - what's the first moment on this new path?`
          : `Start a new thread on ${gap.branchLabel}. What's the first moment?`,
      });
    } catch (err) {
      console.error("[PathfinderHome] start new branch failed", err);
      setGapChooser(null);
    }
  }

  // Create a new branch anchored from an existing moment (selected in detail panel),
  // then start guided flow for the first moment on that new branch.
  async function handleStartNewBranchFromMoment(node: any) {
    const branchLabel = node?.branchLabel ?? node?.lifeArea ?? node?.branch ?? null;
    const limb =
      (node?.limbId ? LIMBS.find((l) => l.id === node.limbId) : null) ??
      LIMBS.find((l) => l.label === branchLabel);
    if (!limb || !branchLabel) return;
    try {
      const offset = computeNextBranchOffset(limb.id, canonicalBranches as any);
      const branch = await createBranchLocal({
        limbId: limb.id,
        label: null,
        mapAngleOffset: offset,
      });
      const branchMoments = timelineGoals
        .filter((n) => (n.limb ?? n.lifeArea ?? n.branch) === branchLabel)
        .sort((a, b) => Number(a.mapPosition ?? 0) - Number(b.mapPosition ?? 0));
      const fromIdx = branchMoments.findIndex((n) => n.id === node?.id);
      const insertIndex = fromIdx >= 0 ? fromIdx + 1 : branchMoments.length;
      const nextNode = fromIdx >= 0 ? branchMoments[fromIdx + 1] ?? null : null;
      setPendingNewBranchId(branch.id);
      setSelected(null);
      openGuidedForBranch(branchLabel, {
        insertIndex,
        insertAfterNodeId: node?.id ?? null,
        insertBeforeNodeId: nextNode?.id ?? null,
        isBranching: true,
        promptOverride: `New thread from "${node?.label ?? "this moment"}" - what's the first moment on this new path?`,
      });
    } catch (err) {
      console.error("[PathfinderHome] branch from moment failed", err);
    }
  }

  function limitLabelFiveWords(text) {
    return String(text || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 5)
      .join(" ");
  }

  useEffect(() => {
    if (!selected) {
      setReflectionDraft("");
      setNodeDetailEditMode(false);
      setNodeDeleteConfirm(false);
      setMoveBranchOpen(false);
      setReflectionSaveStatus("idle");
      setDetailPatchStatus("idle");
      return;
    }
    const src = goals.find((g) => g.id === selected) ?? guidedNodes.find((g) => g.id === selected);
    if (!src) return;
    setReflectionDraft(src.timelineNote ?? "");
    setNodeEditLabel(src.title ?? src.label ?? "");
    setNodeEditDesc(String(src.description ?? ""));
    setNodeEditYear(String(src.year ?? new Date(src.createdAt).getFullYear()));
    setNodeDetailEditMode(false);
    setNodeDeleteConfirm(false);
    setMoveBranchOpen(false);
    setReflectionSaveStatus("idle");
    setDetailPatchStatus("idle");
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    const src = goals.find((g) => g.id === selected) ?? guidedNodes.find((g) => g.id === selected);
    if (!src) return;
    if (reflectionDraft === (src.timelineNote ?? "")) return;

    const isLocalOnly = /^(guided|suggested|preview-saved|origin-born)/.test(selected);
    setReflectionSaveStatus("saving");
    const timer = window.setTimeout(async () => {
      try {
        if (!isLocalOnly) {
          await patchLifeMapNodeApi(selected, { timelineNote: reflectionDraft });
        }
        applyLocalPatch(selected, { timelineNote: reflectionDraft });
        setReflectionSaveStatus("saved");
        window.setTimeout(() => setReflectionSaveStatus("idle"), 2000);
      } catch (err) {
        console.error("[PathfinderHome] reflection save failed", err);
        setReflectionSaveStatus("idle");
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [reflectionDraft, selected]);

  async function handleUndoAction() {
    const last = actionHistory[actionHistory.length - 1];
    if (!last) return;

    if (last.type === "ADD_NODE" && last.payload.nodeId) {
      const nodeId = last.payload.nodeId;
      const isLocalOnly = /^(guided|suggested|preview-saved)-/.test(nodeId);
      if (!isLocalOnly) {
        try {
          await fetch(`/api/marks/${nodeId}`, { method: "DELETE" });
        } catch (err) {
          console.error("[PathfinderHome] undo delete request failed", err);
        }
      }
      setGoals((prev) => prev.filter((node) => node.id !== nodeId));
      setGuidedNodes((prev) => prev.filter((node) => node.id !== nodeId));
      setConnections((prev) =>
        prev.filter(
          (connection) =>
            connection.fromNodeId !== nodeId && connection.toNodeId !== nodeId,
        ),
      );
    } else if (last.type === "UNLOCK_BRANCH" && last.payload.branchId) {
      setUnlockedBranches((prev) =>
        prev.filter((branchId) => branchId !== last.payload.branchId),
      );
    } else if (last.type === "DELETE_NODE" && last.payload.nodeData) {
      const restored = last.payload.nodeData;
      if (last.payload.source === "goals") {
        setGoals((prev) =>
          prev.some((node) => node.id === restored.id) ? prev : [...prev, restored],
        );
      } else {
        setGuidedNodes((prev) =>
          prev.some((node) => node.id === restored.id) ? prev : [...prev, restored],
        );
      }
    }

    setActionHistory((prev) => prev.slice(0, -1));
    showUndoneToast();
  }

  async function resetMockData() {
    if (!useMockData) return;
    try {
      await fetch("/api/dev/mock-reset", { method: "POST" });
    } catch (err) {
      console.error("[PathfinderHome] mock reset failed", err);
    } finally {
      setGuidedNodes([]);
      setConnections([]);
      setRecentNodeIds([]);
      applyMockData();
      setHasAutoFit(false);
    }
  }

  useEffect(() => {
    if (suggestionsLoaded) return;
    if (timelineGoals.length < 3) return;

    const branchesPayload = visibleLabels.map((area) => ({
      name: area,
      nodes: timelineGoals
        .filter((goal) => goal.lifeArea === area)
        .map((goal) => ({
          label: goal.title,
          year: new Date(goal.createdAt).getFullYear(),
          desc: goal.description || goal.title,
          progress: goal.progress ?? 0,
        })),
    }));

    let mounted = true;
    async function loadSuggestions() {
      try {
        const response = await fetch("/api/life-map/suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ branches: branchesPayload }),
        });
        const data = await response.json();
        if (!mounted) return;
        if (!response.ok) {
          console.error("[PathfinderHome] suggestions failed", data?.error);
          setSuggestionsLoaded(true);
          return;
        }
        const normalized = (Array.isArray(data.suggestions) ? data.suggestions : []).map((s, idx) => ({
          id: `sg-${idx}-${String(s.branch).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          branch: s.branch,
          label: s.label,
          year: Number(s.year),
          confidence: Number(s.confidence),
          rationale: s.rationale,
        }));
        setSuggestions(normalized);
      } catch (err) {
        console.error("[PathfinderHome] suggestion request error", err);
      } finally {
        if (mounted) setSuggestionsLoaded(true);
      }
    }
    loadSuggestions();
    return () => {
      mounted = false;
    };
  }, [suggestionsLoaded, timelineGoals.length, goals.length, guidedNodes.length]);

  useEffect(() => {
    if (!unlockPrompt || unlockPromptLeaving) return;
    setUnlockQueue((prev) => {
      const additions = [];
      for (const branch of ALL_BRANCHES.filter((b) => b.unlockable)) {
        if (branch.id === unlockPrompt.id) continue;
        if (unlockedBranches.includes(branch.id)) continue;
        if (dismissedUnlocks.includes(branch.id)) continue;
        if (sessionSnoozedUnlocks.includes(branch.id)) continue;
        if (sessionSeenUnlocks.includes(branch.id)) continue;
        if (wasUnlockShownRecently(branch.id)) continue;
        if (prev.includes(branch.id)) continue;
        if (goals.length >= (branch.unlockAfterNodes ?? 0)) {
          additions.push(branch.id);
        }
      }
      if (additions.length === 0) return prev;
      return [...prev, ...additions];
    });
  }, [unlockPrompt?.id, unlockPromptLeaving, goals.length, unlockedBranches, dismissedUnlocks, sessionSnoozedUnlocks, sessionSeenUnlocks]);

  useEffect(() => {
    if (unlockPrompt || unlockPromptLeaving) return;

    if (unlockGateUntil !== null && Date.now() < unlockGateUntil) {
      const ms = Math.max(0, unlockGateUntil - Date.now());
      const t = window.setTimeout(() => setUnlockGateUntil(null), ms);
      return () => window.clearTimeout(t);
    }

    const totalNodes = goals.length;
    const isEligibleNow = (branch) =>
      branch.unlockable &&
      totalNodes >= (branch.unlockAfterNodes ?? 0) &&
      !unlockedBranches.includes(branch.id) &&
      !dismissedUnlocks.includes(branch.id) &&
      !sessionSnoozedUnlocks.includes(branch.id) &&
      !sessionSeenUnlocks.includes(branch.id) &&
      !wasUnlockShownRecently(branch.id);

    const cleanedQueue = unlockQueue.filter((id) => {
      const b = ALL_BRANCHES.find((x) => x.id === id);
      if (!b?.unlockable) return false;
      if (unlockedBranches.includes(id)) return false;
      if (dismissedUnlocks.includes(id)) return false;
      if (sessionSnoozedUnlocks.includes(id)) return false;
      if (sessionSeenUnlocks.includes(id)) return false;
      if (wasUnlockShownRecently(id)) return false;
      return true;
    });
    if (cleanedQueue.length !== unlockQueue.length) {
      setUnlockQueue(cleanedQueue);
      return;
    }

    const head = unlockQueue.find((id) => {
      const b = ALL_BRANCHES.find((x) => x.id === id);
      return b && isEligibleNow(b);
    });
    if (head) {
      const branch = ALL_BRANCHES.find((x) => x.id === head);
      if (branch) {
        setUnlockPromptLeaving(false);
        setUnlockPrompt(branch);
        setSessionSeenUnlocks((prev) =>
          prev.includes(branch.id) ? prev : [...prev, branch.id],
        );
        try {
          window.localStorage.setItem(
            getUnlockLastShownStorageKey(branch.id),
            Date.now().toString(),
          );
        } catch {
          /* ignore */
        }
        setUnlockQueue((q) => q.filter((id) => id !== head));
      }
      return;
    }

    if (unlockQueue.length > 0) {
      return;
    }

    const nextDirect = ALL_BRANCHES.filter((b) => b.unlockable).find((b) => isEligibleNow(b));
    if (nextDirect) {
      setUnlockPromptLeaving(false);
      setUnlockPrompt(nextDirect);
      setSessionSeenUnlocks((prev) =>
        prev.includes(nextDirect.id) ? prev : [...prev, nextDirect.id],
      );
      try {
        window.localStorage.setItem(
          getUnlockLastShownStorageKey(nextDirect.id),
          Date.now().toString(),
        );
      } catch {
        /* ignore */
      }
    }
  }, [
    unlockPrompt,
    unlockPromptLeaving,
    unlockGateUntil,
    unlockQueue,
    goals.length,
    unlockedBranches,
    dismissedUnlocks,
    sessionSnoozedUnlocks,
    sessionSeenUnlocks,
  ]);

  useEffect(() => {
    if (!unlockPrompt || unlockPromptLeaving) return;
    const id = unlockPrompt.id;
    const t = window.setTimeout(() => {
      unlockDismissBranchIdRef.current = id;
      setUnlockPromptLeaving(true);
    }, 10000);
    return () => window.clearTimeout(t);
  }, [unlockPrompt?.id, unlockPromptLeaving]);

  useEffect(() => {
    if (activeGoal) return;
    if (branchCount === 0) return;
    const timer = window.setInterval(() => {
      setFocusBranchIndex((prev) => (prev + 1) % branchCount);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [activeGoal, branchCount]);

  useEffect(() => {
    if (hasInitialisedViewFit.current) return;
    if (viewport.height <= 0 || viewport.width <= 0) return;
    const fitAreaWidth = Math.max(1, viewport.width - 48);
    const fitAreaHeight = Math.max(1, viewport.height - 48);
    const boundsWidth = Math.max(1, contentBounds.maxX - contentBounds.minX);
    const boundsHeight = Math.max(1, contentBounds.maxY - contentBounds.minY);
    const targetZoom = Math.min(fitAreaWidth / boundsWidth, fitAreaHeight / boundsHeight);
    const nextZoom = Math.min(2.5, Math.max(0.3, targetZoom));
    const centerX = (contentBounds.minX + contentBounds.maxX) / 2;
    const centerY = (contentBounds.minY + contentBounds.maxY) / 2;
    const nextPanX = -(nextZoom * centerX);
    const selfAnchorY = viewport.height * SELF_VIEWPORT_HEIGHT_RATIO;
    const nextPanY = selfAnchorY - viewport.height / 2 - nextZoom * centerY;
    setPan({ x: nextPanX, y: nextPanY });
    panDraftRef.current = { x: nextPanX, y: nextPanY };
    setZoom(nextZoom);
    setHasAutoFit(true);
    hasInitialisedViewFit.current = true;
  }, [viewport.height, viewport.width, contentBounds]);

  function handleUnlockDismissAnimationEnd(e) {
    if (!unlockPromptLeaving) return;
    if (!String(e.animationName || "").includes("unlock-prompt-out")) return;
    if (e.target !== e.currentTarget) return;
    const id = unlockDismissBranchIdRef.current;
    if (id) {
      setUnlockQueue((q) => q.filter((x) => x !== id));
    }
    unlockDismissBranchIdRef.current = null;
    setUnlockPrompt(null);
    setUnlockPromptLeaving(false);
    setUnlockGateUntil(Date.now() + 30000);
  }

  function handleUnlockRemindLater() {
    const branch = unlockPrompt;
    if (!branch) return;
    setSessionSnoozedUnlocks((prev) => (prev.includes(branch.id) ? prev : [...prev, branch.id]));
    unlockDismissBranchIdRef.current = branch.id;
    setUnlockPromptLeaving(true);
  }

  function handleUnlockNotInterested() {
    const branch = unlockPrompt;
    if (!branch) return;
    setDismissedUnlocks((prev) => {
      const next = prev.includes(branch.id) ? prev : [...prev, branch.id];
      try {
        window.localStorage.setItem("pathfinder_dismissed_unlocks", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    unlockDismissBranchIdRef.current = branch.id;
    setUnlockPromptLeaving(true);
  }

  const unlockBranch = (branchId: string) => {
    unlockDismissBranchIdRef.current = null;
    setUnlockPromptLeaving(false);
    setUnlockedBranches((prev) => {
      if (prev.includes(branchId)) return prev;
      pushHistory({
        type: "UNLOCK_BRANCH",
        payload: { branchId },
        timestamp: Date.now(),
        label: `Unlocked "${BRANCH_LABEL_BY_ID[branchId] ?? branchId}"`,
      });
      return [...prev, branchId];
    });
    setUnlockPrompt((prev) => (prev?.id === branchId ? null : prev));
    setUnlockQueue((q) => q.filter((id) => id !== branchId));
    setUnlockGateUntil(null);
    setShowUnlockPanel(false);
    setHasAutoFit(false);
  };

  useEffect(() => {
    const mapEl = mapContainerRef.current;
    if (!mapEl) return;
    const onMapWheel = (e: WheelEvent) => {
      if (activeView !== "map") return;
      e.preventDefault();
      setZoom((z) => Math.min(2.5, Math.max(0.3, z - e.deltaY * 0.001)));
    };
    mapEl.addEventListener("wheel", onMapWheel, { passive: false });
    return () => mapEl.removeEventListener("wheel", onMapWheel);
  }, [activeView]);

  useEffect(() => {
    function handleUndo(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        handleUndoAction();
      }
    }
    window.addEventListener("keydown", handleUndo);
    return () => window.removeEventListener("keydown", handleUndo);
  }, [actionHistory]);

  useEffect(() => {
    if (!contextMenu) return;
    function closeContextMenu() {
      setContextMenu(null);
    }
    window.addEventListener("click", closeContextMenu);
    return () => window.removeEventListener("click", closeContextMenu);
  }, [contextMenu]);

  useEffect(() => {
    if (!guidedBranch) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        closeGuidedOverlay();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [guidedBranch]);

  function getMapPointFromClient(clientX, clientY) {
    const svgEl = svgRef.current as SVGSVGElement | null;
    if (!svgEl) return { x: 0, y: 0 };
    const rect = svgEl.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return {
      x: (sx - selfX) / zoom,
      y: (sy - selfY) / zoom,
    };
  }

  function getNearestOtherBranch(point, sourceBranchLabel) {
    const sourceId = BRANCH_ID_BY_LABEL[sourceBranchLabel] ?? null;
    let nearest: { id: string; dist: number } | null = null;
    for (const branch of renderBranches) {
      if (!branch?.id || branch.id === sourceId) continue;
      const end = getPos(branch.angle, PROMPT_DISTANCE);
      const dist = pointToSegmentDistance(point, { x: 0, y: 0 }, end);
      if (!nearest || dist < nearest.dist) {
        nearest = { id: branch.id, dist };
      }
    }
    const threshold = 60 / Math.max(zoom, 0.2);
    if (!nearest || nearest.dist > threshold) return null;
    return nearest.id;
  }

  function startNodeDrag(node, clientX, clientY) {
    if (!isEnabled("DRAG_TO_CONNECT")) return;
    const mapPoint = getMapPointFromClient(clientX, clientY);
    setDragState({
      isDragging: true,
      nodeId: node.id,
      startX: mapPoint.x,
      startY: mapPoint.y,
      currentX: mapPoint.x,
      currentY: mapPoint.y,
      nearBranch: null,
      nearNodeId: null,
    });
    setDragging(false);
    setDragStart(null);
    setDragGhost(null);
    setDragSuggestion(null);
  }

  function moveNodeDrag(clientX, clientY) {
    if (!dragState.isDragging || !dragState.nodeId) return;
    const node = allMoments.find((n) => n.id === dragState.nodeId);
    if (!node) return;
    const originalPos = positions[node.id];
    if (!originalPos) return;
    const mapPoint = getMapPointFromClient(clientX, clientY);
    const threshold = 40 / Math.max(zoom, 0.2);
    const dist = Math.hypot(mapPoint.x - originalPos.x, mapPoint.y - originalPos.y);
    const nearBranchId = getNearestOtherBranch(mapPoint, node.branchLabel);
    setDragState((prev) => ({
      ...prev,
      currentX: mapPoint.x,
      currentY: mapPoint.y,
      nearBranch: nearBranchId,
    }));
    if (dist <= threshold) {
      setDragGhost(null);
      return;
    }
    const branchMeta = BRANCH_BY_LABEL[node.branchLabel];
    const angleOffset =
      branchMeta?.subbranches?.find((sb) => sb.id === node.subbranch)?.angleOffset ?? 0;
    const parentSubbranchAngle = (branchMeta?.angle ?? 0) + angleOffset;
    const forkAngle = getDragBranchAngle(
      parentSubbranchAngle,
      mapPoint.x,
      mapPoint.y,
      originalPos.x,
      originalPos.y,
    );
    const extension = getPos(forkAngle, NODE_SPACING);
    const ghostX = originalPos.x + extension.x;
    const ghostY = originalPos.y + extension.y;
    const lateral: "left" | "right" = forkAngle < parentSubbranchAngle ? "left" : "right";
    setDragGhost((prev) => {
      const next = {
        ghostX,
        ghostY,
        originalX: originalPos.x,
        originalY: originalPos.y,
        branchColor: node.branchColor ?? branchMeta?.color ?? "#94A3B8",
        branchLabel: node.branchLabel,
        lateral,
      };
      if (
        prev &&
        Math.abs(prev.ghostX - next.ghostX) < 0.25 &&
        Math.abs(prev.ghostY - next.ghostY) < 0.25 &&
        prev.lateral === next.lateral &&
        prev.branchColor === next.branchColor
      ) {
        return prev;
      }
      return next;
    });
  }

  async function endNodeDrag(clientX, clientY) {
    if (!dragState.isDragging || !dragState.nodeId) return;
    const node = allMoments.find((n) => n.id === dragState.nodeId);
    const originalPos = node ? positions[node.id] : null;
    const mapPoint = getMapPointFromClient(clientX, clientY);
    const threshold = 40 / Math.max(zoom, 0.2);
    const dist = originalPos
      ? Math.hypot(mapPoint.x - originalPos.x, mapPoint.y - originalPos.y)
      : 0;
    const nearBranchId =
      dragState.nearBranch ?? (node ? getNearestOtherBranch(mapPoint, node.branchLabel) : null);
    if (!node || !originalPos) {
      setDragState({
        isDragging: false,
        nodeId: null,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        nearBranch: null,
        nearNodeId: null,
      });
      setDragGhost(null);
      return;
    }
    if (dist < threshold) {
      setSelected(node.id);
    } else if (nearBranchId) {
      try {
        const targetNode = allMoments.find(
          (n) => BRANCH_ID_BY_LABEL[n.branchLabel] === nearBranchId && n.id !== node.id,
        );
        const response = await fetch("/api/life-map/drag-suggestion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromNodeId: node.id,
            toNodeId: targetNode?.id ?? node.id,
            allMoments: timelineGoals.map((n) => ({
              id: n.id,
              label: n.title ?? n.label,
              branch: n.limb ?? n.lifeArea ?? n.branch,
              year: Number(n.year ?? new Date(n.createdAt).getFullYear()),
            })),
          }),
        });
        const data = await response.json();
        setDragSuggestion(data?.suggestion ?? null);
      } catch (err) {
        console.error("[PathfinderHome] drag suggestion failed", err);
      }
    } else {
      const parentYear = Number(node.year ?? new Date().getFullYear());
      setGuidedBranch(node.branchLabel);
      setGuidedSubbranch(node.subbranch ?? null);
      setGuidedEntryMode("guided");
      setGuidedFlow(null);
      setGuidedPostStage("none");
      setGuidedLocationDraft("");
      setPendingGuidedOutcome(null);
      setPendingConnectionIds([]);
      setPendingSignificance(2);
      setPreviewError(null);
      setGuidedInput(`What happened next after "${node.label}"?`);
      setGuidedFlowContext({
        parentNodeId: node.id,
        parentLabel: node.label,
        parentYear,
        subbranch: node.subbranch ?? null,
        promptOverride: `What happened next after "${node.label}"?`,
        isBranching: true,
        lateral: dragGhost?.lateral ?? "right",
      });
    }
    setDragState({
      isDragging: false,
      nodeId: null,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      nearBranch: null,
      nearNodeId: null,
    });
    setDragGhost(null);
  }

  function onMouseDown(e) {
    if (dragState.isDragging) return;
    if (e.target.closest(".node-g") || e.target.closest(".ui-overlay")) return;
    setDragging(true);
    const basePan = panDraftRef.current;
    setDragStart({ x: e.clientX - basePan.x, y: e.clientY - basePan.y });
  }
  function onMouseMove(e) {
    if (dragState.isDragging) {
      moveNodeDrag(e.clientX, e.clientY);
      return;
    }
    if (!dragging || !dragStart) return;
    panDraftRef.current = { x: e.clientX - dragStart.x, y: e.clientY - dragStart.y };
    if (panRafRef.current !== null) return;
    panRafRef.current = window.requestAnimationFrame(() => {
      panRafRef.current = null;
      const nextPan = panDraftRef.current;
      setPan((prev) =>
        Math.abs(prev.x - nextPan.x) < 0.5 && Math.abs(prev.y - nextPan.y) < 0.5
          ? prev
          : nextPan,
      );
    });
  }
  function onMouseUp(e) {
    if (dragState.isDragging) {
      const event = e as MouseEvent | undefined;
      endNodeDrag(event?.clientX ?? 0, event?.clientY ?? 0);
      return;
    }
    if (panRafRef.current !== null) {
      window.cancelAnimationFrame(panRafRef.current);
      panRafRef.current = null;
    }
    setPan((prev) =>
      Math.abs(prev.x - panDraftRef.current.x) < 0.5 &&
      Math.abs(prev.y - panDraftRef.current.y) < 0.5
        ? prev
        : panDraftRef.current,
    );
    setDragging(false);
  }

  async function startVoiceCapture() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-GB";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? "";
      setGuidedInput(transcript);
    };
    recognition.start();
  }

  function closeGuidedOverlay() {
    setGuidedBranch(null);
    setGuidedSubbranch(null);
    setGuidedInput("");
    setGuidedMode("text");
    setGuidedEntryMode("guided");
    setGuidedFlow(null);
    setGuidedPostStage("none");
    setGuidedLocationDraft("");
    setPendingGuidedOutcome(null);
    setPendingSignificance(2);
    setPendingConnectionIds([]);
    setGuidedFlowContext(null);
    setGuidedFlowInsertContext(null);
    updatePendingInsertPosition(null);
    setPreviewError(null);
  }

  function calculateMapPosition(insertIndex: number, branchMoments: Array<{ mapPosition?: number }>) {
    const sorted = [...branchMoments].sort(
      (a, b) => Number(a.mapPosition ?? 0) - Number(b.mapPosition ?? 0),
    );

    if (sorted.length === 0) return 0;
    if (insertIndex === 0) return Number(sorted[0].mapPosition ?? 0) - 1;
    if (insertIndex >= sorted.length) {
      return Number(sorted[sorted.length - 1].mapPosition ?? 0) + 1;
    }
    const prev = Number(sorted[insertIndex - 1].mapPosition ?? 0);
    const next = Number(sorted[insertIndex].mapPosition ?? 0);
    return (prev + next) / 2;
  }

  function getMapPositionForInsert(
    branchLabel: string,
    options?: {
      branchId?: string | null;
      insertIndex?: number | null;
    },
  ) {
    const targetBranchId = options?.branchId ?? guidedFlowInsertContext?.branchId ?? null;
    let branchMoments = timelineGoals.filter((n) => {
      if (targetBranchId && n.branchId) {
        return n.branchId === targetBranchId;
      }
      return (n.limb ?? n.lifeArea ?? n.branch) === branchLabel;
    });
    // If branchId was provided but legacy nodes are missing branchId, fall back
    // to branch-label scope so insertion still behaves predictably.
    if (branchMoments.length === 0) {
      branchMoments = timelineGoals.filter((n) => (n.limb ?? n.lifeArea ?? n.branch) === branchLabel);
    }
    branchMoments = branchMoments.sort((a, b) => Number(a.mapPosition ?? 0) - Number(b.mapPosition ?? 0));
    const insertIndex =
      typeof options?.insertIndex === "number"
        ? options.insertIndex
        : guidedFlowInsertContext?.insertIndex ?? branchMoments.length;
    return calculateMapPosition(insertIndex, branchMoments);
  }

  function addQuickNode(input) {
    const label = input.label.trim().split(" ").slice(0, 5).join(" ");
    const year = Number.parseInt(String(input.year), 10);
    if (!input.branch || !label || !Number.isFinite(year)) return null;
    const newId = `guided-${input.branch}-${Date.now()}`;
    const createdAt =
      input.createdAtOverride ??
      `${year}-${String(input.month ?? 1).padStart(2, "0")}-01`;
    const newNode = {
      id: newId,
      title: label,
      lifeArea: input.branch,
      createdAt,
      progress: 0,
      description: input.desc,
      year,
      month: input.month ?? null,
      future: Boolean(input.future ?? false),
      timelineNote: input.timelineNote ?? null,
      connectedTo: Array.isArray(input.connectedTo) ? input.connectedTo : [],
      significance: Math.max(1, Math.min(3, Number(input.significance ?? 1))),
      practicalData: input.practicalData,
      subbranch: input.subbranch ?? null,
      subtype: input.subtype ?? null,
      location: input.location ?? null,
      // branchId â€” canonical reference to the Branch record this moment lives on.
      // For Slice 1 this is bookkeeping only; Slice 2 will use it for rendering.
      branchId: input.branchId ?? null,
      limbId: input.limbId ?? null,
      mapPosition: Number(
        input.mapPosition ??
          getMapPositionForInsert(input.branch, {
            branchId: input.branchId ?? guidedFlowInsertContext?.branchId ?? null,
            insertIndex:
              typeof input.insertIndex === "number"
                ? input.insertIndex
                : guidedFlowInsertContext?.insertIndex ?? null,
          }),
      ),
    };
    setGuidedNodes((prev) => [
      ...prev,
      newNode,
    ]);
    pushHistory({
      type: "ADD_NODE",
      payload: { nodeId: newId, nodeData: newNode, source: "guidedNodes" },
      timestamp: Date.now(),
      label: `Added "${newNode.title}"`,
    });
    setRecentNodeIds((prev) => [...prev, newId]);
    setTimeout(() => {
      setRecentNodeIds((prev) => prev.filter((id) => id !== newId));
    }, 500);
    if (input.closeAfterAdd !== false) {
      closeGuidedOverlay();
    }
    return newId;
  }

  function buildFlowOutcome(flowState) {
    if (!guidedBranch) return null;
    const answers = flowState?.answers ?? {};
    const branch = guidedBranch;
    const selectedPill = flowState?.pill;
    const get = (key) => String(answers[key] ?? "").trim();
    const currentYear = new Date().getFullYear();
    if (branch === "Work & Learning" && selectedPill === "First job") {
      const field = get("field") || "First";
      const when = get("when") || "This year";
      const outcome = get("outcome") || "Learned a lot";
      const year = resolveYearChipToNumber(when);
      return {
        label: buildNodeLabel([field, "Job"]),
        year,
        desc: `Started a ${field.toLowerCase()} job around ${when} - ${outcome.toLowerCase()}.`,
        summary: `Started a ${field.toLowerCase()} job around ${when} - ${outcome.toLowerCase()}.`,
      };
    }
    if (branch === "Work & Learning" && selectedPill === "Career pivot") {
      const from = get("from") || "previous role";
      const to = get("to") || "new role";
      const driver = get("driver") || "life change";
      const when = get("when") || String(currentYear);
      const year = resolveYearChipToNumber(when);
      return {
        label: buildNodeLabel([to, "Career", "Pivot"]),
        year,
        desc: `Pivoted from ${from.toLowerCase()} to ${to.toLowerCase()} in ${when} due to ${driver.toLowerCase()}.`,
        summary: `Pivoted from ${from.toLowerCase()} to ${to.toLowerCase()} in ${when} because of ${driver.toLowerCase()}.`,
      };
    }
    if (branch === "Work & Learning" && selectedPill === "Started a business") {
      const kind = get("kind") || "business";
      const when = get("when") || String(currentYear);
      const status = get("status") || "just getting started";
      const year = resolveYearChipToNumber(when);
      return {
        label: buildNodeLabel(["Started", kind, "Business"]),
        year,
        desc: `Started a ${kind.toLowerCase()} business in ${when}; currently ${status.toLowerCase()}.`,
        summary: `Started a ${kind.toLowerCase()} business in ${when} - ${status.toLowerCase()}.`,
      };
    }
    if (branch === "Health" && selectedPill === "Started training") {
      const type = get("type") || "training";
      const when = get("when") || String(currentYear);
      const status = get("status") || "on and off";
      const year = resolveYearChipToNumber(when);
      return {
        label: `Started ${type}`,
        year,
        desc: `Started ${type.toLowerCase()} in ${when} - ${status.toLowerCase()}.`,
        summary: `Started ${type.toLowerCase()} training in ${when} - and you're ${status.toLowerCase()}.`,
      };
    }
    if (branch === "Health" && selectedPill === "Lost weight") {
      const amount = get("amount") || "weight";
      const method = get("method") || "habit changes";
      const when = get("when") || String(currentYear);
      const year = resolveYearChipToNumber(when);
      return {
        label: buildNodeLabel(["Lost", amount]),
        year,
        desc: `Lost ${amount.toLowerCase()} around ${when} using ${method.toLowerCase()}.`,
        summary: `Lost ${amount.toLowerCase()} around ${when} through ${method.toLowerCase()}.`,
      };
    }
    if (branch === "Health" && selectedPill === "Built a habit") {
      const habit = get("habit") || "habit";
      const when = get("when") || String(currentYear);
      const consistency = get("consistency") || "still building it";
      const year = resolveYearChipToNumber(when);
      return {
        label: buildNodeLabel([habit, "habit"]),
        year,
        desc: `Built a ${habit.toLowerCase()} habit from ${when}; consistency: ${consistency.toLowerCase()}.`,
        summary: `Built a ${habit.toLowerCase()} habit in ${when} - ${consistency.toLowerCase()}.`,
      };
    }
    if (branch === "Relationships" && selectedPill === "Met my partner") {
      const how = get("how") || "through life";
      const when = get("when") || String(currentYear);
      const status = get("status") || "together";
      const year = resolveYearChipToNumber(when);
      return {
        label: "Met My Partner",
        year,
        desc: `Met my partner via ${how.toLowerCase()} in ${when}; now ${status.toLowerCase()}.`,
        summary: `Met your partner via ${how.toLowerCase()} in ${when} - now ${status.toLowerCase()}.`,
      };
    }
    if (branch === "Relationships" && selectedPill === "Found my people") {
      const community = get("community") || "community";
      const when = get("when") || String(currentYear);
      const year = resolveYearChipToNumber(when);
      return {
        label: buildNodeLabel(["Found", community]),
        year,
        desc: `Found my people through ${community.toLowerCase()} around ${when}.`,
        summary: `Found your people through ${community.toLowerCase()} around ${when}.`,
      };
    }
    if (branch === "Relationships" && selectedPill === "Lost someone") {
      const lossType = get("lossType") || "a significant loss";
      const when = get("when") || String(currentYear);
      const impact = get("impact") || "still processing";
      const year = resolveYearChipToNumber(when);
      return {
        label: "A significant loss",
        year,
        desc: `Experienced ${lossType.toLowerCase()} around ${when}; it ${impact.toLowerCase()}.`,
        summary: `A significant loss around ${when} that ${impact.toLowerCase()}.`,
      };
    }
    if (branch === "Personal Growth" && selectedPill === "Mindset Shift") {
      const beforeThink = get("beforeThink") || "something I outgrew";
      const nowThink = get("nowThink") || "something truer for me";
      const cause = get("cause") || "life";
      const when = get("when") || String(currentYear);
      const year = resolveYearChipToNumber(when);
      return {
        label: buildNodeLabel(["From", beforeThink, "to"]),
        year,
        desc: `Used to think: ${beforeThink}. Now: ${nowThink}. Shifted after ${cause.toLowerCase()} (${when}).`,
        summary: `Mindset shift around ${when}: moved from "${beforeThink}" toward "${nowThink.slice(0, 140)}${nowThink.length > 140 ? "â€¦" : ""}".`,
      };
    }
    if (branch === "Personal Growth" && selectedPill === "Lesson Learned") {
      const area = get("area") || "life";
      const lesson = get("lesson") || "something important";
      const how = get("how") || "experience";
      const when = get("when") || String(currentYear);
      const year = resolveYearChipToNumber(when);
      return {
        label: buildNodeLabel(["Lesson in", area]),
        year,
        desc: `I learned that ${lesson}. Learned through ${how.toLowerCase()} in ${area.toLowerCase()} (${when}).`,
        summary: `Lesson in ${area.toLowerCase()} around ${when}: I learned that ${lesson.slice(0, 120)}${lesson.length > 120 ? "â€¦" : ""}.`,
      };
    }
    if (branch === "Personal Growth" && selectedPill === "Identity Change") {
      const usedTo = get("usedTo") || "played small";
      const nowIdentity = get("nowIdentity") || "shows up differently";
      const when = get("when") || String(currentYear);
      const year = resolveYearChipToNumber(when);
      return {
        label: buildNodeLabel(["Used to", usedTo, "now"]),
        year,
        desc: `I used to be someone who ${usedTo.toLowerCase()}. Now: ${nowIdentity}. Started shifting around ${when}.`,
        summary: `Identity shift from "${usedTo}" toward "${nowIdentity.slice(0, 120)}${nowIdentity.length > 120 ? "â€¦" : ""}" (${when}).`,
      };
    }
    if (branch === "Money" && selectedPill === "First income") {
      const source = get("source") || "income";
      const when = get("when") || String(currentYear);
      const year = resolveYearChipToNumber(when);
      return {
        label: buildNodeLabel(["First", source]),
        year,
        desc: `First meaningful income came from ${source.toLowerCase()} around ${when}.`,
        summary: `First income came from ${source.toLowerCase()} around ${when}.`,
      };
    }
    if (branch === "Money" && selectedPill === "Started saving") {
      const goal = get("goal") || "saving";
      const when = get("when") || String(currentYear);
      const status = get("status") || "in progress";
      const year = resolveYearChipToNumber(when);
      return {
        label: buildNodeLabel(["Saving for", goal]),
        year,
        desc: `Started saving for ${goal.toLowerCase()} in ${when}; status: ${status.toLowerCase()}.`,
        summary: `Started saving for ${goal.toLowerCase()} in ${when} - ${status.toLowerCase()}.`,
      };
    }
    if (branch === "Money" && selectedPill === "Big financial decision") {
      const decision = get("decision") || "financial decision";
      const when = get("when") || String(currentYear);
      const outcome = get("outcome") || "still dealing with it";
      const year = resolveYearChipToNumber(when);
      return {
        label: buildNodeLabel([decision]),
        year,
        desc: `Made a major financial decision (${decision.toLowerCase()}) in ${when}; ${outcome.toLowerCase()}.`,
        summary: `A big financial decision in ${when}: ${decision.toLowerCase()} - ${outcome.toLowerCase()}.`,
      };
    }
    return null;
  }

  const DEFAULT_FLOW_BY_SUBBRANCH: Record<string, string> = {
    "finance-income": "First income",
    "finance-saving": "Started saving",
    "finance-decisions": "Big financial decision",
    "work-roles": "First job",
    "work-skills": "Started a business",
    "work-projects": "Started a business",
    "becoming-mindset": "Mindset Shift",
    "becoming-lessons": "Lesson Learned",
    "becoming-identity": "Identity Change",
    "people-romance": "Met my partner",
    "people-family": "Found my people",
    "people-friends": "Found my people",
    "people-mentors": "Found my people",
    "health-fitness": "Started training",
    "health-mental": "Built a habit",
    "health-habits": "Built a habit",
  };

  function openGuidedForSubbranch(
    branchLabel,
    subbranchId,
    insertionContext?: {
      insertIndex: number;
      insertAfterNodeId: string | null;
      insertBeforeNodeId: string | null;
      promptOverride: string;
      isBranching?: boolean;
    },
  ) {
    setGuidedBranch(branchLabel);
    setGuidedSubbranch(subbranchId);
    setGuidedEntryMode("guided");
    setGuidedInput("");
    setPreviewError(null);
    if (insertionContext) {
      setGuidedFlowInsertContext({
        branchId: BRANCH_ID_BY_LABEL[branchLabel] ?? branchLabel,
        insertIndex: insertionContext.insertIndex,
        prevMomentId: insertionContext.insertAfterNodeId ?? null,
        nextMomentId: insertionContext.insertBeforeNodeId ?? null,
      });
      const seedYear = insertionContext.insertAfterNodeId
        ? Number(
            timelineGoals.find((n) => n.id === insertionContext.insertAfterNodeId)?.year ??
              new Date().getFullYear(),
          )
        : Number(
            timelineGoals.find((n) => n.id === insertionContext.insertBeforeNodeId)?.year ??
              new Date().getFullYear(),
          );
      setGuidedFlowContext({
        parentNodeId: insertionContext.insertAfterNodeId ?? insertionContext.insertBeforeNodeId ?? "",
        parentLabel: "",
        parentYear: seedYear,
        subbranch: subbranchId,
        promptOverride: insertionContext.promptOverride,
        isBranching: Boolean(insertionContext.isBranching),
        insertIndex: insertionContext.insertIndex,
        insertAfterNodeId: insertionContext.insertAfterNodeId,
        insertBeforeNodeId: insertionContext.insertBeforeNodeId,
      });
    } else {
      setGuidedFlowContext(null);
      setGuidedFlowInsertContext(null);
    }
    const example = DEFAULT_FLOW_BY_SUBBRANCH[subbranchId];
    const flowTemplate = GUIDED_FLOW_BLUEPRINTS?.[branchLabel]?.[example];
    if (example && flowTemplate) {
      const stepsWithContextYears = buildFlowStepsWithOptionalMonth(
        flowTemplate.steps,
        guidedFlowContext?.parentYear,
      );
      setGuidedFlow({
        pill: example,
        steps: stepsWithContextYears,
        currentStep: 0,
        answers: {},
        otherTextByStep: {},
        awaitingOther: false,
        completed: false,
      });
      return;
    }
    setGuidedFlow(null);
  }

  function openGuidedForBranch(
    branchLabel,
    insertionContext?: {
      insertIndex: number;
      insertAfterNodeId: string | null;
      insertBeforeNodeId: string | null;
      promptOverride?: string;
      isBranching?: boolean;
    },
  ) {
    setGuidedBranch(branchLabel);
    setGuidedSubbranch(null);
    setGuidedEntryMode("guided");
    setGuidedFlow(null);
    setGuidedInput("");
    if (insertionContext) {
      setGuidedFlowInsertContext({
        branchId: BRANCH_ID_BY_LABEL[branchLabel] ?? branchLabel,
        insertIndex: insertionContext.insertIndex,
        prevMomentId: insertionContext.insertAfterNodeId ?? null,
        nextMomentId: insertionContext.insertBeforeNodeId ?? null,
      });
      const seedYear = insertionContext.insertAfterNodeId
        ? Number(
            timelineGoals.find((n) => n.id === insertionContext.insertAfterNodeId)?.year ??
              new Date().getFullYear(),
          )
        : Number(
            timelineGoals.find((n) => n.id === insertionContext.insertBeforeNodeId)?.year ??
              new Date().getFullYear(),
          );
      setGuidedFlowContext({
        parentNodeId: insertionContext.insertAfterNodeId ?? insertionContext.insertBeforeNodeId ?? "",
        parentLabel: "",
        parentYear: seedYear,
        subbranch: null,
        promptOverride: insertionContext.promptOverride ?? `Add to ${branchLabel}`,
        isBranching: Boolean(insertionContext.isBranching),
        insertIndex: insertionContext.insertIndex,
        insertAfterNodeId: insertionContext.insertAfterNodeId,
        insertBeforeNodeId: insertionContext.insertBeforeNodeId,
      });
    } else {
      setGuidedFlowContext(null);
      setGuidedFlowInsertContext(null);
    }
    setPreviewError(null);
  }

  function resolveSublineInsertion(
    branch,
    subLine,
    clientX: number,
    clientY: number,
  ) {
    const mapPoint = getMapPointFromClient(clientX, clientY);
    const closest = getClosestPointOnSegment(
      mapPoint.x,
      mapPoint.y,
      subLine.startX ?? 0,
      subLine.startY ?? 0,
      subLine.endX ?? 0,
      subLine.endY ?? 0,
    );
    const ratio = getClickRatioOnLine(
      closest.x,
      closest.y,
      subLine.startX ?? 0,
      subLine.startY ?? 0,
      subLine.endX ?? 0,
      subLine.endY ?? 0,
    );
    const subNodes = getSubbranchNodesByIds(branch.label, subLine.id);
    const middleIndex = Math.max(1, Math.floor(subNodes.length / 2));
    const insertIndex =
      subNodes.length === 0
        ? 0
        : ratio < 0.33
          ? 0
          : ratio < 0.66
            ? middleIndex
            : subNodes.length;
    const prevNode = insertIndex > 0 ? subNodes[insertIndex - 1] : null;
    const nextNode = insertIndex < subNodes.length ? subNodes[insertIndex] : null;
    const point =
      insertIndex === 0 && nextNode && positions[nextNode.id]
        ? positions[nextNode.id]
        : insertIndex >= subNodes.length
          ? subLine.addPoint
          : positions[subNodes[insertIndex]?.id] ?? subLine.addPoint;
    const promptOverride =
      insertIndex === 0 && nextNode
        ? `What came before "${nextNode.title ?? nextNode.label}"?`
        : insertIndex >= subNodes.length && prevNode
          ? `What came after "${prevNode.title ?? prevNode.label}"?`
          : prevNode && nextNode
            ? `What happened between "${prevNode.title ?? prevNode.label}" and "${nextNode.title ?? nextNode.label}"?`
            : `Add to ${subLine.subbranch.label}`;
    return {
      insertIndex,
      insertAfterNodeId: prevNode?.id ?? null,
      insertBeforeNodeId: nextNode?.id ?? null,
      prevNodeLabel: prevNode ? prevNode.title ?? prevNode.label : null,
      nextNodeLabel: nextNode ? nextNode.title ?? nextNode.label : null,
      promptOverride,
      x: point.x,
      y: point.y,
      ratio,
    };
  }

  function startGuidedFlowFromExample(example) {
    const becomingSubByPill =
      guidedBranch === "Personal Growth"
        ? {
            "Mindset Shift": "becoming-mindset",
            "Lesson Learned": "becoming-lessons",
            "Identity Change": "becoming-identity",
          }[example]
        : null;
    const resolvedSubbranch = guidedSubbranch ?? becomingSubByPill ?? null;
    if (guidedBranch === "Personal Growth" && becomingSubByPill && !guidedSubbranch) {
      setGuidedSubbranch(becomingSubByPill);
    }
    if (guidedBranchConfig?.subbranches?.length > 0 && !resolvedSubbranch) {
      return;
    }
    const flowTemplate = GUIDED_FLOW_BLUEPRINTS?.[guidedBranch]?.[example];
    if (!flowTemplate) {
      setGuidedEntryMode("text");
      setGuidedInput((prev) => (prev ? `${prev} ${example}` : example));
      return;
    }
    const stepsWithContextYears = buildFlowStepsWithOptionalMonth(
      flowTemplate.steps,
      guidedFlowContext?.parentYear,
    );
    setGuidedEntryMode("guided");
    setGuidedFlow({
      pill: example,
      steps: stepsWithContextYears,
      currentStep: 0,
      answers: {},
      otherTextByStep: {},
      awaitingOther: false,
      completed: false,
    });
  }

  function selectGuidedFlowOption(option) {
    if (!guidedFlow || !guidedFlowStep) return;
    if (option === "Other" && guidedFlowStep.allowOther) {
      setGuidedFlow((prev) => ({ ...prev, awaitingOther: true }));
      return;
    }
    const nextAnswers = {
      ...(guidedFlow.answers ?? {}),
      [guidedFlowStep.id]: option,
    };
    const nextStep = (guidedFlow.currentStep ?? 0) + 1;
    const done = nextStep >= guidedFlow.steps.length;
    setGuidedFlow((prev) => ({
      ...prev,
      answers: nextAnswers,
      currentStep: done ? prev.currentStep : nextStep,
      awaitingOther: false,
      completed: done,
    }));
  }

  function submitGuidedOtherValue() {
    if (!guidedFlow || !guidedFlowStep) return;
    const otherText = String(guidedOtherDraftRef.current || "").trim();
    if (!otherText) return;
    const nextAnswers = {
      ...(guidedFlow.answers ?? {}),
      [guidedFlowStep.id]: otherText,
    };
    const nextStep = (guidedFlow.currentStep ?? 0) + 1;
    const done = nextStep >= guidedFlow.steps.length;
    setGuidedFlow((prev) => ({
      ...prev,
      answers: nextAnswers,
      currentStep: done ? prev.currentStep : nextStep,
      awaitingOther: false,
      completed: done,
    }));
  }

  function submitGuidedFreeTextStep() {
    if (!guidedFlow || !guidedFlowStep?.isFreeText) return;
    const text = String(guidedFreeTextDraftRef.current || "").trim();
    if (!text) return;
    const nextAnswers = {
      ...(guidedFlow.answers ?? {}),
      [guidedFlowStep.id]: text,
    };
    const nextStep = (guidedFlow.currentStep ?? 0) + 1;
    const done = nextStep >= guidedFlow.steps.length;
    setGuidedFlow((prev) => ({
      ...prev,
      answers: nextAnswers,
      currentStep: done ? prev.currentStep : nextStep,
      awaitingOther: false,
      completed: done,
    }));
  }

  function backGuidedFlowStep() {
    if (!guidedFlow) return;
    if ((guidedFlow.currentStep ?? 0) <= 0) {
      setGuidedFlow(null);
      if (guidedBranch === "Personal Growth") {
        setGuidedSubbranch(null);
      }
      return;
    }
    setGuidedFlow((prev) => ({
      ...prev,
      currentStep: Math.max(0, prev.currentStep - 1),
      completed: false,
      awaitingOther: false,
    }));
  }

  function getCreatedAtForInsertion(
    branchLabel: string,
    subbranchId: string | null,
    year: number,
    month: number | null | undefined,
) {
    if (!subbranchId || guidedFlowContext?.insertIndex === undefined) {
      return `${year}-${String(month ?? 1).padStart(2, "0")}-01`;
    }
    const subNodes = getSubbranchNodesByIds(branchLabel, subbranchId);
    if (subNodes.length === 0) {
      return `${year}-${String(month ?? 1).padStart(2, "0")}-01`;
    }
    const insertIndex = Math.max(0, Math.min(guidedFlowContext.insertIndex, subNodes.length));
    const before = insertIndex > 0 ? Date.parse(String(subNodes[insertIndex - 1].createdAt)) : null;
    const after = insertIndex < subNodes.length ? Date.parse(String(subNodes[insertIndex].createdAt)) : null;
    let ts: number | null = null;
    if (before && after && after > before + 1000) {
      ts = Math.floor((before + after) / 2);
    } else if (before) {
      ts = before + 3600 * 1000;
    } else if (after) {
      ts = after - 3600 * 1000;
    }
    if (!ts || !Number.isFinite(ts)) {
      return `${year}-${String(month ?? 1).padStart(2, "0")}-01`;
    }
    return new Date(ts).toISOString();
  }

  function commitPendingGuidedNode() {
    if (!pendingGuidedOutcome || !guidedBranch) return;
    const defaultYear = new Date().getFullYear();
    const createdAtOverride = getCreatedAtForInsertion(
      guidedBranch,
      guidedSubbranch,
      Number(pendingGuidedOutcome.year),
      pendingGuidedOutcome.month ?? null,
    );
    const resolvedLimbId =
      LIMBS.find((l) => l.label === guidedBranch)?.id ?? null;
    const resolvedBranchId =
      pendingNewBranchId ??
      (resolvedLimbId
        ? canonicalBranches.find(
            (b) => b.limbId === resolvedLimbId && Number(b.mapAngleOffset ?? 0) === 0,
          )?.id ?? null
        : null);
    const newNodeId = addQuickNode({
      label: pendingGuidedOutcome.label,
      year: defaultYear,
      month: null,
      createdAtOverride,
      desc: pendingGuidedOutcome.desc,
      branch: guidedBranch,
      branchId: resolvedBranchId,
      limbId: resolvedLimbId,
      insertIndex:
        guidedFlowInsertContext?.insertIndex ??
        guidedFlowContext?.insertIndex ??
        null,
      future: Boolean(pendingGuidedOutcome.future ?? false),
      significance: Number(
        pendingGuidedOutcome.significance ?? pendingSignificance,
      ),
      connectedTo: pendingConnectionIds,
      subbranch: guidedSubbranch,
      subtype: guidedSubbranch ? String(guidedSubbranch).split("-")[1] ?? null : null,
      location: pendingGuidedOutcome.location ?? null,
      insertAfterNodeId: guidedFlowContext?.insertAfterNodeId ?? null,
      insertBeforeNodeId: guidedFlowContext?.insertBeforeNodeId ?? null,
      closeAfterAdd: false,
    });
    if (pendingNewBranchId) {
      setPendingNewBranchId(null);
    }
    if (newNodeId) {
      pendingConnectionIds.forEach((targetId) => {
        addConnection({
          fromNodeId: newNodeId,
          toNodeId: targetId,
          fromBranch: guidedBranch,
          toBranch:
            timelineGoals.find((node) => node.id === targetId)?.lifeArea ??
            guidedBranch,
          connectionType: "affected",
        });
      });
      setGuidedNodes((prev) =>
        prev.map((node) =>
          pendingConnectionIds.includes(node.id)
            ? {
                ...node,
                connectedTo: Array.from(
                  new Set([...(node.connectedTo ?? []), newNodeId]),
                ),
              }
            : node,
        ),
      );
    }
    closeGuidedOverlay();
  }

  function saveGuidedNode() {
    if (!guidedBranch || !guidedInput.trim()) return;
    if (guidedBranchConfig?.subbranches?.length > 0 && !guidedSubbranch) {
      setPreviewError("Choose a work moment type first so we can place it on the right branch.");
      return;
    }
    const labelCandidate =
      guidedInput.trim().split(" ").slice(0, 5).join(" ") ||
      `My ${guidedBranch} Story`;
    if (isLikelyLocationOnlyLabel(labelCandidate)) {
      setPreviewError(
        "Looks like this might be a location â€” try adding what actually happened there and tag the location instead",
      );
      return;
    }
    setPreviewError(null);
    const createdAtOverride = getCreatedAtForInsertion(
      guidedBranch,
      guidedSubbranch,
      new Date().getFullYear(),
      null,
    );
    addQuickNode({
      label: labelCandidate,
      year: new Date().getFullYear(),
      month: null,
      createdAtOverride,
      desc: guidedInput.trim(),
      branch: guidedBranch,
      branchId: guidedFlowInsertContext?.branchId ?? null,
      insertIndex:
        guidedFlowInsertContext?.insertIndex ??
        guidedFlowContext?.insertIndex ??
        null,
      subbranch: guidedSubbranch,
      subtype: guidedSubbranch ? String(guidedSubbranch).split("-")[1] ?? null : null,
      insertAfterNodeId: guidedFlowContext?.insertAfterNodeId ?? null,
      insertBeforeNodeId: guidedFlowContext?.insertBeforeNodeId ?? null,
    });
  }

  function dismissSuggestion(suggestionId) {
    const dismissed = suggestions.find((s) => s.id === suggestionId);
    if (dismissed) {
      setDismissedSuggestionTerms((prev) => [
        ...prev,
        ...dismissed.label
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3),
      ]);
    }
    setSuggestions((prev) => prev.filter((s) => s.id !== suggestionId));
    if (selectedSuggestionId === suggestionId) {
      setSelectedSuggestionId(null);
      setSuggestionEditLabel("");
      setSuggestionEditYear("");
    }
  }

  function acceptSuggestion(input) {
    const label = input.label.trim().split(" ").slice(0, 5).join(" ");
    const yearNumber = Number.parseInt(String(input.year), 10);
    if (!label || !Number.isFinite(yearNumber)) return;
    const newId = `suggested-${input.branch}-${Date.now()}`;
    setGuidedNodes((prev) => [
      ...prev,
      {
        id: newId,
        title: label,
        lifeArea: input.branch,
        createdAt: `${yearNumber}-01-01`,
        mapPosition: getMapPositionForInsert(input.branch),
        progress: 0,
        description: `AI suggestion accepted: ${label}`,
      },
    ]);
    pushHistory({
      type: "ADD_NODE",
      payload: {
        nodeId: newId,
        nodeData: {
          id: newId,
          title: label,
        },
        source: "guidedNodes",
      },
      timestamp: Date.now(),
      label: `Added "${label}"`,
    });
    setRecentNodeIds((prev) => [...prev, newId]);
    setTimeout(() => {
      setRecentNodeIds((prev) => prev.filter((id) => id !== newId));
    }, 500);
    dismissSuggestion(input.id);
  }

  function validatePreviewNodes(nodes) {
    for (const node of nodes) {
      if (!node.label?.trim()) return "Each moment needs a label.";
      if (!visibleLabels.includes(node.branch)) return "Each moment needs a valid branch.";
      const year = Number(node.year);
      if (!Number.isFinite(year) || year < 1900 || year > 2100) {
        return "Each moment year must be between 1900 and 2100.";
      }
    }
    return null;
  }

  async function extractNodesFromInput() {
    if (!guidedInput.trim()) return;
    if (!isEnabled("AI_MOMENT_EXTRACTION")) {
      if (!guidedBranch) return;
      const inputText = guidedInput.trim();
      const label = extractLabel(inputText) || `My ${guidedBranch} Story`;
      const createdAtOverride = getCreatedAtForInsertion(
        guidedBranch,
        guidedSubbranch,
        new Date().getFullYear(),
        null,
      );
      addQuickNode({
        label,
        year: new Date().getFullYear(),
        month: null,
        createdAtOverride,
        desc: inputText,
        branch: guidedBranch,
        subbranch: guidedSubbranch,
        subtype: guidedSubbranch ? String(guidedSubbranch).split("-")[1] ?? null : null,
        insertAfterNodeId: guidedFlowContext?.insertAfterNodeId ?? null,
        insertBeforeNodeId: guidedFlowContext?.insertBeforeNodeId ?? null,
      });
      return;
    }
    setPreviewError(null);
    setIsExtracting(true);
    try {
      const existingNodes = timelineGoals.map((g) => ({
        id: g.id,
        label: g.title,
        year: new Date(g.createdAt).getFullYear(),
        branch: g.lifeArea,
        desc: g.description || g.title,
      }));
      const response = await fetch("/api/life-map/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: guidedInput.trim(),
          history: [
            { role: "assistant", text: guidedBranchConfig?.emptyPrompt ?? "Tell me your story." },
            { role: "user", text: guidedInput.trim() },
          ],
          existingNodes,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setPreviewError(data?.error ?? "Could not extract nodes.");
        return;
      }
      if (data.state !== "confident" || !Array.isArray(data.preview) || data.preview.length === 0) {
        setPreviewError(data?.question ?? "I need one more detail before mapping this.");
        return;
      }
      const preview = data.preview.map((node, idx) => ({
        id: `preview-${Date.now()}-${idx}`,
        branch: node.branch,
        label: node.label,
        year: Number(node.year),
        desc: node.desc,
        future: Boolean(node.future),
      }));
      setExtractionPreviewNodes(preview);
      setPreviewMode("review");
    } catch (err) {
      console.error("[PathfinderHome] extract failed", err);
      setPreviewError("Could not extract nodes right now.");
    } finally {
      setIsExtracting(false);
    }
  }

  function finalizePreviewNodes() {
    const validationError = validatePreviewNodes(extractionPreviewNodes);
    if (validationError) {
      setPreviewError(validationError);
      return;
    }
    const createdNodes = extractionPreviewNodes.map((node) => ({
      id: `preview-saved-${node.branch}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
      title: node.label.trim().split(" ").slice(0, 5).join(" "),
      lifeArea: node.branch,
      createdAt: `${Number(node.year)}-01-01`,
      progress: node.future ? 0 : 100,
      description: node.desc?.trim() || node.label,
      practicalData:
        node.branch === "Money" && financeIncludeNumbers
          ? {
              type: financeType,
              amount: financeAmount ? Number(financeAmount) : undefined,
              currency: financeCurrency || "GBP",
              targetAmount: financeTargetAmount ? Number(financeTargetAmount) : undefined,
              currentAmount: financeCurrentAmount ? Number(financeCurrentAmount) : undefined,
            }
          : undefined,
    }));
    setGuidedNodes((prev) => [...prev, ...createdNodes]);
    createdNodes.forEach((node) => {
      pushHistory({
        type: "ADD_NODE",
        payload: { nodeId: node.id, nodeData: node, source: "guidedNodes" },
        timestamp: Date.now(),
        label: `Added "${node.title}"`,
      });
    });
    setRecentNodeIds((prev) => [...prev, ...createdNodes.map((n) => n.id)]);
    setTimeout(() => {
      setRecentNodeIds((prev) => prev.filter((id) => !createdNodes.some((n) => n.id === id)));
    }, 500);
    setHasAutoFit(false);
    setExtractionPreviewNodes([]);
    setGuidedInput("");
    setGuidedBranch(null);
    setGuidedEntryMode("guided");
    setGuidedFlow(null);
    setPreviewMode("edit");
    setPreviewError(null);
  }

  function triggerDevHighlight(item: { type: "branch" | "subbranch" | "node"; id: string }) {
    setDevHighlight(item);
    window.setTimeout(() => {
      setDevHighlight((prev) => (prev?.type === item.type && prev.id === item.id ? null : prev));
    }, 2000);
  }

  function clearRealNodesDevOnly() {
    setGoals((prev) => prev.filter((node) => node.synthetic));
    setGuidedNodes((prev) => prev.filter((node) => node.synthetic));
  }

  async function copyDevStateAsJson() {
    const statePayload = {
      hoverInfo: devSnapshot?.hoverInfo ?? null,
      selected,
      selectedNode: detailPanelNode,
      mapState: {
        zoom,
        pan,
        activeView,
        focusedBranch,
        focusedSubbranch,
      },
      counts: {
        nodes: allMoments.length,
        gapZones: totalGapZones,
        edges: edges.length,
      },
      branches: branchBreakdown,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(statePayload, null, 2));
    } catch (err) {
      console.error("[DevPanel] failed to copy state", err);
    }
  }

  const handleToggleGapZones = useCallback(() => {
    setDevShowGapZones((prev) => !prev);
  }, []);
  const handleToggleBranchLabels = useCallback(() => {
    setDevShowAllBranchLabels((prev) => !prev);
  }, []);
  const handleTimelineStartBranch = useCallback((branchLabel) => {
    openGuidedForBranch(branchLabel);
  }, [openGuidedForBranch]);
  const handleDevLogState = useCallback(() => {
    console.log("[DevPanel] Full State", {
      hoverInfo: devSnapshot?.hoverInfo ?? null,
      selected,
      detailPanelNode,
      selectedSourceGoal,
      mapState: {
        zoom,
        pan,
        activeView,
        focusedBranch,
        focusedSubbranch,
      },
      nodes: { goals, guidedNodes, allMoments },
      gapZones: allGapZones,
      branchBreakdown,
    });
  }, [
    devSnapshot,
    selected,
    detailPanelNode,
    selectedSourceGoal,
    zoom,
    pan,
    activeView,
    focusedBranch,
    focusedSubbranch,
    goals,
    guidedNodes,
    allMoments,
    allGapZones,
    branchBreakdown,
  ]);
  const devMapState = useMemo(
    () => ({
      zoom,
      panX: pan.x,
      panY: pan.y,
      activeView,
      focusedBranch,
      hoveredGap: hoveredGapId,
      totalNodes: allMoments.length,
      totalGapZones,
      visibleBranches: visibleBranches.length,
    }),
    [
      zoom,
      pan.x,
      pan.y,
      activeView,
      focusedBranch,
      hoveredGapId,
      allMoments.length,
      totalGapZones,
      visibleBranches.length,
    ],
  );
  const devPerfState = useMemo(
    () => ({
      renderCount: renderCountRef.current,
      nodesRendered: allMoments.length,
      gapZonesRendered: devShowGapZones ? allGapZones.length : 0,
      edgesRendered: edges.length,
    }),
    [allMoments.length, devShowGapZones, allGapZones.length, edges.length],
  );
  const captureDevSnapshot = useCallback(
    (hoverInfo: DevHoverInfo | null) => {
      setDevSnapshot({
        hoverInfo,
        moments: [...allMoments],
        branches: [...canonicalBranches],
        selectedNode: (detailPanelNode as Record<string, unknown> | null) ?? null,
        selectedNodeRaw: (selectedSourceGoal as Record<string, unknown> | null) ?? null,
        mapState: devMapState,
        perfState: devPerfState,
        branchBreakdown,
      });
    },
    [
      allMoments,
      canonicalBranches,
      detailPanelNode,
      selectedSourceGoal,
      devMapState,
      devPerfState,
      branchBreakdown,
    ],
  );
  const handleRefreshSnapshot = useCallback(() => {
    captureDevSnapshot(devSnapshot?.hoverInfo ?? null);
  }, [captureDevSnapshot, devSnapshot]);
  const devHealthMetrics =
    typeof window !== "undefined"
      ? ((window as Window & {
          __DEV_HEALTH_METRICS__?: {
            rps: number;
            fps: number;
            memoryMB: number | null;
            interaction: string;
          };
        }).__DEV_HEALTH_METRICS__ ?? null)
      : null;

  const leftDock = 16;
  const resetLeft = 100;

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {isDev && devPanelOpen ? (
        <div
          style={{
            position: "fixed",
            right: 16,
            top: 16,
            zIndex: 150,
          }}
        >
          <DevPanel
            isOpen={devPanelOpen}
            hoverInfo={devSnapshot?.hoverInfo ?? null}
            moments={devSnapshot?.moments ?? []}
            branches={devSnapshot?.branches ?? []}
            selectedNode={devSnapshot?.selectedNode ?? null}
            selectedNodeRaw={devSnapshot?.selectedNodeRaw ?? null}
            mapState={
              devSnapshot?.mapState ?? {
                zoom,
                panX: pan.x,
                panY: pan.y,
                activeView,
                focusedBranch,
                hoveredGap: hoveredGapId,
                totalNodes: allMoments.length,
                totalGapZones,
                visibleBranches: visibleBranches.length,
              }
            }
            perfState={
              devSnapshot?.perfState ?? {
                renderCount: renderCountRef.current,
                nodesRendered: allMoments.length,
                gapZonesRendered: devShowGapZones ? allGapZones.length : 0,
                edgesRendered: edges.length,
              }
            }
            branchBreakdown={devSnapshot?.branchBreakdown ?? []}
            showGapZones={devShowGapZones}
            onToggleGapZones={handleToggleGapZones}
            onResetMockData={resetMockData}
            onClearRealNodes={clearRealNodesDevOnly}
            onLogState={handleDevLogState}
            onCopyState={copyDevStateAsJson}
            onToggleBranchLabels={handleToggleBranchLabels}
            onHighlightItem={triggerDevHighlight}
            onRefreshSnapshot={handleRefreshSnapshot}
            health={{
              rps: devHealthMetrics?.rps ?? null,
              fps: devHealthMetrics?.fps ?? null,
              memoryMB: devHealthMetrics?.memoryMB ?? null,
              interaction: devHealthMetrics?.interaction ?? null,
            }}
          />
        </div>
      ) : null}

    <div
      style={{
        width: "100%",
        height: "100vh",
        background: "#020810",
        overflow: "hidden",
        position: "relative",
        cursor: "default",
        userSelect: "none",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <style>{STYLE}</style>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse 80% 60% at 50% 60%, #050D1A 0%, #020810 100%)",
          pointerEvents: "none",
        }}
      />
      {branches.map((b, i) => (
        <div
          key={b.id}
          style={{
            position: "absolute",
            width: 700,
            height: 700,
            borderRadius: "50%",
            background: b.color,
            opacity: 0.022,
            filter: "blur(130px)",
            left: `${15 + i * 10}%`,
            top: "10%",
            pointerEvents: "none",
          }}
        />
      ))}

      <div
        className="ui-overlay"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          padding: "16px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "linear-gradient(to bottom, rgba(2,8,16,0.92) 0%, transparent 100%)",
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #1E3A5F, #0F2040)",
              border: "1px solid #1E3A5F",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ color: "#60A5FA", fontSize: 13, fontWeight: "bold" }}>
              {firstName.slice(0, 1).toUpperCase()}
            </span>
          </div>
          <div>
            <div
              style={{
                color: "#9FB3CE",
                fontSize: 13,
                letterSpacing: 4,
                textTransform: "uppercase",
                fontFamily: "'Cormorant Garamond', serif",
                fontWeight: 600,
              }}
            >
              PATHFINDER
            </div>
            <div
              style={{
                color: "white",
                fontSize: 22,
                fontWeight: 300,
                letterSpacing: 0.4,
                fontFamily: "'Cormorant Garamond', serif",
              }}
            >
              {possessiveDisplayName}
            </div>
            <div
              style={{
                color: "#8FA2BD",
                fontSize: 12,
                letterSpacing: 0.4,
                marginTop: 2,
                fontFamily: "'Cormorant Garamond', serif",
                fontWeight: 400,
              }}
            >
              Your life. Your story. Your map.
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              borderRadius: 999,
              border: "1px solid rgba(148,163,184,0.35)",
              overflow: "hidden",
            }}
          >
            <button
              onClick={() => {
                setActiveView("map");
              }}
              style={{
                border: "none",
                padding: "6px 12px",
                background: activeView === "map" ? "white" : "transparent",
                color: activeView === "map" ? "#0B1220" : "rgba(255,255,255,0.4)",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              ðŸŒ³ Map
            </button>
            <button
              onClick={() => {}}
              style={{
                border: "none",
                padding: "6px 12px",
                background: "transparent",
                color: "rgba(255,255,255,0.3)",
                fontSize: 11,
                cursor: "pointer",
              }}
              disabled
            >
              â‰¡ Timeline
            </button>
          </div>
          <Link
            href="/dashboard"
            style={{
              color: "#9CA3AF",
              fontSize: 12,
              letterSpacing: 0.6,
              textDecoration: "underline",
              textUnderlineOffset: 4,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Daily focus
          </Link>
          <Link
            href="/dashboard"
            style={{
              padding: "7px 16px",
              borderRadius: 20,
              background: "linear-gradient(135deg, #1E3A6E, #0F2040)",
              border: "1px solid #2D4A7A",
              color: "#93C5FD",
              fontSize: 10,
              letterSpacing: 2,
              textTransform: "uppercase",
              boxShadow: "0 0 20px rgba(59,130,246,0.15)",
            }}
          >
            + Add a moment
          </Link>
        </div>
      </div>

      {activeView === "map" && focusedBranch ? (
        <div
          className="ui-overlay"
          style={{
            position: "absolute",
            top: 90,
            left: 28,
            zIndex: 70,
            color: BRANCH_BY_LABEL[focusedBranchLabel ?? ""]?.color ?? "#94A3B8",
            fontSize: 11,
            fontFamily: "'DM Sans', sans-serif",
            opacity: 0.7,
            cursor: "pointer",
            letterSpacing: 1,
            display: "flex",
            gap: 6,
            alignItems: "center",
          }}
        >
          <span
            onClick={() => {
              setFocusedBranch(null);
              setFocusedSubbranch(null);
            }}
          >
            â†
          </span>
          <span
            onClick={() => setFocusedSubbranch(null)}
            style={{ textDecoration: focusedSubbranch ? "underline" : "none" }}
          >
            {focusedBranchLabel}
          </span>
          {focusedSubbranch ? (
            <span style={{ opacity: 0.85 }}>
              /{" "}
              {BRANCH_BY_LABEL[focusedBranchLabel ?? ""]?.subbranches?.find(
                (sb) => sb.id === focusedSubbranch,
              )?.label ?? focusedSubbranch}
            </span>
          ) : null}
        </div>
      ) : null}

      {activeView === "map" ? (
        <div
          ref={mapContainerRef}
          onMouseDownCapture={(e) => {
            const target = e.target as Element | null;
            if (target?.closest(".map-moment-dot") || target?.closest(".map-moment-detail")) return;
            setSelectedMomentId(null);
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          style={{
            position: "absolute",
            inset: 0,
            display: "block",
            userSelect: "none",
            touchAction: "none",
          }}
        >
          <ErrorBoundary name="LifeMapStatic">
              <svg ref={svgRef} width="100%" height="100%" style={{ position: "absolute", top: 0, left: 0 }}>
                <g transform={`translate(${selfX}, ${selfY}) scale(${zoom})`}>
                  {visibleGridLines.xs.map((x) => (
                    <line
                      key={`sgx${x}`}
                      x1={x}
                      y1={visibleGridLines.worldTop}
                      x2={x}
                      y2={visibleGridLines.worldBottom}
                      stroke="#0A1628"
                      strokeWidth={0.5}
                    />
                  ))}
                  {visibleGridLines.ys.map((y) => (
                    <line
                      key={`sgy${y}`}
                      x1={visibleGridLines.worldLeft}
                      y1={y}
                      x2={visibleGridLines.worldRight}
                      y2={y}
                      stroke="#0A1628"
                      strokeWidth={0.5}
                    />
                  ))}
                  {renderBranches.map((branch) => {
                    const rowY = -PROMPT_DISTANCE;
                    const card = limbCardPositions[branch.id] ?? {
                      x: getPos(branch.angle, PROMPT_DISTANCE).x,
                      y: rowY,
                    };
                    const anchor = getLimbCardBottomCenterForSpoke(card);
                    return (
                      <line
                        key={`static-spoke-${branch.id}`}
                        x1={0}
                        y1={0}
                        x2={anchor.x}
                        y2={anchor.y}
                        stroke={branch.color}
                        strokeWidth={3}
                        strokeOpacity={0.92}
                        strokeLinecap="round"
                      />
                    );
                  })}
                  <g>
                    <circle
                      className="self-origin-pulse"
                      cx={0}
                      cy={0}
                      r={SELF_GLOW_RADIUS}
                      fill="none"
                      stroke="rgba(96,165,250,0.35)"
                      strokeWidth={2}
                    />
                    <circle cx={0} cy={0} r={SELF_OUTER_RING_RADIUS} fill="#020810" stroke="rgba(96,165,250,0.55)" strokeWidth={3} />
                    <circle cx={0} cy={0} r={SELF_CORE_RADIUS} fill="#061226" stroke="rgba(147,197,253,0.5)" strokeWidth={2} />
                    <text x={0} y={-2} textAnchor="middle" fill="rgba(226,232,240,0.96)" fontSize={15} fontWeight={700} letterSpacing={1}>
                      {selfMonogram || firstName.slice(0, 2).toUpperCase()}
                    </text>
                    <text x={0} y={15} textAnchor="middle" fill="rgba(147,197,253,0.72)" fontSize={8} letterSpacing={1.2}>
                      ORIGIN
                    </text>
                    {selfYear ? (
                      <text x={0} y={26} textAnchor="middle" fill="rgba(96,165,250,0.55)" fontSize={7}>
                        {selfYear}
                      </text>
                    ) : null}
                  </g>
                  {branches.map((branch) => {
                    const labelPos = limbCardPositions[branch.id];
                    if (!labelPos) return null;
                    const limbIconKey = BRANCH_ID_BY_LABEL[branch.label] ?? branch.id;
                    const count = Number(limbMomentCounts[branch.id] ?? 0);
                    return (
                      <g
                        key={`static-limb-${branch.id}`}
                        transform={`translate(${labelPos.x}, ${labelPos.y})`}
                        style={{ cursor: "default" }}
                      >
                        <rect x={-40} y={-40} width={80} height={80} rx={18} fill="#030B18" stroke={branch.color} strokeWidth={1.7} strokeOpacity={0.92} />
                        <rect x={-32} y={-32} width={64} height={64} rx={14} fill="#061226" fillOpacity={1} stroke="none" />
                        {renderLimbGlyph(limbIconKey, branch.color)}
                        {count > 0 ? (
                          <>
                            <circle cx={30} cy={-30} r={9} fill="#030B18" stroke={branch.color} strokeWidth={1} opacity={0.92} />
                            <text x={30} y={-26} textAnchor="middle" fill={branch.color} fontSize={10} fontFamily="'DM Sans', sans-serif" fontWeight={700}>
                              {String(count)}
                            </text>
                          </>
                        ) : null}
                        <title>{branch.label}</title>
                      </g>
                    );
                  })}
                  {branches.map((branch) => {
                    const labelPos = limbCardPositions[branch.id];
                    if (!labelPos) return null;
                    const labelWidth = Math.max(
                      LIMB_LABEL_MIN_WIDTH,
                      Math.round(branch.label.length * LIMB_LABEL_CHAR_WIDTH + LIMB_LABEL_PADDING_X * 2),
                    );
                    const labelBoxY = LIMB_LABEL_Y - 12;
                    return (
                      <g key={`static-limb-label-${branch.id}`} transform={`translate(${labelPos.x}, ${labelPos.y})`} pointerEvents="none">
                        <rect
                          x={-labelWidth / 2}
                          y={labelBoxY}
                          width={labelWidth}
                          height={LIMB_LABEL_HEIGHT}
                          rx={8}
                          fill="rgba(2,6,14,0.88)"
                          stroke="rgba(30,41,59,0.9)"
                          strokeWidth={1}
                        />
                        <text
                          x={0}
                          y={LIMB_LABEL_Y}
                          textAnchor="middle"
                          fill="rgba(226,232,240,0.96)"
                          fontSize={11}
                          fontFamily="'DM Sans', sans-serif"
                          fontWeight={600}
                        >
                          {branch.label}
                        </text>
                      </g>
                    );
                  })}
                  {branches.map((branch) => {
                    const labelPos = limbCardPositions[branch.id];
                    if (!labelPos) return null;
                    const limbBranchRows = (canonicalBranches as any[])
                      .filter((b) => String(b?.limbId ?? "") === String(branch.id))
                      .sort((a, b) => {
                        const orderDelta = Number(a?.order ?? 0) - Number(b?.order ?? 0);
                        if (Math.abs(orderDelta) > 0.001) return orderDelta;
                        return String(a?.name ?? a?.label ?? "").localeCompare(
                          String(b?.name ?? b?.label ?? ""),
                        );
                      });
                    if (limbBranchRows.length === 0) return null;
                    const stemStartX = labelPos.x;
                    const stemStartY = labelPos.y - LIMB_CARD_HALF - 4;
                    const spread = BRANCH_FAN_DEGREES;
                    const spreadStep =
                      limbBranchRows.length > 1 ? spread / (limbBranchRows.length - 1) : 0;
                    return (
                      <g key={`static-branch-fan-${branch.id}`} pointerEvents="none">
                        {limbBranchRows.map((row, idx) => {
                          const baseOffset = limbBranchRows.length > 1 ? -spread / 2 + idx * spreadStep : 0;
                          const mapAngleOffset = Number(row?.mapAngleOffset ?? 0);
                          const fanDeg = baseOffset + mapAngleOffset * 0.35;
                          const fanRad = (fanDeg * Math.PI) / 180;
                          const tipX = stemStartX + Math.sin(fanRad) * BRANCH_STEM_LENGTH;
                          const tipY = stemStartY - Math.cos(fanRad) * BRANCH_STEM_LENGTH;
                          const branchName = String(row?.name ?? row?.label ?? "Thread");
                          const placeLabelRight = idx % 2 === 0;
                          const textAnchor: "start" | "end" = placeLabelRight ? "start" : "end";
                          const textX = placeLabelRight ? tipX + 8 : tipX - 8;
                          return (
                            <g key={`static-branch-fan-line-${branch.id}-${row?.id ?? idx}`}>
                              <line
                                x1={stemStartX}
                                y1={stemStartY}
                                x2={tipX}
                                y2={tipY}
                                stroke={branch.color}
                                strokeWidth={1.2}
                                strokeOpacity={0.72}
                                strokeLinecap="round"
                              />
                              <text
                                x={textX}
                                y={tipY - 4}
                                textAnchor={textAnchor}
                                fill={branch.color}
                                fontSize={8}
                                fontFamily="'DM Sans', sans-serif"
                                fontWeight={600}
                                opacity={0.92}
                              >
                                {branchName}
                              </text>
                            </g>
                          );
                        })}
                      </g>
                    );
                  })}
                  {branches.map((branch) => {
                    const labelPos = limbCardPositions[branch.id];
                    if (!labelPos) return null;
                    const limbBranchRows = (canonicalBranches as any[])
                      .filter((b) => String(b?.limbId ?? "") === String(branch.id))
                      .sort((a, b) => {
                        const orderDelta = Number(a?.order ?? 0) - Number(b?.order ?? 0);
                        if (Math.abs(orderDelta) > 0.001) return orderDelta;
                        return String(a?.name ?? a?.label ?? "").localeCompare(
                          String(b?.name ?? b?.label ?? ""),
                        );
                      });
                    if (limbBranchRows.length === 0) return null;
                    const stemStartX = labelPos.x;
                    const stemStartY = labelPos.y - LIMB_CARD_HALF - 4;
                    const spread = BRANCH_FAN_DEGREES;
                    const spreadStep =
                      limbBranchRows.length > 1 ? spread / (limbBranchRows.length - 1) : 0;

                    return (
                      <g key={`static-branch-marks-${branch.id}`}>
                        {limbBranchRows.map((row, idx) => {
                          const marks = branchMarksForMap[String(row?.id ?? "")] ?? [];
                          if (marks.length === 0) return null;
                          const baseOffset = limbBranchRows.length > 1 ? -spread / 2 + idx * spreadStep : 0;
                          const mapAngleOffset = Number(row?.mapAngleOffset ?? 0);
                          const fanDeg = baseOffset + mapAngleOffset * 0.35;
                          const fanRad = (fanDeg * Math.PI) / 180;
                          const ux = Math.sin(fanRad);
                          const uy = -Math.cos(fanRad);
                          const hasSelectionOnBranch = marks.some((m) => m.id === selectedMomentId);
                          return (
                            <g key={`branch-mark-cluster-${branch.id}-${row?.id ?? idx}`}>
                              {marks.map((moment, index) => {
                                const reversedIndex = marks.length - 1 - index;
                                const dist = (reversedIndex + 1) * MOMENT_STEP;
                                const momentX = stemStartX + ux * dist;
                                const momentY = stemStartY + uy * dist;
                                const isSelected = selectedMomentId === moment.id;
                                const momentOpacity = hasSelectionOnBranch && !isSelected ? 0.3 : 1;
                                const labelText = `${moment.yearLabel} · ${moment.title}`;
                                const estimatedLabelWidth = Math.max(
                                  72,
                                  Math.min(210, labelText.length * (MOMENT_LABEL_FONT_SIZE * 0.58)),
                                );
                                const placeOnRight = fanDeg >= 0;
                                const minX = visibleGridLines.worldLeft + 8;
                                const maxX = visibleGridLines.worldRight - 8;
                                const rawLabelX = momentX + (placeOnRight ? MOMENT_LABEL_OFFSET_X : -MOMENT_LABEL_OFFSET_X);
                                const labelX = placeOnRight
                                  ? Math.max(minX, Math.min(rawLabelX, maxX - estimatedLabelWidth))
                                  : Math.max(minX + estimatedLabelWidth, Math.min(rawLabelX, maxX));
                                return (
                                  <g key={`branch-mark-${row?.id ?? idx}-${moment.id}`}>
                                    <circle
                                      className="map-moment-dot"
                                      cx={momentX}
                                      cy={momentY}
                                      r={11}
                                      fill="transparent"
                                      style={{ cursor: "pointer" }}
                                      onMouseEnter={() => setHoveredMarkId(moment.id)}
                                      onMouseLeave={() => setHoveredMarkId((prev) => (prev === moment.id ? null : prev))}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedMomentId((prev) => (prev === moment.id ? null : moment.id));
                                      }}
                                    />
                                    <circle
                                      className="map-moment-dot"
                                      cx={momentX}
                                      cy={momentY}
                                      r={5}
                                      fill={branch.color}
                                      stroke="#020810"
                                      strokeWidth={1}
                                      opacity={momentOpacity}
                                      style={{ cursor: "pointer" }}
                                      onMouseEnter={() => setHoveredMarkId(moment.id)}
                                      onMouseLeave={() => setHoveredMarkId((prev) => (prev === moment.id ? null : prev))}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedMomentId((prev) => (prev === moment.id ? null : moment.id));
                                      }}
                                    />
                                    {hoveredMarkId === moment.id ? (
                                      <text
                                        x={labelX}
                                        y={momentY + 3}
                                        fill={branch.color}
                                        fontSize={MOMENT_LABEL_FONT_SIZE}
                                        fontFamily="'DM Sans', sans-serif"
                                        fontWeight={500}
                                        opacity={momentOpacity}
                                        textAnchor={placeOnRight ? "start" : "end"}
                                      >
                                        {labelText}
                                      </text>
                                    ) : null}
                                    {isSelected ? (
                                      <foreignObject
                                        x={momentX + (placeOnRight ? 12 : -242)}
                                        y={momentY - 12}
                                        width={230}
                                        height={130}
                                        style={{ overflow: "visible" }}
                                      >
                                        <div
                                          className="map-moment-detail"
                                          style={{
                                            background: "rgba(2,8,16,0.95)",
                                            border: `1px solid ${branch.color}`,
                                            borderRadius: 10,
                                            padding: "10px 11px",
                                            boxShadow: "0 10px 24px rgba(0,0,0,0.55)",
                                            color: "#E2E8F0",
                                            fontFamily: "'DM Sans', sans-serif",
                                            fontSize: 11,
                                            lineHeight: 1.3,
                                            pointerEvents: "auto",
                                          }}
                                        >
                                          <div style={{ color: branch.color, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                                            {moment.title}
                                          </div>
                                          <div style={{ color: "rgba(226,232,240,0.82)", marginBottom: 2 }}>
                                            {moment.dateLabel}
                                          </div>
                                          <div style={{ color: "rgba(148,163,184,0.95)", marginBottom: 5 }}>
                                            {moment.location ?? "No location"}
                                          </div>
                                          <div style={{ color: "rgba(203,213,225,0.95)" }}>
                                            {moment.description?.trim() || "No description"}
                                          </div>
                                        </div>
                                      </foreignObject>
                                    ) : null}
                                  </g>
                                );
                              })}
                            </g>
                          );
                        })}
                      </g>
                    );
                  })}
                </g>
              </svg>
          </ErrorBoundary>
        </div>
      ) : null}



      {actionHistory.length > 0 ? (
        <button
          className="ui-overlay"
          onClick={handleUndoAction}
          style={{
            position: "absolute",
            left: leftDock,
            bottom: 80,
            zIndex: 92,
            maxWidth: 200,
            borderRadius: 999,
            border: "1px solid #1E293B",
            background: "rgba(0,0,0,0.8)",
            color: "rgba(255,255,255,0.6)",
            fontSize: 9,
            fontFamily: "'DM Sans', sans-serif",
            padding: "8px 10px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            cursor: "pointer",
            transition: "opacity 0.2s ease, left 0.3s ease",
          }}
          title={`Undo: ${actionHistory[actionHistory.length - 1]?.label ?? ""}`}
        >
          {`â†© Undo: ${actionHistory[actionHistory.length - 1]?.label ?? ""}`}
        </button>
      ) : null}

      {undoToast ? (
        <div
          className="ui-overlay"
          style={{
            position: "absolute",
            left: "50%",
            bottom: 24,
            transform: "translateX(-50%)",
            borderRadius: 999,
            border: "1px solid #1E293B",
            background: "rgba(2,8,16,0.92)",
            color: "#E2E8F0",
            fontSize: 11,
            padding: "7px 12px",
            zIndex: 95,
          }}
        >
          {undoToast}
        </div>
      ) : null}

      {gapChooser ? (
        <>
          <div
            onClick={() => setGapChooser(null)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 998,
              background: "transparent",
            }}
          />
          <div
            style={{
              position: "fixed",
              left: Math.min(Math.max(gapChooser.screenX, 140), window.innerWidth - 180),
              top: Math.min(Math.max(gapChooser.screenY, 80), window.innerHeight - 140),
              transform: "translate(-50%, 0)",
              zIndex: 999,
              background: "rgba(2,8,16,0.98)",
              border: "1px solid rgba(148,163,184,0.35)",
              borderRadius: 10,
              padding: 8,
              boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
              fontFamily: "'DM Sans', sans-serif",
              minWidth: 240,
            }}
          >
            <div
              style={{
                fontSize: 9,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.45)",
                padding: "2px 8px 6px",
              }}
            >
              {gapChooser.gap.branchLabel ?? "Thread"}
            </div>
            <button
              type="button"
              onClick={() => {
                const gap = gapChooser.gap;
                setGapChooser(null);
                openGuidedForBranch(gap.branchLabel, {
                  insertIndex: gap.insertIndex,
                  insertAfterNodeId: gap.prevNodeId ?? null,
                  insertBeforeNodeId: gap.nextNodeId ?? null,
                  promptOverride:
                    gap.prevNodeLabel && gap.nextNodeLabel
                      ? `What happened between "${gap.prevNodeLabel}" and "${gap.nextNodeLabel}"?`
                      : gap.prevNodeLabel
                        ? `What came after "${gap.prevNodeLabel}"?`
                        : gap.nextNodeLabel
                          ? `What came before "${gap.nextNodeLabel}"?`
                          : `Add to ${gap.branchLabel}`,
                });
              }}
              style={{
                width: "100%",
                textAlign: "left",
                background: "transparent",
                border: "none",
                color: "#E2E8F0",
                padding: "8px 10px",
                fontSize: 12,
                cursor: "pointer",
                borderRadius: 6,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(148,163,184,0.08)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }}
            >
              <span>
                {gapChooser.gap.prevNodeLabel && gapChooser.gap.nextNodeLabel
                  ? "Add between these moments"
                  : gapChooser.gap.prevNodeLabel
                    ? "Add after this moment"
                    : gapChooser.gap.nextNodeLabel
                      ? "Add before first moment"
                      : "Add first moment"}
              </span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
                {gapChooser.gap.prevNodeLabel && gapChooser.gap.nextNodeLabel
                  ? `Between "${gapChooser.gap.prevNodeLabel}" and "${gapChooser.gap.nextNodeLabel}"`
                  : gapChooser.gap.prevNodeLabel
                    ? `After "${gapChooser.gap.prevNodeLabel}"`
                    : gapChooser.gap.nextNodeLabel
                      ? `Before "${gapChooser.gap.nextNodeLabel}"`
                      : "On this thread"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                handleStartNewBranchFromChooser(gapChooser.gap);
              }}
              style={{
                width: "100%",
                textAlign: "left",
                background: "transparent",
                border: "none",
                color: "#E2E8F0",
                padding: "8px 10px",
                fontSize: 12,
                cursor: "pointer",
                borderRadius: 6,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(148,163,184,0.08)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }}
            >
              <span>{gapChooser.gap.prevNodeLabel ? "Branch from previous moment" : "Branch from self"}</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
                {gapChooser.gap.prevNodeLabel
                  ? `From "${gapChooser.gap.prevNodeLabel}" on ${gapChooser.gap.branchLabel}`
                  : `Parallel thread on ${gapChooser.gap.branchLabel}`}
              </span>
            </button>
          </div>
        </>
      ) : null}

      {useMockData && isEnabled("MOCK_DATA") ? (
        <div
          className="ui-overlay"
          style={{
            position: "absolute",
            left: leftDock,
            bottom: 16,
            zIndex: 90,
            transition: "left 0.3s ease",
          }}
        >
          <div
            style={{
              background: "#F59E0B",
              color: "#0B1220",
              fontSize: 8,
              letterSpacing: 2,
              textTransform: "uppercase",
              fontFamily: "'DM Sans', sans-serif",
              padding: "4px 8px",
              borderRadius: 10,
              fontWeight: 600,
            }}
          >
            MOCK DATA
          </div>
        </div>
      ) : null}
      {useMockData && isEnabled("MOCK_DATA") ? (
        <div
          className="ui-overlay"
          style={{
            position: "absolute",
            left: resetLeft,
            bottom: 16,
            zIndex: 90,
            transition: "left 0.3s ease",
          }}
        >
          <button
            onClick={resetMockData}
            style={{
              background: "rgba(15,23,42,0.9)",
              border: "1px solid rgba(148,163,184,0.4)",
              color: "#CBD5E1",
              fontSize: 10,
              padding: "4px 8px",
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            â†º Reset
          </button>
        </div>
      ) : null}

      <div
        style={{
          position: "fixed",
          right: devPanelOpen ? 344 : 12,
          top: "50%",
          transform: "translateY(-50%)",
          transition: "right 0.3s ease",
          background: "#1E293B",
          border: "1px solid #374151",
          padding: "8px 4px",
          borderRadius: "4px",
          color: "#6B7280",
          zIndex: 101,
          cursor: "pointer",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
        onClick={() => setDevPanelOpen((prev) => !prev)}
      >
        {devPanelOpen ? "â—€" : "â–¶"}
      </div>

      {!(hovered || selected) && activeView === "map" && (
        <div
          className="ui-overlay"
          style={{
            position: "absolute",
            bottom: 28,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(2,8,16,0.9)",
            border: "1px solid #0F172A",
            padding: "12px 24px",
            borderRadius: 30,
            display: "flex",
            alignItems: "center",
            gap: 16,
            zIndex: 50,
            backdropFilter: "blur(20px)",
          }}
        >
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#F59E0B", boxShadow: "0 0 8px #F59E0B" }} />
          <div>
            <div style={{ color: "#374151", fontSize: 8, letterSpacing: 3, marginBottom: 2 }}>TODAY&apos;S FOCUS</div>
            <div style={{ color: "white", fontSize: 11 }}>
              {focusText}
            </div>
          </div>
          <div style={{ width: 1, height: 24, background: "#0F172A" }} />
          <div style={{ color: "#374151", fontSize: 10, letterSpacing: 1 }}>{doneGoals}/{totalGoals} complete</div>
        </div>
      )}

      {tooltipNode && activeView === "map" && (
        <div
          className="ui-overlay"
          style={{
            position: "absolute",
            bottom: 28,
            left: 28,
            maxWidth: 280,
            zIndex: 50,
            background: "rgba(2,8,16,0.92)",
            border: `1px solid ${tooltipNode.branchColor}33`,
            borderLeft: `2px solid ${tooltipNode.branchColor}`,
            borderRadius: 12,
            padding: "12px 14px",
            backdropFilter: "blur(16px)",
          }}
        >
          <div
            style={{
              color: "rgba(255,255,255,0.45)",
              fontSize: 10,
              fontFamily: "'DM Sans', sans-serif",
              marginBottom: 4,
            }}
          >
            {tooltipNode.year} Â· {tooltipNode.branchLabel}
          </div>
          <div
            style={{
              color: "white",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              marginBottom: 6,
            }}
          >
            {tooltipNode.label}
          </div>
          <div
            style={{
              color: "rgba(255,255,255,0.55)",
              fontSize: 11,
              lineHeight: 1.5,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {(tooltipNode.desc || "").slice(0, 110)}
            {(tooltipNode.desc || "").length > 110 ? "â€¦" : ""}
          </div>
        </div>
      )}

      {selected && detailPanelNode && activeView === "map" ? (
        <>
          <div
            className="ui-overlay node-detail-dim"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(4,10,20,0.5)",
              zIndex: 40,
              opacity: 1,
              pointerEvents: "auto",
              transition: "opacity 0.3s ease",
            }}
            onClick={() => {
              setSelected(null);
              setNodeDeleteConfirm(false);
            }}
            aria-hidden
          />
          <aside
            className="ui-overlay node-detail-panel-enter"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: 72,
              right: 0,
              bottom: 0,
              width: 340,
              zIndex: 55,
              background: "rgba(4,10,20,0.97)",
              borderLeft: `1px solid ${detailPanelNode.branchColor}4D`,
              backdropFilter: "blur(20px)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "-12px 0 40px rgba(0,0,0,0.45)",
            }}
          >
            <div
              style={{
                flexShrink: 0,
                padding: "16px 18px 12px",
                borderBottom: "1px solid rgba(15,23,42,0.9)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      color: detailPanelNode.branchColor,
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 11,
                      marginBottom: 8,
                    }}
                  >
                    <span>{branchMetaByLabel[detailPanelNode.branchLabel]?.icon ?? "Â·"}</span>
                    <span>{detailPanelNode.branchLabel}</span>
                  </div>
                  {nodeDetailEditMode ? (
                    <input
                      value={nodeEditLabel}
                      onChange={(e) => setNodeEditLabel(e.target.value)}
                      style={{
                        width: "100%",
                        fontFamily: "'Cormorant Garamond', serif",
                        fontSize: 22,
                        color: "white",
                        background: "rgba(15,23,42,0.6)",
                        border: "1px solid rgba(148,163,184,0.25)",
                        borderRadius: 8,
                        padding: "6px 8px",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        fontFamily: "'Cormorant Garamond', serif",
                        fontSize: 26,
                        color: "white",
                        lineHeight: 1.15,
                      }}
                    >
                      {detailPanelNode.label}
                    </div>
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, alignItems: "center" }}>
                    <span
                      style={{
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 11,
                        padding: "4px 10px",
                        borderRadius: 999,
                        background: `${detailPanelNode.branchColor}2A`,
                        color: detailPanelNode.branchColor,
                        fontWeight: 600,
                      }}
                    >
                      {detailPanelNode.year}
                    </span>
                    {detailPanelNode.future ? (
                      <span
                        style={{
                          fontFamily: "'DM Sans', sans-serif",
                          fontSize: 10,
                          padding: "4px 8px",
                          borderRadius: 8,
                          border: "1px dashed rgba(148,163,184,0.5)",
                          color: "rgba(255,255,255,0.65)",
                        }}
                      >
                        Future Moment
                      </span>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setNodeDeleteConfirm(false);
                    setNodeDetailEditMode(false);
                  }}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "rgba(255,255,255,0.5)",
                    fontSize: 22,
                    lineHeight: 1,
                    cursor: "pointer",
                    padding: 4,
                  }}
                  aria-label="Close"
                >
                  Ã—
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
              <div
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 9,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.3)",
                  marginBottom: 8,
                }}
              >
                Description
              </div>
              {nodeDetailEditMode ? (
                <textarea
                  value={nodeEditDesc}
                  maxLength={200}
                  onChange={(e) => setNodeEditDesc(e.target.value)}
                  rows={5}
                  style={{
                    width: "100%",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 12,
                    color: "rgba(255,255,255,0.9)",
                    background: "rgba(15,23,42,0.55)",
                    border: "1px solid rgba(148,163,184,0.2)",
                    borderRadius: 8,
                    padding: 10,
                    lineHeight: 1.6,
                    resize: "vertical",
                  }}
                />
              ) : (
                <div
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 13,
                    color: "rgba(255,255,255,0.7)",
                    lineHeight: 1.8,
                    fontStyle: detailPanelNode.desc ? "normal" : "italic",
                  }}
                >
                  {detailPanelNode.desc || "No notes added yet"}
                </div>
              )}
              {nodeDetailEditMode ? (
                <div style={{ marginTop: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
                  {nodeEditDesc.length}/200 characters
                </div>
              ) : null}
              {nodeDetailEditMode ? (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>
                    Year
                  </div>
                  <input
                    type="number"
                    min={1900}
                    max={2100}
                    value={nodeEditYear}
                    onChange={(e) => setNodeEditYear(e.target.value)}
                    style={{
                      width: "100%",
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 13,
                      color: "white",
                      background: "rgba(15,23,42,0.55)",
                      border: "1px solid rgba(148,163,184,0.2)",
                      borderRadius: 8,
                      padding: "8px 10px",
                    }}
                  />
                </div>
              ) : null}
              {nodeDetailEditMode ? (
                <div style={{ marginTop: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
                  {limitLabelFiveWords(nodeEditLabel).split(/\s+/).filter(Boolean).length}/5 words (label)
                </div>
              ) : null}

              <div
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 9,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.3)",
                  marginTop: 22,
                  marginBottom: 8,
                }}
              >
                Your reflection
              </div>
              {selectedSourceGoal && !detailPanelNode.synthetic ? (
                <>
                  <textarea
                    value={reflectionDraft}
                    onChange={(e) => setReflectionDraft(e.target.value)}
                    placeholder="What does this moment mean to you? How did it shape who you are?"
                    rows={4}
                    style={{
                      width: "100%",
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 12,
                      color: "rgba(255,255,255,0.85)",
                      background: "transparent",
                      border: "none",
                      borderLeft: `2px solid ${detailPanelNode.branchColor}`,
                      padding: "8px 12px",
                      lineHeight: 1.55,
                      resize: "vertical",
                    }}
                  />
                  {reflectionSaveStatus === "saving" ? (
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "rgba(255,255,255,0.2)", marginTop: 6 }}>
                      Saving...
                    </div>
                  ) : null}
                  {reflectionSaveStatus === "saved" ? (
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: `${detailPanelNode.branchColor}99`, marginTop: 6 }}>
                      Saved âœ“
                    </div>
                  ) : null}
                </>
              ) : (
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(255,255,255,0.35)", fontStyle: "italic" }}>
                  Reflections can be added for moments you add to your map.
                </div>
              )}

              {Array.isArray(detailPanelNode.connectedTo) && detailPanelNode.connectedTo.length > 0 ? (
                <div style={{ marginTop: 22 }}>
                  <div
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 9,
                      letterSpacing: 3,
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.3)",
                      marginBottom: 8,
                    }}
                  >
                    Connected to
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {detailPanelNode.connectedTo.map((cid) => {
                      const other = allMoments.find((n) => n.id === cid);
                      const col = other?.branchColor ?? "#94A3B8";
                      const lab = other?.label ?? cid;
                      return (
                        <button
                          type="button"
                          key={cid}
                          onClick={() => setSelected(cid)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "6px 10px",
                            borderRadius: 999,
                            border: "1px solid rgba(51,65,85,0.8)",
                            background: "rgba(15,23,42,0.6)",
                            color: "rgba(255,255,255,0.85)",
                            fontFamily: "'DM Sans', sans-serif",
                            fontSize: 11,
                            cursor: "pointer",
                          }}
                        >
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: col }} />
                          {lab}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div style={{ marginTop: 22 }}>
                <div
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 9,
                    letterSpacing: 3,
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.3)",
                    marginBottom: 10,
                  }}
                >
                  Significance
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {SIGNIFICANCE_OPTIONS.map((opt) => {
                    const on = significanceCurrent === opt.v;
                    return (
                      <button
                        type="button"
                        key={opt.v}
                        disabled={!selectedSourceGoal || detailPanelNode.synthetic}
                        onClick={async () => {
                          if (!selected) return;
                          const prev = findSourceGoal(selected);
                          if (!prev) return;
                          applyLocalPatch(selected, { significance: opt.v });
                          try {
                            if (!/^(guided|suggested|preview-saved|origin-born)/.test(selected)) {
                              await patchLifeMapNodeApi(selected, { significance: opt.v });
                            }
                          } catch (err) {
                            console.error(err);
                            applyLocalPatch(selected, { significance: prev.significance ?? 1 });
                          }
                        }}
                        style={{
                          borderRadius: 999,
                          border: on ? `1px solid ${detailPanelNode.branchColor}` : "1px solid rgba(51,65,85,0.7)",
                          background: on ? `${detailPanelNode.branchColor}22` : "rgba(15,23,42,0.5)",
                          color: on ? detailPanelNode.branchColor : "rgba(255,255,255,0.55)",
                          padding: "8px 12px",
                          fontFamily: "'DM Sans', sans-serif",
                          fontSize: 11,
                          cursor: !selectedSourceGoal || detailPanelNode.synthetic ? "not-allowed" : "pointer",
                        }}
                      >
                        {opt.sym} {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {(() => {
                const limbIdForSubtype =
                  detailPanelNode.limbId ??
                  LIMBS.find((l) => l.label === detailPanelNode.branchLabel)?.id ??
                  null;
                const subtypeOptions = limbIdForSubtype ? LIMB_SUBTYPES[limbIdForSubtype] ?? [] : [];
                if (!subtypeOptions.length) return null;
                const currentSubtype = detailPanelNode.subtype ?? null;
                return (
                  <div style={{ marginTop: 22 }}>
                    <div
                      style={{
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 9,
                        letterSpacing: 3,
                        textTransform: "uppercase",
                        color: "rgba(255,255,255,0.3)",
                        marginBottom: 10,
                      }}
                    >
                      Category
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {subtypeOptions.map((s) => {
                        const on = currentSubtype === s;
                        return (
                          <button
                            type="button"
                            key={s}
                            disabled={!selectedSourceGoal || detailPanelNode.synthetic}
                            onClick={async () => {
                              if (!selected) return;
                              const prev = findSourceGoal(selected);
                              if (!prev) return;
                              const next = on ? null : s;
                              applyLocalPatch(selected, { subtype: next });
                              try {
                                if (!/^(guided|suggested|preview-saved|origin-born)/.test(selected)) {
                                  await patchLifeMapNodeApi(selected, { subtype: next });
                                }
                              } catch (err) {
                                console.error(err);
                                applyLocalPatch(selected, { subtype: prev.subtype ?? null });
                              }
                            }}
                            style={{
                              borderRadius: 999,
                              border: on
                                ? `1px solid ${detailPanelNode.branchColor}`
                                : "1px solid rgba(51,65,85,0.7)",
                              background: on
                                ? `${detailPanelNode.branchColor}22`
                                : "rgba(15,23,42,0.5)",
                              color: on ? detailPanelNode.branchColor : "rgba(255,255,255,0.55)",
                              padding: "6px 12px",
                              fontFamily: "'DM Sans', sans-serif",
                              fontSize: 11,
                              textTransform: "capitalize",
                              cursor:
                                !selectedSourceGoal || detailPanelNode.synthetic
                                  ? "not-allowed"
                                  : "pointer",
                            }}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div style={{ marginTop: 22 }}>
                <div
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 9,
                    letterSpacing: 3,
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.3)",
                    marginBottom: 8,
                  }}
                >
                  Timeline position
                </div>
                <div style={{ position: "relative", height: 28, marginTop: 4 }}>
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: 12,
                      height: 1,
                      background: "rgba(148,163,184,0.25)",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: `${timelineDotPct}%`,
                      top: 6,
                      width: 10,
                      height: 10,
                      marginLeft: -5,
                      borderRadius: "50%",
                      background: detailPanelNode.branchColor,
                      boxShadow: `0 0 10px ${detailPanelNode.branchColor}`,
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: 18,
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 10,
                      color: "rgba(255,255,255,0.35)",
                    }}
                  >
                    <span>{timelineMinY}</span>
                    <span>{timelineMaxY}</span>
                  </div>
                </div>
              </div>

              {detailPanelNode.branchLabel === "Money" ? (
                <Link
                  href="/finance-tracker"
                  style={{
                    marginTop: 16,
                    display: "inline-block",
                    color: "#6EE7B7",
                    fontSize: 11,
                    textDecoration: "underline",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  Open finance tracker
                </Link>
              ) : null}
            </div>

            <div
              style={{
                flexShrink: 0,
                borderTop: "1px solid rgba(15,23,42,0.9)",
                padding: "14px 18px 18px",
                display: "grid",
                gap: 10,
              }}
            >
              {nodeDetailEditMode ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!selected || !selectedSourceGoal) return;
                      const prev = { ...selectedSourceGoal };
                      const label = limitLabelFiveWords(nodeEditLabel);
                      const description = nodeEditDesc.slice(0, 200);
                      const year = Math.min(2100, Math.max(1900, Number.parseInt(String(nodeEditYear), 10) || prev.year));
                      applyLocalPatch(selected, {
                        title: label,
                        label,
                        description,
                        year,
                        lifeArea: prev.lifeArea,
                        branch: prev.limb ?? prev.lifeArea ?? prev.branch,
                      });
                      setDetailPatchStatus("saving");
                      try {
                        if (!/^(guided|suggested|preview-saved|origin-born)/.test(selected)) {
                          await patchLifeMapNodeApi(selected, {
                            label,
                            description,
                            year,
                            branch: prev.limb ?? prev.lifeArea ?? prev.branch,
                          });
                        }
                        setDetailPatchStatus("saved");
                        setNodeDetailEditMode(false);
                        window.setTimeout(() => setDetailPatchStatus("idle"), 2000);
                      } catch (err) {
                        console.error(err);
                        applyLocalPatch(selected, prev);
                        setDetailPatchStatus("idle");
                      }
                    }}
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      border: `1px solid ${detailPanelNode.branchColor}88`,
                      background: `${detailPanelNode.branchColor}33`,
                      color: detailPanelNode.branchColor,
                      padding: "10px",
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNodeDetailEditMode(false);
                      const src = findSourceGoal(selected);
                      if (src) {
                        setNodeEditLabel(src.title ?? src.label ?? "");
                        setNodeEditDesc(String(src.description ?? ""));
                        setNodeEditYear(String(src.year ?? new Date(src.createdAt).getFullYear()));
                      }
                    }}
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      border: "1px solid rgba(51,65,85,0.8)",
                      background: "transparent",
                      color: "rgba(255,255,255,0.5)",
                      padding: "10px",
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={!selectedSourceGoal || detailPanelNode.synthetic}
                  onClick={() => {
                    const src = findSourceGoal(selected);
                    if (!src) return;
                    setNodeEditLabel(src.title ?? src.label ?? "");
                    setNodeEditDesc(String(src.description ?? ""));
                    setNodeEditYear(String(src.year ?? new Date(src.createdAt).getFullYear()));
                    setNodeDetailEditMode(true);
                  }}
                  style={{
                    width: "100%",
                    borderRadius: 10,
                    border: "1px solid rgba(51,65,85,0.8)",
                    background: "rgba(15,23,42,0.6)",
                    color: "rgba(255,255,255,0.85)",
                    padding: "10px 12px",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 12,
                    cursor: !selectedSourceGoal || detailPanelNode.synthetic ? "not-allowed" : "pointer",
                  }}
                >
                  Edit moment
                </button>
              )}
              {detailPatchStatus === "saved" ? (
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: `${detailPanelNode.branchColor}AA` }}>
                  Saved
                </div>
              ) : null}

              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  disabled={!selectedSourceGoal || detailPanelNode.synthetic}
                  onClick={() => setMoveBranchOpen((o) => !o)}
                  style={{
                    width: "100%",
                    borderRadius: 10,
                    border: "1px solid rgba(51,65,85,0.8)",
                    background: "rgba(15,23,42,0.6)",
                    color: "rgba(255,255,255,0.85)",
                    padding: "10px 12px",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 12,
                    cursor: !selectedSourceGoal || detailPanelNode.synthetic ? "not-allowed" : "pointer",
                  }}
                >
                  Move to different thread
                </button>
                {moveBranchOpen ? (
                  <div
                    style={{
                      position: "absolute",
                      bottom: "100%",
                      left: 0,
                      right: 0,
                      marginBottom: 6,
                      maxHeight: 200,
                      overflowY: "auto",
                      background: "rgba(6,12,24,0.98)",
                      border: "1px solid #1E293B",
                      borderRadius: 10,
                      padding: 6,
                      zIndex: 2,
                    }}
                  >
                    {BRANCHES.map((b) => (
                      <button
                        type="button"
                        key={b.id}
                        onClick={async () => {
                          if (!selected || !selectedSourceGoal) return;
                          const prevBranch =
                            selectedSourceGoal.limb ??
                            selectedSourceGoal.lifeArea ??
                            selectedSourceGoal.branch;
                          applyLocalPatch(selected, { lifeArea: b.label, branch: b.label });
                          setMoveBranchOpen(false);
                          try {
                            if (!/^(guided|suggested|preview-saved|origin-born)/.test(selected)) {
                              await patchLifeMapNodeApi(selected, { branch: b.label });
                            }
                          } catch (err) {
                            console.error(err);
                            applyLocalPatch(selected, { lifeArea: prevBranch, branch: prevBranch });
                          }
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 10px",
                          border: "none",
                          background: "transparent",
                          color: b.color,
                          fontFamily: "'DM Sans', sans-serif",
                          fontSize: 12,
                          cursor: "pointer",
                          borderRadius: 6,
                        }}
                      >
                        {b.icon} {b.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                disabled={!selectedSourceGoal || detailPanelNode.synthetic}
                onClick={() => {
                  if (!selected || !detailPanelNode) return;
                  setMoveBranchOpen(false);
                  handleStartNewBranchFromMoment({
                    id: selected,
                    label: detailPanelNode.label,
                    branchLabel: detailPanelNode.branchLabel,
                    branch: detailPanelNode.branch,
                    lifeArea: detailPanelNode.lifeArea,
                    limbId: detailPanelNode.limbId,
                  });
                }}
                style={{
                  width: "100%",
                  borderRadius: 10,
                  border: "1px solid rgba(51,65,85,0.8)",
                  background: "rgba(15,23,42,0.6)",
                  color: "rgba(255,255,255,0.85)",
                  padding: "10px 12px",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12,
                  cursor: !selectedSourceGoal || detailPanelNode.synthetic ? "not-allowed" : "pointer",
                }}
              >
                Thread from this moment
              </button>

              {nodeDeleteConfirm ? (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: "rgba(30,10,10,0.6)",
                    border: "1px solid rgba(239,68,68,0.35)",
                  }}
                >
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(255,255,255,0.8)", marginBottom: 10 }}>
                    Are you sure? This cannot be undone.
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setNodeDeleteConfirm(false)}
                      style={{
                        flex: 1,
                        borderRadius: 8,
                        border: "1px solid #334155",
                        background: "transparent",
                        color: "#94A3B8",
                        padding: "8px",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (selected) handleDeleteNode(selected);
                        setNodeDeleteConfirm(false);
                      }}
                      style={{
                        flex: 1,
                        borderRadius: 8,
                        border: "none",
                        background: "#B91C1C",
                        color: "white",
                        padding: "8px",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setNodeDeleteConfirm(true)}
                  style={{
                    width: "100%",
                    borderRadius: 10,
                    border: "1px solid rgba(239,68,68,0.35)",
                    background: "rgba(30,10,10,0.35)",
                    color: "#FCA5A5",
                    padding: "10px 12px",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Remove moment
                </button>
              )}
            </div>
          </aside>
        </>
      ) : null}

      <div className="ui-overlay" style={{ position: "absolute", bottom: 28, right: 28, zIndex: 50 }}>
        <button
          onClick={() => setGoalsOpen((o) => !o)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            borderRadius: 20,
            background: "rgba(2,8,16,0.9)",
            border: "1px solid #0F172A",
            color: "#4B5563",
            fontSize: 10,
            letterSpacing: 2,
          }}
        >
          <span style={{ width: 18, height: 18, borderRadius: "50%", background: "#0F172A", border: "1px solid #1E293B", display: "flex", alignItems: "center", justifyContent: "center", color: "#60A5FA", fontSize: 9 }}>{totalGoals}</span>
          MOMENTS {goalsOpen ? "â–¾" : "â–´"}
        </button>
        {goalsOpen ? (
          <div
            style={{
              position: "absolute",
              right: 0,
              bottom: 46,
              minWidth: 260,
              maxHeight: 320,
              overflowY: "auto",
              borderRadius: 12,
              background: "rgba(2,8,16,0.95)",
              border: "1px solid #0F172A",
              padding: "10px",
              backdropFilter: "blur(16px)",
            }}
          >
            {branches.map((branch) => (
              <div key={branch.id} style={{ marginBottom: 8 }}>
                <div style={{ color: branch.color, fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>
                  {branch.label.toUpperCase()}
                </div>
                {branch.nodes.map((node) => (
                  <div key={node.id} style={{ color: "#9CA3AF", fontSize: 11, marginBottom: 3 }}>
                    {node.label}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {guidedBranch ? (
        <ErrorBoundary name="GuidedFlowOverlay">
        <div
          className="ui-overlay"
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(2,8,16,0.82)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 70,
          }}
        >
          <div
            className="overlay-shimmer"
            style={{
              position: "absolute",
              inset: 0,
              background: `radial-gradient(circle at 20% 20%, ${guidedBranchConfig?.color ?? LIFE_AREA_COLORS[guidedBranch]}33 0%, transparent 45%), radial-gradient(circle at 80% 80%, ${guidedBranchConfig?.color ?? LIFE_AREA_COLORS[guidedBranch]}22 0%, transparent 45%)`,
              pointerEvents: "none",
            }}
          />
          <div
            className="overlay-particle"
            style={{
              position: "absolute",
              top: "24%",
              left: "30%",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: guidedBranchConfig?.color ?? LIFE_AREA_COLORS[guidedBranch],
              opacity: 0.35,
              boxShadow: `0 0 16px ${guidedBranchConfig?.color ?? LIFE_AREA_COLORS[guidedBranch]}`,
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              width: 760,
              maxWidth: "94vw",
              minHeight: "72vh",
              borderRadius: 20,
              background: "rgba(2,8,16,0.93)",
              border: `1px solid ${(guidedBranchConfig?.color ?? LIFE_AREA_COLORS[guidedBranch])}55`,
              padding: "24px 30px",
              position: "relative",
              boxShadow: `0 30px 80px rgba(0,0,0,0.55), 0 0 90px ${(guidedBranchConfig?.color ?? LIFE_AREA_COLORS[guidedBranch])}20`,
            }}
          >
            <button
              onClick={closeGuidedOverlay}
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                border: "1px solid #334155",
                background: "rgba(2,8,16,0.65)",
                color: "#94A3B8",
                borderRadius: 999,
                width: 30,
                height: 30,
                cursor: "pointer",
              }}
            >
              Ã—
            </button>

            <div style={{ color: guidedBranchConfig?.color ?? LIFE_AREA_COLORS[guidedBranch], fontSize: 32, letterSpacing: 1, marginBottom: 4 }}>
              {guidedBranchConfig?.label ?? guidedBranch}
            </div>
            <div
              style={{
                color: "rgba(255,255,255,0.4)",
                fontSize: 11,
                marginBottom: 14,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {guidedBranchConfig?.sublabel ?? ""}
            </div>
            <div
              style={{
                color: "white",
                fontSize: 36,
                lineHeight: 1.2,
                maxWidth: 640,
                marginBottom: 28,
                fontFamily: "'Cormorant Garamond', serif",
                fontWeight: 300,
                letterSpacing: 0.5,
              }}
            >
              {guidedFlowContext?.promptOverride ??
                guidedBranchConfig?.emptyPrompt ??
                PROMPT_COPY[guidedBranch]}
            </div>
            {guidedEntryMode === "guided" ? (
              <>
                {!guidedFlow ? (
                  <div style={{ marginBottom: 18 }}>
                    {guidedBranch === "Personal Growth" && !guidedSubbranch ? (
                      <>
                        <div style={{ color: "rgba(255,255,255,0.78)", fontSize: 13, marginBottom: 10 }}>
                          What kind of growth moment is this?
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 10 }}>
                          {[
                            {
                              subId: "becoming-mindset",
                              pill: "Mindset Shift",
                              icon: "ðŸ’¡",
                              line: "Mindset Shift",
                              sub: "A way of thinking that changed",
                            },
                            {
                              subId: "becoming-lessons",
                              pill: "Lesson Learned",
                              icon: "ðŸ“–",
                              line: "Lesson Learned",
                              sub: "Something you learned the hard way",
                            },
                            {
                              subId: "becoming-identity",
                              pill: "Identity Change",
                              icon: "ðŸ¦‹",
                              line: "Identity Change",
                              sub: "You became a different kind of person",
                            },
                          ].map((card) => {
                            const flowTemplate = GUIDED_FLOW_BLUEPRINTS["Personal Growth"]?.[card.pill];
                            return (
                              <button
                                key={card.subId}
                                type="button"
                                onClick={() => {
                                  if (!flowTemplate) return;
                                  setGuidedSubbranch(card.subId);
                                  setGuidedEntryMode("guided");
                                  setGuidedFlow({
                                    pill: card.pill,
                                    steps: flowTemplate.steps,
                                    currentStep: 0,
                                    answers: {},
                                    otherTextByStep: {},
                                    awaitingOther: false,
                                    completed: false,
                                  });
                                }}
                                style={{
                                  background: `${guidedBranchConfig?.color ?? "#A78BFA"}14`,
                                  border: `1px solid ${`${guidedBranchConfig?.color ?? "#A78BFA"}4D`}`,
                                  borderRadius: 12,
                                  padding: 14,
                                  cursor: "pointer",
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "center",
                                  gap: 6,
                                  textAlign: "center",
                                }}
                              >
                                <div style={{ fontSize: 26 }}>{card.icon}</div>
                                <div style={{ color: "white", fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>
                                  {card.line}
                                </div>
                                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 9, lineHeight: 1.35 }}>
                                  {card.sub}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    ) : guidedSubbranches.length > 0 && !guidedSubbranch ? (
                      <>
                        <div style={{ color: "rgba(255,255,255,0.78)", fontSize: 13, marginBottom: 10 }}>
                          {{
                            Relationships: "What kind of relationship is this?",
                            "Work & Learning": "What kind of work moment is this?",
                            Health: "What area of health?",
                            "Personal Growth": "What kind of growth moment is this?",
                            Money: "What kind of money moment is this?",
                          }[guidedBranch as string] ?? "What kind of moment is this?"}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          {guidedSubbranches.map((subbranch) => {
                            const selectedSub = guidedSubbranch === subbranch.id;
                            return (
                              <button
                                key={`subbranch-${subbranch.id}`}
                                onClick={() => setGuidedSubbranch(subbranch.id)}
                                style={{
                                  background: `${subbranch.color}14`,
                                  border: `1px solid ${selectedSub ? `${subbranch.color}CC` : `${subbranch.color}4D`}`,
                                  borderRadius: 12,
                                  padding: 16,
                                  cursor: "pointer",
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "center",
                                  gap: 6,
                                }}
                              >
                                <div style={{ fontSize: 28 }}>{subbranch.icon}</div>
                                <div style={{ color: "white", fontFamily: "'DM Sans', sans-serif", fontSize: 10 }}>
                                  {subbranch.label}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {(guidedBranchConfig?.examples ?? []).map((example) => (
                          <button
                            key={`${guidedBranch}-example-${example}`}
                            onClick={() => startGuidedFlowFromExample(example)}
                            style={{
                              background: `${guidedBranchConfig?.color ?? "#64748B"}1A`,
                              border: `1px solid ${(guidedBranchConfig?.color ?? "#64748B")}66`,
                              color: guidedBranchConfig?.color ?? "#94A3B8",
                              fontFamily: "'DM Sans', sans-serif",
                              fontSize: 11,
                              padding: "8px 16px",
                              borderRadius: 20,
                              cursor: "pointer",
                            }}
                          >
                            {example}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                {guidedFlow && !guidedFlow.completed && guidedFlowStep ? (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <div
                        style={{
                          color: "white",
                          fontFamily: "'Cormorant Garamond', serif",
                          fontSize: 20,
                          fontWeight: 400,
                        }}
                      >
                        {guidedFlowStep.question}
                      </div>
                      <div style={{ display: "flex", gap: 5 }}>
                        {guidedFlow.steps.map((_, idx) => (
                          <span key={`dot-${idx}`} style={{ color: idx <= guidedFlow.currentStep ? "white" : "rgba(255,255,255,0.25)", fontSize: 12 }}>
                            â—
                          </span>
                        ))}
                      </div>
                    </div>

                    {guidedFlowStep.isFreeText ? (
                      <div style={{ marginBottom: 12 }}>
                        <textarea
                          key={`guided-free-${guidedFlowStep.id}`}
                          defaultValue={guidedFlow.otherTextByStep?.[guidedFlowStep.id] ?? ""}
                          onChange={(e) => {
                            guidedFreeTextDraftRef.current = e.target.value;
                          }}
                          placeholder="Write it in your own words"
                          rows={3}
                          style={{
                            width: "100%",
                            borderRadius: 8,
                            border: "1px solid #334155",
                            background: "#0B1220",
                            color: "white",
                            padding: "10px 12px",
                            fontFamily: "'DM Sans', sans-serif",
                            fontSize: 13,
                            resize: "vertical",
                            marginBottom: 10,
                          }}
                        />
                        <button
                          type="button"
                          onClick={submitGuidedFreeTextStep}
                          style={{
                            borderRadius: 999,
                            border: `1px solid ${(guidedBranchConfig?.color ?? "#64748B")}66`,
                            background: `${guidedBranchConfig?.color ?? "#64748B"}22`,
                            color: "white",
                            padding: "8px 16px",
                            fontSize: 12,
                            cursor: "pointer",
                          }}
                        >
                          Continue
                        </button>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: guidedFlowStep.isYear ? "nowrap" : "wrap",
                          overflowX: guidedFlowStep.isYear ? "auto" : "visible",
                          paddingBottom: guidedFlowStep.isYear ? 6 : 0,
                          marginBottom: 12,
                        }}
                      >
                        {(guidedFlowStep.options ?? []).map((option) => {
                          const selected = guidedFlow.answers?.[guidedFlowStep.id] === option;
                          return (
                            <button
                              key={`${guidedFlowStep.id}-${option}`}
                              onClick={() => selectGuidedFlowOption(option)}
                              style={{
                                whiteSpace: "nowrap",
                                background: selected
                                  ? `${guidedBranchConfig?.color ?? "#64748B"}40`
                                  : `${guidedBranchConfig?.color ?? "#64748B"}1A`,
                                border: `1px solid ${
                                  selected
                                    ? `${guidedBranchConfig?.color ?? "#64748B"}CC`
                                    : `${guidedBranchConfig?.color ?? "#64748B"}66`
                                }`,
                                color: selected ? "white" : guidedBranchConfig?.color ?? "#94A3B8",
                                fontFamily: "'DM Sans', sans-serif",
                                fontSize: 11,
                                padding: "8px 16px",
                                borderRadius: 20,
                                cursor: "pointer",
                              }}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {guidedFlow.awaitingOther && guidedFlowStep.allowOther ? (
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                        <input
                          key={`guided-other-${guidedFlowStep.id}`}
                          defaultValue={guidedFlow.otherTextByStep?.[guidedFlowStep.id] ?? ""}
                          onChange={(e) => {
                            guidedOtherDraftRef.current = e.target.value;
                          }}
                          placeholder="Type your answer"
                          style={{
                            flex: 1,
                            borderRadius: 8,
                            border: "1px solid #334155",
                            background: "#0B1220",
                            color: "white",
                            padding: "8px 10px",
                          }}
                        />
                        <button
                          onClick={submitGuidedOtherValue}
                          style={{
                            borderRadius: 999,
                            border: `1px solid ${(guidedBranchConfig?.color ?? "#64748B")}66`,
                            background: `${guidedBranchConfig?.color ?? "#64748B"}22`,
                            color: "white",
                            padding: "8px 12px",
                          }}
                        >
                          Use
                        </button>
                      </div>
                    ) : null}

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <button
                        onClick={backGuidedFlowStep}
                        style={{ border: "none", background: "transparent", color: "rgba(255,255,255,0.7)", fontSize: 12, cursor: "pointer", padding: 0 }}
                      >
                        Back
                      </button>
                      <button
                        onClick={() => {
                          setGuidedEntryMode("text");
                          setGuidedFlow(null);
                        }}
                        style={{ border: "none", background: "transparent", color: "rgba(255,255,255,0.2)", fontSize: 12, cursor: "pointer", padding: 0 }}
                      >
                        Skip - I&apos;ll type instead
                      </button>
                    </div>
                  </div>
                ) : null}

                {guidedFlow?.completed && guidedFlowOutcome ? (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, marginBottom: 12 }}>
                      {guidedFlowOutcome.summary}
                    </div>
                    {guidedPostStage === "none" ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => {
                            setPendingGuidedOutcome(guidedFlowOutcome);
                            setPendingSignificance(2);
                            setPendingConnectionIds([]);
                            setGuidedLocationDraft("");
                            setGuidedPostStage("location");
                          }}
                          style={{
                            padding: "10px 16px",
                            borderRadius: 999,
                            border: `1px solid ${(guidedBranchConfig?.color ?? LIFE_AREA_COLORS[guidedBranch])}77`,
                            background: `${guidedBranchConfig?.color ?? LIFE_AREA_COLORS[guidedBranch]}22`,
                            color: "#E2E8F0",
                            fontSize: 13,
                            cursor: "pointer",
                          }}
                        >
                          Add to my map
                        </button>
                        <button
                          onClick={() => setGuidedFlow((prev) => ({ ...prev, currentStep: 0, completed: false }))}
                          style={{
                            padding: "10px 16px",
                            borderRadius: 999,
                            border: "1px solid #334155",
                            background: "transparent",
                            color: "#94A3B8",
                            fontSize: 13,
                            cursor: "pointer",
                          }}
                        >
                          Edit
                        </button>
                      </div>
                    ) : null}

                    {guidedPostStage === "location" ? (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ color: "rgba(255,255,255,0.78)", fontSize: 13, marginBottom: 8 }}>
                          Where were you when this happened?{" "}
                          <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}>(optional)</span>
                        </div>
                        <input
                          type="text"
                          value={guidedLocationDraft}
                          onChange={(e) => setGuidedLocationDraft(e.target.value)}
                          placeholder="Where were you? e.g. Bangkok, London"
                          style={{
                            width: "100%",
                            maxWidth: 360,
                            borderRadius: 8,
                            border: "1px solid #334155",
                            background: "#0B1220",
                            color: "white",
                            padding: "8px 10px",
                            fontSize: 12,
                            marginBottom: 10,
                          }}
                        />
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => {
                              const v = guidedLocationDraft.trim();
                              setPendingGuidedOutcome((prev) =>
                                prev ? { ...prev, location: v || null } : prev,
                              );
                              setGuidedPostStage("significance");
                            }}
                            style={{
                              padding: "8px 14px",
                              borderRadius: 999,
                              border: `1px solid ${(guidedBranchConfig?.color ?? LIFE_AREA_COLORS[guidedBranch])}77`,
                              background: `${guidedBranchConfig?.color ?? LIFE_AREA_COLORS[guidedBranch]}22`,
                              color: "#E2E8F0",
                              fontSize: 12,
                              cursor: "pointer",
                            }}
                          >
                            Continue
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPendingGuidedOutcome((prev) =>
                                prev ? { ...prev, location: null } : prev,
                              );
                              setGuidedPostStage("significance");
                            }}
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "rgba(255,255,255,0.45)",
                              fontSize: 12,
                              cursor: "pointer",
                              textDecoration: "underline",
                            }}
                          >
                            Skip
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {guidedPostStage === "significance" ? (
                      <div>
                        <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, marginBottom: 10 }}>
                          How significant was this moment in your life?
                        </div>
                        <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                          {[
                            { value: 1, icon: "â—‹", label: "Just part of life" },
                            { value: 2, icon: "â—‰", label: "A meaningful chapter" },
                            { value: 3, icon: "â—", label: "A defining moment" },
                          ].map((option) => (
                            <button
                              key={`sig-${option.value}`}
                              onClick={() => setPendingSignificance(option.value)}
                              style={{
                                borderRadius: 999,
                                border:
                                  pendingSignificance === option.value
                                    ? `1px solid ${(guidedBranchConfig?.color ?? LIFE_AREA_COLORS[guidedBranch])}CC`
                                    : "1px solid #334155",
                                background:
                                  pendingSignificance === option.value
                                    ? `${guidedBranchConfig?.color ?? LIFE_AREA_COLORS[guidedBranch]}33`
                                    : "transparent",
                                color: pendingSignificance === option.value ? "white" : "#94A3B8",
                                padding: "6px 10px",
                                fontSize: 12,
                                cursor: "pointer",
                              }}
                            >
                              {option.icon} {option.label}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() =>
                            setGuidedPostStage(
                              candidateConnectionNodes.length > 0 ? "connections" : "none",
                            )
                          }
                          style={{
                            padding: "8px 14px",
                            borderRadius: 999,
                            border: `1px solid ${(guidedBranchConfig?.color ?? LIFE_AREA_COLORS[guidedBranch])}77`,
                            background: `${guidedBranchConfig?.color ?? LIFE_AREA_COLORS[guidedBranch]}22`,
                            color: "#E2E8F0",
                            fontSize: 12,
                            cursor: "pointer",
                          }}
                        >
                          {candidateConnectionNodes.length > 0 ? "Continue" : "Save moment"}
                        </button>
                        {candidateConnectionNodes.length === 0 ? (
                          <button
                            onClick={commitPendingGuidedNode}
                            style={{
                              marginLeft: 8,
                              padding: "8px 14px",
                              borderRadius: 999,
                              border: "1px solid #334155",
                              background: "transparent",
                              color: "#94A3B8",
                              fontSize: 12,
                              cursor: "pointer",
                            }}
                          >
                            Save now
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    {guidedPostStage === "connections" ? (
                      <div>
                        <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, marginBottom: 10 }}>
                          Did this connect to anything else in your life around that time?
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                          {candidateConnectionNodes.map((node) => {
                            const meta = BRANCH_BY_LABEL[node.lifeArea];
                            const active = pendingConnectionIds.includes(node.id);
                            return (
                              <button
                                key={`connect-${node.id}`}
                                onClick={() =>
                                  setPendingConnectionIds((prev) =>
                                    active ? prev.filter((id) => id !== node.id) : [...prev, node.id],
                                  )
                                }
                                style={{
                                  borderRadius: 999,
                                  border: active ? "1px solid #93C5FD" : "1px solid #334155",
                                  background: active ? "rgba(59,130,246,0.2)" : "transparent",
                                  color: active ? "#DBEAFE" : "#94A3B8",
                                  padding: "6px 10px",
                                  fontSize: 11,
                                  cursor: "pointer",
                                }}
                              >
                                {meta?.icon ?? "âœ¦"} {node.title}
                              </button>
                            );
                          })}
                          <button
                            onClick={() => setPendingConnectionIds([])}
                            style={{
                              borderRadius: 999,
                              border: "1px solid #334155",
                              background: "transparent",
                              color: "#94A3B8",
                              padding: "6px 10px",
                              fontSize: 11,
                              cursor: "pointer",
                            }}
                          >
                            Not really connected
                          </button>
                        </div>
                        <button
                          onClick={commitPendingGuidedNode}
                          style={{
                            padding: "8px 14px",
                            borderRadius: 999,
                            border: `1px solid ${(guidedBranchConfig?.color ?? LIFE_AREA_COLORS[guidedBranch])}77`,
                            background: `${guidedBranchConfig?.color ?? LIFE_AREA_COLORS[guidedBranch]}22`,
                            color: "#E2E8F0",
                            fontSize: 12,
                            cursor: "pointer",
                          }}
                        >
                          Save moment
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
                  <button
                    onClick={() => {
                      setGuidedMode("voice");
                      startVoiceCapture();
                    }}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      border: `1px solid ${(guidedBranchConfig?.color ?? LIFE_AREA_COLORS[guidedBranch])}66`,
                      background: `${guidedBranchConfig?.color ?? LIFE_AREA_COLORS[guidedBranch]}22`,
                      color: guidedBranchConfig?.color ?? LIFE_AREA_COLORS[guidedBranch],
                      fontSize: 18,
                      cursor: "pointer",
                    }}
                    title="Use voice input"
                  >
                    ðŸŽ™
                  </button>
                  <span style={{ color: "#64748B", fontSize: 12, letterSpacing: 0.6 }}>
                    Just start talking or typing - there are no wrong answers...
                  </span>
                  <span style={{ marginLeft: "auto", color: "#94A3B8", fontSize: 12 }}>
                    {guidedInput.trim() ? guidedInput.trim().split(/\s+/).length : 0} words
                  </span>
                </div>
                <textarea
                  value={guidedInput}
                  onChange={(e) => setGuidedInput(e.target.value)}
                  placeholder={guidedBranchConfig?.addPrompt ?? "Just start talking or typing - there are no wrong answers..."}
                  style={{
                    width: "100%",
                    minHeight: 260,
                    borderRadius: 0,
                    background: "transparent",
                    border: "none",
                    color: "white",
                    padding: "10px 2px",
                    marginBottom: 10,
                    outline: "none",
                    fontSize: 18,
                    lineHeight: 1.6,
                  }}
                />
                {guidedBranch === "Money" ? (
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={financeIncludeNumbers}
                        onChange={(e) => setFinanceIncludeNumbers(e.target.checked)}
                      />
                      Track the numbers (optional)
                    </label>
                    {financeIncludeNumbers ? (
                      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <select value={financeType} onChange={(e) => setFinanceType(e.target.value)} style={{ borderRadius: 8, background: "#0B1220", border: "1px solid #334155", color: "white", padding: "6px 8px" }}>
                          <option value="income">Income</option>
                          <option value="savings_goal">Savings Moment</option>
                          <option value="investment">Investment</option>
                          <option value="debt">Debt</option>
                          <option value="milestone">Milestone</option>
                        </select>
                        <select value={financeCurrency} onChange={(e) => setFinanceCurrency(e.target.value)} style={{ borderRadius: 8, background: "#0B1220", border: "1px solid #334155", color: "white", padding: "6px 8px" }}>
                          <option value="GBP">GBP</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                        </select>
                        <input value={financeAmount} onChange={(e) => setFinanceAmount(e.target.value)} placeholder="Amount" style={{ borderRadius: 8, background: "#0B1220", border: "1px solid #334155", color: "white", padding: "6px 8px" }} />
                        <input value={financeTargetAmount} onChange={(e) => setFinanceTargetAmount(e.target.value)} placeholder="Target amount" style={{ borderRadius: 8, background: "#0B1220", border: "1px solid #334155", color: "white", padding: "6px 8px" }} />
                        <input value={financeCurrentAmount} onChange={(e) => setFinanceCurrentAmount(e.target.value)} placeholder="Current amount" style={{ borderRadius: 8, background: "#0B1220", border: "1px solid #334155", color: "white", padding: "6px 8px", gridColumn: "1 / span 2" }} />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <button
                    onClick={() => setGuidedEntryMode("guided")}
                    style={{ border: "none", background: "transparent", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 12, padding: 0 }}
                  >
                    Use guided flow
                  </button>
                  {guidedInput.trim() ? (
                    <button
                      onClick={extractNodesFromInput}
                      style={{
                        padding: "10px 16px",
                        borderRadius: 999,
                        border: `1px solid ${(guidedBranchConfig?.color ?? LIFE_AREA_COLORS[guidedBranch])}77`,
                        background: `${guidedBranchConfig?.color ?? LIFE_AREA_COLORS[guidedBranch]}22`,
                        color: "#E2E8F0",
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      {isExtracting ? "Mapping..." : "Map my story"}
                    </button>
                  ) : null}
                </div>
              </>
            )}
            {previewError ? (
              <div style={{ marginTop: 8, color: "#FCA5A5", fontSize: 11 }}>{previewError}</div>
            ) : null}
          </div>
        </div>
        </ErrorBoundary>
      ) : null}

      {activeView === "map" ? (
        <div
          className="ui-overlay"
          style={{
            position: "absolute",
            right: 24,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 50,
            display: "grid",
            gap: 8,
          }}
        >
          <button
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.1))}
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              border: "1px solid #334155",
              background: "rgba(2,8,16,0.85)",
              color: "#BFDBFE",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            +
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              border: "1px solid #334155",
              background: "rgba(2,8,16,0.85)",
              color: "#BFDBFE",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            -
          </button>
        </div>
      ) : null}

      {showUnlockPanel ? (
        <div
          className="ui-overlay"
          style={{
            position: "absolute",
            left: 24,
            bottom: 120,
            width: 320,
            borderRadius: 12,
            background: "rgba(2,8,16,0.95)",
            border: "1px solid #1E293B",
            padding: 12,
            zIndex: 72,
          }}
        >
          <div style={{ color: "#CBD5E1", fontSize: 12, marginBottom: 8 }}>Unlockable threads</div>
          <div style={{ display: "grid", gap: 8 }}>
            {eligibleUnlockableBranches.map((branch) => (
              <button
                key={branch.id}
                onClick={() => unlockBranch(branch.id)}
                style={{
                  width: "100%",
                  borderRadius: 10,
                  border: `1px solid ${branch.color}66`,
                  background: `${branch.color}1A`,
                  color: branch.color,
                  padding: "10px 12px",
                  textAlign: "left",
                }}
              >
                {branch.icon} {branch.label}
              </button>
            ))}
            {eligibleUnlockableBranches.length === 0 ? (
              <div style={{ color: "#64748B", fontSize: 11 }}>No threads available yet.</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {unlockPrompt ? (
        <div
          className="ui-overlay"
          style={{
            position: "fixed",
            right: 28,
            bottom: 100,
            width: "calc(100% - 32px)",
            maxWidth: 380,
            zIndex: 85,
            pointerEvents: "none",
          }}
        >
          <div
            key={unlockPrompt.id}
            className={unlockPromptLeaving ? "unlock-prompt-panel-leave" : "unlock-prompt-panel-enter"}
            onAnimationEnd={handleUnlockDismissAnimationEnd}
            style={{
              pointerEvents: "auto",
              borderRadius: 14,
              border: `1px solid ${unlockPrompt.color}44`,
              background: "rgba(2,8,16,0.94)",
              overflow: "hidden",
              boxShadow: `0 12px 40px rgba(0,0,0,0.45), 0 0 28px ${unlockPrompt.color}28`,
            }}
          >
            <div style={{ padding: "16px 18px 10px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <span style={{ fontSize: 28, lineHeight: 1, color: unlockPrompt.color }}>{unlockPrompt.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "'Cormorant Garamond', serif",
                      fontSize: 20,
                      color: unlockPrompt.color,
                      fontWeight: 400,
                      lineHeight: 1.2,
                    }}
                  >
                    {unlockPrompt.label}
                  </div>
                  <div
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 11,
                      color: "rgba(255,255,255,0.5)",
                      marginTop: 6,
                      lineHeight: 1.45,
                    }}
                  >
                    {unlockPrompt.sublabel}
                  </div>
                </div>
              </div>
              <p
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12,
                  color: "rgba(255,255,255,0.88)",
                  lineHeight: 1.55,
                  margin: "14px 0 0",
                }}
              >
                {resolveUnlockMiddleInsight(unlockPrompt, timelineGoals)}
              </p>
            </div>
            <div
              style={{
                padding: "0 18px 12px",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 10,
                color: "rgba(255,255,255,0.2)",
                lineHeight: 1.45,
              }}
            >
              Most people find this thread takes 2 minutes to start and becomes their most visited
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                padding: "0 18px 14px",
                alignItems: "center",
              }}
            >
              <button
                type="button"
                onClick={() => unlockBranch(unlockPrompt.id)}
                style={{
                  borderRadius: 999,
                  border: `1px solid ${unlockPrompt.color}88`,
                  background: `${unlockPrompt.color}24`,
                  color: unlockPrompt.color,
                  padding: "8px 14px",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: `0 0 14px ${unlockPrompt.color}44`,
                }}
              >
                {`Start a ${unlockPrompt.label} thread`}
              </button>
              <button
                type="button"
                onClick={handleUnlockRemindLater}
                style={{
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "transparent",
                  color: "rgba(255,255,255,0.4)",
                  padding: "8px 12px",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Remind me later
              </button>
              <button
                type="button"
                onClick={handleUnlockNotInterested}
                style={{
                  borderRadius: 999,
                  border: "none",
                  background: "transparent",
                  color: "rgba(255,255,255,0.2)",
                  padding: "8px 10px",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Not interested
              </button>
            </div>
            {!unlockPromptLeaving ? (
              <div style={{ height: 2, background: "rgba(255,255,255,0.06)" }}>
                <div
                  key={`${unlockPrompt.id}-count`}
                  className="unlock-prompt-countdown"
                  style={{ height: "100%", background: `${unlockPrompt.color}4D` }}
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {dragSuggestion && isEnabled("DRAG_TO_CONNECT") ? (
        <div
          className="ui-overlay"
          style={{
            position: "absolute",
            left: 24,
            bottom: 84,
            borderRadius: 10,
            border: "1px solid #334155",
            background: "rgba(2,8,16,0.92)",
            color: "#BFDBFE",
            padding: "8px 10px",
            fontSize: 11,
            zIndex: 78,
            maxWidth: 320,
          }}
        >
          {dragSuggestion.suggestionText}
        </div>
      ) : null}

      {extractionPreviewNodes.length > 0 ? (
        <div
          className="ui-overlay"
          style={{
            position: "absolute",
            right: 24,
            top: 84,
            width: 420,
            maxHeight: "72vh",
            overflowY: "auto",
            background: "rgba(2,8,16,0.96)",
            border: "1px solid #1E293B",
            borderRadius: 12,
            padding: 12,
            zIndex: 75,
          }}
        >
          <div style={{ color: "#BFDBFE", fontSize: 14, marginBottom: 8 }}>
            Preview extracted nodes before saving
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {extractionPreviewNodes.map((node) => (
              <div
                key={node.id}
                style={{
                  border: "1px solid #334155",
                  borderRadius: 10,
                  padding: 10,
                  background: "rgba(8,15,30,0.75)",
                }}
              >
                <div style={{ display: "grid", gap: 6 }}>
                  <select
                    value={node.branch}
                    onChange={(e) =>
                      setExtractionPreviewNodes((prev) =>
                        prev.map((n) => (n.id === node.id ? { ...n, branch: e.target.value } : n)),
                      )
                    }
                    style={{ borderRadius: 8, border: "1px solid #334155", background: "#0B1220", color: "white", padding: "6px 8px" }}
                  >
                    {visibleLabels.map((area) => (
                      <option key={area} value={area}>
                        {area}
                      </option>
                    ))}
                  </select>
                  <input
                    value={node.label}
                    onChange={(e) =>
                      setExtractionPreviewNodes((prev) =>
                        prev.map((n) => (n.id === node.id ? { ...n, label: e.target.value } : n)),
                      )
                    }
                    placeholder="Label"
                    style={{ borderRadius: 8, border: "1px solid #334155", background: "#0B1220", color: "white", padding: "6px 8px" }}
                  />
                  <input
                    type="number"
                    min={1900}
                    max={2100}
                    value={node.year}
                    onChange={(e) =>
                      setExtractionPreviewNodes((prev) =>
                        prev.map((n) =>
                          n.id === node.id ? { ...n, year: Number.parseInt(e.target.value, 10) } : n,
                        ),
                      )
                    }
                    style={{ borderRadius: 8, border: "1px solid #334155", background: "#0B1220", color: "white", padding: "6px 8px" }}
                  />
                  <textarea
                    value={node.desc}
                    onChange={(e) =>
                      setExtractionPreviewNodes((prev) =>
                        prev.map((n) => (n.id === node.id ? { ...n, desc: e.target.value } : n)),
                      )
                    }
                    rows={3}
                    style={{ borderRadius: 8, border: "1px solid #334155", background: "#0B1220", color: "white", padding: "6px 8px" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#94A3B8", fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(node.future)}
                        onChange={(e) =>
                          setExtractionPreviewNodes((prev) =>
                            prev.map((n) => (n.id === node.id ? { ...n, future: e.target.checked } : n)),
                          )
                        }
                      />
                      Future goal
                    </label>
                    <button
                      onClick={() =>
                        setExtractionPreviewNodes((prev) => prev.filter((n) => n.id !== node.id))
                      }
                      style={{ borderRadius: 8, border: "1px solid #7F1D1D", background: "#450A0A", color: "#FCA5A5", padding: "6px 10px", fontSize: 11 }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {previewError ? (
            <div style={{ marginTop: 10, color: "#FCA5A5", fontSize: 12 }}>{previewError}</div>
          ) : null}
          <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              onClick={finalizePreviewNodes}
              style={{ borderRadius: 8, border: "1px solid #1D4ED8", background: "#1E3A8A", color: "#DBEAFE", padding: "7px 10px" }}
            >
              Looks good - add to my map
            </button>
            <button
              onClick={() => setPreviewMode("edit")}
              style={{ borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#94A3B8", padding: "7px 10px" }}
            >
              Let me edit first
            </button>
            <button
              onClick={() => {
                setExtractionPreviewNodes([]);
                setPreviewMode("edit");
                setPreviewError(null);
              }}
              style={{ borderRadius: 8, border: "1px solid #7F1D1D", background: "#450A0A", color: "#FCA5A5", padding: "7px 10px" }}
            >
              Start over
            </button>
          </div>
        </div>
      ) : null}

      {suggestionHoverId ? (
        <div
          className="ui-overlay"
          style={{
            position: "absolute",
            left: 24,
            top: 86,
            background: "rgba(2,8,16,0.93)",
            border: "1px dashed #334155",
            borderRadius: 10,
            padding: "8px 10px",
            color: "#94A3B8",
            fontSize: 11,
            zIndex: 65,
          }}
        >
          Based on your career pivot, you may be working toward this
        </div>
      ) : null}

      {selectedSuggestion ? (
        <div
          className="ui-overlay"
          style={{
            position: "absolute",
            right: 24,
            top: 86,
            width: 320,
            background: "rgba(2,8,16,0.95)",
            border: "1px solid #1E293B",
            borderRadius: 12,
            padding: 12,
            zIndex: 72,
          }}
        >
          <div style={{ color: "#BFDBFE", fontSize: 13, marginBottom: 6 }}>
            Does this resonate? Add it to your map
          </div>
          <div style={{ color: "#94A3B8", fontSize: 11, marginBottom: 8 }}>
            {selectedSuggestion.rationale}
          </div>
          <input
            value={suggestionEditLabel}
            onChange={(e) => setSuggestionEditLabel(e.target.value)}
            style={{
              width: "100%",
              borderRadius: 8,
              border: "1px solid #334155",
              background: "#0B1220",
              color: "white",
              padding: "8px 10px",
              marginBottom: 8,
              fontSize: 12,
            }}
          />
          <input
            value={suggestionEditYear}
            onChange={(e) => setSuggestionEditYear(e.target.value)}
            style={{
              width: "100%",
              borderRadius: 8,
              border: "1px solid #334155",
              background: "#0B1220",
              color: "white",
              padding: "8px 10px",
              marginBottom: 10,
              fontSize: 12,
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              onClick={() => dismissSuggestion(selectedSuggestion.id)}
              style={{
                borderRadius: 8,
                border: "1px solid #334155",
                background: "transparent",
                color: "#94A3B8",
                padding: "6px 10px",
              }}
            >
              No
            </button>
            <button
              onClick={() =>
                acceptSuggestion({
                  ...selectedSuggestion,
                  label: selectedSuggestion.label,
                  year: selectedSuggestion.year,
                })
              }
              style={{
                borderRadius: 8,
                border: "1px solid #1D4ED8",
                background: "#1E3A8A",
                color: "#DBEAFE",
                padding: "6px 10px",
              }}
            >
              Yes
            </button>
            <button
              onClick={() =>
                acceptSuggestion({
                  ...selectedSuggestion,
                  label: suggestionEditLabel,
                  year: suggestionEditYear,
                })
              }
              style={{
                borderRadius: 8,
                border: "1px solid #0EA5E9",
                background: "#0C4A6E",
                color: "#BAE6FD",
                padding: "6px 10px",
              }}
            >
              Edit
            </button>
          </div>
        </div>
      ) : null}

      {contextMenu ? (
        <div
          className="ui-overlay"
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            background: "rgba(4,10,20,0.97)",
            border: "1px solid #1E293B",
            borderRadius: 8,
            padding: "4px 0",
            zIndex: 1000,
            minWidth: 160,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              padding: "6px 14px",
              color: "#374151",
              fontSize: 9,
              letterSpacing: 2,
              borderBottom: "1px solid #0F172A",
            }}
          >
            {contextMenu.label}
          </div>
          <button
            onClick={() => handleDeleteNode(contextMenu.nodeId)}
            style={{
              display: "block",
              width: "100%",
              padding: "8px 14px",
              background: "none",
              border: "none",
              color: "#EF4444",
              fontSize: 11,
              textAlign: "left",
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Remove moment
          </button>
          <button
            onClick={() => setContextMenu(null)}
            style={{
              display: "block",
              width: "100%",
              padding: "8px 14px",
              background: "none",
              border: "none",
              color: "#4B5563",
              fontSize: 11,
              textAlign: "left",
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Cancel
          </button>
        </div>
      ) : null}

      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: "radial-gradient(ellipse 100% 100% at 50% 50%, transparent 40%, rgba(2,8,16,0.7) 100%)",
        }}
      />
      {mobilePreview ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              width: 390,
              height: 844,
              border: "8px solid #1E293B",
              borderRadius: 40,
              position: "relative",
              boxShadow: "0 0 60px rgba(0,0,0,0.8)",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: "50%",
                transform: "translateX(-50%)",
                width: 120,
                height: 30,
                background: "#000",
                borderRadius: "0 0 16px 16px",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: -28,
                left: "50%",
                transform: "translateX(-50%)",
                color: "#374151",
                fontSize: 11,
                letterSpacing: 3,
                fontFamily: "DM Sans, sans-serif",
                whiteSpace: "nowrap",
              }}
            >
              MOBILE PREVIEW - CMD+SHIFT+M TO EXIT
            </div>
          </div>
        </div>
      ) : null}
    </div>
    </div>
  );
}
