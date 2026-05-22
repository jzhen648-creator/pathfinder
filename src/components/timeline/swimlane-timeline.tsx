"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getOpacity } from "@/components/tree/tree-branch-geometry";
import type { AreaData, MomentNode, TreeGoalNode } from "@/components/tree/tree-types";
import type { SwimlaneTimelineProps } from "@/components/tree/tree-view-types";

const LANE_LABEL_W = 136;
const AXIS_H = 40;
const LANE_MIN_H = 48;
const NODE_R = 5;
const GOAL_BAR_H = 20;
const MIN_GOAL_BAR_PX = 10;
const MS_PER_DAY = 86400000;
const MIN_TRACK_PX = 960;
const PX_PER_DAY = 2.4;
const PX_PER_DAY_MAX = 6;
const DESC_PREVIEW_MAX = 120;

function realMoments(moments: MomentNode[]): MomentNode[] {
  return moments.filter((m) => m.synthetic !== true);
}

type HubThread = AreaData["branches"][number];

function isPaddedHub(thread: HubThread): boolean {
  return thread.id.startsWith("tree-hub-pad-") || thread.type.trim() === "—";
}

function collectRoadmapGoals(thread: HubThread): TreeGoalNode[] {
  const acc: TreeGoalNode[] = [];
  const walk = (g: TreeGoalNode) => {
    acc.push(g);
    g.childGoals.forEach(walk);
  };
  thread.goals.forEach(walk);
  return acc;
}

function utcMidnightFromParts(y: number, m0: number, d: number): number {
  return Date.UTC(y, m0, d, 0, 0, 0, 0);
}

function msFromCalendarIso(iso: string | null | undefined): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, mo, d] = iso.split("-").map((x) => Number(x));
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const t = utcMidnightFromParts(y, mo - 1, d);
  return Number.isNaN(t) ? null : t;
}

function msForMoment(m: MomentNode): number | null {
  const fromIso = msFromCalendarIso(m.calendarDateIso ?? null);
  if (fromIso != null) return fromIso;
  const y = m.year;
  if (y == null) return null;
  return utcMidnightFromParts(y, 0, 1);
}

function goalSpanMs(g: TreeGoalNode): { startMs: number; endMs: number } | null {
  const startIso = g.timelineStartIso ?? g.createdAtIso ?? null;
  const startMs = msFromCalendarIso(startIso);
  if (startMs == null) {
    if (g.year == null) return null;
    return {
      startMs: utcMidnightFromParts(g.year, 0, 1),
      endMs: utcMidnightFromParts(g.year, 11, 31),
    };
  }
  let endMs = msFromCalendarIso(g.deadlineIso ?? null);
  if (endMs == null && g.year != null) {
    endMs = utcMidnightFromParts(g.year, 11, 31);
  }
  if (endMs == null) {
    endMs = Math.max(startMs, startOfTodayUtc());
  }
  if (endMs < startMs) endMs = startMs + MS_PER_DAY;
  return { startMs, endMs };
}

function addUtcMonths(base: Date, months: number): number {
  const d = new Date(base.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.getTime();
}

function startOfTodayUtc(): number {
  const n = new Date();
  return utcMidnightFromParts(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
}

/** Jan 1 UTC for profile birth year — matches roadmap `timelineStartMs`. */
function birthAnchorMs(birthYear: number | null | undefined): number | null {
  if (birthYear == null || !Number.isFinite(birthYear)) return null;
  const y = Math.trunc(birthYear);
  if (y < 1900 || y > 2100) return null;
  return utcMidnightFromParts(y, 0, 1);
}

function excerpt(text: string | null | undefined, max = DESC_PREVIEW_MAX): string | null {
  const t = text?.trim();
  if (!t) return null;
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

type MomentSwimNode = {
  kind: "moment";
  id: string;
  moment: MomentNode;
  area: AreaData;
  hub: string;
  ms: number;
  dayPrecision: boolean;
};

type GoalSwimNode = {
  kind: "goal";
  id: string;
  goal: TreeGoalNode;
  area: AreaData;
  hub: string;
  startMs: number;
  endMs: number;
};

type SwimNode = MomentSwimNode | GoalSwimNode;

function collectAllSwimNodes(areas: AreaData[]): SwimNode[] {
  const out: SwimNode[] = [];
  for (const area of areas) {
    for (const thread of area.branches) {
      if (isPaddedHub(thread)) continue;
      const hub = thread.type.trim() || "Hub";
      for (const m of realMoments(thread.moments)) {
        const ms = msForMoment(m);
        if (ms == null) continue;
        const dayPrecision = Boolean(m.calendarDateIso && /^\d{4}-\d{2}-\d{2}$/.test(m.calendarDateIso));
        out.push({ kind: "moment", id: m.id, moment: m, area, hub, ms, dayPrecision });
      }
      for (const g of collectRoadmapGoals(thread)) {
        const span = goalSpanMs(g);
        if (span == null) continue;
        out.push({ kind: "goal", id: g.id, goal: g, area, hub, ...span });
      }
    }
  }
  return out;
}

function typeBadgeLabel(n: SwimNode): string {
  return n.kind === "goal" ? "PURSUIT" : "MARK";
}

function titleFor(n: SwimNode): string {
  return n.kind === "moment" ? n.moment.label : n.goal.title;
}

function descriptionFor(n: SwimNode): string | null {
  if (n.kind === "moment") return excerpt(n.moment.description);
  return excerpt(n.goal.description);
}

function staggerKey(n: SwimNode): string {
  return `${n.area.id}:${n.kind}:${n.id}`;
}

type SpanSlot = { startMs: number; endMs: number };

function assignGoalBarDepth(goals: GoalSwimNode[]): Map<string, number> {
  const map = new Map<string, number>();
  const byArea = new Map<string, GoalSwimNode[]>();
  for (const g of goals) {
    const list = byArea.get(g.area.id);
    if (list) list.push(g);
    else byArea.set(g.area.id, [g]);
  }
  for (const [, list] of byArea) {
    const sorted = [...list].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.id.localeCompare(b.id));
    const lanes: SpanSlot[] = [];
    for (const g of sorted) {
      let depth = 0;
      while (depth < lanes.length) {
        const slot = lanes[depth]!;
        if (g.startMs <= slot.endMs && slot.startMs <= g.endMs) {
          depth++;
          continue;
        }
        break;
      }
      if (depth === lanes.length) lanes.push({ startMs: g.startMs, endMs: g.endMs });
      else {
        lanes[depth] = {
          startMs: Math.min(lanes[depth]!.startMs, g.startMs),
          endMs: Math.max(lanes[depth]!.endMs, g.endMs),
        };
      }
      map.set(staggerKey(g), depth);
    }
  }
  return map;
}

const NODE_X_CLUSTER_PX = NODE_R * 2.6;

function assignMomentStagger(moments: MomentSwimNode[], xFor: (n: MomentSwimNode) => number): Map<string, number> {
  const map = new Map<string, number>();
  const byArea = new Map<string, MomentSwimNode[]>();
  for (const n of moments) {
    const list = byArea.get(n.area.id);
    if (list) list.push(n);
    else byArea.set(n.area.id, [n]);
  }
  for (const [, list] of byArea) {
    const sorted = [...list].sort((a, b) => xFor(a) - xFor(b) || a.id.localeCompare(b.id));
    const lastXAtDepth: number[] = [];
    for (const n of sorted) {
      const x = xFor(n);
      let d = 0;
      while (d < lastXAtDepth.length && x - lastXAtDepth[d]! < NODE_X_CLUSTER_PX) d++;
      if (d === lastXAtDepth.length) lastXAtDepth.push(x);
      else lastXAtDepth[d] = x;
      map.set(staggerKey(n), d);
    }
  }
  return map;
}

function countUndated(areas: AreaData[]): number {
  let u = 0;
  for (const area of areas) {
    for (const thread of area.branches) {
      if (isPaddedHub(thread)) continue;
      for (const m of realMoments(thread.moments)) {
        if (msForMoment(m) == null) u++;
      }
      for (const g of collectRoadmapGoals(thread)) {
        if (goalSpanMs(g) == null) u++;
      }
    }
  }
  return u;
}

export function SwimlaneTimeline({
  areas,
  focused,
  birthYear = null,
  onAreaClick,
  onMarkPointerEnter,
  onMarkPointerLeave,
  onMarkClick,
  onGoalClick,
  onUpdateGoalTimeline,
}: SwimlaneTimelineProps) {
  const [selectedGoal, setSelectedGoal] = useState<{
    node: GoalSwimNode;
    clientX: number;
    clientY: number;
  } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const allNodes = useMemo(() => collectAllSwimNodes(areas), [areas]);

  const { minMs, maxMs, trackWidthPx, datedCount, undatedCount, birthMs } = useMemo(() => {
    const extents: number[] = [];
    for (const n of allNodes) {
      if (n.kind === "moment") extents.push(n.ms);
      else {
        extents.push(n.startMs, n.endMs);
      }
    }
    const undatedTotal = countUndated(areas);
    const birth = birthAnchorMs(birthYear);

    if (extents.length === 0) {
      const padEnd = addUtcMonths(new Date(), 6);
      if (birth != null) {
        return {
          minMs: birth,
          maxMs: Math.max(padEnd, birth + MS_PER_DAY),
          trackWidthPx: MIN_TRACK_PX,
          datedCount: 0,
          undatedCount: undatedTotal,
          birthMs: birth,
        };
      }
      return {
        minMs: startOfTodayUtc(),
        maxMs: padEnd,
        trackWidthPx: MIN_TRACK_PX,
        datedCount: 0,
        undatedCount: undatedTotal,
        birthMs: null,
      };
    }
    const minFromData = Math.min(...extents);
    const min = birth != null ? Math.min(minFromData, birth) : minFromData;
    const latestItem = Math.max(...extents);
    const padEnd = addUtcMonths(new Date(), 6);
    const max = Math.max(latestItem, padEnd);
    const rangeDays = Math.max(1, Math.ceil((max - min) / MS_PER_DAY));
    const rawW = Math.ceil(rangeDays * PX_PER_DAY);
    const w = Math.max(MIN_TRACK_PX, Math.min(rawW, rangeDays * PX_PER_DAY_MAX));
    return {
      minMs: min,
      maxMs: max,
      trackWidthPx: w,
      datedCount: allNodes.length,
      undatedCount: undatedTotal,
      birthMs: birth,
    };
  }, [allNodes, areas, birthYear]);

  const xForMs = useCallback(
    (ms: number) => {
      const span = maxMs - minMs;
      if (span <= 0) return 0;
      return ((ms - minMs) / span) * trackWidthPx;
    },
    [maxMs, minMs, trackWidthPx],
  );

  const goalNodes = useMemo(() => allNodes.filter((n): n is GoalSwimNode => n.kind === "goal"), [allNodes]);
  const momentNodes = useMemo(
    () => allNodes.filter((n): n is MomentSwimNode => n.kind === "moment"),
    [allNodes],
  );

  const goalDepthMap = useMemo(() => assignGoalBarDepth(goalNodes), [goalNodes]);
  const momentStaggerMap = useMemo(
    () => assignMomentStagger(momentNodes, (n) => xForMs(n.ms)),
    [momentNodes, xForMs],
  );

  useEffect(() => {
    if (!selectedGoal) return;
    const nextNode = goalNodes.find((g) => g.id === selectedGoal.node.id && g.area.id === selectedGoal.node.area.id);
    if (!nextNode) {
      setSelectedGoal(null);
      return;
    }
    if (nextNode !== selectedGoal.node) {
      setSelectedGoal((curr) =>
        curr && curr.node.id === nextNode.id && curr.node.area.id === nextNode.area.id
          ? { ...curr, node: nextNode }
          : curr,
      );
    }
  }, [goalNodes, selectedGoal]);

  useEffect(() => {
    if (!selectedGoal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedGoal(null);
    };
    const onClickAway = () => setSelectedGoal(null);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("click", onClickAway);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("click", onClickAway);
    };
  }, [selectedGoal]);

  const maxDepthByArea = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of goalNodes) {
      const d = goalDepthMap.get(staggerKey(g)) ?? 0;
      m.set(g.area.id, Math.max(m.get(g.area.id) ?? 0, d));
    }
    for (const n of momentNodes) {
      const d = momentStaggerMap.get(staggerKey(n)) ?? 0;
      m.set(n.area.id, Math.max(m.get(n.area.id) ?? 0, d));
    }
    return m;
  }, [goalDepthMap, goalNodes, momentNodes, momentStaggerMap]);

  const nodesByArea = useMemo(() => {
    const map = new Map<string, SwimNode[]>();
    for (const n of allNodes) {
      const list = map.get(n.area.id);
      if (list) list.push(n);
      else map.set(n.area.id, [n]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const aMs = a.kind === "moment" ? a.ms : a.startMs;
        const bMs = b.kind === "moment" ? b.ms : b.startMs;
        return aMs - bMs || a.id.localeCompare(b.id);
      });
    }
    return map;
  }, [allNodes]);

  const yearMarks = useMemo(() => {
    const ys: { ms: number; label: string }[] = [];
    const y0 = new Date(minMs).getUTCFullYear();
    const y1 = new Date(maxMs).getUTCFullYear();
    for (let y = y0; y <= y1; y++) {
      const ms = utcMidnightFromParts(y, 0, 1);
      if (ms >= minMs && ms <= maxMs) {
        const isBirth = birthMs != null && ms === birthMs;
        ys.push({ ms, label: isBirth ? `Born ${y}` : String(y) });
      }
    }
    if (ys.length === 0) ys.push({ ms: minMs, label: String(new Date(minMs).getUTCFullYear()) });
    return ys;
  }, [minMs, maxMs, birthMs]);

  const quarterTicks = useMemo(() => {
    const ticks: { ms: number }[] = [];
    const y0 = new Date(minMs).getUTCFullYear();
    const y1 = new Date(maxMs).getUTCFullYear();
    for (let y = y0; y <= y1; y++) {
      for (const m0 of [3, 6, 9]) {
        const ms = utcMidnightFromParts(y, m0, 1);
        if (ms > minMs && ms < maxMs) ticks.push({ ms });
      }
    }
    return ticks;
  }, [minMs, maxMs]);

  const innerWidth = LANE_LABEL_W + trackWidthPx;
  const nowMs = startOfTodayUtc();
  const showNow = nowMs >= minMs && nowMs <= maxMs;
  const nowX = showNow ? xForMs(nowMs) : null;

  const scrollToNow = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || datedCount === 0) return;
    const w = el.clientWidth;
    const maxScroll = Math.max(0, el.scrollWidth - w);
    if (w <= 0) return;
    if (nowX != null) {
      const nowContentX = LANE_LABEL_W + nowX;
      el.scrollLeft = Math.max(0, Math.min(nowContentX - w * 0.62, maxScroll));
    } else {
      el.scrollLeft = maxScroll;
    }
  }, [datedCount, nowX]);

  /** Default viewport: recent past + near future around today (not birth-year left edge). */
  useEffect(() => {
    scrollToNow();
    const raf = requestAnimationFrame(scrollToNow);
    return () => cancelAnimationFrame(raf);
  }, [scrollToNow, innerWidth, trackWidthPx, birthYear]);

  if (datedCount === 0) {
    return <SwimlaneEmptyState undatedCount={undatedCount} birthYear={birthYear} />;
  }

  return (
    <div
      style={{
        padding: "10px 12px 16px",
        minWidth: 0,
        height: "100%",
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        boxSizing: "border-box",
      }}
    >
      <p
        style={{
          margin: 0,
          flexShrink: 0,
          fontSize: 14,
          color: "var(--color-text-tertiary)",
          lineHeight: 1.55,
        }}
      >
        Scroll <strong style={{ color: "var(--color-text-secondary)" }}>sideways</strong> — the axis runs from your
        {birthMs != null ? (
          <>
            {" "}
            <strong style={{ color: "var(--color-text-secondary)" }}>birth year</strong>
          </>
        ) : (
          " earliest dated item"
        )}{" "}
        to today (+ padding). Opens near <strong style={{ color: "var(--color-text-secondary)" }}>today</strong> — scroll
        left for earlier years. Pursuits show as spans; marks as dots.
        {undatedCount > 0 ? (
          <span style={{ color: "var(--color-text-tertiary)" }}>
            {" "}
            ({undatedCount} without enough date info aren’t shown.)
          </span>
        ) : null}
      </p>

      <div
        ref={scrollContainerRef}
        style={{
          width: "100%",
          minWidth: 0,
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          overscrollBehaviorX: "contain",
          WebkitOverflowScrolling: "touch",
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: 12,
        }}
      >
        <SwimlaneChart
          innerWidth={innerWidth}
          trackWidthPx={trackWidthPx}
          yearMarks={yearMarks}
          quarterTicks={quarterTicks}
          xForMs={xForMs}
          nowX={nowX}
          areas={areas}
          focused={focused}
          nodesByArea={nodesByArea}
          maxDepthByArea={maxDepthByArea}
          goalDepthMap={goalDepthMap}
          momentStaggerMap={momentStaggerMap}
          onAreaClick={onAreaClick}
          onMarkPointerEnter={onMarkPointerEnter}
          onMarkPointerLeave={onMarkPointerLeave}
          onMarkClick={onMarkClick}
          onSelectGoal={setSelectedGoal}
          onJumpToToday={scrollToNow}
          canJumpToToday={nowX != null}
        />
      </div>

      {selectedGoal ? (
        <SwimlaneGoalCard
          node={selectedGoal.node}
          clientX={selectedGoal.clientX}
          clientY={selectedGoal.clientY}
          onUpdateGoalTimeline={onUpdateGoalTimeline}
          onOpen={() => {
            const node = selectedGoal.node;
            onGoalClick(node.goal, node.area);
          }}
        />
      ) : null}
    </div>
  );
}

function SwimlaneEmptyState({
  undatedCount,
  birthYear,
}: {
  undatedCount: number;
  birthYear?: number | null;
}) {
  const birth = birthAnchorMs(birthYear);
  return (
    <div style={{ padding: "10px 12px 16px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 14, color: "var(--color-text-tertiary)", lineHeight: 1.55 }}>
        Scroll <strong style={{ color: "var(--color-text-secondary)" }}>sideways</strong> — the axis can run from your
        birth year when it is set in your profile. Pursuits appear as spans; marks as dots.
        {birth != null ? (
          <>
            {" "}
            Your birth year (<strong style={{ color: "var(--color-text-secondary)" }}>{Math.trunc(birthYear!)}</strong>
            ) will anchor the left edge once you have dated items.
          </>
        ) : null}
      </p>
      <div style={{ padding: 16, fontSize: 14, color: "var(--color-text-tertiary)" }}>
        Nothing with a date on your timeline yet — set a deadline on a pursuit or add a dated mark.
        {undatedCount > 0 ? ` (${undatedCount} without enough date info aren’t shown.)` : ""}
      </div>
    </div>
  );
}

type SwimlaneChartProps = {
  innerWidth: number;
  trackWidthPx: number;
  yearMarks: { ms: number; label: string }[];
  quarterTicks: { ms: number }[];
  xForMs: (ms: number) => number;
  /** Pixel x for today when in range; null hides the marker. */
  nowX: number | null;
  areas: AreaData[];
  focused: string | null;
  nodesByArea: Map<string, SwimNode[]>;
  maxDepthByArea: Map<string, number>;
  goalDepthMap: Map<string, number>;
  momentStaggerMap: Map<string, number>;
  onAreaClick: SwimlaneTimelineProps["onAreaClick"];
  onMarkPointerEnter: SwimlaneTimelineProps["onMarkPointerEnter"];
  onMarkPointerLeave: SwimlaneTimelineProps["onMarkPointerLeave"];
  onMarkClick: SwimlaneTimelineProps["onMarkClick"];
  onSelectGoal: (h: { node: GoalSwimNode; clientX: number; clientY: number } | null) => void;
  onJumpToToday: () => void;
  canJumpToToday: boolean;
};

function SwimlaneChart({
  innerWidth,
  trackWidthPx,
  yearMarks,
  quarterTicks,
  xForMs,
  nowX,
  areas,
  focused,
  nodesByArea,
  maxDepthByArea,
  goalDepthMap,
  momentStaggerMap,
  onAreaClick,
  onMarkPointerEnter,
  onMarkPointerLeave,
  onMarkClick,
  onSelectGoal,
  onJumpToToday,
  canJumpToToday,
}: SwimlaneChartProps) {
  const goalRowStride = GOAL_BAR_H + 6;
  const momentRowStride = NODE_R * 2 + 4;

  return (
    <div style={{ width: innerWidth, minWidth: "max(100%, 1px)" }}>
      <SwimlaneAxisRow
        trackWidthPx={trackWidthPx}
        yearMarks={yearMarks}
        quarterTicks={quarterTicks}
        xForMs={xForMs}
        nowX={nowX}
        onJumpToToday={onJumpToToday}
        canJumpToToday={canJumpToToday}
      />
      {areas.map((area) => {
          const laneNodes = nodesByArea.get(area.id) ?? [];
          const maxD = maxDepthByArea.get(area.id) ?? 0;
          const lanePad = 8;
          const laneTrackH = Math.max(
            LANE_MIN_H,
            lanePad * 2 + (maxD + 1) * Math.max(goalRowStride, momentRowStride),
          );
          const op = getOpacity(focused, area.id);
          return (
            <div
              key={area.id}
              style={{
                display: "flex",
                flexDirection: "row",
                borderBottom: "1px solid var(--color-border-tertiary)",
                opacity: op,
              }}
            >
              <button
                type="button"
                onClick={() => onAreaClick(area)}
                style={{
                  width: LANE_LABEL_W,
                  minWidth: LANE_LABEL_W,
                  flexShrink: 0,
                  position: "sticky",
                  left: 0,
                  zIndex: 3,
                  boxSizing: "border-box",
                  alignSelf: "stretch",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  padding: "8px 12px",
                  border: "none",
                  borderRight: "1px solid var(--color-border-tertiary)",
                  background: "var(--color-background-primary)",
                  cursor: "pointer",
                  textAlign: "left",
                  font: "inherit",
                  color: area.color,
                  fontWeight: 600,
                  fontSize: 13,
                  lineHeight: 1.35,
                }}
              >
                {area.label}
              </button>
              <div
                style={{
                  width: trackWidthPx,
                  minWidth: trackWidthPx,
                  minHeight: laneTrackH,
                  flexShrink: 0,
                  position: "relative",
                  boxSizing: "border-box",
                  padding: `${lanePad}px 0`,
                }}
              >
                {nowX != null ? <SwimlaneNowLine xPx={nowX} /> : null}
                {laneNodes.map((n) => {
                  if (n.kind === "goal") {
                    const x0 = xForMs(n.startMs);
                    const x1 = xForMs(n.endMs);
                    const w = Math.max(MIN_GOAL_BAR_PX, x1 - x0);
                    const depth = goalDepthMap.get(staggerKey(n)) ?? 0;
                    const top = lanePad + depth * goalRowStride;
                    const desc = descriptionFor(n);
                    return (
                      <button
                        key={`goal-${n.id}`}
                        type="button"
                        aria-label={titleFor(n)}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectGoal({ node: n, clientX: e.clientX, clientY: e.clientY });
                        }}
                        style={{
                          position: "absolute",
                          left: x0,
                          top,
                          width: w,
                          height: GOAL_BAR_H,
                          padding: "0 6px",
                          borderRadius: 4,
                          border: `2px solid ${area.color}`,
                          background: `${area.color}22`,
                          cursor: "pointer",
                          boxSizing: "border-box",
                          display: "flex",
                          alignItems: "center",
                          overflow: "hidden",
                          textAlign: "left",
                        }}
                      >
                        {w >= 56 ? (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: "var(--color-text-primary)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              lineHeight: 1.2,
                            }}
                          >
                            {titleFor(n)}
                            {desc ? (
                              <span style={{ fontWeight: 400, color: "var(--color-text-tertiary)" }}>
                                {" "}
                                — {desc}
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                      </button>
                    );
                  }

                  const x = xForMs(n.ms);
                  const depth = momentStaggerMap.get(staggerKey(n)) ?? 0;
                  const cy = lanePad + NODE_R + depth * momentRowStride;
                  return (
                    <button
                      key={`moment-${n.id}`}
                      type="button"
                      aria-label={titleFor(n)}
                      onClick={(e) => onMarkClick(n.moment, n.area, e.clientX, e.clientY)}
                      onMouseEnter={(e) =>
                        onMarkPointerEnter?.(n.moment, n.area, e.clientX, e.clientY)
                      }
                      onMouseMove={(e) =>
                        onMarkPointerEnter?.(n.moment, n.area, e.clientX, e.clientY)
                      }
                      onMouseLeave={() => onMarkPointerLeave?.(n.moment.id)}
                      style={{
                        position: "absolute",
                        left: x - NODE_R,
                        top: cy - NODE_R,
                        width: NODE_R * 2,
                        height: NODE_R * 2,
                        padding: 0,
                        borderRadius: 999,
                        border: "none",
                        background: area.color,
                        cursor: "pointer",
                        boxSizing: "border-box",
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
    </div>
  );
}

/** Vertical “today” marker — axis label + full-height line in lanes. */
function SwimlaneNowLine({ xPx, showLabel = false }: { xPx: number; showLabel?: boolean }) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: xPx,
        top: 0,
        bottom: 0,
        transform: "translateX(-50%)",
        pointerEvents: "none",
        zIndex: 2,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 0,
          bottom: 0,
          width: 2,
          marginLeft: -1,
          background: "var(--color-text-primary)",
          opacity: 0.35,
          borderRadius: 1,
        }}
      />
      {showLabel ? (
        <span
          style={{
            position: "absolute",
            top: 2,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: ".04em",
            textTransform: "uppercase",
            color: "var(--color-text-primary)",
            background: "var(--color-background-primary)",
            padding: "1px 5px",
            borderRadius: 4,
            border: "1px solid var(--color-border-secondary)",
            whiteSpace: "nowrap",
            lineHeight: 1.2,
          }}
        >
          Now
        </span>
      ) : null}
    </div>
  );
}

function SwimlaneAxisRow({
  trackWidthPx,
  yearMarks,
  quarterTicks,
  xForMs,
  nowX,
  onJumpToToday,
  canJumpToToday,
}: {
  trackWidthPx: number;
  yearMarks: { ms: number; label: string }[];
  quarterTicks: { ms: number }[];
  xForMs: (ms: number) => number;
  nowX: number | null;
  onJumpToToday: () => void;
  canJumpToToday: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        borderBottom: "1px solid var(--color-border-tertiary)",
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: "var(--color-background-primary)",
      }}
    >
      <div
        style={{
          width: LANE_LABEL_W,
          minWidth: LANE_LABEL_W,
          flexShrink: 0,
          position: "sticky",
          left: 0,
          zIndex: 11,
          boxSizing: "border-box",
          background: "var(--color-background-primary)",
          borderRight: "1px solid var(--color-border-tertiary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "4px 8px",
        }}
      >
        <button
          type="button"
          aria-label="Jump to today"
          disabled={!canJumpToToday}
          onClick={onJumpToToday}
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: ".04em",
            textTransform: "uppercase",
            padding: "4px 8px",
            borderRadius: 6,
            border: "1px solid var(--color-border-secondary)",
            background: "var(--color-background-secondary, rgba(255,255,255,0.03))",
            color: "var(--color-text-secondary)",
            cursor: canJumpToToday ? "pointer" : "not-allowed",
            opacity: canJumpToToday ? 1 : 0.45,
            lineHeight: 1.2,
          }}
        >
          Today
        </button>
      </div>
      <div
        style={{
          width: trackWidthPx,
          minWidth: trackWidthPx,
          height: AXIS_H,
          flexShrink: 0,
          position: "relative",
          background: "var(--color-background-secondary, rgba(255,255,255,0.03))",
        }}
      >
        {quarterTicks.map((t, i) => (
          <div
            key={`q-${t.ms}-${i}`}
            style={{
              position: "absolute",
              left: xForMs(t.ms),
              top: 10,
              width: 1,
              height: 10,
              background: "var(--color-border-secondary)",
              opacity: 0.55,
              transform: "translateX(-0.5px)",
            }}
          />
        ))}
        {yearMarks.map((ym) => (
          <div
            key={ym.ms}
            style={{
              position: "absolute",
              left: xForMs(ym.ms),
              top: 0,
              transform: "translateX(-50%)",
              fontSize: 12,
              fontWeight: 700,
              color: "var(--color-text-secondary)",
              whiteSpace: "nowrap",
              lineHeight: `${AXIS_H}px`,
            }}
          >
            {ym.label}
          </div>
        ))}
        {nowX != null ? <SwimlaneNowLine xPx={nowX} showLabel /> : null}
      </div>
    </div>
  );
}

function effectiveGoalStartIso(g: TreeGoalNode): string {
  return g.timelineStartIso ?? g.createdAtIso ?? "";
}

function effectiveGoalDeadlineIso(g: TreeGoalNode): string {
  if (g.deadlineIso) return g.deadlineIso;
  if (g.year != null) return `${g.year}-12-31`;
  return "";
}

function SwimlaneGoalCard({
  node,
  clientX,
  clientY,
  onUpdateGoalTimeline,
  onOpen,
}: {
  node: GoalSwimNode;
  clientX: number;
  clientY: number;
  onUpdateGoalTimeline?: SwimlaneTimelineProps["onUpdateGoalTimeline"];
  onOpen: () => void;
}) {
  const track = `${node.area.label} · ${node.hub}`;
  const desc = descriptionFor(node);
  const cardW = 300;
  const pad = 12;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const left = Math.max(pad, Math.min(clientX + pad, vw - cardW - pad));
  const top = Math.max(pad, Math.min(clientY + pad, vh - 320));

  const [startIso, setStartIso] = useState("");
  const [deadlineIso, setDeadlineIso] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setStartIso(effectiveGoalStartIso(node.goal));
    setDeadlineIso(effectiveGoalDeadlineIso(node.goal));
    setErr(null);
  }, [node]);

  const shell: CSSProperties = {
    position: "fixed",
    left,
    top,
    width: cardW,
    maxWidth: "min(320px, calc(100vw - 24px))",
    zIndex: 50,
    borderRadius: 12,
    border: `1px solid ${node.area.color}55`,
    background: "var(--color-background-primary)",
    boxSizing: "border-box",
    padding: "12px 14px",
    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
  };

  const labelStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--color-text-tertiary)",
    marginBottom: 4,
    display: "block",
  };

  const inputStyle: CSSProperties = {
    width: "100%",
    padding: "6px 8px",
    borderRadius: 8,
    border: "1px solid var(--color-border-secondary)",
    background: "var(--color-background-primary)",
    color: "var(--color-text-primary)",
    fontSize: 13,
    boxSizing: "border-box",
  };

  return (
    <div style={shell} role="dialog" aria-label={titleFor(node)} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: node.area.color, letterSpacing: ".06em" }}>
          {typeBadgeLabel(node)}
        </span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.45, marginBottom: 6 }}>
        {titleFor(node)}
      </div>
      {desc ? (
        <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.45 }}>
          {desc}
        </p>
      ) : null}
      <div style={{ fontSize: 13, color: "var(--color-text-tertiary)", lineHeight: 1.45, marginBottom: 10 }}>{track}</div>

      <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
        <label>
          <span style={labelStyle}>Started</span>
          <input
            type="date"
            value={startIso}
            disabled={busy || !onUpdateGoalTimeline}
            onChange={(e) => setStartIso(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label>
          <span style={labelStyle}>Target deadline</span>
          <input
            type="date"
            value={deadlineIso}
            disabled={busy || !onUpdateGoalTimeline}
            onChange={(e) => setDeadlineIso(e.target.value)}
            style={inputStyle}
          />
        </label>
        {!node.goal.timelineStartIso && node.goal.createdAtIso ? (
          <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-tertiary)" }}>
            Default start is created {node.goal.createdAtIso}. Change the date above to override.
          </p>
        ) : null}
      </div>

      {err ? (
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--color-text-danger, #f87171)" }}>{err}</p>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {onUpdateGoalTimeline ? (
          <button
            type="button"
            disabled={busy || !/^\d{4}-\d{2}-\d{2}$/.test(startIso)}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              const created = node.goal.createdAtIso;
              const timelineStartIso =
                created && startIso === created ? null : startIso;
              const result = await onUpdateGoalTimeline(node.goal.id, {
                timelineStartIso,
                deadlineIso: deadlineIso.trim() ? deadlineIso : null,
              });
              setBusy(false);
              if (!result.ok) setErr(result.error ?? "Could not save dates.");
            }}
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: "6px 12px",
              borderRadius: 8,
              border: "none",
              background: node.area.color,
              color: "#fff",
              cursor: busy ? "wait" : "pointer",
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? "Saving…" : "Save dates"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onOpen}
          style={{
            fontSize: 13,
            fontWeight: 600,
            padding: "6px 12px",
            borderRadius: 8,
            border: `1px solid ${node.area.color}55`,
            background: "transparent",
            color: node.area.color,
            cursor: "pointer",
          }}
        >
          Open detail
        </button>
      </div>
    </div>
  );
}
