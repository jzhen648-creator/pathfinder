"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FLAGS } from "@/lib/flags";
import { formatUserInput } from "@/utils/text";
import {
  badgeStatusFromGoalBloom,
  sigLabel,
  statusBadgeStyle,
  statusFromMoment,
} from "./tree-view-badges";
import { hasRelationalMilestones } from "./goal-milestone-predicates";
import {
  countRoadmapGoalsInArea,
  countRoadmapGoalsOnThread,
  findGoalInAreas,
} from "./tree-view-goal-queries";
import { isScaffoldingSubtaskTitle } from "@/lib/legacy-subtask-placeholder-title";
import { milestoneDoneForSemantics } from "@/lib/milestone-semantics";
import { TREE_ORBITAL_MAX_VISIBLE } from "./milestone-tree-projection";
import { hubPanelCopy } from "@/lib/hub-catalog";
import { getLifeArea } from "@/lib/life-areas";
import { themePanelCopy } from "@/lib/theme-catalog";
import { buildThemeSnapshot } from "@/lib/theme-snapshot";
import type { TreeGoalNode } from "./tree-types";
import type { TreePanelProps } from "./tree-view-types";

function goalAchievedAfterCompletingMilestone(
  milestones: {
    id: string;
    completedAt?: string | null;
    subtasks: { id: string; isCompleted: boolean; title?: string | null }[];
  }[],
  milestoneId: string,
  isCompletedFor: (s: { id: string; isCompleted: boolean }) => boolean,
): boolean {
  if (milestones.length === 0) return false;
  return milestones.every((m) => {
    if (m.id === milestoneId) return true;
    return milestoneDoneForSemantics({
      completedAt: m.completedAt ?? null,
      subtasks: m.subtasks.map((s) => ({
        isCompleted: isCompletedFor({ id: s.id, isCompleted: s.isCompleted }),
        title: s.title,
      })),
    });
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

  const orbital = goal.orbitalMilestones.slice(0, TREE_ORBITAL_MAX_VISIBLE);
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

function defaultEvolutionTitle(goalTitle: string): string {
  const t = goalTitle.trim();
  return t ? `Next: ${t}` : "Next chapter";
}

export function TreePanel({
  panel,
  areas,
  panelPresentation = "sheet",
  onClose,
  onOpenArea,
  onOpenHub,
  onAddGoal,
  onDeleteGoal,
  onUpdateGoal,
  onToggleSubtask,
  onAppendCanonicalTreeMilestone,
  onSetMilestoneCompletion,
  onNavigateToGoal,
  onContinueGoal,
}: TreePanelProps) {
  const [goalDeleteBusy, setGoalDeleteBusy] = useState(false);
  const [goalDeleteError, setGoalDeleteError] = useState<string | null>(null);
  /** In-flight subtask ids (disable + spinner). */
  const [pendingSubtaskIds, setPendingSubtaskIds] = useState<Set<string>>(() => new Set());
  /** Optimistic completion override per subtask while server roundtrips; cleared on response (success or fail). */
  const [optimisticSubtask, setOptimisticSubtask] = useState<Record<string, boolean>>({});
  const [subtaskError, setSubtaskError] = useState<string | null>(null);
  const [pendingMilestoneIds, setPendingMilestoneIds] = useState<Set<string>>(() => new Set());
  const [milestoneError, setMilestoneError] = useState<string | null>(null);
  const [appendBusy, setAppendBusy] = useState(false);
  const [orbitalError, setOrbitalError] = useState<string | null>(null);
  const [orbitalDraft, setOrbitalDraft] = useState("");
  const [suggestMilestonesAvailable, setSuggestMilestonesAvailable] = useState(true);
  const [suggestMilestonesLoading, setSuggestMilestonesLoading] = useState(false);
  const [suggestedMilestoneTitles, setSuggestedMilestoneTitles] = useState<string[]>([]);
  const [continueGoalOpen, setContinueGoalOpen] = useState(false);
  const [continueGoalTitle, setContinueGoalTitle] = useState("");
  const [continueGoalBusy, setContinueGoalBusy] = useState(false);
  const [continueGoalError, setContinueGoalError] = useState<string | null>(null);
  const [goalEditOpen, setGoalEditOpen] = useState(false);
  const [goalEditTitle, setGoalEditTitle] = useState("");
  const [goalEditBusy, setGoalEditBusy] = useState(false);
  const [goalEditError, setGoalEditError] = useState<string | null>(null);
  /** Brief “goal achieved” banner after the last milestone completes (per goal id). */
  const [bloomCelebrateGoalId, setBloomCelebrateGoalId] = useState<string | null>(null);
  const prevBloomByGoalIdRef = useRef<Record<string, string>>({});
  const goalPanelId = panel.type === "goal" ? panel.goal.id : null;
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
    setContinueGoalOpen(false);
    setContinueGoalTitle("");
    setContinueGoalBusy(false);
    setContinueGoalError(null);
    setGoalEditOpen(false);
    setGoalEditTitle("");
    setGoalEditBusy(false);
    setGoalEditError(null);
    setBloomCelebrateGoalId(null);
  }, [goalPanelId]);

  useEffect(() => {
    if (!continueGoalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setContinueGoalOpen(false);
        setContinueGoalError(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [continueGoalOpen]);

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

  const openEvolveFlow = useCallback((goalTitle: string) => {
    setContinueGoalError(null);
    setContinueGoalTitle(defaultEvolutionTitle(goalTitle));
    setContinueGoalOpen(true);
    setBloomCelebrateGoalId(null);
  }, []);

  useEffect(() => {
    if (panel.type !== "goal") return;
    const live = findGoalInAreas(areas, panel.goal.id);
    const g = live?.goal ?? panel.goal;
    const prev = prevBloomByGoalIdRef.current[g.id];
    if (prev && (prev === "GROWING" || prev === "BUD") && g.bloomStatus === "BLOOMED") {
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
    const recentThemeMoments = area.branches
      .flatMap((thread) =>
        thread.moments
          .filter((m) => m.synthetic !== true)
          .map((m) => ({ moment: m, hubLabel: thread.type.trim() || "Hub" })),
      )
      .sort((a, b) => (b.moment.year ?? -1) - (a.moment.year ?? -1));
    const themeCopy = themePanelCopy(area.id);
    const snapshot = buildThemeSnapshot(area);
    const themeAbout =
      area.summary?.trim() || lifeArea?.emptyPrompt || themeCopy.vision;
    const themeTagline = lifeArea?.sublabel;
    const themeExamples = lifeArea?.examples ?? [];
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
          <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-tertiary)", lineHeight: 1.45 }}>
            {branchN} {branchN === 1 ? "hub" : "hubs"} · {roadmapGoalsTotal}{" "}
            {roadmapGoalsTotal === 1 ? "goal" : "goals"}
            {themeMomentCount > 0
              ? ` · ${themeMomentCount} timeline ${themeMomentCount === 1 ? "note" : "notes"}`
              : ""}
          </p>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 18px 20px" }}>
          <div style={{ display: "grid", gap: 18 }}>
            <div
              style={{
                padding: "14px 14px 12px",
                borderRadius: 12,
                border: "1px solid var(--color-border-tertiary)",
                background: "var(--color-background-secondary, rgba(255,255,255,0.02))",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: ".07em",
                  textTransform: "uppercase",
                  color: "var(--color-text-tertiary)",
                  marginBottom: 8,
                }}
              >
                What this theme represents
              </div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--color-text-secondary)" }}>
                {themeCopy.vision}
              </p>
              {themeCopy.dimensions.length > 0 ? (
                <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.5, color: "var(--color-text-tertiary)" }}>
                  {themeCopy.dimensions.map((d) => (
                    <li key={d} style={{ marginBottom: 4 }}>
                      {d}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div
              style={{
                padding: "14px 14px 12px",
                borderRadius: 12,
                border: `1px solid ${area.color}33`,
                background: `linear-gradient(180deg, ${area.color}12 0%, transparent 100%)`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: ".07em",
                    textTransform: "uppercase",
                    color: area.color,
                  }}
                >
                  Theme evaluation
                </div>
                <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>Snapshot</span>
              </div>
              <p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.5, color: "var(--color-text-tertiary)" }}>
                A read of your map today — goals, hubs, and timeline on this theme. AI will go deeper here later.
              </p>
              {snapshot.strengths.length > 0 ? (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 6 }}>
                    What looks strong
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5, color: "var(--color-text-secondary)" }}>
                    {snapshot.strengths.map((s) => (
                      <li key={s} style={{ marginBottom: 4 }}>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {snapshot.gaps.length > 0 ? (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 6 }}>
                    Gaps & opportunities
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5, color: "var(--color-text-tertiary)" }}>
                    {snapshot.gaps.map((g) => (
                      <li key={g} style={{ marginBottom: 4 }}>
                        {g}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {snapshot.reflectionQuestions.length > 0 ? (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 6 }}>
                    Questions to sit with
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5, color: "var(--color-text-tertiary)" }}>
                    {snapshot.reflectionQuestions.map((q) => (
                      <li key={q} style={{ marginBottom: 4 }}>
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 8,
              }}
            >
              {[
                { label: "Goals", value: snapshot.totalGoals },
                { label: "Timeline notes", value: snapshot.totalMoments },
                { label: "Hubs with goals", value: `${snapshot.hubsWithGoals}/${snapshot.hubCount}` },
                { label: "Hubs with history", value: `${snapshot.hubsWithMoments}/${snapshot.hubCount}` },
              ].map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    borderRadius: 10,
                    border: "1px solid var(--color-border-tertiary)",
                    padding: "10px 12px",
                    background: "var(--color-background-secondary, rgba(255,255,255,0.02))",
                  }}
                >
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 4 }}>{stat.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)" }}>{stat.value}</div>
                </div>
              ))}
            </div>

            <div
              style={{
                padding: "14px 14px 12px",
                borderRadius: 12,
                border: "1px solid var(--color-border-tertiary)",
                background: "var(--color-background-secondary, rgba(255,255,255,0.02))",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: ".07em",
                  textTransform: "uppercase",
                  color: "var(--color-text-tertiary)",
                  marginBottom: 8,
                }}
              >
                Your prompt
              </div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "var(--color-text-secondary)" }}>
                {themeAbout}
              </p>
              {themeExamples.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                  {themeExamples.map((example) => (
                    <span
                      key={example}
                      style={{
                        fontSize: 12,
                        lineHeight: 1.35,
                        color: "var(--color-text-tertiary)",
                        border: "1px solid var(--color-border-tertiary)",
                        borderRadius: 999,
                        padding: "4px 10px",
                      }}
                    >
                      {example}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

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
            const statuses = thread.moments.map(statusFromMoment);
            const hasEnded = statuses.includes("ended");
            const hasGrowing = statuses.includes("growing");
            const hasBloomed = statuses.includes("bloomed");
            const badge = hasGrowing ? "growing" : hasEnded && !hasBloomed ? "ended" : "bloomed";
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
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, color: "var(--color-text-tertiary)" }}>
                  {hubBlurb}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-tertiary)" }}>
                  {threadGoalCount} {threadGoalCount === 1 ? "goal" : "goals"}
                </p>
              </button>
            );
          })}
            </div>

            {snapshot.totalGoals > 0 ? (
              <div style={{ display: "grid", gap: 12 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: ".07em",
                    textTransform: "uppercase",
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  All goals in this theme
                </div>
                {area.branches.map((thread) => {
                  const hubLabel = thread.type.trim() || "Hub";
                  const goals = thread.goals.flatMap(function flatten(g: TreeGoalNode): TreeGoalNode[] {
                    return [g, ...g.childGoals.flatMap(flatten)];
                  });
                  if (goals.length === 0) return null;
                  return (
                    <div key={thread.id} style={{ display: "grid", gap: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: area.color }}>{hubLabel}</div>
                      {goals.map((goal) => {
                        const gBadge = badgeStatusFromGoalBloom(goal.bloomStatus);
                        const summary = hubGoalStageSummary(goal);
                        return (
                          <button
                            key={goal.id}
                            type="button"
                            onClick={() => onNavigateToGoal(goal.id)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 10,
                              border: "1px solid var(--color-border-tertiary)",
                              borderRadius: 10,
                              padding: "10px 12px",
                              background: "var(--color-background-secondary, rgba(255,255,255,0.02))",
                              cursor: "pointer",
                              textAlign: "left",
                              width: "100%",
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)", lineHeight: 1.35 }}>
                                {goal.title}
                              </div>
                              {summary.total > 0 ? (
                                <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--color-text-tertiary)" }}>
                                  {summary.done}/{summary.total} {summary.usesStages ? "stages" : "milestones"} · {summary.progressPct}%
                                </p>
                              ) : (
                                <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--color-text-tertiary)" }}>
                                  No milestones yet
                                </p>
                              )}
                            </div>
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
                              {goal.bloomStatus.toLowerCase().replace("_", " ")}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {recentThemeMoments.length > 0 ? (
              <div style={{ display: "grid", gap: 8 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: ".07em",
                    textTransform: "uppercase",
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  Timeline across this theme
                </div>
                {recentThemeMoments.map(({ moment, hubLabel }) => (
                  <div
                    key={moment.id}
                    style={{
                      border: "1px solid var(--color-border-tertiary)",
                      borderRadius: 10,
                      padding: "10px 12px",
                      background: "var(--color-background-secondary, rgba(255,255,255,0.02))",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)", lineHeight: 1.35 }}>
                        {moment.label}
                      </span>
                      {moment.year != null ? (
                        <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", flexShrink: 0 }}>
                          {moment.year}
                        </span>
                      ) : null}
                    </div>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: area.color }}>
                      {hubLabel}
                    </p>
                    {moment.description ? (
                      <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.45, color: "var(--color-text-tertiary)" }}>
                        {moment.description}
                      </p>
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

  if (panel.type === "hub") {
    const area = panel.area;
    const thread = area.branches.find((t) => t.id === panel.thread.id) ?? panel.thread;
    const hubLabel = thread.type.trim() || "Hub";
    const hubGoals = thread.goals;
    const hubRail = panelPresentation === "rail";
    const momentCount = thread.moments.filter((m) => m.synthetic !== true).length;
    const hubCopy = hubPanelCopy(area.id, hubLabel);
    const recentHubMoments = thread.moments
      .filter((m) => m.synthetic !== true)
      .slice()
      .sort((a, b) => (b.year ?? -1) - (a.year ?? -1))
      .slice(0, 3);
    const hubCtx = {
      branchId: thread.id,
      areaId: area.id,
      branchLabel: hubLabel,
      areaLabel: area.label,
      anchorClient: { x: 0, y: 0 },
    };
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
            Hub
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
            {hubGoals.length} {hubGoals.length === 1 ? "goal" : "goals"}
            {momentCount > 0 ? ` · ${momentCount} timeline ${momentCount === 1 ? "note" : "notes"}` : ""}
          </p>
          <button
            type="button"
            data-testid="tree-add-goal"
            onClick={() => onAddGoal(hubCtx)}
            style={{
              marginTop: 14,
              width: "100%",
              fontSize: 14,
              fontWeight: 600,
              color: "#0c0a09",
              background: area.color,
              border: "none",
              borderRadius: 10,
              padding: "10px 14px",
              cursor: "pointer",
            }}
          >
            Add goal
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 18px 20px" }}>
          <div style={{ display: "grid", gap: 18 }}>
            <div
              style={{
                padding: "14px 14px 12px",
                borderRadius: 12,
                border: "1px solid var(--color-border-tertiary)",
                background: "var(--color-background-secondary, rgba(255,255,255,0.02))",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: ".07em",
                  textTransform: "uppercase",
                  color: "var(--color-text-tertiary)",
                  marginBottom: 8,
                }}
              >
                About this hub
              </div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "var(--color-text-secondary)" }}>
                {hubCopy.about}
              </p>
              {hubCopy.examples.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                  {hubCopy.examples.map((example) => (
                    <span
                      key={example}
                      style={{
                        fontSize: 12,
                        lineHeight: 1.35,
                        color: "var(--color-text-tertiary)",
                        border: "1px solid var(--color-border-tertiary)",
                        borderRadius: 999,
                        padding: "4px 10px",
                      }}
                    >
                      {example}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {recentHubMoments.length > 0 ? (
              <div style={{ display: "grid", gap: 8 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: ".07em",
                    textTransform: "uppercase",
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  Recent on the timeline
                </div>
                {recentHubMoments.map((moment) => (
                  <div
                    key={moment.id}
                    style={{
                      border: "1px solid var(--color-border-tertiary)",
                      borderRadius: 10,
                      padding: "10px 12px",
                      background: "var(--color-background-secondary, rgba(255,255,255,0.02))",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)", lineHeight: 1.35 }}>
                        {moment.label}
                      </span>
                      {moment.year != null ? (
                        <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", flexShrink: 0 }}>
                          {moment.year}
                        </span>
                      ) : null}
                    </div>
                    {moment.description ? (
                      <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.45, color: "var(--color-text-tertiary)" }}>
                        {moment.description}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

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
                No goals yet
              </p>
              <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-tertiary)", lineHeight: 1.5 }}>
                Add a goal to start tracking a pursuit on this hub.
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
                Goals on this hub
              </div>
              {hubGoals.map((goal) => {
                const gBadge = badgeStatusFromGoalBloom(goal.bloomStatus);
                const statusLabel = goal.bloomStatus.toLowerCase().replace("_", " ");
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
                      <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-tertiary)" }}>
                        No milestones yet
                      </p>
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
                          Evolved from “{parent.goal.title}”
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
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
    const gBadge = badgeStatusFromGoalBloom(goal.bloomStatus);
    const statusLabel = goal.bloomStatus.toLowerCase().replace("_", " ");
    const isBloomed = goal.bloomStatus === "BLOOMED";
    const showBloomCelebrate = bloomCelebrateGoalId === goal.id && isBloomed;
    const childCount = goal.childGoals.length;
    const confirmDelete = () => {
      const childNote =
        childCount > 0
          ? ` ${childCount} related goal${childCount === 1 ? "" : "s"} that continue from this one will stay on this hub (each stays its own pursuit).`
          : "";
      return window.confirm(
        `Delete “${goal.title}”? This removes the goal and its milestones.${childNote} This cannot be undone.`,
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
    const handleToggle = async (subtaskId: string, current: boolean) => {
      const next = !current;
      setOptimisticSubtask((prev) => ({ ...prev, [subtaskId]: next }));
      setPendingSubtaskIds((prev) => {
        const n = new Set(prev);
        n.add(subtaskId);
        return n;
      });
      setSubtaskError(null);
      const result = await onToggleSubtask(subtaskId);
      setPendingSubtaskIds((prev) => {
        const n = new Set(prev);
        n.delete(subtaskId);
        return n;
      });
      setOptimisticSubtask((prev) => {
        const n = { ...prev };
        delete n[subtaskId];
        return n;
      });
      if (!result.ok) setSubtaskError(result.error ?? "Could not update subtask.");
    };
    const goalRail = panelPresentation === "rail";
    const parentContinuation = goal.parentGoalId
      ? findGoalInAreas(areas, goal.parentGoalId)
      : null;
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
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 14, color: area.color, fontWeight: 600 }}>{area.label}</span>
          <span style={{ fontSize: 14, color: "var(--color-text-tertiary)" }}>·</span>
          <span style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>{thread?.type ?? "Hub"}</span>
          <span
            style={{
              ...statusBadgeStyle(gBadge),
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: ".04em",
              textTransform: "uppercase",
              borderRadius: 999,
              padding: "3px 8px",
            }}
          >
            {statusLabel}
          </span>
        </div>
        <div style={{ marginBottom: 10 }}>
          {goalEditOpen ? (
            <div style={{ display: "grid", gap: 8 }}>
              <input
                type="text"
                autoComplete="off"
                autoFocus
                aria-label="Goal title"
                placeholder="Goal title"
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
              Goal achieved
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
              This pursuit is complete on the map. Start a continuation if there is a next chapter.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button
                type="button"
                disabled={continueGoalBusy}
                onClick={() => openEvolveFlow(goal.title)}
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#0c0a09",
                  background: area.color,
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 14px",
                  cursor: continueGoalBusy ? "wait" : "pointer",
                  opacity: continueGoalBusy ? 0.75 : 1,
                }}
              >
                Evolve this goal
              </button>
              <button
                type="button"
                disabled={continueGoalBusy}
                onClick={() => setBloomCelebrateGoalId(null)}
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--color-text-tertiary)",
                  background: "transparent",
                  border: "1px solid var(--color-border-secondary)",
                  borderRadius: 8,
                  padding: "8px 14px",
                  cursor: continueGoalBusy ? "wait" : "pointer",
                }}
              >
                Not now
              </button>
            </div>
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
            <span style={{ color: "var(--color-text-tertiary)" }}>Evolved from </span>
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
              <span style={{ color: "var(--color-text-secondary)" }}>a previous goal</span>
            )}
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
                {FLAGS.GOAL_MILESTONES && goal.milestones.length > TREE_ORBITAL_MAX_VISIBLE
                  ? `Tap a stage to complete it on the tree (${TREE_ORBITAL_MAX_VISIBLE} on the map · ${goal.milestones.length} total). Substeps are optional.`
                  : FLAGS.GOAL_MILESTONES
                    ? "Tap a stage to complete it on the tree. Substeps are optional detail."
                    : "Tap a stage when it feels complete. Substeps are optional detail."}
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
                  return (
                    <div key={m.id} style={{ display: "grid", gap: 6 }}>
                      <button
                        type="button"
                        disabled={msPending}
                        aria-pressed={displayMilestoneComplete}
                        aria-label={
                          displayMilestoneComplete
                            ? `${m.title}, marked complete. Activate to reopen this stage.`
                            : `${m.title}. Mark this stage complete.`
                        }
                        onClick={() => {
                          if (msPending) return;
                          void (async () => {
                            setMilestoneError(null);
                            setPendingMilestoneIds((prev) => new Set(prev).add(m.id));
                            const result = await onSetMilestoneCompletion(goal.id, m.id, !milestoneComplete);
                            setPendingMilestoneIds((prev) => {
                              const n = new Set(prev);
                              n.delete(m.id);
                              return n;
                            });
                            if (!result.ok) {
                              setMilestoneError(result.error ?? "Could not update milestone.");
                              return;
                            }
                            if (
                              !milestoneComplete &&
                              goalAchievedAfterCompletingMilestone(
                                goal.milestones,
                                m.id,
                                isCompletedFor,
                              )
                            ) {
                              setBloomCelebrateGoalId(goal.id);
                            }
                          })();
                        }}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 10,
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 10px",
                          margin: 0,
                          border: `1px solid ${displayMilestoneComplete ? `${area.color}40` : "rgba(255,255,255,0.08)"}`,
                          borderRadius: 10,
                          background: displayMilestoneComplete
                            ? `linear-gradient(135deg, ${area.color}18, transparent)`
                            : "rgba(255,255,255,0.03)",
                          cursor: msPending ? "wait" : "pointer",
                          opacity: msPending ? 0.72 : 1,
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
                      </button>
                      {total > 0 ? (
                        <div
                          style={{
                            paddingLeft: 30,
                            marginTop: -2,
                            fontSize: 12,
                            color: "var(--color-text-tertiary)",
                            opacity: 0.72,
                            lineHeight: 1.35,
                          }}
                        >
                          Supporting detail · {done}/{total}
                        </div>
                      ) : null}
                      {total > 0 ? (
                        <ul
                          style={{
                            listStyle: "none",
                            margin: 0,
                            padding: 0,
                            paddingLeft: 26,
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
                                    cursor: pending ? "wait" : "pointer",
                                    opacity: pending ? 0.7 : 1,
                                    paddingLeft: 4,
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={completed}
                                    disabled={pending}
                                    onChange={() => {
                                      if (pending) return;
                                      void handleToggle(s.id, completed);
                                    }}
                                    style={{
                                      accentColor: area.color,
                                      cursor: pending ? "wait" : "pointer",
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
                            paddingLeft: 4,
                            fontSize: 13,
                            color: "var(--color-text-tertiary)",
                            fontStyle: "italic",
                          }}
                        >
                          No substeps yet.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: 14, color: "var(--color-text-tertiary)", margin: "0 0 10px", opacity: 0.92 }}>
                Add a step below, or generate an AI roadmap for this goal.
              </p>
            )}

            {FLAGS.GOAL_MILESTONES ? (
            <div style={{ marginTop: 14 }}>
            {milestoneCount < 6 && suggestMilestonesAvailable ? (
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
                      const capped = Math.max(0, 6 - milestoneCount);
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
                        if (chips.length >= capped) break;
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
                          disabled={appendBusy || milestoneCount >= 6}
                          onClick={() => {
                            const title = formatUserInput(chip);
                            if (!title || appendBusy || milestoneCount >= 6) return;
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
                            cursor:
                              appendBusy || milestoneCount >= 6 ? "not-allowed" : "pointer",
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
            {milestoneCount < 6 ? (
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
                      if (!title || appendBusy || milestoneCount >= 6) return;
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
                  disabled={appendBusy || !orbitalDraft.trim() || milestoneCount >= 6}
                  onClick={() => {
                    const title = formatUserInput(orbitalDraft);
                    if (!title || appendBusy || milestoneCount >= 6) return;
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
            ) : (
              <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", margin: "6px 0 0", opacity: 0.85 }}>
                Max 6 on tree
              </p>
            )}
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
            Evolved by
          </div>
          <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", margin: "0 0 10px", lineHeight: 1.35, opacity: 0.88 }}>
            Separate goals · not steps inside this one.
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
          {isBloomed ? (
            <button
              type="button"
              disabled={continueGoalBusy}
              onClick={() => openEvolveFlow(goal.title)}
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: area.color,
                background: "rgba(255,255,255,0.06)",
                border: `1px solid ${area.color}`,
                borderRadius: 8,
                padding: "8px 14px",
                cursor: continueGoalBusy ? "wait" : "pointer",
                opacity: continueGoalBusy ? 0.75 : 1,
              }}
            >
              Evolve this goal
            </button>
          ) : (
            <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", margin: 0, opacity: 0.88, lineHeight: 1.4 }}>
              Complete all milestones to unlock goal evolution.
            </p>
          )}
        </div>
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
              if (!result.ok) setGoalDeleteError(result.error ?? "Could not delete goal.");
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
            {goalDeleteBusy ? "Deleting…" : "Delete goal"}
          </button>
        </div>
        {continueGoalOpen ? (
          <div
            role="presentation"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 80,
              background: "rgba(0,0,0,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
            }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                setContinueGoalOpen(false);
                setContinueGoalError(null);
              }
            }}
          >
            <div
              role="dialog"
              aria-labelledby="continue-goal-dialog-title"
              style={{
                width: "min(400px, 100%)",
                borderRadius: 12,
                border: "1px solid var(--color-border-secondary)",
                background: "var(--color-background-primary)",
                padding: "18px 18px 16px",
                boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div
                id="continue-goal-dialog-title"
                style={{ fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 8 }}
              >
                Evolve this goal
              </div>
              <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", margin: "0 0 14px", lineHeight: 1.45, opacity: 0.92 }}>
                Starts the next chapter on this hub. The completed goal stays on the map as achieved.
              </p>
              <label style={{ display: "grid", gap: 6, marginBottom: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-secondary)" }}>
                  Title
                </span>
                <input
                  type="text"
                  autoComplete="off"
                  autoFocus
                  value={continueGoalTitle}
                  disabled={continueGoalBusy}
                  onChange={(e) => {
                    setContinueGoalTitle(e.target.value);
                    if (continueGoalError) setContinueGoalError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const title = formatUserInput(continueGoalTitle);
                      if (!title || continueGoalBusy) return;
                      void (async () => {
                        setContinueGoalBusy(true);
                        setContinueGoalError(null);
                        const result = await onContinueGoal(goal.id, { title });
                        setContinueGoalBusy(false);
                        if (!result.ok) {
                          setContinueGoalError(result.error ?? "Could not create goal.");
                          return;
                        }
                        setContinueGoalOpen(false);
                        setContinueGoalTitle("");
                        if (result.newGoalId) onNavigateToGoal(result.newGoalId);
                      })();
                    }
                  }}
                  style={{
                    padding: "9px 11px",
                    borderRadius: 8,
                    border: "1px solid var(--color-border-secondary)",
                    background: "var(--color-background-primary)",
                    color: "var(--color-text-primary)",
                    fontSize: 16,
                  }}
                />
              </label>
              {continueGoalError ? (
                <p style={{ color: "var(--color-text-danger, #f87171)", fontSize: 14, margin: "0 0 12px" }}>
                  {continueGoalError}
                </p>
              ) : null}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button
                  type="button"
                  disabled={continueGoalBusy}
                  onClick={() => {
                    setContinueGoalOpen(false);
                    setContinueGoalError(null);
                  }}
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "1px solid var(--color-border-secondary)",
                    background: "transparent",
                    color: "var(--color-text-secondary)",
                    cursor: continueGoalBusy ? "wait" : "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={continueGoalBusy || !formatUserInput(continueGoalTitle)}
                  onClick={() => {
                    const title = formatUserInput(continueGoalTitle);
                    if (!title || continueGoalBusy) return;
                    void (async () => {
                      setContinueGoalBusy(true);
                      setContinueGoalError(null);
                      const result = await onContinueGoal(goal.id, { title });
                      setContinueGoalBusy(false);
                      if (!result.ok) {
                        setContinueGoalError(result.error ?? "Could not create goal.");
                        return;
                      }
                      setContinueGoalOpen(false);
                      setContinueGoalTitle("");
                      if (result.newGoalId) onNavigateToGoal(result.newGoalId);
                    })();
                  }}
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: `1px solid ${area.color}`,
                    background: area.color,
                    color: "#0a0a0c",
                    cursor:
                      continueGoalBusy || !formatUserInput(continueGoalTitle) ? "wait" : "pointer",
                    opacity: continueGoalBusy || !formatUserInput(continueGoalTitle) ? 0.65 : 1,
                  }}
                >
                  {continueGoalBusy ? "Creating…" : "Create goal"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  if (panel.type !== "moment") return null;

  const area = panel.area;
  const moment = panel.moment;
  const thread = areas
    .flatMap((a) => a.branches)
    .find((t) => t.id === moment.branchId);
  const status = statusFromMoment(moment);

  return (
    <section
      style={{
        borderTop: `1.5px solid ${area.color}`,
        background: "var(--color-background-primary)",
        padding: "14px 18px 20px",
        animation: "slideup 160ms ease-out",
        position: "relative",
      }}
    >
      <button
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
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 14, color: area.color, fontWeight: 600 }}>{area.label}</span>
        <span style={{ fontSize: 14, color: "var(--color-text-tertiary)" }}>·</span>
        <span style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>{thread?.type ?? "Hub"}</span>
        {moment.year ? (
          <>
            <span style={{ fontSize: 14, color: "var(--color-text-tertiary)" }}>·</span>
            <span style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>{moment.year}</span>
          </>
        ) : null}
        <span
          style={{
            ...statusBadgeStyle(status),
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: ".04em",
            textTransform: "uppercase",
            borderRadius: 999,
            padding: "3px 8px",
          }}
        >
          {status}
        </span>
        {moment.value !== null ? (
          <span
            style={{
              background: "var(--color-background-secondary, rgba(148,163,184,0.15))",
              color: "var(--color-text-secondary, #334155)",
              fontSize: 12,
              borderRadius: 999,
              padding: "3px 8px",
            }}
          >
            value {moment.value}
          </span>
        ) : null}
      </div>
      <div style={{ fontSize: 18, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 6 }}>{moment.label}</div>
      <div style={{ fontSize: 16, color: "var(--color-text-secondary)", lineHeight: 1.65, marginBottom: 10 }}>
        {moment.description ?? "No description yet."}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: n <= moment.significance ? area.color : "var(--color-border-secondary)",
                opacity: n <= moment.significance ? 0.95 : 0.6,
              }}
            />
          ))}
        </div>
        <span style={{ fontSize: 14, color: "var(--color-text-tertiary)", textTransform: "lowercase" }}>
          {sigLabel(moment.significance)}
        </span>
      </div>
      {moment.synthetic ? (
        <div
          style={{
            marginTop: 12,
            borderTop: "1px solid var(--color-border-tertiary)",
            paddingTop: 10,
            fontSize: 13,
            color: "var(--color-text-tertiary)",
          }}
        >
          Placeholder moment (tree density preview only).
        </div>
      ) : null}
    </section>
  );
}