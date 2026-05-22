"use client";

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { formatUserInput } from "@/utils/text";
import { formatBloomStatusLabel } from "@/lib/bloom-display";
import { badgeStatusFromGoalBloom, sigLabel, statusBadgeStyle } from "./tree-view-badges";
import { hasRelationalMilestones } from "./goal-milestone-predicates";
import {
  countRoadmapGoalsInArea,
  countRoadmapGoalsOnThread,
  findGoalInAreas,
} from "./tree-view-goal-queries";
import { isScaffoldingSubtaskTitle } from "@/lib/legacy-subtask-placeholder-title";
import { milestoneDoneForSemantics } from "@/lib/milestone-semantics";
import type { SequenceAnchor } from "@/lib/branch-sequence";
import { canonicalHubDisplayLabel, hubPanelCopy } from "@/lib/hub-catalog";
import { getLifeArea } from "@/lib/life-areas";
import { HubCatalogPanelSections } from "./hub-catalog-panel-sections";
import { themePanelCopy } from "@/lib/theme-catalog";
import type { DomainHubData, TreeGoalNode, TreeMilestoneNode } from "./tree-types";
import type { TreePanelProps, TreePanelSurface } from "./tree-view-types";
import { pointyTopHexPathD } from "./tree-design-visual";

const STREAM_ENTRY_SUBTITLE = "Talk freely — I'll find what belongs on your map";
const PF_TREE_MARK_COLOR = "#c9a227";

function isCanvasDetailRail(
  surface: TreePanelSurface,
  presentation: TreePanelProps["panelPresentation"],
): boolean {
  return surface === "canvas" && presentation === "rail";
}

function StreamEntryButton({
  subjectName,
  accent,
  onClick,
  testId,
  variant = "default",
}: {
  subjectName: string;
  accent: string;
  onClick: () => void;
  testId: string;
  variant?: "default" | "canvas";
}) {
  if (variant === "canvas") {
    return (
      <button type="button" data-testid={testId} onClick={onClick} className="pf-tree-rail-btn-primary">
        Tell me about this
      </button>
    );
  }
  return (
    <div style={{ marginTop: 14, display: "grid", gap: 6 }}>
      <button
        type="button"
        data-testid={testId}
        onClick={onClick}
        style={{
          width: "100%",
          fontSize: 14,
          fontWeight: 600,
          color: "#0c0a09",
          background: accent,
          border: "none",
          borderRadius: 10,
          padding: "10px 14px",
          cursor: "pointer",
        }}
      >
        Talk to me about {subjectName}
      </button>
      <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-tertiary)", lineHeight: 1.45 }}>
        {STREAM_ENTRY_SUBTITLE}
      </p>
    </div>
  );
}

function PursuitHexGlyph({
  color,
  bloomStatus,
}: {
  color: string;
  bloomStatus: TreeGoalNode["bloomStatus"];
}) {
  const complete = bloomStatus === "COMPLETE";
  const onHold = bloomStatus === "ON_HOLD";
  return (
    <svg width={13} height={13} viewBox="-7.5 -7.5 15 15" style={{ flexShrink: 0 }} aria-hidden>
      <path
        d={pointyTopHexPathD(0, 0, 5.5, 0)}
        fill={complete ? color : "transparent"}
        stroke={color}
        strokeWidth={1.1}
        strokeDasharray={onHold ? "1.5 1.5" : undefined}
        opacity={complete ? 0.7 : 1}
      />
    </svg>
  );
}

function milestoneDueLabel(milestone: TreeMilestoneNode): string | null {
  const dated = milestone as TreeMilestoneNode & {
    dueDate?: string | null;
    dueIso?: string | null;
    deadlineIso?: string | null;
    targetDate?: string | null;
  };
  const iso = dated.dueIso ?? dated.deadlineIso ?? dated.dueDate ?? dated.targetDate ?? null;
  if (!iso) return null;
  return formatGoalDateDisplay(iso) ?? iso;
}

type PursuitPanelSectionProps = {
  label: string;
  count?: number;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
};

function PursuitPanelSection({ label, count, action, onAction, children }: PursuitPanelSectionProps) {
  return (
    <section style={{ marginBottom: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
          fontFamily: "var(--font-pf-tree-mono, ui-monospace, monospace)",
          fontSize: 10.5,
          fontWeight: 500,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.42)",
        }}
      >
        <span>
          {label}
          {count != null ? <span style={{ color: "rgba(255,255,255,0.28)" }}> · {count}</span> : null}
        </span>
        {action ? (
          <button
            type="button"
            onClick={onAction}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              border: "none",
              background: "transparent",
              color: "rgba(255,255,255,0.55)",
              cursor: "pointer",
              fontFamily: "var(--font-pf-tree-mono, ui-monospace, monospace)",
              fontSize: 10.5,
              fontWeight: 500,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: 0,
            }}
          >
            + {action}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function PursuitSignificanceBar({ value, color }: { value: number; color: string }) {
  const clamped = Math.max(1, Math.min(5, Math.round(value)));
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          style={{
            width: 14,
            height: 4,
            borderRadius: 2,
            background: n <= clamped ? color : "rgba(255,255,255,0.10)",
            boxShadow: n <= clamped ? `0 0 6px ${color}80` : "none",
          }}
        />
      ))}
    </div>
  );
}

const PURSUIT_STATUS_TABS: Array<{ value: TreeGoalNode["bloomStatus"]; label: string }> = [
  { value: "ACTIVE", label: "Active" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "COMPLETE", label: "Complete" },
];

type MilestoneSuggestionCacheEntry = {
  status: "loading" | "ready";
  suggestions: string[];
};

function PursuitStateTabs({
  current,
  color,
  busy,
  onSelect,
}: {
  current: TreeGoalNode["bloomStatus"];
  color: string;
  busy: boolean;
  onSelect: (next: TreeGoalNode["bloomStatus"]) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Pursuit state"
      style={{
        display: "flex",
        gap: 2,
        padding: 3,
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 8,
      }}
    >
      {PURSUIT_STATUS_TABS.map((tab) => {
        const selected = current === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            disabled={busy || selected}
            onClick={() => onSelect(tab.value)}
            style={{
              position: "relative",
              flex: 1,
              padding: "5px 0",
              border: "none",
              borderRadius: 6,
              background: selected ? "rgba(255,255,255,0.06)" : "transparent",
              color: selected ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.45)",
              cursor: busy || selected ? "default" : "pointer",
              fontFamily: "var(--font-pf-tree-sans, Inter, system-ui, sans-serif)",
              fontSize: 11.5,
              fontWeight: 500,
              letterSpacing: "0.005em",
              textAlign: "center",
              opacity: busy && !selected ? 0.65 : 1,
            }}
          >
            {selected && tab.value === "ACTIVE" ? (
              <span
                style={{
                  position: "absolute",
                  left: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: color,
                  boxShadow: `0 0 6px ${color}`,
                }}
                aria-hidden
              />
            ) : null}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

type PursuitPanelMoment = { id: string; text: string; date: string };
type PursuitPanelRelated = { id: string; title: string; hub: string; color: string };

function momentsAttachedToGoal(thread: DomainHubData | undefined, goal: TreeGoalNode): PursuitPanelMoment[] {
  if (!thread) return [];
  const goalIndex = thread.sequencedNodes.findIndex((node) => node.kind === "goal" && node.goal.id === goal.id);
  if (goalIndex < 0) return [];

  const moments: PursuitPanelMoment[] = [];
  for (const node of thread.sequencedNodes.slice(goalIndex + 1)) {
    if (node.kind === "goal") break;
    const moment = node.moment;
    const text = moment.description?.trim() || moment.label.trim();
    if (!text) continue;
    moments.push({
      id: moment.id,
      text,
      date: moment.calendarDateIso
        ? (formatGoalDateDisplay(moment.calendarDateIso) ?? moment.calendarDateIso)
        : moment.year != null
          ? String(moment.year)
          : "Undated",
    });
  }
  return moments;
}

/** Hub “Add moment”: insert before the first root goal on the branch line (nearest the hub). */
function sequenceAnchorForAddMomentFromHub(thread: DomainHubData): SequenceAnchor | null {
  for (const n of thread.sequencedNodes) {
    if (n.kind === "goal") return { kind: "before", nodeId: n.goal.id };
  }
  return null;
}

function goalEffectiveStartIso(g: TreeGoalNode): string {
  return g.timelineStartIso ?? g.createdAtIso ?? "";
}

function goalEffectiveDeadlineIso(g: TreeGoalNode): string {
  if (g.deadlineIso) return g.deadlineIso;
  if (g.year != null) return `${g.year}-12-31`;
  return "";
}

function formatGoalDateDisplay(iso: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [ys, ms, ds] = iso.split("-");
  const y = Number(ys);
  const mo = Number(ms);
  const d = Number(ds);
  if (!y || !mo || !d) return null;
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString(undefined, {
    dateStyle: "medium",
    timeZone: "UTC",
  });
}

function hubGoalStageSummary(goal: TreeGoalNode): {
  done: number;
  total: number;
  subtaskDone: number;
  subtaskTotal: number;
  progressPct: number;
  usesStages: boolean;
} {
  const relational = hasRelationalMilestones(goal);
  const subtasks = goal.milestones.flatMap((m) =>
    m.subtasks.filter((s) => !isScaffoldingSubtaskTitle(s.title)),
  );
  const subtaskTotal = subtasks.length;
  const subtaskDone = subtasks.filter((s) => s.isCompleted).length;

  if (relational && goal.milestones.length > 0) {
    const total = goal.milestones.length;
    const done = goal.milestones.filter((m) =>
      milestoneDoneForSemantics({
        completedAt: m.completedAt ?? null,
        subtasks: m.subtasks.map((s) => ({ isCompleted: s.isCompleted, title: s.title })),
      }),
    ).length;
    return {
      done,
      total,
      subtaskDone,
      subtaskTotal,
      progressPct: total > 0 ? Math.round((done / total) * 100) : 0,
      usesStages: true,
    };
  }

  const orbital = goal.orbitalMilestones;
  const total = orbital.length;
  const done = orbital.filter((m) => m.completed).length;
  const progressPct =
    total > 0
      ? Math.round((done / total) * 100)
      : subtaskTotal > 0
        ? Math.round((subtaskDone / subtaskTotal) * 100)
        : 0;
  return { done, total, subtaskDone, subtaskTotal, progressPct, usesStages: total > 0 };
}

function renderHubPursuitCard(
  goal: TreeGoalNode,
  area: { color: string },
  areas: TreePanelProps["areas"],
  onNavigateToGoal: (goalId: string) => void,
  variant: "default" | "canvas" = "default",
) {
  const gBadge = badgeStatusFromGoalBloom(goal.bloomStatus);
  const statusLabel = formatBloomStatusLabel(goal.bloomStatus);
  const summary = hubGoalStageSummary(goal);
  const parent = goal.parentGoalId ? findGoalInAreas(areas, goal.parentGoalId) : null;
  const sigTier = goal.significanceTier;

  if (variant === "canvas") {
    const titleClass =
      goal.bloomStatus === "COMPLETE"
        ? "pf-tree-rail-pursuit-title is-complete"
        : goal.bloomStatus === "ON_HOLD"
          ? "pf-tree-rail-pursuit-title is-on-hold"
          : "pf-tree-rail-pursuit-title";
    return (
      <button
        key={goal.id}
        type="button"
        onClick={() => onNavigateToGoal(goal.id)}
        className="pf-tree-rail-pursuit-row"
      >
        <PursuitHexGlyph color={area.color} bloomStatus={goal.bloomStatus} />
        <span className={titleClass}>{goal.title}</span>
        {goal.bloomStatus === "ON_HOLD" ? (
          <span className="pf-tree-rail-pursuit-badge">on hold</span>
        ) : null}
        {goal.bloomStatus === "COMPLETE" ? (
          <span className="pf-tree-rail-pursuit-done" style={{ color: area.color }}>
            ✓ done
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <button
      key={goal.id}
      type="button"
      onClick={() => onNavigateToGoal(goal.id)}
      style={{
        display: "grid",
        gap: 10,
        border: "1px solid var(--color-border-tertiary)",
        borderRadius: 12,
        padding: "12px 14px",
        background: "var(--color-background-secondary, rgba(255,255,255,0.02))",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <span
          style={{
            fontSize: 16,
            fontWeight: 600,
            lineHeight: 1.35,
            color: "var(--color-text-primary)",
          }}
        >
          {goal.title}
        </span>
        <span
          style={{
            ...statusBadgeStyle(gBadge),
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: ".04em",
            textTransform: "uppercase",
            borderRadius: 999,
            padding: "3px 8px",
            flexShrink: 0,
          }}
        >
          {statusLabel}
        </span>
      </div>

      {summary.total > 0 || summary.subtaskTotal > 0 ? (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              marginBottom: 6,
              fontSize: 12,
              color: "var(--color-text-secondary)",
            }}
          >
            <span>
              {summary.usesStages
                ? `${summary.done}/${summary.total} stages`
                : `${summary.done}/${summary.total} milestones`}
            </span>
            <span>{summary.progressPct}%</span>
          </div>
          <div
            style={{
              height: 5,
              borderRadius: 999,
              background: "var(--color-border-tertiary)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${summary.progressPct}%`,
                height: "100%",
                borderRadius: 999,
                background: area.color,
                opacity: 0.9,
              }}
            />
          </div>
          {summary.subtaskTotal > 0 ? (
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--color-text-tertiary)" }}>
              {summary.subtaskDone}/{summary.subtaskTotal} steps complete
            </p>
          ) : null}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-tertiary)" }}>No milestones yet</p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {typeof sigTier === "number" ? (
          <span
            style={{
              fontSize: 11,
              color: "var(--color-text-tertiary)",
              border: "1px solid var(--color-border-tertiary)",
              borderRadius: 999,
              padding: "2px 8px",
            }}
          >
            {sigLabel(sigTier)}
          </span>
        ) : null}
        {goal.forkedGoalIds.length > 0 ? (
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
            {goal.forkedGoalIds.length} continuation
            {goal.forkedGoalIds.length === 1 ? "" : "s"}
          </span>
        ) : null}
        {parent ? (
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
            Continues from “{parent.goal.title}”
          </span>
        ) : null}
      </div>
    </button>
  );
}

function railSectionStyle(
  rail: boolean,
  areaColor: string,
  surface: "roadmap" | "canvas",
  variant: "standard" | "goal" = "standard",
): CSSProperties {
  if (!rail) {
    return {
      borderTop: `1.5px solid ${areaColor}`,
      animation: "slideup 160ms ease-out",
      background: surface === "canvas" ? "transparent" : "var(--color-background-primary)",
      position: "relative",
      ...(variant === "goal" ? { padding: "14px 18px 20px" } : {}),
    };
  }
  if (surface === "canvas") {
    return {
      height: "100%",
      minHeight: 0,
      flex: 1,
      display: "flex",
      flexDirection: "column",
      overflow: variant === "goal" ? "auto" : "hidden",
      background: "transparent",
      position: "relative",
      ...(variant === "goal" ? { padding: "14px 18px 20px" } : {}),
    };
  }
  return {
    height: "100%",
    minHeight: 0,
    flex: 1,
    borderRight: `4px solid ${areaColor}`,
    display: "flex",
    flexDirection: "column",
    overflow: variant === "goal" ? "auto" : "hidden",
    background: "var(--color-background-primary)",
    position: "relative",
    ...(variant === "goal"
      ? { borderLeft: "none", borderTop: "none", padding: "14px 18px 20px" }
      : {}),
  };
}

function firstNameFromUserName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

export function TreePanel({
  panel,
  areas,
  currentUserName,
  panelPresentation = "sheet",
  panelSurface = "roadmap",
  onClose,
  onOpenArea,
  onOpenHub,
  onOpenThemeStream,
  onOpenHubStream,
  onOpenGoalStream,
  onAddGoal,
  onAddMoment,
  archivedGoals,
  archivedMarks,
  onReviveGoal,
  onReviveMark,
  onUpdateGoal,
  onAppendCanonicalTreeMilestone,
  onSetMilestoneCompletion,
  onNavigateToGoal,
}: TreePanelProps) {
  const [goalStatusBusy, setGoalStatusBusy] = useState(false);
  const [goalStatusError, setGoalStatusError] = useState<string | null>(null);
  const [hubShowInactiveGoals, setHubShowInactiveGoals] = useState(false);
  const [pendingMilestoneIds, setPendingMilestoneIds] = useState<Set<string>>(() => new Set());
  const [milestoneError, setMilestoneError] = useState<string | null>(null);
  const [milestoneNotice, setMilestoneNotice] = useState<string | null>(null);
  const [appendBusy, setAppendBusy] = useState(false);
  const [orbitalError, setOrbitalError] = useState<string | null>(null);
  const [goalEditOpen, setGoalEditOpen] = useState(false);
  const [goalEditTitle, setGoalEditTitle] = useState("");
  const [goalEditBusy, setGoalEditBusy] = useState(false);
  const [goalEditError, setGoalEditError] = useState<string | null>(null);
  const [milestoneSuggestionCache, setMilestoneSuggestionCache] = useState<
    Record<string, MilestoneSuggestionCacheEntry>
  >({});
  const goalPanelId = panel.type === "goal" ? panel.goal.id : null;
  const hubPanelId = panel.type === "hub" ? panel.thread.id : null;
  const activeSuggestionGoal =
    panel.type === "goal" ? (findGoalInAreas(areas, panel.goal.id)?.goal ?? panel.goal) : null;
  useEffect(() => {
    setPendingMilestoneIds(new Set());
    setMilestoneError(null);
    setMilestoneNotice(null);
    setAppendBusy(false);
    setGoalEditOpen(false);
    setGoalEditTitle("");
    setGoalEditBusy(false);
    setGoalEditError(null);
    setGoalStatusBusy(false);
    setGoalStatusError(null);
  }, [goalPanelId]);

  useEffect(() => {
    setHubShowInactiveGoals(false);
  }, [hubPanelId]);

  useEffect(() => {
    if (
      !activeSuggestionGoal ||
      activeSuggestionGoal.bloomStatus !== "ACTIVE" ||
      activeSuggestionGoal.milestones.length > 0 ||
      milestoneSuggestionCache[activeSuggestionGoal.id]
    ) {
      return;
    }

    const goalId = activeSuggestionGoal.id;
    const goalTitle = activeSuggestionGoal.title;
    const existing = activeSuggestionGoal.milestones.map((m) => m.title);
    let cancelled = false;

    setMilestoneSuggestionCache((prev) =>
      prev[goalId] ? prev : { ...prev, [goalId]: { status: "loading", suggestions: [] } },
    );

    void (async () => {
      try {
        const res = await fetch("/api/goals/suggest-milestones", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goalTitle, existing }),
        });
        if (!res.ok) throw new Error("suggest failed");
        const data = (await res.json()) as { suggestions?: unknown };
        const suggestions = Array.isArray(data.suggestions)
          ? data.suggestions.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          : [];
        if (cancelled) return;
        setMilestoneSuggestionCache((prev) => ({
          ...prev,
          [goalId]: { status: "ready", suggestions: suggestions.map((item) => item.trim()) },
        }));
      } catch {
        if (cancelled) return;
        setMilestoneSuggestionCache((prev) => ({
          ...prev,
          [goalId]: { status: "ready", suggestions: [] },
        }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeSuggestionGoal, milestoneSuggestionCache]);

  /** Append one relational milestone from tree UX. */
  const appendCanonicalToServer = useCallback(
    async (goalId: string, title: string, onSuccess?: () => void) => {
      setOrbitalError(null);
      setAppendBusy(true);
      const result = await onAppendCanonicalTreeMilestone(goalId, title);
      setAppendBusy(false);
      if (!result.ok) {
        setOrbitalError(result.error ?? "Could not add milestone.");
        return;
      }
      onSuccess?.();
    },
    [onAppendCanonicalTreeMilestone],
  );

  if (panel.type === "none") return null;

  if (panel.type === "area") {
    const area = panel.area;
    const areaRail = panelPresentation === "rail";
    const lifeArea = getLifeArea(area.id);
    const roadmapGoalsTotal = countRoadmapGoalsInArea(area);
    const branchN = area.branches.length;
    const themeMomentCount = area.branches.reduce(
      (n, thread) => n + thread.moments.filter((m) => m.synthetic !== true).length,
      0,
    );
    const themeCopy = themePanelCopy(area.id);
    const themeAbout =
      area.summary?.trim() || lifeArea?.emptyPrompt || themeCopy.vision;
    const themeTagline = lifeArea?.sublabel;
    const areaCanvasRail = isCanvasDetailRail(panelSurface, panelPresentation);
    return (
      <section style={railSectionStyle(areaRail, area.color, panelSurface)}>
        {areaCanvasRail ? (
          <>
            <div className="pf-tree-rail-crumb-row">
              <div className="pf-tree-rail-crumb">
                <span
                  className="pf-tree-rail-crumb-dot"
                  style={{ color: area.color, borderColor: area.color, boxShadow: `0 0 8px ${area.color}` }}
                />
                <span>{area.label}</span>
              </div>
              <button type="button" className="pf-tree-rail-close" onClick={onClose} aria-label="Close panel">
                ×
              </button>
            </div>
            <div className="pf-tree-rail-catalog">
              <h2 className="pf-tree-rail-title">{area.label}</h2>
              {themeTagline ? <p className="pf-tree-rail-meta">{themeTagline}</p> : null}
              {themeAbout ? <p className="pf-tree-rail-body">{themeAbout}</p> : null}
              <p className="pf-tree-rail-meta">
                {branchN} {branchN === 1 ? "hub" : "hubs"} · {roadmapGoalsTotal}{" "}
                {roadmapGoalsTotal === 1 ? "pursuit" : "pursuits"}
                {themeMomentCount > 0
                  ? ` · ${themeMomentCount} ${themeMomentCount === 1 ? "mark" : "marks"}`
                  : ""}
              </p>
              {onOpenThemeStream ? (
                <div className="pf-tree-rail-actions">
                  <StreamEntryButton
                    subjectName={area.label}
                    accent={area.color}
                    onClick={() => onOpenThemeStream(area)}
                    testId="tree-open-theme-stream"
                    variant="canvas"
                  />
                </div>
              ) : null}
            </div>
            <div className="pf-tree-rail-scroll">
              <div className="pf-tree-rail-section-head">
                <span>Hubs · {branchN}</span>
              </div>
              {area.branches.map((thread) => {
                const threadGoalCount = countRoadmapGoalsOnThread(thread);
                const hubLabel = thread.type.trim() || "Hub";
                const hubBlurb = hubPanelCopy(area.id, hubLabel).about;
                return (
                  <button
                    key={thread.id}
                    type="button"
                    className="pf-tree-rail-hub-card"
                    onClick={() => onOpenHub(area, thread)}
                  >
                    <span className="pf-tree-rail-hub-card-title">{hubLabel}</span>
                    <p className="pf-tree-rail-hub-card-blurb">{hubBlurb}</p>
                    <p className="pf-tree-rail-meta" style={{ margin: 0 }}>
                      {threadGoalCount} {threadGoalCount === 1 ? "pursuit" : "pursuits"}
                    </p>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                flexShrink: 0,
                padding: "16px 18px 14px",
                borderBottom: "1px solid var(--color-border-tertiary)",
                position: "relative",
              }}
            >
              <button
                type="button"
                onClick={onClose}
                aria-label="Close panel"
                style={{
                  position: "absolute",
                  right: 10,
                  top: 10,
                  border: "none",
                  background: "transparent",
                  fontSize: 22,
                  lineHeight: 1,
                  color: "var(--color-text-tertiary)",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: area.color,
                  marginBottom: 6,
                }}
              >
                Theme
              </div>
              <h2
                style={{
                  margin: "0 0 4px",
                  fontSize: 22,
                  fontWeight: 600,
                  lineHeight: 1.25,
                  color: "var(--color-text-primary)",
                  paddingRight: 28,
                }}
              >
                {area.label}
              </h2>
              {themeTagline ? (
                <p style={{ margin: "0 0 8px", fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.4 }}>
                  {themeTagline}
                </p>
              ) : null}
              {themeAbout ? (
                <p
                  style={{
                    margin: "0 0 8px",
                    fontSize: 14,
                    color: "var(--color-text-secondary)",
                    lineHeight: 1.45,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {themeAbout}
                </p>
              ) : null}
              <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-tertiary)", lineHeight: 1.45 }}>
                {branchN} {branchN === 1 ? "hub" : "hubs"} · {roadmapGoalsTotal}{" "}
                {roadmapGoalsTotal === 1 ? "pursuit" : "pursuits"}
                {themeMomentCount > 0
                  ? ` · ${themeMomentCount} ${themeMomentCount === 1 ? "mark" : "marks"}`
                  : ""}
              </p>
              {onOpenThemeStream ? (
                <StreamEntryButton
                  subjectName={area.label}
                  accent={area.color}
                  onClick={() => onOpenThemeStream(area)}
                  testId="tree-open-theme-stream"
                />
              ) : null}
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 18px 20px" }}>
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: ".07em",
                      textTransform: "uppercase",
                      color: "var(--color-text-tertiary)",
                    }}
                  >
                    Hubs in this theme
                  </div>
                  {area.branches.map((thread) => {
                    const statuses = thread.goals.map((g) => badgeStatusFromGoalBloom(g.bloomStatus));
                    const hasOnHold = statuses.includes("on_hold");
                    const hasActive = statuses.includes("active");
                    const hasComplete = statuses.includes("complete");
                    const badge = hasActive ? "active" : hasOnHold && !hasComplete ? "on_hold" : "complete";
                    const threadGoalCount = countRoadmapGoalsOnThread(thread);
                    const hubLabel = thread.type.trim() || "Hub";
                    const hubBlurb = hubPanelCopy(area.id, hubLabel).about;
                    return (
                      <button
                        key={thread.id}
                        type="button"
                        onClick={() => onOpenHub(area, thread)}
                        style={{
                          display: "grid",
                          gap: 8,
                          border: "1px solid var(--color-border-tertiary)",
                          borderRadius: 12,
                          padding: "12px 14px",
                          background: "var(--color-background-secondary, rgba(255,255,255,0.02))",
                          cursor: "pointer",
                          textAlign: "left",
                          width: "100%",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: 10,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 16,
                              fontWeight: 600,
                              lineHeight: 1.35,
                              color: "var(--color-text-primary)",
                            }}
                          >
                            {hubLabel}
                          </span>
                          <span
                            style={{
                              ...statusBadgeStyle(badge),
                              fontSize: 11,
                              fontWeight: 600,
                              letterSpacing: ".04em",
                              textTransform: "uppercase",
                              borderRadius: 999,
                              padding: "3px 8px",
                              flexShrink: 0,
                            }}
                          >
                            {badge}
                          </span>
                        </div>
                        <p
                          style={{
                            margin: 0,
                            fontSize: 13,
                            lineHeight: 1.45,
                            color: "var(--color-text-tertiary)",
                            overflow: "hidden",
                            display: "-webkit-box",
                            WebkitLineClamp: 1,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          {hubBlurb}
                        </p>
                        <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-tertiary)" }}>
                          {threadGoalCount} {threadGoalCount === 1 ? "pursuit" : "pursuits"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    );
  }

  if (panel.type === "hub") {
    const area = panel.area;
    const thread = area.branches.find((t) => t.id === panel.thread.id) ?? panel.thread;
    const hubLabelRaw = thread.type.trim() || "Hub";
    const hubLabel = canonicalHubDisplayLabel(area.id, hubLabelRaw);
    const hubGoals = thread.goals;
    const hubActiveGoals = hubGoals.filter((g) => g.bloomStatus === "ACTIVE");
    const hubInactiveGoals = hubGoals.filter(
      (g) => g.bloomStatus === "ON_HOLD" || g.bloomStatus === "COMPLETE",
    );
    const hubRail = panelPresentation === "rail";
    const momentCount = thread.moments.filter((m) => m.synthetic !== true).length;
    const hubCopy = hubPanelCopy(area.id, hubLabelRaw);
    const hubCtx = {
      branchId: thread.id,
      areaId: area.id,
      branchLabel: hubLabel,
      areaLabel: area.label,
      anchorClient: { x: 0, y: 0 },
    };
    const hubArchivedGoals = (archivedGoals ?? []).filter((g) => g.branchId === thread.id);
    const hubArchivedMarks = (archivedMarks ?? []).filter((m) => m.branchId === thread.id);
    const hasArchiveSection = hubArchivedGoals.length > 0 || hubArchivedMarks.length > 0;
    const hubUnresolvedCount = thread.moments.filter(
      (m) => m.needsResolution === true && m.synthetic !== true,
    ).length;
    const hubCanvasRail = isCanvasDetailRail(panelSurface, panelPresentation);
    const pursuitCardVariant = hubCanvasRail ? "canvas" : "default";

    const hubArchiveBlock = hasArchiveSection ? (
      <div style={{ display: "grid", gap: 10, marginTop: hubCanvasRail ? 16 : 0 }}>
        <div
          style={
            hubCanvasRail
              ? undefined
              : {
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: ".07em",
                  textTransform: "uppercase",
                  color: "var(--color-text-tertiary)",
                }
          }
          className={hubCanvasRail ? "pf-tree-rail-section-head" : undefined}
        >
          <span>Removed from map</span>
        </div>
        {hubArchivedGoals.map((g) => (
          <div
            key={`goal-${g.id}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              border: hubCanvasRail ? "none" : "1px solid var(--color-border-tertiary)",
              borderRadius: 10,
              padding: "10px 12px",
              background: hubCanvasRail
                ? "transparent"
                : "var(--color-background-secondary, rgba(255,255,255,0.02))",
            }}
          >
            <span style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.35 }}>
              {g.title}
            </span>
            {onReviveGoal ? (
              <button
                type="button"
                onClick={() => void onReviveGoal(g.id)}
                style={{
                  flexShrink: 0,
                  border: "none",
                  background: "transparent",
                  fontSize: 13,
                  color: area.color,
                  cursor: "pointer",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                  padding: 0,
                }}
              >
                Restore
              </button>
            ) : null}
          </div>
        ))}
        {hubArchivedMarks.map((m) => (
          <div
            key={`mark-${m.id}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              border: hubCanvasRail ? "none" : "1px solid var(--color-border-tertiary)",
              borderRadius: 10,
              padding: "10px 12px",
              background: hubCanvasRail
                ? "transparent"
                : "var(--color-background-secondary, rgba(255,255,255,0.02))",
            }}
          >
            <span style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.35 }}>
              <span style={{ color: PF_TREE_MARK_COLOR, marginRight: 6 }} aria-hidden>
                ◆
              </span>
              {m.title}
            </span>
            {onReviveMark ? (
              <button
                type="button"
                onClick={() => void onReviveMark(m.id)}
                style={{
                  flexShrink: 0,
                  border: "none",
                  background: "transparent",
                  fontSize: 13,
                  color: area.color,
                  cursor: "pointer",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                  padding: 0,
                }}
              >
                Restore
              </button>
            ) : null}
          </div>
        ))}
      </div>
    ) : null;

    const hubPursuitsBlock =
      hubGoals.length === 0 ? (
        hubCanvasRail ? (
          <p className="pf-tree-rail-empty">
            No pursuits on this hub yet. Tell Pathfinder about this part of your life — it&apos;ll surface
            what&apos;s there.
          </p>
        ) : (
          <div
            style={{
              padding: "20px 16px",
              borderRadius: 12,
              border: "1px dashed var(--color-border-secondary)",
              background: "var(--color-background-secondary, rgba(255,255,255,0.02))",
              textAlign: "center",
            }}
          >
            <p
              style={{
                margin: "0 0 4px",
                fontSize: 15,
                fontWeight: 500,
                color: "var(--color-text-primary)",
              }}
            >
              No pursuits yet
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-tertiary)", lineHeight: 1.5 }}>
              Add a pursuit to start tracking on this hub.
            </p>
          </div>
        )
      ) : (
        <>
          {hubActiveGoals.map((goal) =>
            renderHubPursuitCard(goal, area, areas, onNavigateToGoal, pursuitCardVariant),
          )}
          {hubInactiveGoals.length > 0 && !hubShowInactiveGoals ? (
            <button
              type="button"
              onClick={() => setHubShowInactiveGoals(true)}
              style={{
                border: "none",
                background: "transparent",
                fontSize: 13,
                color: hubCanvasRail ? "rgba(255,255,255,0.55)" : area.color,
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: 3,
                padding: "4px 10px",
                textAlign: "left",
              }}
            >
              Show {hubInactiveGoals.length} on hold or complete
            </button>
          ) : null}
          {hubShowInactiveGoals
            ? hubInactiveGoals.map((goal) =>
                renderHubPursuitCard(goal, area, areas, onNavigateToGoal, pursuitCardVariant),
              )
            : null}
        </>
      );

    return (
      <section style={railSectionStyle(hubRail, area.color, panelSurface)}>
        {hubCanvasRail ? (
          <>
            <div className="pf-tree-rail-crumb-row">
              <button
                type="button"
                className="pf-tree-rail-crumb"
                onClick={() => onOpenArea(area)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  padding: 0,
                  textAlign: "left",
                }}
              >
                <span
                  className="pf-tree-rail-crumb-dot"
                  style={{ color: area.color, borderColor: area.color, boxShadow: `0 0 8px ${area.color}` }}
                />
                <span>{area.label}</span>
                <span className="pf-tree-rail-crumb-sep">›</span>
                <span className="pf-tree-rail-crumb-active">{hubLabel}</span>
              </button>
              <button type="button" className="pf-tree-rail-close" onClick={onClose} aria-label="Close panel">
                ×
              </button>
            </div>
            <div className="pf-tree-rail-catalog">
              <h2 className="pf-tree-rail-title">{hubLabel}</h2>
              <p className="pf-tree-rail-body">{hubCopy.about}</p>
              <p className="pf-tree-rail-meta">
                {hubGoals.length} {hubGoals.length === 1 ? "pursuit" : "pursuits"}
                {momentCount > 0 ? ` · ${momentCount} ${momentCount === 1 ? "mark" : "marks"}` : ""}
              </p>
              {hubUnresolvedCount > 0 ? (
                <p className="pf-tree-rail-meta" style={{ color: area.color }}>
                  {hubUnresolvedCount} {hubUnresolvedCount === 1 ? "item needs" : "items need"} your input on
                  the tree
                </p>
              ) : null}
              <div className="pf-tree-rail-actions">
                {onOpenHubStream ? (
                  <StreamEntryButton
                    subjectName={hubLabel}
                    accent={area.color}
                    onClick={() => onOpenHubStream(area, thread)}
                    testId="tree-open-hub-stream"
                    variant="canvas"
                  />
                ) : null}
                {onAddMoment ? (
                  <button
                    type="button"
                    data-testid="tree-add-moment"
                    className="pf-tree-rail-btn-ghost"
                    onClick={() =>
                      onAddMoment({
                        branchId: thread.id,
                        areaId: area.id,
                        sequenceAnchor: sequenceAnchorForAddMomentFromHub(thread),
                      })
                    }
                  >
                    <span style={{ color: PF_TREE_MARK_COLOR }} aria-hidden>
                      ◆
                    </span>
                    Add mark
                  </button>
                ) : null}
              </div>
            </div>
            <div className="pf-tree-rail-scroll">
              <div className="pf-tree-rail-section-head">
                <span>
                  Pursuits · {hubGoals.length}
                </span>
                <button
                  type="button"
                  className="pf-tree-rail-section-add"
                  data-testid="tree-add-goal"
                  onClick={() => onAddGoal(hubCtx)}
                >
                  + Add
                </button>
              </div>
              {hubPursuitsBlock}
              {hubArchiveBlock}
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                flexShrink: 0,
                padding: "16px 18px 14px",
                borderBottom: "1px solid var(--color-border-tertiary)",
                position: "relative",
              }}
            >
              <button
                type="button"
                onClick={onClose}
                aria-label="Close panel"
                style={{
                  position: "absolute",
                  right: 10,
                  top: 10,
                  border: "none",
                  background: "transparent",
                  fontSize: 22,
                  lineHeight: 1,
                  color: "var(--color-text-tertiary)",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
              <button
                type="button"
                onClick={() => onOpenArea(area)}
                style={{
                  display: "block",
                  marginBottom: 10,
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  fontSize: 13,
                  color: "var(--color-text-tertiary)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                ← {area.label}
              </button>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: area.color,
                  marginBottom: 6,
                }}
              >
                {area.label} · Hub
              </div>
              <h2
                style={{
                  margin: "0 0 8px",
                  fontSize: 22,
                  fontWeight: 600,
                  lineHeight: 1.25,
                  color: "var(--color-text-primary)",
                  paddingRight: 28,
                }}
              >
                {hubLabel}
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-tertiary)", lineHeight: 1.45 }}>
                {hubGoals.length} {hubGoals.length === 1 ? "pursuit" : "pursuits"}
                {momentCount > 0 ? ` · ${momentCount} ${momentCount === 1 ? "mark" : "marks"}` : ""}
              </p>
              {hubUnresolvedCount > 0 ? (
                <p style={{ margin: "8px 0 0", fontSize: 13, color: area.color, lineHeight: 1.45 }}>
                  {hubUnresolvedCount} {hubUnresolvedCount === 1 ? "item needs" : "items need"} your input on
                  the tree
                </p>
              ) : null}
              {onOpenHubStream ? (
                <StreamEntryButton
                  subjectName={hubLabel}
                  accent={area.color}
                  onClick={() => onOpenHubStream(area, thread)}
                  testId="tree-open-hub-stream"
                />
              ) : null}
              <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                {hubGoals.length === 0 ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      data-testid="tree-add-goal"
                      onClick={() => onAddGoal(hubCtx)}
                      style={hubGhostBtnStyle}
                    >
                      Add pursuit
                    </button>
                    {onAddMoment ? (
                      <button
                        type="button"
                        data-testid="tree-add-moment"
                        onClick={() =>
                          onAddMoment({
                            branchId: thread.id,
                            areaId: area.id,
                            sequenceAnchor: sequenceAnchorForAddMomentFromHub(thread),
                          })
                        }
                        style={hubGhostBtnStyle}
                      >
                        Add mark
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      data-testid="tree-add-goal"
                      onClick={() => onAddGoal(hubCtx)}
                      style={{ ...hubGhostBtnStyle, flex: 1 }}
                    >
                      Add pursuit
                    </button>
                    {onAddMoment ? (
                      <button
                        type="button"
                        data-testid="tree-add-moment"
                        onClick={() =>
                          onAddMoment({
                            branchId: thread.id,
                            areaId: area.id,
                            sequenceAnchor: sequenceAnchorForAddMomentFromHub(thread),
                          })
                        }
                        style={{ ...hubGhostBtnStyle, flex: 1 }}
                      >
                        Add mark
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 18px 20px" }}>
              <div style={{ display: "grid", gap: 18 }}>
                <HubCatalogPanelSections copy={hubCopy} areaColor={area.color} areas={areas} compact />
                {hubGoals.length === 0 ? (
                  hubPursuitsBlock
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: ".07em",
                        textTransform: "uppercase",
                        color: "var(--color-text-tertiary)",
                      }}
                    >
                      Pursuits on this hub
                    </div>
                    {hubPursuitsBlock}
                  </div>
                )}
                {hubArchiveBlock}
              </div>
            </div>
          </>
        )}
      </section>
    );
  }

  if (panel.type === "goal") {
    /** Reflect post-`loadData()` data after milestone/subtask toggles (panel state holds a stale snapshot otherwise). */
    const live = findGoalInAreas(areas, panel.goal.id);
    const goal = live?.goal ?? panel.goal;
    const area = live?.area ?? panel.area;
    const thread = area.branches.find((t) => t.id === goal.branchId);
    const hubLabel = canonicalHubDisplayLabel(area.id, thread?.type.trim() || "Hub");
    const isComplete = goal.bloomStatus === "COMPLETE";
    const isOnHold = goal.bloomStatus === "ON_HOLD";
    const provenance = goal as TreeGoalNode & {
      streamSourceText?: string | null;
      sourceText?: string | null;
      provenanceText?: string | null;
    };
    const heardFirstQuote =
      provenance.streamSourceText?.trim() ||
      provenance.sourceText?.trim() ||
      provenance.provenanceText?.trim() ||
      null;
    const pursuitMoments = momentsAttachedToGoal(thread, goal);
    const relatedPursuits: PursuitPanelRelated[] = [];
    const isCompletedFor = (s: { isCompleted: boolean }) => s.isCompleted;
    const goalRail = panelPresentation === "rail";
    const parentContinuation = goal.parentGoalId
      ? findGoalInAreas(areas, goal.parentGoalId)
      : null;
    const goalDescription = goal.description?.trim();
    const goalDateSummary = [
      goalEffectiveStartIso(goal)
        ? `Started ${formatGoalDateDisplay(goalEffectiveStartIso(goal)) ?? goalEffectiveStartIso(goal)}`
        : null,
      goalEffectiveDeadlineIso(goal)
        ? `Deadline ${formatGoalDateDisplay(goalEffectiveDeadlineIso(goal)) ?? goalEffectiveDeadlineIso(goal)}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const userFirstName = firstNameFromUserName(currentUserName);
    const goalSubtitle =
      goalDateSummary ||
      `${userFirstName ? `${userFirstName} is` : "You are"} tracking this through ${area.label} › ${hubLabel}.`;
    const significance = goal.significanceTier ?? 4;
    const milestoneSuggestions = milestoneSuggestionCache[goal.id];
    const addMilestone = () => {
      const title = formatUserInput(window.prompt("Add milestone") ?? "");
      if (!title || appendBusy) return;
      void appendCanonicalToServer(goal.id, title, () => {
        setMilestoneSuggestionCache((prev) => {
          const next = { ...prev };
          delete next[goal.id];
          return next;
        });
      });
    };
    const addSuggestedMilestone = (title: string) => {
      const normalized = formatUserInput(title);
      if (!normalized || appendBusy) return;
      setMilestoneSuggestionCache((prev) => {
        const current = prev[goal.id];
        if (!current) return prev;
        return {
          ...prev,
          [goal.id]: {
            ...current,
            suggestions: current.suggestions.filter((item) => item !== title),
          },
        };
      });
      void appendCanonicalToServer(goal.id, normalized, () => {
        setMilestoneSuggestionCache((prev) => {
          const next = { ...prev };
          delete next[goal.id];
          return next;
        });
      });
    };

    const openGoalEdit = () => {
      setGoalEditTitle(goal.title);
      setGoalEditError(null);
      setGoalEditOpen(true);
    };
    const footerBaseButtonStyle: CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 999,
      background: "rgba(255,255,255,0.03)",
      color: "rgba(245,235,214,0.78)",
      cursor: "pointer",
      fontSize: 12,
      fontWeight: 500,
      padding: "7px 11px",
      whiteSpace: "nowrap",
      lineHeight: 1,
    };
    const footerTertiaryButtonStyle: CSSProperties = {
      ...footerBaseButtonStyle,
      borderColor: "rgba(255,255,255,0.05)",
      background: "rgba(255,255,255,0.015)",
      color: "rgba(245,235,214,0.58)",
      fontSize: 11.5,
      padding: "6px 9px",
    };

    return (
      <section
        style={{
          ...railSectionStyle(goalRail, area.color, panelSurface, "goal"),
          padding: 0,
          overflow: "hidden",
          borderRadius: goalRail ? 18 : undefined,
          background: "var(--color-background-primary, var(--pf-tree-glass-bg))",
          borderWidth: panelSurface === "canvas" ? 1 : undefined,
          borderStyle: panelSurface === "canvas" ? "solid" : undefined,
          borderColor: panelSurface === "canvas" ? "rgba(255,255,255,0.08)" : undefined,
          backdropFilter: panelSurface === "canvas" ? "blur(28px) saturate(1.1)" : undefined,
          WebkitBackdropFilter: panelSurface === "canvas" ? "blur(28px) saturate(1.1)" : undefined,
        }}
      >
        <div
          style={{
            padding: "18px 22px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => {
              if (thread) onOpenHub(area, thread);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              minWidth: 0,
              border: "none",
              background: "transparent",
              padding: 0,
              color: "rgba(255,255,255,0.42)",
              cursor: thread ? "pointer" : "default",
              fontFamily: "var(--font-pf-tree-mono, ui-monospace, monospace)",
              fontSize: 10.5,
              fontWeight: 500,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              textAlign: "left",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#0B0A11",
                border: `1px solid ${area.color}`,
                boxShadow: `0 0 8px ${area.color}`,
                flexShrink: 0,
              }}
            />
            <span>{area.label}</span>
            <span style={{ color: "rgba(255,255,255,0.20)" }}>›</span>
            <span style={{ color: "rgba(255,255,255,0.62)" }}>{hubLabel}</span>
            <span style={{ color: "rgba(255,255,255,0.20)" }}>›</span>
            <span style={{ color: "rgba(255,255,255,0.85)" }}>Pursuit</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            style={{
              flexShrink: 0,
              border: "none",
              background: "transparent",
              color: "rgba(255,255,255,0.42)",
              cursor: "pointer",
              padding: 6,
              borderRadius: 6,
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: "4px 22px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
          <PursuitStateTabs
            current={goal.bloomStatus}
            color={area.color}
            busy={goalStatusBusy}
            onSelect={async (next) => {
              if (next === goal.bloomStatus) return;
              setGoalStatusError(null);
              setGoalStatusBusy(true);
              const result = await onUpdateGoal(goal.id, { bloomStatus: next });
              setGoalStatusBusy(false);
              if (!result.ok) setGoalStatusError(result.error ?? "Could not update status.");
            }}
          />
          {goalStatusError ? (
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--color-text-danger, #f87171)" }}>
              {goalStatusError}
            </p>
          ) : null}

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, marginBottom: 14 }}>
            <span
              style={{
                fontFamily: "var(--font-pf-tree-mono, ui-monospace, monospace)",
                fontSize: 10.5,
                fontWeight: 500,
                color: "rgba(255,255,255,0.42)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              Weight
            </span>
            <PursuitSignificanceBar value={significance} color={area.color} />
            <span
              style={{
                marginLeft: "auto",
                fontFamily: "var(--font-pf-tree-mono, ui-monospace, monospace)",
                fontSize: 10.5,
                color: "rgba(255,255,255,0.42)",
                letterSpacing: "0.06em",
              }}
            >
              {significance} of 5
            </span>
          </div>

          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <svg width={32} height={32} viewBox="-16 -16 32 32" style={{ flexShrink: 0, marginTop: 4 }} aria-hidden>
              <path d={pointyTopHexPathD(0, 0, 13, 0)} fill={area.color} opacity={0.18} />
              <path
                d={pointyTopHexPathD(0, 0, 9, 0)}
                fill="#0A0911"
                stroke={area.color}
                strokeWidth={1.4}
                strokeDasharray={isOnHold ? "2 2" : undefined}
              />
              {isComplete ? (
                <path
                  d="M -3 0 L -1 2 L 4 -3"
                  fill="none"
                  stroke={area.color}
                  strokeWidth={1.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
            </svg>

            <div style={{ flex: 1, minWidth: 0 }}>
              {goalEditOpen ? (
                <div style={{ display: "grid", gap: 8 }}>
                  <input
                    type="text"
                    autoComplete="off"
                    autoFocus
                    aria-label="Pursuit title"
                    placeholder="Pursuit title"
                    value={goalEditTitle}
                    disabled={goalEditBusy}
                    onChange={(e) => {
                      setGoalEditTitle(e.target.value);
                      if (goalEditError) setGoalEditError(null);
                    }}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.04)",
                      color: "rgba(255,255,255,0.96)",
                      fontSize: 18,
                      fontWeight: 500,
                    }}
                  />
                  {goalEditError ? (
                    <p style={{ color: "var(--color-text-danger, #f87171)", fontSize: 13, margin: 0 }}>
                      {goalEditError}
                    </p>
                  ) : null}
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <button
                      type="button"
                      disabled={goalEditBusy || !formatUserInput(goalEditTitle)}
                      onClick={async () => {
                        const title = formatUserInput(goalEditTitle);
                        if (!title || goalEditBusy) return;
                        setGoalEditBusy(true);
                        setGoalEditError(null);
                        const result = await onUpdateGoal(goal.id, { title });
                        setGoalEditBusy(false);
                        if (!result.ok) {
                          setGoalEditError(result.error ?? "Could not save.");
                          return;
                        }
                        setGoalEditOpen(false);
                      }}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: area.color,
                        cursor: goalEditBusy ? "wait" : "pointer",
                        fontSize: 13,
                        fontWeight: 600,
                        padding: 0,
                      }}
                    >
                      {goalEditBusy ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      disabled={goalEditBusy}
                      onClick={() => {
                        setGoalEditOpen(false);
                        setGoalEditError(null);
                      }}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "rgba(255,255,255,0.42)",
                        cursor: goalEditBusy ? "wait" : "pointer",
                        fontSize: 13,
                        padding: 0,
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <h2
                  style={{
                    margin: 0,
                    fontSize: 24,
                    fontWeight: 600,
                    letterSpacing: "-0.018em",
                    lineHeight: 1.18,
                    color: isComplete || isOnHold ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.96)",
                    textDecoration: isComplete ? "line-through" : "none",
                    textDecorationColor: "rgba(255,255,255,0.30)",
                  }}
                >
                  {goal.title}
                </h2>
              )}
            </div>
          </div>

          {goal.parentGoalId && parentContinuation ? (
            <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.42)" }}>
              nested under <span style={{ color: "rgba(255,255,255,0.78)" }}>{parentContinuation.goal.title}</span>
            </div>
          ) : null}

          <p
            style={{
              margin: "14px 0 0",
              fontSize: 14.5,
              fontWeight: 400,
              lineHeight: 1.55,
              color: isOnHold ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.66)",
              opacity: isOnHold ? 0.72 : 1,
              textWrap: "pretty",
              letterSpacing: "0.001em",
            }}
          >
            {goalSubtitle}
          </p>
          {onOpenGoalStream ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginTop: 12,
                padding: "10px 12px",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 10,
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <span style={{ fontSize: 13, lineHeight: 1.4, color: "rgba(255,255,255,0.52)" }}>
                Add milestones, marks, or context via Stream
              </span>
              <button
                type="button"
                onClick={() => onOpenGoalStream(area, goal)}
                style={{
                  flexShrink: 0,
                  border: "none",
                  background: "transparent",
                  color: area.color,
                  cursor: "pointer",
                  fontSize: 12.5,
                  fontWeight: 600,
                  padding: 0,
                  whiteSpace: "nowrap",
                }}
              >
                Open Stream →
              </button>
            </div>
          ) : null}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "18px 22px 16px" }}>
          {goalDescription ? (
            <PursuitPanelSection label="About">
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: "rgba(255,255,255,0.72)",
                  textWrap: "pretty",
                }}
              >
                {goalDescription}
              </p>
            </PursuitPanelSection>
          ) : null}

          {heardFirstQuote ? (
            <PursuitPanelSection label="Heard first">
              <div
                style={{
                  padding: "12px 14px 12px 16px",
                  background: "rgba(255,255,255,0.018)",
                  borderWidth: "1px 1px 1px 2px",
                  borderStyle: "solid",
                  borderColor: `rgba(255,255,255,0.05) rgba(255,255,255,0.05) rgba(255,255,255,0.05) ${PF_TREE_MARK_COLOR}`,
                  borderRadius: 10,
                }}
              >
                <div
                  style={{
                    fontFamily: '"Lora", Georgia, serif',
                    fontStyle: "italic",
                    fontSize: 14,
                    fontWeight: 400,
                    color: "rgba(255,255,255,0.85)",
                    lineHeight: 1.55,
                    textWrap: "pretty",
                  }}
                >
                  “{heardFirstQuote}”
                </div>
                <div
                  style={{
                    marginTop: 7,
                    fontFamily: "var(--font-pf-tree-mono, ui-monospace, monospace)",
                    fontSize: 10.5,
                    color: "rgba(255,255,255,0.42)",
                    letterSpacing: "0.06em",
                  }}
                >
                  from Stream
                </div>
              </div>
            </PursuitPanelSection>
          ) : null}

          <PursuitPanelSection label="Milestones" count={goal.milestones.length}>
            {goal.milestones.length > 0 ? (
              goal.milestones.map((m) => {
                  const milestoneComplete = milestoneDoneForSemantics({
                    completedAt: m.completedAt ?? null,
                    subtasks: m.subtasks.map((s) => ({
                      isCompleted: isCompletedFor(s),
                      title: s.title,
                    })),
                  });
                  const msPending = pendingMilestoneIds.has(m.id);
                  const displayMilestoneComplete = msPending ? !milestoneComplete : milestoneComplete;
                  const dueLabel = milestoneDueLabel(m);

                  return (
                    <label
                      key={m.id}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 11,
                        padding: "8px 0",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        cursor: msPending ? "wait" : "pointer",
                        opacity: msPending ? 0.72 : 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={displayMilestoneComplete}
                        disabled={msPending}
                        onChange={async () => {
                          const next = !milestoneComplete;
                          setMilestoneError(null);
                          setMilestoneNotice(null);
                          setPendingMilestoneIds((prev) => new Set(prev).add(m.id));
                          const result = await onSetMilestoneCompletion(goal.id, m.id, next);
                          setPendingMilestoneIds((prev) => {
                            const n = new Set(prev);
                            n.delete(m.id);
                            return n;
                          });
                          if (!result.ok) setMilestoneError(result.error ?? "Could not update milestone.");
                          else if (goal.bloomStatus === "ON_HOLD" && next) {
                            setMilestoneNotice("Milestone saved — status updates when pursuit is reactivated.");
                          }
                        }}
                        style={{ accentColor: area.color, marginTop: 2, cursor: msPending ? "wait" : "pointer" }}
                      />
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: 13.5,
                          lineHeight: 1.4,
                          color: displayMilestoneComplete ? "rgba(255,255,255,0.42)" : "rgba(255,255,255,0.92)",
                          textDecoration: displayMilestoneComplete ? "line-through" : "none",
                          textDecorationColor: "rgba(255,255,255,0.20)",
                        }}
                      >
                        {m.title}
                      </span>
                      <span
                        style={{
                          flexShrink: 0,
                          marginTop: 3,
                          fontFamily: "var(--font-pf-tree-mono, ui-monospace, monospace)",
                          fontSize: 10.5,
                          color: "rgba(255,255,255,0.42)",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {dueLabel ?? "this cycle"}
                      </span>
                    </label>
                  );
                })
            ) : (
              <div
                style={{
                  padding: "14px 16px",
                  border: "1px dashed rgba(255,255,255,0.10)",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.018)",
                  color: "rgba(255,255,255,0.52)",
                  fontSize: 13.5,
                  lineHeight: 1.45,
                }}
              >
                {goal.bloomStatus === "ACTIVE" && milestoneSuggestions?.status === "loading" ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }} aria-hidden>
                    {[0, 1, 2].map((n) => (
                      <span
                        key={n}
                        style={{
                          width: n === 1 ? 128 : 104,
                          height: 28,
                          borderRadius: 999,
                          border: `1px solid ${area.color}33`,
                          background: `linear-gradient(90deg, rgba(255,255,255,0.025), ${area.color}18, rgba(255,255,255,0.025))`,
                          opacity: 0.65,
                        }}
                      />
                    ))}
                  </div>
                ) : null}
                {goal.bloomStatus === "ACTIVE" &&
                milestoneSuggestions?.status === "ready" &&
                milestoneSuggestions.suggestions.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                    {milestoneSuggestions.suggestions.map((title) => (
                      <button
                        key={title}
                        type="button"
                        disabled={appendBusy}
                        onClick={() => addSuggestedMilestone(title)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 7,
                          maxWidth: "100%",
                          border: `1px solid ${area.color}66`,
                          borderRadius: 999,
                          background: `${area.color}10`,
                          color: "rgba(255,255,255,0.84)",
                          cursor: appendBusy ? "wait" : "pointer",
                          fontSize: 12.5,
                          fontWeight: 500,
                          lineHeight: 1.25,
                          padding: "6px 10px",
                        }}
                      >
                        <span
                          style={{
                            color: area.color,
                            fontSize: 13,
                            fontWeight: 700,
                            lineHeight: 1,
                          }}
                          aria-hidden
                        >
                          +
                        </span>
                        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <span>No milestones yet — use Stream to plan the steps.</span>
              </div>
            )}
            {goal.milestones.length > 0 ? (
              <button
                type="button"
                disabled={appendBusy}
                onClick={addMilestone}
                style={{
                  marginTop: 10,
                  border: "none",
                  background: "transparent",
                  color: "rgba(255,255,255,0.55)",
                  cursor: appendBusy ? "wait" : "pointer",
                  fontFamily: "var(--font-pf-tree-mono, ui-monospace, monospace)",
                  fontSize: 10.5,
                  fontWeight: 500,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  padding: 0,
                }}
              >
                + Add milestone
              </button>
            ) : null}
              {milestoneError || orbitalError ? (
                <p style={{ color: "var(--color-text-danger, #f87171)", fontSize: 13, margin: "8px 0 0" }}>
                  {milestoneError ?? orbitalError}
                </p>
              ) : null}
              {milestoneNotice ? (
                <p style={{ color: "var(--color-text-subtle, rgba(255,255,255,0.52))", fontSize: 13, margin: "8px 0 0" }}>
                  {milestoneNotice}
                </p>
              ) : null}
          </PursuitPanelSection>

          <PursuitPanelSection label="Marks" count={pursuitMoments.length}>
            {pursuitMoments.length > 0 ? (
              pursuitMoments.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 11,
                    padding: "10px 12px 10px 14px",
                    marginLeft: -2,
                    marginBottom: 6,
                    background: "rgba(201,162,39,0.04)",
                    borderLeft: `2px solid ${PF_TREE_MARK_COLOR}`,
                    borderRadius: "0 8px 8px 0",
                  }}
                >
                  <span style={{ color: PF_TREE_MARK_COLOR, lineHeight: 1.2 }} aria-hidden>
                    ◆
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, color: "rgba(255,255,255,0.92)", lineHeight: 1.45 }}>
                      {m.text}
                    </div>
                    <div
                      style={{
                        marginTop: 3,
                        fontFamily: "var(--font-pf-tree-mono, ui-monospace, monospace)",
                        fontSize: 10.5,
                        color: "rgba(255,255,255,0.42)",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {m.date}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: 10,
                  padding: "14px 16px",
                  border: "1px dashed rgba(201,162,39,0.18)",
                  borderRadius: 10,
                  background: "rgba(201,162,39,0.035)",
                  color: "rgba(255,255,255,0.52)",
                  fontSize: 13.5,
                  lineHeight: 1.45,
                }}
              >
                <span>No marks are attached after this pursuit yet.</span>
                {onOpenGoalStream ? (
                  <button
                    type="button"
                    onClick={() => onOpenGoalStream(area, goal)}
                    style={{
                      justifySelf: "start",
                      border: "none",
                      background: "transparent",
                      color: PF_TREE_MARK_COLOR,
                      cursor: "pointer",
                      fontFamily: "var(--font-pf-tree-mono, ui-monospace, monospace)",
                      fontSize: 10.5,
                      fontWeight: 500,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      padding: 0,
                    }}
                  >
                    Add via Stream
                  </button>
                ) : null}
              </div>
            )}
          </PursuitPanelSection>

          {parentContinuation || goal.childGoals.length > 0 ? (
            <PursuitPanelSection label="Lineage">
              {parentContinuation ? (
                <button
                  type="button"
                  onClick={() => onNavigateToGoal(parentContinuation.goal.id)}
                  style={lineageButtonStyle}
                >
                  <PursuitHexGlyph color={area.color} bloomStatus={parentContinuation.goal.bloomStatus} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={lineageTitleStyle}>{parentContinuation.goal.title}</span>
                    <span style={lineageMetaStyle}>parent pursuit</span>
                  </span>
                </button>
              ) : null}
              {goal.childGoals.map((child) => (
                <button key={child.id} type="button" onClick={() => onNavigateToGoal(child.id)} style={lineageButtonStyle}>
                  <PursuitHexGlyph color={area.color} bloomStatus={child.bloomStatus} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={lineageTitleStyle}>{child.title}</span>
                    <span style={lineageMetaStyle}>continuation · {formatBloomStatusLabel(child.bloomStatus).toLowerCase()}</span>
                  </span>
                </button>
              ))}
            </PursuitPanelSection>
          ) : null}

          {relatedPursuits.length > 0 ? (
            <PursuitPanelSection label="Related" count={relatedPursuits.length}>
              {relatedPursuits.map((r) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
                  <svg width={13} height={13} viewBox="-7 -7 14 14" style={{ flexShrink: 0 }} aria-hidden>
                    <path d={pointyTopHexPathD(0, 0, 5, 0)} fill="none" stroke={r.color} strokeWidth={1} />
                  </svg>
                  <span style={{ flex: 1, fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.35 }}>
                    {r.title}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-pf-tree-mono, ui-monospace, monospace)",
                      fontSize: 10.5,
                      color: "rgba(255,255,255,0.42)",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {r.hub}
                  </span>
                </div>
              ))}
            </PursuitPanelSection>
          ) : null}

        </div>

        <div
          style={{
            flexShrink: 0,
            padding: "12px 14px",
            borderTop: "1px solid rgba(255,255,255,0.05)",
            background: "rgba(7,6,10,0.4)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            alignItems: "center",
          }}
        >
          <button type="button" onClick={openGoalEdit} style={footerTertiaryButtonStyle}>
            Edit
          </button>
        </div>
      </section>
    );
  }

  return null;
}

const hubGhostBtnStyle: CSSProperties = {
  flex: 1,
  fontSize: 13,
  fontWeight: 600,
  color: "var(--color-text-primary)",
  background: "transparent",
  border: "1px solid var(--color-border-tertiary)",
  borderRadius: 10,
  padding: "8px 12px",
  cursor: "pointer",
};

const lineageButtonStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 11,
  width: "100%",
  marginLeft: -8,
  marginRight: -4,
  padding: "9px 12px",
  border: "none",
  borderRadius: 8,
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  textAlign: "left",
};

const lineageTitleStyle: CSSProperties = {
  display: "block",
  color: "rgba(255,255,255,0.92)",
  fontSize: 13,
  fontWeight: 500,
  lineHeight: 1.35,
};

const lineageMetaStyle: CSSProperties = {
  display: "block",
  marginTop: 1,
  color: "rgba(255,255,255,0.42)",
  fontFamily: "var(--font-pf-tree-mono, ui-monospace, monospace)",
  fontSize: 10.5,
  letterSpacing: "0.06em",
};
