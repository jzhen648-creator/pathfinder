"use client";

import { useEffect, useState } from "react";
import {
  badgeStatusFromGoalBloom,
  sigLabel,
  statusBadgeStyle,
  statusFromMoment,
} from "./tree-view-badges";
import {
  countRoadmapGoalsInArea,
  countRoadmapGoalsOnThread,
  findGoalInAreas,
} from "./tree-view-goal-queries";
import type { TreePanelProps } from "./tree-view-types";

export function TreePanel({
  panel,
  areas,
  onClose,
  onCreateBranchFromMoment,
  onAddGoal,
  onDeleteGoal,
  onToggleSubtask,
}: TreePanelProps) {
  const [newBranchLabel, setNewBranchLabel] = useState("");
  const [branching, setBranching] = useState(false);
  const [branchCreateError, setBranchCreateError] = useState<string | null>(null);
  const [goalDeleteBusy, setGoalDeleteBusy] = useState(false);
  const [goalDeleteError, setGoalDeleteError] = useState<string | null>(null);
  /** In-flight subtask ids (disable + spinner). */
  const [pendingSubtaskIds, setPendingSubtaskIds] = useState<Set<string>>(() => new Set());
  /** Optimistic completion override per subtask while server roundtrips; cleared on response (success or fail). */
  const [optimisticSubtask, setOptimisticSubtask] = useState<Record<string, boolean>>({});
  const [subtaskError, setSubtaskError] = useState<string | null>(null);
  const goalPanelId = panel.type === "goal" ? panel.goal.id : null;
  useEffect(() => {
    setGoalDeleteError(null);
    setGoalDeleteBusy(false);
    setPendingSubtaskIds(new Set());
    setOptimisticSubtask({});
    setSubtaskError(null);
  }, [goalPanelId]);
  if (panel.type === "none") return null;

  if (panel.type === "foundations") {
    return (
      <section
        style={{
          borderTop: "1.5px solid #888780",
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
            fontSize: 18,
            lineHeight: 1,
            color: "var(--color-text-tertiary)",
            cursor: "pointer",
          }}
        >
          ×
        </button>
        <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: ".14em", color: "var(--color-text-tertiary)", textTransform: "uppercase", marginBottom: 6 }}>
          Foundations
        </div>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.65, marginBottom: 12 }}>
          The unchosen context — everything that shaped you before you had real agency. The richer this becomes, the more personally the AI reflects on everything growing above it.
        </p>
        <button
          style={{
            fontSize: 12,
            color: "var(--color-text-info)",
            background: "none",
            border: "0.5px solid var(--color-border-info)",
            borderRadius: "var(--border-radius-md)",
            padding: "6px 14px",
            cursor: "pointer",
          }}
        >
          Add to your foundations →
        </button>
      </section>
    );
  }

  if (panel.type === "area") {
    const area = panel.area;
    const roadmapGoalsTotal = countRoadmapGoalsInArea(area);
    const branchN = area.branches.length;
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
            fontSize: 18,
            lineHeight: 1,
            color: "var(--color-text-tertiary)",
            cursor: "pointer",
          }}
        >
          ×
        </button>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: area.color }}>{area.label}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
              {branchN} {branchN === 1 ? "branch" : "branches"} · {roadmapGoalsTotal}{" "}
              {roadmapGoalsTotal === 1 ? "goal" : "goals"}
            </div>
          </div>
          <button
            type="button"
            data-testid="tree-add-goal"
            onClick={onAddGoal}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--color-text-secondary)",
              background: "var(--color-background-secondary, rgba(255,255,255,0.04))",
              border: "1px solid var(--color-border-secondary)",
              borderRadius: 8,
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            Add goal
          </button>
        </div>

        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          {area.branches.map((thread) => {
            const statuses = thread.moments.map(statusFromMoment);
            const hasEnded = statuses.includes("ended");
            const hasGrowing = statuses.includes("growing");
            const hasBloomed = statuses.includes("bloomed");
            const badge = hasGrowing ? "growing" : hasEnded && !hasBloomed ? "ended" : "bloomed";
            const threadGoalCount = countRoadmapGoalsOnThread(thread);
            return (
              <div
                key={thread.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  border: "1px solid var(--color-border-tertiary)",
                  borderRadius: 8,
                  padding: "8px 10px",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, color: "var(--color-text-primary)", fontWeight: 500 }}>{thread.type}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                    {threadGoalCount} {threadGoalCount === 1 ? "goal" : "goals"}
                  </div>
                </div>
                <span
                  style={{
                    ...statusBadgeStyle(badge),
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: ".04em",
                    textTransform: "uppercase",
                    borderRadius: 999,
                    padding: "3px 8px",
                  }}
                >
                  {badge}
                </span>
              </div>
            );
          })}
        </div>

        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
          {area.summary ??
            "Summary coming soon. This area weaves together how your goals in this part of life connect over time."}
        </p>
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
    const childCount = goal.childGoals.length;
    const confirmDelete = () => {
      const childNote =
        childCount > 0
          ? ` ${childCount} branched goal${childCount === 1 ? "" : "s"} will stay on this branch as top-level goals.`
          : "";
      return window.confirm(
        `Delete “${goal.title}”? This removes the goal and its milestones.${childNote} This cannot be undone.`,
      );
    };
    const isCompletedFor = (s: { id: string; isCompleted: boolean }) =>
      optimisticSubtask[s.id] ?? s.isCompleted;
    const allSubtasks = goal.milestones.flatMap((m) => m.subtasks);
    const totalSubtasks = allSubtasks.length;
    const doneSubtasks = allSubtasks.filter(isCompletedFor).length;
    const progressPct = totalSubtasks > 0 ? Math.round((doneSubtasks / totalSubtasks) * 100) : 0;
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
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          style={{
            position: "absolute",
            right: 12,
            top: 8,
            border: "none",
            background: "transparent",
            fontSize: 18,
            lineHeight: 1,
            color: "var(--color-text-tertiary)",
            cursor: "pointer",
          }}
        >
          ×
        </button>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: area.color, fontWeight: 600 }}>{area.label}</span>
          <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>·</span>
          <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{thread?.type ?? "Branch"}</span>
          <span
            style={{
              ...statusBadgeStyle(gBadge),
              fontSize: 10,
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
        <div style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 8 }}>
          {goal.title}
        </div>
        {totalSubtasks > 0 ? (
          <div style={{ marginTop: 4, marginBottom: 12 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 11,
                color: "var(--color-text-tertiary)",
                marginBottom: 4,
              }}
            >
              <span>Progress</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {doneSubtasks} / {totalSubtasks} · {progressPct}%
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
                  width: `${progressPct}%`,
                  background: area.color,
                  transition: "width 200ms ease",
                }}
              />
            </div>
          </div>
        ) : null}
        {subtaskError ? (
          <p style={{ color: "var(--color-text-danger, #f87171)", fontSize: 12, margin: "0 0 10px" }}>
            {subtaskError}
          </p>
        ) : null}
        {goal.milestones.length > 0 ? (
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: area.color, marginBottom: 6 }}>
              Milestones
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {goal.milestones.map((m) => {
                const subs = m.subtasks;
                const done = subs.filter(isCompletedFor).length;
                const total = subs.length;
                const milestoneComplete = total > 0 && done === total;
                return (
                  <div key={m.id} style={{ display: "grid", gap: 6 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: milestoneComplete
                            ? "var(--color-text-tertiary)"
                            : "var(--color-text-primary)",
                          textDecoration: milestoneComplete ? "line-through" : "none",
                        }}
                      >
                        {m.title}
                      </div>
                      {total > 0 ? (
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--color-text-tertiary)",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {done}/{total}
                        </span>
                      ) : null}
                    </div>
                    {total > 0 ? (
                      <ul
                        style={{
                          listStyle: "none",
                          margin: 0,
                          padding: 0,
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
                                  fontSize: 12.5,
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
                          fontSize: 11,
                          color: "var(--color-text-tertiary)",
                          fontStyle: "italic",
                        }}
                      >
                        No subtasks yet — counts as done when its milestone is reached.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 12 }}>
              <a
                href={`/roadmap/${encodeURIComponent(goal.id)}`}
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: area.color,
                  textDecoration: "none",
                }}
              >
                Open in roadmap →
              </a>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 4 }}>
            <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", margin: "0 0 8px" }}>
              No milestones yet — plan this goal to start tracking progress.
            </p>
            <a
              href={`/roadmap/${encodeURIComponent(goal.id)}`}
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: area.color,
                textDecoration: "none",
              }}
            >
              Plan in roadmap →
            </a>
          </div>
        )}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--color-border-tertiary)" }}>
          {goalDeleteError ? (
            <p style={{ color: "var(--color-text-danger, #f87171)", fontSize: 12, margin: "0 0 10px" }}>
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
              fontSize: 12,
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
  const defaultBranchLabel = newBranchLabel.trim();
  const canCreateBranch = defaultBranchLabel.length > 1 && !branching;

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
          fontSize: 18,
          lineHeight: 1,
          color: "var(--color-text-tertiary)",
          cursor: "pointer",
        }}
      >
        ×
      </button>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: area.color, fontWeight: 600 }}>{area.label}</span>
        <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>·</span>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{thread?.type ?? "Thread"}</span>
        {moment.year ? (
          <>
            <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>·</span>
            <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{moment.year}</span>
          </>
        ) : null}
        <span
          style={{
            ...statusBadgeStyle(status),
            fontSize: 10,
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
              fontSize: 10,
              borderRadius: 999,
              padding: "3px 8px",
            }}
          >
            value {moment.value}
          </span>
        ) : null}
      </div>
      <div style={{ fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 6 }}>{moment.label}</div>
      <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.65, marginBottom: 10 }}>
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
        <span style={{ fontSize: 12, color: "var(--color-text-tertiary)", textTransform: "lowercase" }}>
          {sigLabel(moment.significance)}
        </span>
      </div>
      {!moment.synthetic ? (
        <div
          style={{
            marginTop: 12,
            borderTop: "1px solid var(--color-border-tertiary)",
            paddingTop: 10,
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: area.color }}>
            Branch this goal into a new thread
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={newBranchLabel}
              onChange={(e) => {
                setNewBranchLabel(e.target.value);
                if (branchCreateError) setBranchCreateError(null);
              }}
              placeholder="e.g. Weight loss"
              style={{
                minWidth: 220,
                flex: "1 1 240px",
                padding: "7px 9px",
                borderRadius: 8,
                border: "1px solid var(--color-border-secondary)",
                background: "var(--color-background-primary)",
                color: "var(--color-text-primary)",
                fontSize: 12,
              }}
            />
            <button
              type="button"
              disabled={!canCreateBranch}
              onClick={async () => {
                const label = newBranchLabel.trim();
                if (label.length < 2) return;
                setBranching(true);
                setBranchCreateError(null);
                const result = await onCreateBranchFromMoment({
                  limbId: area.id,
                  parentBranchId: moment.branchId,
                  turningPointId: moment.id,
                  label,
                });
                setBranching(false);
                if (!result.ok) {
                  setBranchCreateError(result.error ?? "Could not create branch.");
                  return;
                }
                setNewBranchLabel("");
              }}
              style={{
                padding: "7px 11px",
                borderRadius: 8,
                border: "1px solid var(--color-border-info)",
                background: canCreateBranch ? "var(--color-background-info, rgba(59,130,246,0.14))" : "var(--color-background-secondary)",
                color: canCreateBranch ? "var(--color-text-info, #1D4ED8)" : "var(--color-text-tertiary)",
                cursor: canCreateBranch ? "pointer" : "not-allowed",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {branching ? "Creating..." : "Create child thread"}
            </button>
          </div>
          {branchCreateError ? (
            <div style={{ fontSize: 11, color: "var(--color-text-danger, #B91C1C)" }}>{branchCreateError}</div>
          ) : (
            <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
              This creates a new branch with this goal as the fork point.
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            marginTop: 12,
            borderTop: "1px solid var(--color-border-tertiary)",
            paddingTop: 10,
            fontSize: 11,
            color: "var(--color-text-tertiary)",
          }}
        >
          Placeholder moment (tree density preview only). Branching is disabled.
        </div>
      )}
    </section>
  );
}