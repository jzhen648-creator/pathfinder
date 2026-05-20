"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FLAGS } from "@/lib/flags";
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
import { isSparseContextItem } from "@/lib/sparse-context";
import { SparseContextPrompt } from "./sparse-context-prompt";
import { themePanelCopy } from "@/lib/theme-catalog";
import type { DomainHubData, TreeGoalNode } from "./tree-types";
import type { TreePanelProps } from "./tree-view-types";

const STREAM_ENTRY_SUBTITLE = "Talk freely — I'll find what belongs on your map";

function StreamEntryButton({
  subjectName,
  accent,
  onClick,
  testId,
}: {
  subjectName: string;
  accent: string;
  onClick: () => void;
  testId: string;
}) {
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
) {
  const gBadge = badgeStatusFromGoalBloom(goal.bloomStatus);
  const statusLabel = formatBloomStatusLabel(goal.bloomStatus);
  const summary = hubGoalStageSummary(goal);
  const parent = goal.parentGoalId ? findGoalInAreas(areas, goal.parentGoalId) : null;
  const sigTier = goal.significanceTier;
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

const PURSUIT_STATUS_OPTIONS = [
  { value: "ACTIVE" as const, label: "Active" },
  { value: "ON_HOLD" as const, label: "On hold" },
  { value: "COMPLETE" as const, label: "Complete" },
];

function PursuitStatusButtons({
  current,
  accentColor,
  busy,
  onSelect,
}: {
  current: "ACTIVE" | "ON_HOLD" | "COMPLETE";
  accentColor: string;
  busy: boolean;
  onSelect: (next: "ACTIVE" | "ON_HOLD" | "COMPLETE") => void;
}) {
  return (
    <div
      role="group"
      aria-label="Pursuit status"
      style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
    >
      {PURSUIT_STATUS_OPTIONS.map((opt) => {
        const selected = current === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={busy || selected}
            onClick={() => onSelect(opt.value)}
            style={{
              fontSize: 13,
              fontWeight: selected ? 600 : 500,
              color: selected ? "#0c0a09" : "var(--color-text-secondary)",
              background: selected ? accentColor : "transparent",
              border: selected ? "none" : "1px solid var(--color-border-tertiary)",
              borderRadius: 8,
              padding: "6px 12px",
              cursor: busy || selected ? "default" : "pointer",
              opacity: busy && !selected ? 0.6 : 1,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function TreePanel({
  panel,
  areas,
  panelPresentation = "sheet",
  onClose,
  onOpenArea,
  onOpenHub,
  onOpenThemeStream,
  onOpenHubStream,
  onOpenGoalStream,
  editMapMode = false,
  onAddGoal,
  onAddMoment,
  onDeleteGoal,
  archivedGoals,
  archivedMarks,
  onReviveGoal,
  onReviveMark,
  onUpdateGoal,
  onMoveGoalToHub,
  onAppendCanonicalTreeMilestone,
  onNavigateToGoal,
  onSparseEnriched,
}: TreePanelProps) {
  const [goalDeleteBusy, setGoalDeleteBusy] = useState(false);
  const [goalDeleteError, setGoalDeleteError] = useState<string | null>(null);
  const [goalStatusBusy, setGoalStatusBusy] = useState(false);
  const [goalStatusError, setGoalStatusError] = useState<string | null>(null);
  const [hubShowInactiveGoals, setHubShowInactiveGoals] = useState(false);
  /** In-flight subtask ids (disable + spinner). */
  const [pendingSubtaskIds, setPendingSubtaskIds] = useState<Set<string>>(() => new Set());
  /** Optimistic completion override per subtask while server roundtrips; cleared on response (success or fail). */
  const [optimisticSubtask, setOptimisticSubtask] = useState<Record<string, boolean>>({});
  const [subtaskError, setSubtaskError] = useState<string | null>(null);
  const [pendingMilestoneIds, setPendingMilestoneIds] = useState<Set<string>>(() => new Set());
  const [expandedMilestoneIds, setExpandedMilestoneIds] = useState<Set<string>>(() => new Set());
  const [milestoneError, setMilestoneError] = useState<string | null>(null);
  const [appendBusy, setAppendBusy] = useState(false);
  const [orbitalError, setOrbitalError] = useState<string | null>(null);
  const [orbitalDraft, setOrbitalDraft] = useState("");
  const [suggestMilestonesAvailable, setSuggestMilestonesAvailable] = useState(true);
  const [suggestMilestonesLoading, setSuggestMilestonesLoading] = useState(false);
  const [suggestedMilestoneTitles, setSuggestedMilestoneTitles] = useState<string[]>([]);
  const [goalEditOpen, setGoalEditOpen] = useState(false);
  const [goalEditTitle, setGoalEditTitle] = useState("");
  const [goalEditBusy, setGoalEditBusy] = useState(false);
  const [goalEditError, setGoalEditError] = useState<string | null>(null);
  const [goalTimelineEditOpen, setGoalTimelineEditOpen] = useState(false);
  const [goalStartIso, setGoalStartIso] = useState("");
  const [goalDeadlineIso, setGoalDeadlineIso] = useState("");
  const [goalTimelineBusy, setGoalTimelineBusy] = useState(false);
  const [goalTimelineError, setGoalTimelineError] = useState<string | null>(null);
  const [goalMoveOpen, setGoalMoveOpen] = useState(false);
  const [goalMoveBusyBranchId, setGoalMoveBusyBranchId] = useState<string | null>(null);
  const [goalMoveError, setGoalMoveError] = useState<string | null>(null);
  /** Brief “goal achieved” banner after the last milestone completes (per goal id). */
  const [bloomCelebrateGoalId, setBloomCelebrateGoalId] = useState<string | null>(null);
  const prevBloomByGoalIdRef = useRef<Record<string, string>>({});
  const goalPanelId = panel.type === "goal" ? panel.goal.id : null;
  const hubPanelId = panel.type === "hub" ? panel.thread.id : null;
  useEffect(() => {
    setGoalDeleteError(null);
    setGoalDeleteBusy(false);
    setPendingSubtaskIds(new Set());
    setOptimisticSubtask({});
    setSubtaskError(null);
    setPendingMilestoneIds(new Set());
    setMilestoneError(null);
    setAppendBusy(false);
    setOrbitalDraft("");
    setSuggestMilestonesAvailable(true);
    setSuggestMilestonesLoading(false);
    setSuggestedMilestoneTitles([]);
    setGoalEditOpen(false);
    setGoalEditTitle("");
    setGoalEditBusy(false);
    setGoalEditError(null);
    setGoalTimelineEditOpen(false);
    setGoalStartIso("");
    setGoalDeadlineIso("");
    setGoalTimelineBusy(false);
    setGoalTimelineError(null);
    setGoalMoveOpen(false);
    setGoalMoveBusyBranchId(null);
    setGoalMoveError(null);
    setBloomCelebrateGoalId(null);
    setGoalStatusBusy(false);
    setGoalStatusError(null);
  }, [goalPanelId]);

  useEffect(() => {
    setHubShowInactiveGoals(false);
  }, [hubPanelId]);

  useEffect(() => {
    if (panel.type !== "goal") return;
    const g = panel.goal;
    setGoalStartIso(goalEffectiveStartIso(g));
    setGoalDeadlineIso(goalEffectiveDeadlineIso(g));
  }, [
    goalPanelId,
    panel.type === "goal"
      ? `${panel.goal.id}|${panel.goal.timelineStartIso ?? ""}|${panel.goal.createdAtIso ?? ""}|${panel.goal.deadlineIso ?? ""}|${panel.goal.year ?? ""}`
      : "",
  ]);

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

  useEffect(() => {
    if (panel.type !== "goal") return;
    setExpandedMilestoneIds(new Set());
  }, [panel.type, panel.type === "goal" ? panel.goal.id : ""]);

  useEffect(() => {
    if (panel.type !== "goal") return;
    const live = findGoalInAreas(areas, panel.goal.id);
    const g = live?.goal ?? panel.goal;
    const prev = prevBloomByGoalIdRef.current[g.id];
    if (prev && prev === "ACTIVE" && g.bloomStatus === "COMPLETE") {
      setBloomCelebrateGoalId(g.id);
    }
    prevBloomByGoalIdRef.current[g.id] = g.bloomStatus;
  }, [panel, areas]);

  useEffect(() => {
    if (panel.type !== "goal") return;
    const live = findGoalInAreas(areas, panel.goal.id);
    const g = live?.goal ?? panel.goal;
    if (g.milestones.length >= 6) {
      setSuggestedMilestoneTitles([]);
      return;
    }
    const titleLower = new Set(g.milestones.map((m) => m.title.trim().toLowerCase()));
    setSuggestedMilestoneTitles((prev) =>
      prev.filter((c) => !titleLower.has(formatUserInput(c).trim().toLowerCase())),
    );
  }, [panel, areas]);

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
    return (
      <section
        style={{
          ...(areaRail
            ? {
                height: "100%",
                minHeight: 0,
                flex: 1,
                borderRight: `4px solid ${area.color}`,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }
            : {
                borderTop: `1.5px solid ${area.color}`,
                animation: "slideup 160ms ease-out",
              }),
          background: "var(--color-background-primary)",
          position: "relative",
        }}
      >
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
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.35, color: "var(--color-text-primary)" }}>
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
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: "var(--color-text-tertiary)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" }}>
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
    return (
      <section
        style={{
          ...(hubRail
            ? {
                height: "100%",
                minHeight: 0,
                flex: 1,
                borderRight: `4px solid ${area.color}`,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }
            : {
                borderTop: `1.5px solid ${area.color}`,
                animation: "slideup 160ms ease-out",
              }),
          background: "var(--color-background-primary)",
          position: "relative",
        }}
      >
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
              {hubUnresolvedCount} {hubUnresolvedCount === 1 ? "item needs" : "items need"} your input on the
              tree
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
              <>
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
              </>
            ) : (
              <>

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
              </>
            )}
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 18px 20px" }}>
          <div style={{ display: "grid", gap: 18 }}>
            <HubCatalogPanelSections copy={hubCopy} areaColor={area.color} areas={areas} compact />

            {hubGoals.length === 0 ? (
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
              {hubActiveGoals.map((goal) =>
                renderHubPursuitCard(goal, area, areas, onNavigateToGoal),
              )}
              {hubInactiveGoals.length > 0 && !hubShowInactiveGoals ? (
                <button
                  type="button"
                  onClick={() => setHubShowInactiveGoals(true)}
                  style={{
                    border: "none",
                    background: "transparent",
                    fontSize: 13,
                    color: area.color,
                    cursor: "pointer",
                    textDecoration: "underline",
                    textUnderlineOffset: 3,
                    padding: 0,
                    textAlign: "left",
                  }}
                >
                  Show {hubInactiveGoals.length} on hold or complete
                </button>
              ) : null}
              {hubShowInactiveGoals
                ? hubInactiveGoals.map((goal) =>
                    renderHubPursuitCard(goal, area, areas, onNavigateToGoal),
                  )
                : null}
            </div>
          )}

            {hasArchiveSection ? (
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
                  Removed from map
                </div>
                {hubArchivedGoals.map((g) => (
                  <div
                    key={`goal-${g.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      border: "1px solid var(--color-border-tertiary)",
                      borderRadius: 10,
                      padding: "10px 12px",
                      background: "var(--color-background-secondary, rgba(255,255,255,0.02))",
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
                      border: "1px solid var(--color-border-tertiary)",
                      borderRadius: 10,
                      padding: "10px 12px",
                      background: "var(--color-background-secondary, rgba(255,255,255,0.02))",
                    }}
                  >
                    <span style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.35 }}>
                      <span style={{ color: "#d97706", marginRight: 6 }} aria-hidden>
                        ●
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
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  if (panel.type === "goal") {
    /** Reflect post-`loadData()` data after a subtask toggle (panel state holds a stale snapshot otherwise). */
    const live = findGoalInAreas(areas, panel.goal.id);
    const goal = live?.goal ?? panel.goal;
    const area = live?.area ?? panel.area;
    const thread = area.branches.find((t) => t.id === goal.branchId);
    const isBloomed = goal.bloomStatus === "COMPLETE";
    const showBloomCelebrate = bloomCelebrateGoalId === goal.id && isBloomed;
    const childCount = goal.childGoals.length;
    const confirmDelete = () => {
      const childNote =
        childCount > 0
          ? ` ${childCount} related pursuit${childCount === 1 ? "" : "s"} that continue from this one will stay on this hub.`
          : "";
      return window.confirm(
        `Remove “${goal.title}” from your map? It will be archived (hidden from the tree).${childNote}`,
      );
    };
    const isCompletedFor = (s: { id: string; isCompleted: boolean }) =>
      optimisticSubtask[s.id] ?? s.isCompleted;
    const allSubtasks = goal.milestones.flatMap((m) =>
      m.subtasks.filter((s) => !isScaffoldingSubtaskTitle(s.title)),
    );
    const totalSubtasks = allSubtasks.length;
    const doneSubtasks = allSubtasks.filter(isCompletedFor).length;
    const subtaskProgressPct = totalSubtasks > 0 ? Math.round((doneSubtasks / totalSubtasks) * 100) : 0;
    const relationalPanel = hasRelationalMilestones(goal);
    const milestoneCount = goal.milestones.length;
    const milestonesDoneStage = relationalPanel
      ? goal.milestones.filter((m) =>
          milestoneDoneForSemantics({
            completedAt: m.completedAt ?? null,
            subtasks: m.subtasks.map((s) => ({
              isCompleted: isCompletedFor(s),
              title: s.title,
            })),
          }),
        ).length
      : 0;
    const stageProgressPct =
      relationalPanel && milestoneCount > 0
        ? Math.round((milestonesDoneStage / milestoneCount) * 100)
        : 0;
    const goalRail = panelPresentation === "rail";
    const parentContinuation = goal.parentGoalId
      ? findGoalInAreas(areas, goal.parentGoalId)
      : null;
    const showMilestoneEditControls = false;
    const moveTargetAreas = areas
      .map((candidateArea) => ({
        area: candidateArea,
        hubs: candidateArea.branches.filter((candidateHub) => candidateHub.id !== goal.branchId),
      }))
      .filter((candidate) => candidate.hubs.length > 0);
    return (
      <section
        style={{
          ...(goalRail
            ? {
                height: "100%",
                minHeight: 0,
                flex: 1,
                borderRight: `4px solid ${area.color}`,
                borderLeft: "none",
                borderTop: "none",
                display: "flex",
                flexDirection: "column",
                overflowY: "auto",
              }
            : {
                borderTop: `1.5px solid ${area.color}`,
                animation: "slideup 160ms ease-out",
              }),
          background: "var(--color-background-primary)",
          padding: "14px 18px 20px",
          position: "relative",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          style={{
            position: "absolute",
            right: 12,
            top: 8,
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
        {panel.returnTo?.type === "hub" ? (
          <button
            type="button"
            onClick={() => {
              const back = panel.returnTo;
              if (back?.type !== "hub") return;
              onOpenHub(
                back.area,
                back.area.branches.find((t) => t.id === back.thread.id) ?? back.thread,
              );
            }}
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
            ←{" "}
            {canonicalHubDisplayLabel(
              panel.returnTo.area.id,
              panel.returnTo.thread.type.trim() || "Hub",
            )}
          </button>
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 14, color: area.color, fontWeight: 600 }}>{area.label}</span>
          <span style={{ fontSize: 14, color: "var(--color-text-tertiary)" }}>·</span>
          <span style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>{thread?.type ?? "Hub"}</span>
        </div>
        {editMapMode ? (
          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => {
                setGoalMoveOpen((open) => !open);
                setGoalMoveError(null);
              }}
              style={{
                border: "none",
                background: "transparent",
                color: "var(--color-text-tertiary)",
                cursor: "pointer",
                fontSize: 13,
                padding: 0,
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              Move to different area
            </button>
            {goalMoveOpen ? (
            <div
              style={{
                marginTop: 10,
                display: "grid",
                gap: 10,
                border: "1px solid var(--color-border-tertiary)",
                borderRadius: 10,
                padding: "10px 12px",
                background: "var(--color-background-secondary, rgba(255,255,255,0.02))",
              }}
            >
              <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.45 }}>
                Choose the hub where this pursuit belongs.
              </p>
              {moveTargetAreas.map(({ area: targetArea, hubs }) => (
                <div key={targetArea.id} style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: targetArea.color }}>
                    {targetArea.label}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {hubs.map((hub) => {
                      const moving = goalMoveBusyBranchId === hub.id;
                      const hubLabel = canonicalHubDisplayLabel(
                        targetArea.id,
                        hub.type.trim() || "Hub",
                      );
                      return (
                        <button
                          key={hub.id}
                          type="button"
                          disabled={goalMoveBusyBranchId !== null}
                          onClick={async () => {
                            setGoalMoveError(null);
                            setGoalMoveBusyBranchId(hub.id);
                            const result = await onMoveGoalToHub(goal.id, hub.id);
                            setGoalMoveBusyBranchId(null);
                            if (!result.ok) {
                              setGoalMoveError(result.error ?? "Could not move pursuit.");
                              return;
                            }
                            setGoalMoveOpen(false);
                          }}
                          style={{
                            border: `1px solid ${targetArea.color}55`,
                            background: moving ? `${targetArea.color}22` : "transparent",
                            color: "var(--color-text-primary)",
                            borderRadius: 999,
                            cursor: goalMoveBusyBranchId !== null ? "wait" : "pointer",
                            fontSize: 13,
                            padding: "6px 10px",
                            opacity: goalMoveBusyBranchId !== null && !moving ? 0.55 : 1,
                          }}
                        >
                          {moving ? "Moving…" : hubLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {goalMoveError ? (
                <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-danger, #f87171)" }}>
                  {goalMoveError}
                </p>
              ) : null}
            </div>
            ) : null}
          </div>
        ) : null}
        <div style={{ marginBottom: 12 }}>
          <PursuitStatusButtons
            current={goal.bloomStatus}
            accentColor={area.color}
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
        </div>
        <div style={{ marginBottom: 10 }}>
          {editMapMode && goalEditOpen ? (
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
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setGoalEditOpen(false);
                    setGoalEditError(null);
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void (async () => {
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
                    })();
                  }
                }}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--color-border-secondary)",
                  background: "var(--color-background-primary)",
                  color: "var(--color-text-primary)",
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
                    fontSize: 14,
                    fontWeight: 600,
                    color: area.color,
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor:
                      goalEditBusy || !formatUserInput(goalEditTitle) ? "wait" : "pointer",
                    opacity: goalEditBusy || !formatUserInput(goalEditTitle) ? 0.5 : 1,
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
                    fontSize: 14,
                    color: "var(--color-text-tertiary)",
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: goalEditBusy ? "wait" : "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 10,
                fontSize: 18,
                fontWeight: 500,
                color: "var(--color-text-primary)",
              }}
            >
              <span style={{ lineHeight: 1.35 }}>{goal.title}</span>
              {editMapMode ? (
                <button
                  type="button"
                  onClick={() => {
                    setGoalEditTitle(goal.title);
                    setGoalEditError(null);
                    setGoalEditOpen(true);
                  }}
                  style={{
                    flexShrink: 0,
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--color-text-tertiary)",
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    textDecoration: "underline",
                    textUnderlineOffset: 3,
                  }}
                >
                  Rename
                </button>
              ) : null}
            </div>
          )}
        </div>
        {goal.description?.trim() ? (
          <p
            style={{
              margin: "0 0 10px",
              fontSize: 14,
              lineHeight: 1.45,
              color: "var(--color-text-secondary)",
            }}
          >
            {goal.description.trim()}
          </p>
        ) : null}
        {isSparseContextItem(goal.title, goal.description) && onSparseEnriched ? (
          <div style={{ marginBottom: 12 }}>
            <SparseContextPrompt
              itemType="pursuit"
              itemId={goal.id}
              accentColor={area.color}
              onDone={onSparseEnriched}
            />
          </div>
        ) : null}
        <div style={{ marginBottom: 12 }}>
          {editMapMode && goalTimelineEditOpen ? (
            <div style={{ display: "grid", gap: 10 }}>
              {goalTimelineError ? (
                <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-danger, #f87171)" }}>
                  {goalTimelineError}
                </p>
              ) : null}
              <label style={{ display: "grid", gap: 4, fontSize: 13, color: "var(--color-text-tertiary)" }}>
                Started
                <input
                  type="date"
                  value={goalStartIso}
                  disabled={goalTimelineBusy}
                  onChange={(e) => setGoalStartIso(e.target.value)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid var(--color-border-secondary)",
                    background: "var(--color-background-primary)",
                    color: "var(--color-text-primary)",
                    fontSize: 15,
                  }}
                />
              </label>
              {!goal.timelineStartIso && goal.createdAtIso ? (
                <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-tertiary)" }}>
                  Defaults to created {formatGoalDateDisplay(goal.createdAtIso) ?? goal.createdAtIso}. Saving the same
                  date clears the override.
                </p>
              ) : null}
              <label style={{ display: "grid", gap: 4, fontSize: 13, color: "var(--color-text-tertiary)" }}>
                Target deadline
                <input
                  type="date"
                  value={goalDeadlineIso}
                  disabled={goalTimelineBusy}
                  onChange={(e) => setGoalDeadlineIso(e.target.value)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid var(--color-border-secondary)",
                    background: "var(--color-background-primary)",
                    color: "var(--color-text-primary)",
                    fontSize: 15,
                  }}
                />
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button
                  type="button"
                  disabled={goalTimelineBusy || !/^\d{4}-\d{2}-\d{2}$/.test(goalStartIso)}
                  onClick={async () => {
                    setGoalTimelineBusy(true);
                    setGoalTimelineError(null);
                    const created = goal.createdAtIso;
                    const timelineStartIso =
                      created && goalStartIso === created ? null : goalStartIso;
                    const result = await onUpdateGoal(goal.id, {
                      timelineStartIso,
                      deadlineIso: goalDeadlineIso.trim() ? goalDeadlineIso : null,
                    });
                    setGoalTimelineBusy(false);
                    if (!result.ok) {
                      setGoalTimelineError(result.error ?? "Could not save dates.");
                      return;
                    }
                    setGoalTimelineEditOpen(false);
                  }}
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: area.color,
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: goalTimelineBusy ? "wait" : "pointer",
                    opacity: goalTimelineBusy ? 0.6 : 1,
                  }}
                >
                  {goalTimelineBusy ? "Saving…" : "Save dates"}
                </button>
                <button
                  type="button"
                  disabled={goalTimelineBusy}
                  onClick={() => {
                    setGoalTimelineEditOpen(false);
                    setGoalTimelineError(null);
                    setGoalStartIso(goalEffectiveStartIso(goal));
                    setGoalDeadlineIso(goalEffectiveDeadlineIso(goal));
                  }}
                  style={{
                    fontSize: 14,
                    color: "var(--color-text-tertiary)",
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: goalTimelineBusy ? "wait" : "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
                {goalEffectiveStartIso(goal) ? (
                  <span>
                    <strong style={{ color: "var(--color-text-tertiary)", fontWeight: 600 }}>Started </strong>
                    {formatGoalDateDisplay(goalEffectiveStartIso(goal)) ?? goalEffectiveStartIso(goal)}
                  </span>
                ) : (
                  <span style={{ color: "var(--color-text-tertiary)" }}>No start date</span>
                )}
                {goalEffectiveDeadlineIso(goal) ? (
                  <>
                    <span style={{ color: "var(--color-text-tertiary)" }}> · </span>
                    <strong style={{ color: "var(--color-text-tertiary)", fontWeight: 600 }}>Deadline </strong>
                    {formatGoalDateDisplay(goalEffectiveDeadlineIso(goal)) ?? goalEffectiveDeadlineIso(goal)}
                  </>
                ) : (
                  <span style={{ color: "var(--color-text-tertiary)" }}> · No deadline</span>
                )}
              </div>
              {editMapMode ? (
                <button
                  type="button"
                  onClick={() => {
                    setGoalTimelineError(null);
                    setGoalStartIso(goalEffectiveStartIso(goal));
                    setGoalDeadlineIso(goalEffectiveDeadlineIso(goal));
                    setGoalTimelineEditOpen(true);
                  }}
                  style={{
                    flexShrink: 0,
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--color-text-tertiary)",
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    textDecoration: "underline",
                    textUnderlineOffset: 3,
                  }}
                >
                  Edit dates
                </button>
              ) : null}
            </div>
          )}
        </div>
        {showBloomCelebrate ? (
          <div
            role="status"
            style={{
              marginBottom: 14,
              padding: "14px 16px",
              borderRadius: 12,
              border: `1px solid ${area.color}55`,
              background: `linear-gradient(135deg, ${area.color}22, rgba(255,255,255,0.03))`,
            }}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "var(--color-text-primary)",
                marginBottom: 4,
              }}
            >
              Pursuit achieved
            </div>
            <p
              style={{
                fontSize: 13,
                color: "var(--color-text-secondary)",
                margin: "0 0 12px",
                lineHeight: 1.45,
                opacity: 0.92,
              }}
            >
              This pursuit is complete on the map.
            </p>
            <button
              type="button"
              onClick={() => setBloomCelebrateGoalId(null)}
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--color-text-tertiary)",
                background: "transparent",
                border: "1px solid var(--color-border-secondary)",
                borderRadius: 8,
                padding: "8px 14px",
                cursor: "pointer",
              }}
            >
              Dismiss
            </button>
          </div>
        ) : null}
        {relationalPanel && milestoneCount > 0 ? (
          <div style={{ marginTop: 4, marginBottom: 12 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 13,
                color: "var(--color-text-tertiary)",
                marginBottom: 4,
              }}
            >
              <span>Stages</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {milestonesDoneStage} / {milestoneCount} · {stageProgressPct}%
              </span>
            </div>
            <div
              style={{
                height: 4,
                background: "rgba(255,255,255,0.07)",
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${stageProgressPct}%`,
                  background: area.color,
                  transition: "width 200ms ease",
                }}
              />
            </div>
          </div>
        ) : totalSubtasks > 0 ? (
          <div style={{ marginTop: 4, marginBottom: 12 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 13,
                color: "var(--color-text-tertiary)",
                marginBottom: 4,
              }}
            >
              <span>Progress</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {doneSubtasks} / {totalSubtasks} · {subtaskProgressPct}%
              </span>
            </div>
            <div
              style={{
                height: 4,
                background: "rgba(255,255,255,0.07)",
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${subtaskProgressPct}%`,
                  background: area.color,
                  transition: "width 200ms ease",
                }}
              />
            </div>
          </div>
        ) : null}
        {subtaskError ? (
          <p style={{ color: "var(--color-text-danger, #f87171)", fontSize: 14, margin: "0 0 10px" }}>
            {subtaskError}
          </p>
        ) : null}
        {milestoneError ? (
          <p style={{ color: "var(--color-text-danger, #f87171)", fontSize: 14, margin: "0 0 10px" }}>
            {milestoneError}
          </p>
        ) : null}
        {goal.parentGoalId ? (
          <div style={{ margin: "0 0 14px", fontSize: 14, lineHeight: 1.55 }}>
            <span style={{ color: "var(--color-text-tertiary)" }}>Continues from </span>
            {parentContinuation ? (
              <button
                type="button"
                onClick={() => onNavigateToGoal(parentContinuation.goal.id)}
                style={{
                  padding: 0,
                  border: "none",
                  background: "none",
                  font: "inherit",
                  color: area.color,
                  fontWeight: 600,
                  cursor: "pointer",
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                  textAlign: "left",
                }}
              >
                {parentContinuation.goal.title}
              </button>
            ) : (
              <span style={{ color: "var(--color-text-secondary)" }}>a previous pursuit</span>
            )}
          </div>
        ) : null}
        {onOpenGoalStream ? (
          <div style={{ margin: "0 0 16px" }}>
            <button
              type="button"
              onClick={() => onOpenGoalStream(area, goal)}
              style={{
                width: "100%",
                border: "none",
                borderRadius: 10,
                background: area.color,
                color: "#0c0a09",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
                padding: "10px 14px",
              }}
            >
              Tell me more
            </button>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--color-text-tertiary)", lineHeight: 1.45 }}>
              Add milestones and marks for this pursuit with Stream.
            </p>
          </div>
        ) : null}
        <div style={{ marginTop: 4, marginBottom: 2 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: area.color,
                marginBottom: 8,
                letterSpacing: ".02em",
              }}
            >
              Milestones
            </div>

            {hasRelationalMilestones(goal) ? (
              <p
                style={{
                  fontSize: 12,
                  color: "var(--color-text-tertiary)",
                  margin: "0 0 10px",
                  lineHeight: 1.35,
                  opacity: 0.88,
                }}
              >
                Use + beside a stage to view substeps.
              </p>
            ) : null}

            {hasRelationalMilestones(goal) ? (
              <div style={{ display: "grid", gap: 10 }}>
                {goal.milestones.map((m) => {
                  const subs = m.subtasks.filter((s) => !isScaffoldingSubtaskTitle(s.title));
                  const done = subs.filter(isCompletedFor).length;
                  const total = subs.length;
                  const milestoneComplete = milestoneDoneForSemantics({
                    completedAt: m.completedAt ?? null,
                    subtasks: m.subtasks.map((s) => ({
                      isCompleted: isCompletedFor(s),
                      title: s.title,
                    })),
                  });
                  const msPending = pendingMilestoneIds.has(m.id);
                  /** While PATCH is in flight, show the target completion state so the stage feels responsive. */
                  const displayMilestoneComplete = msPending ? !milestoneComplete : milestoneComplete;
                  const expanded = expandedMilestoneIds.has(m.id);
                  return (
                    <div key={m.id} style={{ display: "grid", gap: 6 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-label={expanded ? "Hide substeps for this stage" : "Show substeps for this stage"}
                          onClick={() => {
                            setExpandedMilestoneIds((prev) => {
                              const n = new Set(prev);
                              if (n.has(m.id)) n.delete(m.id);
                              else n.add(m.id);
                              return n;
                            });
                          }}
                          style={{
                            flexShrink: 0,
                            width: 36,
                            minHeight: 44,
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.1)",
                            background: "rgba(255,255,255,0.04)",
                            color: "var(--color-text-tertiary)",
                            fontSize: 18,
                            lineHeight: 1,
                            cursor: "pointer",
                          }}
                        >
                          {expanded ? "−" : "+"}
                        </button>
                        <div
                        role="group"
                        aria-label={displayMilestoneComplete ? `${m.title}, marked complete.` : m.title}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 10,
                          flex: 1,
                          minWidth: 0,
                          textAlign: "left",
                          padding: "8px 10px",
                          margin: 0,
                          border: `1px solid ${displayMilestoneComplete ? `${area.color}40` : "rgba(255,255,255,0.08)"}`,
                          borderRadius: 10,
                          background: displayMilestoneComplete
                            ? `linear-gradient(135deg, ${area.color}18, transparent)`
                            : "rgba(255,255,255,0.03)",
                          cursor: "default",
                          opacity: 1,
                          transition: "border-color 160ms ease, background 160ms ease",
                          font: "inherit",
                          color: "inherit",
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 999,
                            flexShrink: 0,
                            border: `1.5px solid ${area.color}`,
                            background: displayMilestoneComplete ? area.color : "transparent",
                            opacity: displayMilestoneComplete ? 0.88 : 0.35,
                            boxShadow: displayMilestoneComplete ? `0 0 14px ${area.color}28` : "none",
                          }}
                        />
                        <span
                          style={{
                            flex: 1,
                            fontSize: 16,
                            fontWeight: 500,
                            color: displayMilestoneComplete
                              ? "var(--color-text-tertiary)"
                              : "var(--color-text-primary)",
                            textDecoration: displayMilestoneComplete ? "line-through" : "none",
                            lineHeight: 1.35,
                            minWidth: 0,
                          }}
                        >
                          {m.title}
                        </span>
                        {displayMilestoneComplete ? (
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: area.color,
                              opacity: 0.92,
                              letterSpacing: "0.06em",
                              textTransform: "uppercase",
                              flexShrink: 0,
                            }}
                          >
                            Complete
                          </span>
                        ) : null}
                      </div>
                      </div>
                      {expanded ? (
                        <>
                          {total > 0 ? (
                            <div
                              style={{
                                paddingLeft: 44,
                                marginTop: -2,
                                fontSize: 12,
                                color: "var(--color-text-tertiary)",
                                opacity: 0.72,
                                lineHeight: 1.35,
                              }}
                            >
                              Substeps · {done}/{total}
                            </div>
                          ) : null}
                          {total > 0 ? (
                            <ul
                              style={{
                                listStyle: "none",
                                margin: 0,
                                padding: 0,
                                paddingLeft: 40,
                                display: "grid",
                                gap: 4,
                              }}
                            >
                              {subs.map((s) => {
                                const completed = isCompletedFor(s);
                                const pending = pendingSubtaskIds.has(s.id);
                                return (
                                  <li key={s.id}>
                                    <label
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        fontSize: 15,
                                        color: completed
                                          ? "var(--color-text-tertiary)"
                                          : "var(--color-text-secondary)",
                                        textDecoration: completed ? "line-through" : "none",
                                        cursor: "default",
                                        opacity: pending ? 0.7 : 1,
                                        paddingLeft: 4,
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={completed}
                                        disabled
                                        readOnly
                                        style={{
                                          accentColor: area.color,
                                          cursor: "default",
                                        }}
                                      />
                                      <span>{s.title}</span>
                                    </label>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <p
                              style={{
                                margin: 0,
                                paddingLeft: 44,
                                fontSize: 13,
                                color: "var(--color-text-tertiary)",
                                fontStyle: "italic",
                              }}
                            >
                              No substeps yet.
                            </p>
                          )}
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: 14, color: "var(--color-text-tertiary)", margin: "0 0 10px", opacity: 0.92 }}>
                No milestones yet.
              </p>
            )}

            {showMilestoneEditControls && FLAGS.GOAL_MILESTONES ? (
            <div style={{ marginTop: 14 }}>
            {suggestMilestonesAvailable ? (
              <>
                <button
                  type="button"
                  disabled={suggestMilestonesLoading || appendBusy}
                  onClick={async () => {
                    setSuggestMilestonesLoading(true);
                    try {
                      const res = await fetch("/api/goals/suggest-milestones", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          goalTitle: goal.title,
                          existing: goal.milestones.map((m) => m.title),
                        }),
                      });
                      const raw = (await res.json().catch(() => ({}))) as {
                        suggestions?: string[];
                        error?: string;
                      };
                      if (!res.ok) {
                        setSuggestMilestonesAvailable(false);
                        setSuggestedMilestoneTitles([]);
                        return;
                      }
                      const list = Array.isArray(raw.suggestions) ? raw.suggestions : [];
                      const existingLower = new Set(
                        goal.milestones.map((m) => m.title.trim().toLowerCase()),
                      );
                      const seen = new Set<string>();
                      const chips: string[] = [];
                      for (const item of list) {
                        const trimmed = typeof item === "string" ? item.trim() : "";
                        if (!trimmed) continue;
                        const formed = formatUserInput(trimmed);
                        const low = formed.toLowerCase();
                        if (existingLower.has(low) || seen.has(low)) continue;
                        seen.add(low);
                        chips.push(trimmed);
                      }
                      setSuggestedMilestoneTitles(chips);
                    } catch {
                      setSuggestMilestonesAvailable(false);
                      setSuggestedMilestoneTitles([]);
                    } finally {
                      setSuggestMilestonesLoading(false);
                    }
                  }}
                  style={{
                    display: "block",
                    marginBottom: suggestedMilestoneTitles.length > 0 ? 8 : 10,
                    padding: 0,
                    border: "none",
                    background: "none",
                    fontSize: 13,
                    color: "var(--color-text-tertiary)",
                    cursor: suggestMilestonesLoading || appendBusy ? "wait" : "pointer",
                    opacity: suggestMilestonesLoading || appendBusy ? 0.65 : 0.9,
                    textAlign: "left",
                  }}
                >
                  {suggestMilestonesLoading ? "✦ Suggesting…" : "✦ Suggest milestones"}
                </button>
                {suggestedMilestoneTitles.length > 0 ? (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {suggestedMilestoneTitles.map((chip, chipIdx) => (
                        <button
                          key={`${chip}-${chipIdx}`}
                          type="button"
                          disabled={appendBusy}
                          onClick={() => {
                            const title = formatUserInput(chip);
                            if (!title || appendBusy) return;
                            void appendCanonicalToServer(goal.id, title, () =>
                              setSuggestedMilestoneTitles((prev) => prev.filter((t) => t !== chip)),
                            );
                          }}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 999,
                            border: "1px solid var(--color-border-secondary)",
                            background: "rgba(255,255,255,0.05)",
                            color: "var(--color-text-secondary)",
                            fontSize: 13,
                            cursor: appendBusy ? "not-allowed" : "pointer",
                            opacity: appendBusy ? 0.7 : 1,
                          }}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      disabled={appendBusy}
                      onClick={() => setSuggestedMilestoneTitles([])}
                      style={{
                        marginTop: 6,
                        padding: 0,
                        border: "none",
                        background: "none",
                        fontSize: 12,
                        color: "var(--color-text-tertiary)",
                        cursor: appendBusy ? "wait" : "pointer",
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="Add step…"
                  value={orbitalDraft}
                  disabled={appendBusy}
                  onChange={(e) => {
                    setOrbitalDraft(e.target.value);
                    if (orbitalError) setOrbitalError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const title = formatUserInput(orbitalDraft);
                      if (!title || appendBusy) return;
                      void appendCanonicalToServer(goal.id, title);
                      setOrbitalDraft("");
                    }
                  }}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "7px 9px",
                    borderRadius: 8,
                    border: "1px solid var(--color-border-secondary)",
                    background: "var(--color-background-primary)",
                    color: "var(--color-text-primary)",
                    fontSize: 14,
                  }}
                />
                <button
                  type="button"
                  aria-label="Add milestone"
                  disabled={appendBusy || !orbitalDraft.trim()}
                  onClick={() => {
                    const title = formatUserInput(orbitalDraft);
                    if (!title || appendBusy) return;
                    void appendCanonicalToServer(goal.id, title);
                    setOrbitalDraft("");
                  }}
                  style={{
                    flexShrink: 0,
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    border: "1px solid var(--color-border-secondary)",
                    background: "rgba(255,255,255,0.06)",
                    color: "var(--color-text-secondary)",
                    fontSize: 22,
                    lineHeight: 1,
                    cursor: appendBusy ? "wait" : "pointer",
                  }}
                >
                  +
                </button>
              </div>
            {orbitalError ? (
              <p style={{ color: "var(--color-text-danger, #f87171)", fontSize: 13, margin: "8px 0 0" }}>
                {orbitalError}
              </p>
            ) : null}
            </div>
            ) : null}
          </div>
        <div
          style={{
            marginTop: 20,
            paddingTop: 14,
            borderTop: "1px solid var(--color-border-tertiary)",
            paddingLeft: 12,
            paddingBottom: 4,
            borderLeft: `3px solid ${area.color}`,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: area.color, marginBottom: 8, letterSpacing: ".02em" }}>
            Continuations
          </div>
          <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", margin: "0 0 10px", lineHeight: 1.35, opacity: 0.88 }}>
            Separate pursuits · not steps inside this one.
          </p>
          {goal.childGoals.length > 0 ? (
            <ul style={{ listStyle: "none", margin: "0 0 12px", padding: 0, display: "grid", gap: 8 }}>
              {goal.childGoals.map((child) => (
                <li key={child.id}>
                  <button
                    type="button"
                    onClick={() => onNavigateToGoal(child.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "9px 11px",
                      borderRadius: 8,
                      border: "1px solid var(--color-border-secondary)",
                      background: "rgba(255,255,255,0.04)",
                      color: "var(--color-text-primary)",
                      fontSize: 16,
                      fontWeight: 500,
                      cursor: "pointer",
                      lineHeight: 1.35,
                    }}
                  >
                    {child.title}
                    <span
                      style={{
                        display: "block",
                        marginTop: 3,
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--color-text-tertiary)",
                        opacity: 0.85,
                      }}
                    >
                      Open
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", margin: "0 0 12px", opacity: 0.9 }}>
              None yet.
            </p>
          )}
        </div>
        {editMapMode ? (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--color-border-tertiary)" }}>
            {goalDeleteError ? (
              <p style={{ color: "var(--color-text-danger, #f87171)", fontSize: 14, margin: "0 0 10px" }}>
                {goalDeleteError}
              </p>
            ) : null}
            <button
              type="button"
              disabled={goalDeleteBusy}
              onClick={async () => {
                if (!confirmDelete()) return;
                setGoalDeleteError(null);
                setGoalDeleteBusy(true);
                const result = await onDeleteGoal(goal.id);
                setGoalDeleteBusy(false);
                if (!result.ok) setGoalDeleteError(result.error ?? "Could not remove pursuit.");
              }}
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--color-text-danger, #fecaca)",
                background: "rgba(127, 29, 29, 0.2)",
                border: "1px solid rgba(248, 113, 113, 0.45)",
                borderRadius: 8,
                padding: "8px 14px",
                cursor: goalDeleteBusy ? "wait" : "pointer",
                opacity: goalDeleteBusy ? 0.7 : 1,
              }}
            >
              {goalDeleteBusy ? "Removing…" : "Remove from map"}
            </button>
          </div>
        ) : null}
      </section>
    );
  }

  return null;
}

const hubGhostBtnStyle: React.CSSProperties = {
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
