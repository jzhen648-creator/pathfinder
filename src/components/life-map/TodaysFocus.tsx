"use client";

import { memo, useEffect, useMemo, useState } from "react";

type BranchLike = { id: string; label?: string };
type MomentLike = { title?: string; progress?: number };

type TodaysFocusProps = {
  moments: MomentLike[];
  branches: BranchLike[];
  hidden?: boolean;
  completedCount?: number;
};

export const TodaysFocus = memo(function TodaysFocus({
  moments,
  branches,
  hidden = false,
  completedCount,
}: TodaysFocusProps) {
  const [focusIndex, setFocusIndex] = useState(0);
  const branchCount = branches.length;
  const activeGoal = useMemo(
    () => moments.find((g) => (g.progress ?? 0) > 0 && (g.progress ?? 0) < 100) ?? null,
    [moments],
  );
  const rotatingBranch = branchCount > 0 ? branches[focusIndex % branchCount] : null;

  useEffect(() => {
    if (activeGoal || branchCount === 0) return;
    const timer = window.setInterval(() => {
      setFocusIndex((i) => (i + 1) % branchCount);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [activeGoal, branchCount]);

  if (hidden) return null;
  const label = rotatingBranch?.label ?? "";
  const text = activeGoal?.title
    ? activeGoal.title
    : label
      ? `Start your ${label} story \u2192`
      : "Add your first moment \u2192";
  const done = completedCount ?? moments.filter((m) => (m.progress ?? 0) === 100).length;
  const total = moments.length;

  return (
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
        <div style={{ color: "white", fontSize: 11 }}>{text}</div>
      </div>
      <div style={{ width: 1, height: 24, background: "#0F172A" }} />
      <div style={{ color: "#374151", fontSize: 10, letterSpacing: 1 }}>{done}/{total} complete</div>
    </div>
  );
});
