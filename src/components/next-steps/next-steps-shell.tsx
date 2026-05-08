"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AddGoalModal } from "@/components/goals/add-goal-modal";
import { PfChromeTopbar, PfChromeViewsNav } from "@/components/shell/pf-chrome";
import { getLifeArea } from "@/lib/life-areas";
import {
  ROADMAP_LIFE_AREA_COLUMN_ORDER,
  getRoadmapLifeAreaColor,
  getRoadmapLifeAreaSub,
} from "@/lib/roadmap/roadmap-data";
import {
  type ApiGoalProgressShape,
  type NextStepsGoalDTO,
  nextStepsGoalFromApi,
} from "@/lib/next-steps-serialize";
import type { LimbId } from "@/lib/types";

function initialsFromProfile(name: string, email: string): string {
  const n = name.trim();
  if (n.length >= 2) return (n[0] + n[1]).toUpperCase();
  if (n.length === 1) {
    const e = (email[0] ?? "?").toUpperCase();
    return `${n[0].toUpperCase()}${e}`;
  }
  const local = email.split("@")[0] ?? "";
  if (local.length >= 2) return local.slice(0, 2).toUpperCase();
  if (local.length === 1) return `${local[0].toUpperCase()}P`;
  return "PF";
}

function subscribeDark(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function getDarkSnapshot() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
function getServerDarkSnapshot() {
  return false;
}

const LIMB_SHORT: Record<LimbId, string> = {
  work: "Work",
  health: "Health",
  becoming: "Becoming",
  finance: "Money",
  people: "People",
};

function limbTextColors(limbId: LimbId, isDark: boolean): { sub: string; text: string } {
  const c = getRoadmapLifeAreaColor(limbId, isDark);
  const sub = getRoadmapLifeAreaSub(limbId, isDark);
  return { sub, text: c };
}

type Props = {
  initialGoals: NextStepsGoalDTO[];
  initialBranches: { id: string; limbId: string; name: string | null; label: string | null }[];
  userName: string;
  userEmail: string;
};

export function NextStepsShell({ initialGoals, initialBranches, userName, userEmail }: Props) {
  const router = useRouter();
  const isDark = useSyncExternalStore(subscribeDark, getDarkSnapshot, getServerDarkSnapshot);
  const [goals, setGoals] = useState(initialGoals);
  const [addGoalOpen, setAddGoalOpen] = useState(false);
  const [filterLimb, setFilterLimb] = useState<LimbId | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(() => initialGoals[0]?.id ?? null);
  const [toast, setToast] = useState<{ msg: string; color: string } | null>(null);

  const avatarInitials = initialsFromProfile(userName, userEmail);

  const addGoalBranches = useMemo(
    () =>
      initialBranches.map((b) => ({
        id: b.id,
        lifeAreaId: b.limbId,
        label: b.name ?? b.label ?? "Branch",
      })),
    [initialBranches],
  );

  useEffect(() => {
    setGoals(initialGoals);
  }, [initialGoals]);

  const visibleGoals = useMemo(() => {
    if (filterLimb === "all") return goals;
    return goals.filter((g) => g.limbId === filterLimb);
  }, [goals, filterLimb]);

  const showEmptyForLimb = filterLimb !== "all" && visibleGoals.length === 0;

  const showGlobalEmpty = filterLimb === "all" && goals.length === 0;

  const showToast = useCallback((msg: string, color = "#7B68C8") => {
    setToast({ msg, color });
    window.setTimeout(() => setToast(null), 2400);
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((cur) => (cur === id ? null : id));
  }, []);

  const toggleSubtask = useCallback(
    async (goalId: string, subtaskId: string, wasCompleted: boolean) => {
      try {
        const res = await fetch(`/api/subtasks/${subtaskId}/complete`, { method: "PATCH" });
        if (!res.ok) {
          showToast("Couldn’t update step", "#b91c1c");
          return;
        }
        const data = (await res.json()) as { goal?: ApiGoalProgressShape };
        if (!data.goal) return;
        setGoals((prev) => {
          const updated = nextStepsGoalFromApi(data.goal!, prev.find((g) => g.id === goalId)?.lastMarkSummary ?? null);
          if (!updated) {
            return prev.filter((g) => g.id !== goalId);
          }
          return prev.map((g) => (g.id === goalId ? updated : g));
        });
        showToast(
          wasCompleted ? "Step unmarked" : "Step marked done",
          wasCompleted ? "#6B7280" : "#3D7A5E",
        );
      } catch {
        showToast("Couldn’t update step", "#b91c1c");
      }
    },
    [showToast],
  );

  const setLimbFilter = useCallback((limb: LimbId | "all") => {
    setFilterLimb(limb);
  }, []);

  const ink300 = isDark ? "#2E3236" : "#D4D6DA";

  return (
    <div className="pf-ns min-h-dvh overflow-hidden bg-[var(--ns-canvas)] text-[var(--ns-text1)]">
      <style>{`
        .pf-ns {
          --ns-canvas: #F5F3EE;
          --ns-canvas2: #EDEBE4;
          --ns-ink900: #1A1C1E;
          --ns-ink700: #3D4046;
          --ns-ink500: #6B7280;
          --ns-ink300: #B8BDC4;
          --ns-ink100: #ECEEF0;
          --ns-bgEl: #FFFFFF;
          --ns-border: #D8D9DC;
          --ns-text1: var(--ns-ink900);
          --ns-text2: var(--ns-ink700);
          --ns-text3: var(--ns-ink500);
          --ns-ai: #7B68C8;
        }
        @media (prefers-color-scheme: dark) {
          .pf-ns {
            --ns-canvas: #16181A;
            --ns-canvas2: #1E2022;
            --ns-bgEl: #242628;
            --ns-border: #2E3236;
            --ns-text1: #E8EAEC;
            --ns-text2: #9CA3AF;
            --ns-text3: #6B7280;
            --ns-ink100: #252729;
          }
        }
        .pf-ns .ns-shell {
          display: grid;
          grid-template-rows: 48px 1fr;
          grid-template-columns: 220px 1fr;
          height: 100dvh;
          width: 100%;
        }
        .pf-ns .ns-topbar {
          grid-column: 1 / -1;
          display: flex;
          align-items: center;
          gap: 0;
          border-bottom: 1px solid var(--ns-border);
          background: var(--ns-bgEl);
          padding: 0 20px;
          z-index: 20;
        }
        .pf-ns .ns-logo {
          font-family: var(--font-pf-ns-serif), serif;
          font-style: italic;
          font-weight: 400;
          font-size: 17px;
          color: var(--ns-text1);
          margin-right: auto;
          letter-spacing: -0.01em;
          text-decoration: none;
        }
        .pf-ns .ns-logo span {
          opacity: 0.4;
          font-size: 13px;
          margin-left: 6px;
          font-style: normal;
          font-family: var(--font-pf-ns-sans), sans-serif;
        }
        .pf-ns .ns-tb-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          height: 32px;
          padding: 0 12px;
          border-radius: 8px;
          border: 1px solid var(--ns-border);
          background: transparent;
          color: var(--ns-text2);
          font-size: 12px;
          font-weight: 500;
          text-decoration: none;
          font-family: var(--font-pf-ns-sans), sans-serif;
        }
        .pf-ns .ns-tb-btn:hover { background: var(--ns-ink100); }
        .pf-ns .ns-avatar {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: #1a1c1e;
          color: #fff;
          font-size: 12px;
          font-weight: 500;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        @media (prefers-color-scheme: dark) {
          .pf-ns .ns-avatar {
            background: #e8eaec;
            color: #1a1c1e;
          }
        }
        .pf-ns .ns-sidebar {
          background: var(--ns-bgEl);
          border-right: 1px solid var(--ns-border);
          padding: 16px 0;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .pf-ns .ns-sidebar-label {
          font-size: 10px;
          font-weight: 500;
          color: var(--ns-text3);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          padding: 0 20px;
          margin-bottom: 6px;
        }
        .pf-ns .ns-nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          margin: 0 8px;
          border-radius: 8px;
          font-size: 12px;
          color: var(--ns-text2);
          text-decoration: none;
          transition: background 120ms;
        }
        .pf-ns .ns-nav-item:hover { background: var(--ns-ink100); }
        .pf-ns .ns-nav-item.ns-active {
          background: var(--ns-ink100);
          color: var(--ns-text1);
          font-weight: 500;
        }
        .pf-ns .ns-nav-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .pf-ns .ns-sidebar-divider {
          height: 1px;
          background: var(--ns-border);
          margin: 10px 12px;
        }
        .pf-ns .ns-limb-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 7px 12px;
          margin: 0 8px;
          border-radius: 8px;
          cursor: pointer;
          border: 0;
          width: calc(100% - 16px);
          background: transparent;
          text-align: left;
          font: inherit;
        }
        .pf-ns .ns-limb-item:hover { background: var(--ns-ink100); }
        .pf-ns .ns-limb-item.ns-on { background: var(--ns-ink100); }
        .pf-ns .ns-limb-name {
          font-size: 12px;
          color: var(--ns-text3);
        }
        .pf-ns .ns-main {
          background: var(--ns-canvas2);
          overflow: auto;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .pf-ns .ns-page-header {
          background: var(--ns-bgEl);
          border-bottom: 1px solid var(--ns-border);
          padding: 20px 28px 0;
        }
        .pf-ns .ns-page-title {
          font-family: var(--font-pf-ns-serif), serif;
          font-size: 24px;
          font-weight: 400;
          color: var(--ns-text1);
          margin-bottom: 4px;
        }
        .pf-ns .ns-page-sub {
          font-size: 13px;
          color: var(--ns-text3);
          margin-bottom: 16px;
        }
        .pf-ns .ns-filter-row {
          display: flex;
          gap: 6px;
          padding-bottom: 16px;
          overflow-x: auto;
        }
        .pf-ns .ns-filter-chip {
          height: 30px;
          padding: 0 12px;
          border-radius: 100px;
          font-size: 12px;
          font-weight: 500;
          border: 1px solid var(--ns-border);
          background: transparent;
          color: var(--ns-text2);
          cursor: pointer;
          white-space: nowrap;
          font-family: var(--font-pf-ns-sans), sans-serif;
        }
        .pf-ns .ns-filter-chip:hover {
          border-color: var(--ns-text3);
          color: var(--ns-text1);
        }
        .pf-ns .ns-filter-chip.ns-chip-active {
          background: #1a1c1e;
          color: #fff;
          border-color: #1a1c1e;
        }
        @media (prefers-color-scheme: dark) {
          .pf-ns .ns-filter-chip.ns-chip-active {
            background: #e8eaec;
            color: #1a1c1e;
            border-color: #e8eaec;
          }
        }
        .pf-ns .ns-content {
          padding: 20px 28px;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .pf-ns .ns-branch-card {
          background: var(--ns-bgEl);
          border-radius: 14px;
          border: 1px solid var(--ns-border);
          overflow: hidden;
          transition: box-shadow 200ms, border-color 200ms;
        }
        .pf-ns .ns-branch-card:hover {
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
          border-color: var(--ns-ink300);
        }
        .pf-ns .ns-branch-card.ns-expanded {
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }
        .pf-ns .ns-card-main {
          display: flex;
          align-items: center;
          padding: 16px 20px;
          cursor: pointer;
        }
        .pf-ns .ns-card-icon {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-right: 14px;
        }
        .pf-ns .ns-card-info { flex: 1; min-width: 0; }
        .pf-ns .ns-card-title {
          font-size: 15px;
          font-weight: 500;
          color: var(--ns-text1);
          margin-bottom: 3px;
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .pf-ns .ns-card-last {
          font-size: 12px;
          color: var(--ns-text3);
          margin-bottom: 8px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .pf-ns .ns-card-last strong {
          color: var(--ns-text2);
          font-weight: 400;
        }
        .pf-ns .ns-progress-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .pf-ns .ns-progress-track {
          flex: 1;
          height: 5px;
          background: var(--ns-ink100);
          border-radius: 100px;
          overflow: hidden;
        }
        .pf-ns .ns-progress-fill {
          height: 100%;
          border-radius: 100px;
          transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .pf-ns .ns-progress-label {
          font-size: 11px;
          font-family: var(--font-pf-ns-mono), monospace;
          color: var(--ns-text3);
          flex-shrink: 0;
        }
        .pf-ns .ns-card-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 8px;
          margin-left: 16px;
          flex-shrink: 0;
        }
        .pf-ns .ns-limb-tag {
          padding: 3px 9px;
          border-radius: 100px;
          font-size: 11px;
          font-weight: 500;
        }
        .pf-ns .ns-chevron {
          font-size: 12px;
          color: var(--ns-text3);
          transition: transform 200ms;
        }
        .pf-ns .ns-chevron.ns-open { transform: rotate(180deg); }
        .pf-ns .ns-step-list {
          border-top: 1px solid var(--ns-border);
          padding: 14px 20px 16px;
          background: var(--ns-canvas);
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .pf-ns .ns-step-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 9px 10px;
          border-radius: 8px;
        }
        .pf-ns .ns-step-item:hover { background: var(--ns-bgEl); }
        .pf-ns .ns-step-check {
          width: 18px;
          height: 18px;
          border-radius: 5px;
          border: 1.5px solid var(--ns-ink300);
          flex-shrink: 0;
          margin-top: 1px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .pf-ns .ns-step-check.ns-done {
          background: #1a1c1e;
          border-color: #1a1c1e;
          color: #fff;
        }
        @media (prefers-color-scheme: dark) {
          .pf-ns .ns-step-check.ns-done {
            background: #e8eaec;
            border-color: #e8eaec;
            color: #1a1c1e;
          }
        }
        .pf-ns .ns-step-check.ns-done::after {
          content: "✓";
          font-size: 10px;
          font-weight: 600;
        }
        .pf-ns .ns-step-text {
          flex: 1;
          font-size: 13px;
          color: var(--ns-text2);
          line-height: 1.4;
        }
        .pf-ns .ns-step-text.ns-struck {
          text-decoration: line-through;
          color: var(--ns-text3);
        }
        .pf-ns .ns-step-date {
          font-size: 11px;
          font-family: var(--font-pf-ns-mono), monospace;
          color: var(--ns-text3);
          margin-top: 2px;
          flex-shrink: 0;
        }
        .pf-ns .ns-linked {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          margin-top: 4px;
          padding: 2px 7px;
          border-radius: 100px;
          font-size: 10px;
          font-weight: 500;
        }
        .pf-ns .ns-add-step {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 8px;
          cursor: pointer;
          color: var(--ns-text3);
          font-size: 13px;
        }
        .pf-ns .ns-add-step:hover {
          background: var(--ns-bgEl);
          color: var(--ns-text2);
        }
        .pf-ns .ns-add-plus {
          width: 18px;
          height: 18px;
          border-radius: 5px;
          border: 1.5px dashed var(--ns-ink300);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          color: var(--ns-ink300);
        }
        .pf-ns .ns-empty-card {
          background: var(--ns-bgEl);
          border-radius: 14px;
          border: 1px dashed var(--ns-border);
          padding: 24px 20px;
          display: flex;
          align-items: center;
          gap: 14px;
          opacity: 0.65;
        }
        .pf-ns .ns-add-goal-btn {
          display: flex;
          align-items: center;
          gap: 7px;
          height: 36px;
          padding: 0 16px;
          border-radius: 9px;
          border: 1px dashed var(--ns-border);
          background: transparent;
          color: var(--ns-text3);
          font-size: 13px;
          cursor: pointer;
          font-family: var(--font-pf-ns-sans), sans-serif;
        }
        .pf-ns .ns-add-goal-btn:hover {
          border-color: var(--ns-text2);
          color: var(--ns-text2);
          background: var(--ns-bgEl);
        }
        .pf-ns .ns-section-label {
          font-size: 11px;
          font-weight: 500;
          color: var(--ns-text3);
          text-transform: uppercase;
          letter-spacing: 0.07em;
          margin-top: 4px;
        }
        .pf-ns .ns-toast {
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: var(--ns-bgEl);
          border: 1px solid var(--ns-border);
          border-radius: 10px;
          padding: 10px 14px;
          font-size: 13px;
          color: var(--ns-text2);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
          display: flex;
          align-items: center;
          gap: 8px;
          z-index: 99;
          border-left: 3px solid var(--ns-ai);
        }
      `}</style>

      <div className="ns-shell">
        <PfChromeTopbar
          shell="nextSteps"
          avatarInitials={avatarInitials}
          avatarTitle={userName || userEmail || "Profile"}
        />

        <aside className="ns-sidebar">
          <PfChromeViewsNav shell="nextSteps" />

          <div className="ns-sidebar-divider shrink-0" />
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="ns-sidebar-label px-3">Filter by area</div>
            <button
              type="button"
              className={`ns-limb-item${filterLimb === "all" ? " ns-on" : ""}`}
              onClick={() => setLimbFilter("all")}
            >
              <div className="ns-nav-dot" style={{ background: ink300 }} />
              <span className="ns-limb-name" style={{ color: "var(--ns-text2)" }}>
                All areas
              </span>
            </button>
            {ROADMAP_LIFE_AREA_COLUMN_ORDER.map((id) => {
              const limb = getLifeArea(id);
              if (!limb) return null;
              const dot = getRoadmapLifeAreaColor(id, isDark);
              return (
                <button
                  key={id}
                  type="button"
                  className={`ns-limb-item${filterLimb === id ? " ns-on" : ""}`}
                  onClick={() => setLimbFilter(id)}
                >
                  <div className="ns-nav-dot" style={{ background: dot }} />
                  <span className="ns-limb-name">{limb.label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="ns-main">
          <div className="ns-page-header">
            <div className="mb-0.5 flex items-center justify-between gap-3">
              <h1 className="ns-page-title">Next Steps</h1>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  data-testid="next-steps-add-goal"
                  className="ns-add-goal-btn"
                  onClick={() => setAddGoalOpen(true)}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Add goal
                </button>
                <Link href="/dashboard" className="ns-add-goal-btn no-underline">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Add roadmap
                </Link>
              </div>
            </div>
            <p className="ns-page-sub">From branches to next steps.</p>
            <div className="ns-filter-row">
              <button
                type="button"
                className={`ns-filter-chip${filterLimb === "all" ? " ns-chip-active" : ""}`}
                onClick={() => setLimbFilter("all")}
              >
                All
              </button>
              {ROADMAP_LIFE_AREA_COLUMN_ORDER.map((id) => {
                const limb = getLifeArea(id);
                if (!limb) return null;
                const active = filterLimb === id;
                const { sub, text } = limbTextColors(id, isDark);
                const stroke = getRoadmapLifeAreaColor(id, isDark);
                return (
                  <button
                    key={id}
                    type="button"
                    className="ns-filter-chip"
                    style={
                      active
                        ? {
                            background: sub,
                            color: text,
                            borderColor: stroke,
                          }
                        : undefined
                    }
                    onClick={() => setLimbFilter(id)}
                  >
                    {limb.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="ns-content">
            {showGlobalEmpty ? (
              <div className="ns-empty-card">
                <div
                  className="flex size-10 shrink-0 items-center justify-center rounded-[10px]"
                  style={{ background: "var(--ns-ink100)" }}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                    <path
                      d="M3 9h12M9 3v12"
                      stroke={ink300}
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <div>
                  <div className="text-[13px] text-[var(--ns-text3)]">Nothing here yet</div>
                  <div className="mt-1 text-[12px] text-[var(--ns-text3)] opacity-70">
                    Add a roadmap from{" "}
                    <Link href="/dashboard" className="text-[var(--ns-text2)] underline">
                      Dashboard
                    </Link>{" "}
                    to see next steps here.
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="ns-section-label">
                  Active roadmaps · {visibleGoals.filter((g) => g.statusTag !== "complete").length}
                </div>
                {visibleGoals.map((goal) => {
                  const expanded = expandedId === goal.id;
                  const { sub, text } = limbTextColors(goal.limbId, isDark);
                  const col = getRoadmapLifeAreaColor(goal.limbId, isDark);
                  const statusStyles =
                    goal.statusTag === "just started"
                      ? { bg: "rgba(185,140,80,.12)", color: "#7A5820" }
                      : { bg: sub, color: text };
                  return (
                    <div
                      key={goal.id}
                      className={`ns-branch-card${expanded ? " ns-expanded" : ""}`}
                    >
                      <div className="ns-card-main" onClick={() => toggleExpand(goal.id)} role="button" tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleExpand(goal.id);
                          }
                        }}
                      >
                        <div className="ns-card-icon" style={{ background: sub }}>
                          <CardIconLimb limbId={goal.limbId} isDark={isDark} />
                        </div>
                        <div className="ns-card-info">
                          <div className="ns-card-title">
                            {goal.title}
                            {goal.statusTag !== "complete" ? (
                              <span
                                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                                style={{
                                  background: statusStyles.bg,
                                  color: statusStyles.color,
                                }}
                              >
                                {goal.statusTag === "just started" ? "just started" : "in progress"}
                              </span>
                            ) : (
                              <span className="rounded-full bg-[var(--ns-ink100)] px-2 py-0.5 text-[11px] font-medium text-[var(--ns-text3)]">
                                complete
                              </span>
                            )}
                          </div>
                          <div className="ns-card-last">
                            {goal.lastMarkSummary ? (
                              <>
                                Last mark: <strong>{goal.lastMarkSummary.title} · </strong>
                                <span className="font-[family-name:var(--font-pf-ns-mono)] text-[11px]">
                                  {goal.lastMarkSummary.relative}
                                </span>
                              </>
                            ) : (
                              <>
                                Latest: <strong>{goal.completedSubtasks} / {goal.totalSubtasks} steps</strong>
                              </>
                            )}
                          </div>
                          <div className="ns-progress-row">
                            <div className="ns-progress-track">
                              <div
                                className="ns-progress-fill"
                                style={{ width: `${goal.progressPct}%`, background: col }}
                              />
                            </div>
                            <span className="ns-progress-label">
                              {goal.completedSubtasks} / {goal.totalSubtasks}
                            </span>
                          </div>
                        </div>
                        <div className="ns-card-right">
                          <span className="ns-limb-tag" style={{ background: sub, color: text }}>
                            {LIMB_SHORT[goal.limbId as LimbId]}
                          </span>
                          <span className={`ns-chevron${expanded ? " ns-open" : ""}`}>▾</span>
                        </div>
                      </div>
                      {expanded ? (
                        <div className="ns-step-list">
                          {goal.steps.map((step) => (
                            <div key={step.id} className="ns-step-item">
                              <button
                                type="button"
                                className={`ns-step-check${step.isCompleted ? " ns-done" : ""}`}
                                aria-label={step.isCompleted ? "Mark not done" : "Mark done"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void toggleSubtask(goal.id, step.id, step.isCompleted);
                                }}
                              />
                              <div className="min-w-0 flex-1">
                                <div className={`ns-step-text${step.isCompleted ? " ns-struck" : ""}`}>
                                  {step.title}
                                </div>
                                {step.isCompleted ? (
                                  <span className="ns-linked" style={{ background: sub, color: text }}>
                                    ● {step.milestoneTitle}
                                  </span>
                                ) : null}
                              </div>
                              {step.dueLabel ? <div className="ns-step-date">{step.dueLabel}</div> : null}
                            </div>
                          ))}
                          <button
                            type="button"
                            className="ns-add-step"
                            onClick={(e) => {
                              e.stopPropagation();
                              showToast("Open the roadmap on Dashboard to add milestones and steps", "#7B68C8");
                            }}
                          >
                            <div className="ns-add-plus">+</div>
                            Add next step
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {showEmptyForLimb ? (
                  <div className="ns-empty-card">
                    <div
                      className="flex size-10 shrink-0 items-center justify-center rounded-[10px]"
                      style={{ background: "var(--ns-ink100)" }}
                    >
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                        <circle cx="7" cy="6" r="3" stroke={ink300} strokeWidth="1.3" />
                        <circle cx="11" cy="6" r="3" stroke={ink300} strokeWidth="1.3" />
                        <path
                          d="M2 15c0-3 2.2-5 5-5M9 15c0-3 2.2-5 5-5"
                          stroke={ink300}
                          strokeWidth="1.3"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                    <div>
                      <div className="text-[13px] text-[var(--ns-text3)]">
                        No active roadmaps in {getLifeArea(filterLimb)?.label ?? filterLimb}
                      </div>
                      <div className="mt-1 text-[12px] text-[var(--ns-text3)] opacity-70">
                        Add a roadmap from Dashboard to get started.
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </main>
      </div>

      {toast ? (
        <div className="ns-toast" style={{ borderLeftColor: toast.color }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M3 8l3.5 3.5L13 4" stroke="#5B6FD4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{toast.msg}</span>
        </div>
      ) : null}

      <AddGoalModal
        open={addGoalOpen}
        onOpenChange={setAddGoalOpen}
        branches={addGoalBranches}
        defaultBranchId={null}
        onGoalCreated={({ branchLabel }) => {
          showToast(`Goal created on ${branchLabel}.`);
          router.refresh();
        }}
      />
    </div>
  );
}

function CardIconLimb({ limbId, isDark }: { limbId: LimbId; isDark: boolean }) {
  const col = getRoadmapLifeAreaColor(limbId, isDark);
  if (limbId === "work") {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
        <rect x="3" y="7" width="14" height="10" rx="2" stroke={col} strokeWidth="1.5" />
        <path
          d="M6 7V5.5A1.5 1.5 0 017.5 4h5A1.5 1.5 0 0114 5.5V7"
          stroke={col}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path d="M3 11h14" stroke={col} strokeWidth="1.2" strokeOpacity={0.4} />
      </svg>
    );
  }
  if (limbId === "health") {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path
          d="M3 13l3-4 3 3 3-6 3 4"
          stroke={col}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="16" cy="13" r="1.5" fill={col} />
      </svg>
    );
  }
  if (limbId === "finance") {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
        <rect x="3" y="6" width="14" height="10" rx="2" stroke={col} strokeWidth="1.5" />
        <path d="M3 9.5h14" stroke={col} strokeWidth="1.3" strokeOpacity={0.5} />
        <circle cx="10" cy="13" r="1.5" fill={col} />
      </svg>
    );
  }
  if (limbId === "people") {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
        <circle cx="7" cy="7" r="3" stroke={col} strokeWidth="1.3" />
        <circle cx="13" cy="7" r="3" stroke={col} strokeWidth="1.3" />
        <path
          d="M3 16c0-2.5 2-4.5 4.5-4.5M10 16c0-2.5 2-4.5 4.5-4.5"
          stroke={col}
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M4 5h12M4 8.5h8M4 12h10M4 15.5h6" stroke={col} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
