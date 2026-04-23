"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { type LifeWheelAreaSummary, allAreasBalanced } from "@/lib/life-wheel";
import { CreateGoalModal } from "@/components/dashboard/create-goal-modal";

export function LifeWheelLauncher({
  initialAreas,
}: {
  initialAreas: LifeWheelAreaSummary[];
}) {
  const [open, setOpen] = useState(false);
  const [areas, setAreas] = useState<LifeWheelAreaSummary[]>(initialAreas);
  const [selectedAreaKey, setSelectedAreaKey] = useState(initialAreas[0]?.key ?? "careerPurpose");
  const displayScoresRef = useRef(
    Object.fromEntries(initialAreas.map((a) => [a.key, 0])) as Record<string, number>,
  );
  const [scoresVersion, setScoresVersion] = useState(0);
  const [autoOpenGoalToken, setAutoOpenGoalToken] = useState(0);

  useEffect(() => {
    const interval = setInterval(async () => {
      const response = await fetch("/api/life-wheel/summary");
      const data = (await response.json()) as { areas?: LifeWheelAreaSummary[] };
      if (response.ok && data.areas) {
        setAreas(data.areas);
      }
    }, 12000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const start = performance.now();
    const duration = 900;
    let frame = 0;
    const scores = displayScoresRef.current;
    areas.forEach((area) => {
      if (scores[area.key] === undefined) scores[area.key] = 0;
    });
    const animate = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      areas.forEach((area) => {
        scores[area.key] = Number((area.score * eased).toFixed(1));
      });
      setScoresVersion((v) => v + 1);
      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      }
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [areas]);

  const selectedArea = useMemo(
    () => areas.find((a) => a.key === selectedAreaKey) ?? areas[0],
    [areas, selectedAreaKey],
  );

  const achievement = allAreasBalanced(areas);

  const size = 260;
  const center = size / 2;
  const maxRadius = 98;

  const segmentPath = (start: number, end: number, radius: number) => {
    const sx = center + Math.cos(start) * radius;
    const sy = center + Math.sin(start) * radius;
    const ex = center + Math.cos(end) * radius;
    const ey = center + Math.sin(end) * radius;
    return `M ${center} ${center} L ${sx} ${sy} A ${radius} ${radius} 0 0 1 ${ex} ${ey} Z`;
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-white/10 bg-[#151522] px-3 py-2 text-xs text-zinc-200 transition hover:border-indigo-300/50"
      >
        ◔ Life Wheel
      </button>
      {achievement ? (
        <span className="rounded-md border border-amber-300/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
          Balanced Life unlocked
        </span>
      ) : null}
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-5xl rounded-2xl border border-white/10 bg-[#0e0e18] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Life Wheel</h3>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
              >
                Close
              </button>
            </div>
            <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
              <div className="rounded-xl border border-white/10 bg-[#101018] p-3">
                <svg width={size} height={size} className="mx-auto">
                  {areas.map((area, index) => {
                    const start = (index / areas.length) * Math.PI * 2 - Math.PI / 2;
                    const end = ((index + 1) / areas.length) * Math.PI * 2 - Math.PI / 2;
                    const fillRadius = ((displayScoresRef.current[area.key] ?? 0) / 10) * maxRadius;
                    return (
                      <g
                        key={area.key}
                        onClick={() => {
                          setSelectedAreaKey(area.key);
                          if (area.score === 0) {
                            setAutoOpenGoalToken((prev) => prev + 1);
                          }
                        }}
                        className="cursor-pointer"
                      >
                        <path d={segmentPath(start, end, maxRadius)} fill="rgba(255,255,255,0.02)" />
                        <path
                          d={segmentPath(start, end, fillRadius)}
                          fill={`${area.color}66`}
                          className={area.score === 0 ? "animate-pulse" : ""}
                          style={{ filter: `drop-shadow(0 0 10px ${area.color}aa)` }}
                        />
                        <text
                          x={center + Math.cos((start + end) / 2) * (maxRadius + 18)}
                          y={center + Math.sin((start + end) / 2) * (maxRadius + 18)}
                          fill="#cbd5e1"
                          fontSize="10"
                          textAnchor="middle"
                        >
                          {Math.round(displayScoresRef.current[area.key] ?? 0)}
                        </text>
                      </g>
                    );
                  })}
                </svg>
                <p className="mt-2 text-center text-xs text-zinc-400">Auto-calculated from goal and task completion.</p>
              </div>

              {selectedArea ? (
                <div className="rounded-xl border border-white/10 bg-[#101018] p-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">{selectedArea.label}</p>
                  <p className="mt-1 text-3xl font-semibold text-white">{selectedArea.score.toFixed(1)} / 10</p>
                  <div className="mt-4 space-y-2">
                    {selectedArea.goals.length > 0 ? (
                      selectedArea.goals.map((goal) => (
                        <div key={goal.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-zinc-200">{goal.title}</span>
                            <Link className="text-indigo-300" href={`/roadmap/${goal.id}`}>Open</Link>
                          </div>
                          <div className="mt-2 h-1.5 rounded-full bg-black/40">
                            <div
                              className="shimmer-fill h-1.5 rounded-full"
                              style={{ width: `${goal.progress}%`, backgroundColor: selectedArea.color }}
                            />
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-lg border border-amber-300/20 bg-amber-500/10 p-3 text-sm text-amber-100">
                        No goals yet in this area. Start one now to begin filling this segment.
                      </p>
                    )}
                  </div>
                  <div className="mt-4">
                    <CreateGoalModal
                      key={`${selectedArea.key}-${autoOpenGoalToken}`}
                      triggerLabel={selectedArea.goals.length === 0 ? `Start ${selectedArea.label} Goal` : `Add Goal in ${selectedArea.label}`}
                      defaultLifeArea={selectedArea.label}
                      quickStart={selectedArea.goals.length === 0}
                      autoOpenToken={autoOpenGoalToken}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      <span style={{ display: "none" }}>{scoresVersion}</span>
    </>
  );
}
