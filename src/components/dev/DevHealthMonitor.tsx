"use client";

import { useEffect, useRef } from "react";

type HealthStatus = "healthy" | "warning" | "problem";
type InteractionState = "idle" | "hovering" | "dragging";

type MemorySample = {
  usedMB: number;
  totalMB: number;
};

type PerformanceWithMemory = Performance & {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
};

declare global {
  interface Window {
    __DEV_HEALTH_LAST_RENDER_CAUSE__?: string;
    __DEV_HEALTH_METRICS__?: {
      rps: number;
      fps: number;
      memoryMB: number | null;
      interaction: InteractionState;
    };
  }
}

function dotColor(status: HealthStatus): string {
  if (status === "problem") return "#EF4444";
  if (status === "warning") return "#F59E0B";
  return "#22C55E";
}

function getRpsStatus(rps: number, interactionState: InteractionState): HealthStatus {
  const redThreshold = interactionState === "idle" ? 5 : 20;
  const amberThreshold = interactionState === "idle" ? 3 : 12;
  if (rps > redThreshold) return "problem";
  if (rps > amberThreshold) return "warning";
  return "healthy";
}

function getFpsStatus(fps: number): HealthStatus {
  if (fps < 50) return "problem";
  if (fps < 55) return "warning";
  return "healthy";
}

function getMemoryStatus(
  current: MemorySample | null,
  recentUsed: number[],
): { status: HealthStatus; growing: boolean } {
  if (!current) return { status: "healthy", growing: false };
  if (recentUsed.length < 6) return { status: "healthy", growing: false };

  const isMonotonic = recentUsed.every((v, i) => i === 0 || v >= recentUsed[i - 1]);
  const growth = recentUsed[recentUsed.length - 1] - recentUsed[0];

  // Treat sustained monotonic growth above ~12MB over recent window as red.
  if (isMonotonic && growth > 12) return { status: "problem", growing: true };
  if (growth > 6) return { status: "warning", growing: true };
  return { status: "healthy", growing: false };
}

function logProblemMetric(name: string, value: string, lastWarningRef: { current: string }) {
  const signature = `${name}:${value}`;
  if (lastWarningRef.current === signature) return;
  lastWarningRef.current = signature;
  console.warn(`[DevHealthMonitor] ${name} problem: ${value}`);
}

export function DevHealthMonitor() {
  const isDev = process.env.NODE_ENV === "development";
  if (!isDev) return null;

  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  const interactionStateRef = useRef<InteractionState>("idle");
  const memoryRecentRef = useRef<number[]>([]);
  const memorySampleRef = useRef<MemorySample | null>(null);
  const isPointerDownRef = useRef(false);
  const lastPointerMoveTsRef = useRef(0);
  const lastRendersRef = useRef(0);
  const fpsFrameCountRef = useRef(0);
  const fpsSecondStartRef = useRef<number | null>(null);
  const warnedSignatureRef = useRef("");
  const rpsValueRef = useRef<HTMLSpanElement | null>(null);
  const fpsValueRef = useRef<HTMLSpanElement | null>(null);
  const interactionValueRef = useRef<HTMLSpanElement | null>(null);
  const causeValueRef = useRef<HTMLSpanElement | null>(null);
  const memoryValueRef = useRef<HTMLSpanElement | null>(null);
  const memoryDetailRef = useRef<HTMLSpanElement | null>(null);
  const rpsDotRef = useRef<HTMLSpanElement | null>(null);
  const fpsDotRef = useRef<HTMLSpanElement | null>(null);
  const interactionDotRef = useRef<HTMLSpanElement | null>(null);
  const causeDotRef = useRef<HTMLSpanElement | null>(null);
  const memoryDotRef = useRef<HTMLSpanElement | null>(null);

  const setMetricVisual = (dotEl: HTMLSpanElement | null, status: HealthStatus) => {
    if (!dotEl) return;
    const color = dotColor(status);
    dotEl.style.background = color;
    dotEl.style.boxShadow = `0 0 8px ${color}99`;
  };

  const writeInteraction = (next: InteractionState) => {
    if (interactionStateRef.current === next) return;
    interactionStateRef.current = next;
    if (interactionValueRef.current) interactionValueRef.current.textContent = next;
  };

  useEffect(() => {
    const onPointerDown = () => {
      isPointerDownRef.current = true;
      writeInteraction("dragging");
    };
    const onPointerUp = () => {
      isPointerDownRef.current = false;
      writeInteraction("hovering");
    };
    const onPointerMove = () => {
      lastPointerMoveTsRef.current = performance.now();
      writeInteraction(isPointerDownRef.current ? "dragging" : "hovering");
    };
    const onPointerLeave = () => {
      if (!isPointerDownRef.current) writeInteraction("idle");
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("blur", onPointerLeave);

    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("blur", onPointerLeave);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = performance.now();
      if (!isPointerDownRef.current && now - lastPointerMoveTsRef.current > 400) {
        writeInteraction("idle");
      }

      const current = renderCountRef.current;
      const nextRps = Math.max(0, current - lastRendersRef.current);
      lastRendersRef.current = current;
      if (rpsValueRef.current) rpsValueRef.current.textContent = `${nextRps}/s`;
      const lastCause = window.__DEV_HEALTH_LAST_RENDER_CAUSE__ ?? "unknown";
      if (causeValueRef.current) causeValueRef.current.textContent = lastCause;
      setMetricVisual(causeDotRef.current, lastCause === "unknown" ? "warning" : "healthy");

      const perf = performance as PerformanceWithMemory;
      let memoryStatus: HealthStatus = "warning";
      let memoryMB: number | null = null;
      if (perf.memory) {
        const usedMB = perf.memory.usedJSHeapSize / (1024 * 1024);
        const totalMB = perf.memory.totalJSHeapSize / (1024 * 1024);
        memoryMB = usedMB;
        memorySampleRef.current = { usedMB, totalMB };
        const recent = memoryRecentRef.current;
        recent.push(usedMB);
        if (recent.length > 12) recent.splice(0, recent.length - 12);
        const memoryEval = getMemoryStatus(memorySampleRef.current, recent);
        memoryStatus = memoryEval.status;
        if (memoryValueRef.current) {
          memoryValueRef.current.textContent = `${usedMB.toFixed(1)} / ${totalMB.toFixed(1)} MB`;
        }
        if (memoryDetailRef.current) {
          memoryDetailRef.current.textContent = memoryEval.growing ? " (growing)" : "";
        }
        if (memoryEval.status === "problem") {
          logProblemMetric(
            "Memory",
            `${usedMB.toFixed(1)}MB used (continuous growth)`,
            warnedSignatureRef,
          );
        }
      } else {
        if (memoryValueRef.current) memoryValueRef.current.textContent = "n/a";
        if (memoryDetailRef.current) memoryDetailRef.current.textContent = "";
      }

      const currentInteraction = interactionStateRef.current;
      window.__DEV_HEALTH_METRICS__ = {
        rps: nextRps,
        fps: window.__DEV_HEALTH_METRICS__?.fps ?? 0,
        memoryMB,
        interaction: currentInteraction,
      };
      const rpsStatus = getRpsStatus(nextRps, currentInteraction);
      setMetricVisual(rpsDotRef.current, rpsStatus);
      setMetricVisual(interactionDotRef.current, "healthy");
      setMetricVisual(memoryDotRef.current, memoryStatus);
      if (rpsStatus === "problem") {
        logProblemMetric("RPS", `${nextRps} (${currentInteraction})`, warnedSignatureRef);
      }
    }, 1000);

    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let rafId = 0;
    const tick = (ts: number) => {
      if (fpsSecondStartRef.current === null) {
        fpsSecondStartRef.current = ts;
      }
      fpsFrameCountRef.current += 1;
      const elapsed = ts - (fpsSecondStartRef.current ?? ts);
      if (elapsed >= 1000) {
        const nextFps = Math.round((fpsFrameCountRef.current * 1000) / elapsed);
        fpsFrameCountRef.current = 0;
        fpsSecondStartRef.current = ts;
        if (fpsValueRef.current) fpsValueRef.current.textContent = String(nextFps);
        const fpsStatus = getFpsStatus(nextFps);
        window.__DEV_HEALTH_METRICS__ = {
          rps: window.__DEV_HEALTH_METRICS__?.rps ?? 0,
          fps: nextFps,
          memoryMB: window.__DEV_HEALTH_METRICS__?.memoryMB ?? null,
          interaction: interactionStateRef.current,
        };
        setMetricVisual(fpsDotRef.current, fpsStatus);
        if (fpsStatus === "problem") {
          logProblemMetric("FPS", String(nextFps), warnedSignatureRef);
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <aside
      style={{
        position: "fixed",
        right: 14,
        bottom: 14,
        zIndex: 9999,
        minWidth: 250,
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid rgba(148,163,184,0.35)",
        background: "rgba(2,8,16,0.9)",
        color: "#E2E8F0",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
        lineHeight: 1.4,
      }}
    >
      <div style={{ color: "#93C5FD", marginBottom: 8, letterSpacing: 0.6 }}>DEV HEALTH</div>

      <div style={{ display: "grid", gap: 5 }}>
        <MetricRow label="RPS" dotRef={rpsDotRef} valueRef={rpsValueRef} defaultValue="0/s" />
        <MetricRow label="FPS" dotRef={fpsDotRef} valueRef={fpsValueRef} defaultValue="0" />
        <MetricRow
          label="Interaction"
          dotRef={interactionDotRef}
          valueRef={interactionValueRef}
          defaultValue="idle"
        />
        <MetricRow
          label="Last Cause"
          dotRef={causeDotRef}
          valueRef={causeValueRef}
          defaultValue="unknown"
        />
        <MetricRow
          label="Memory"
          dotRef={memoryDotRef}
          valueRef={memoryValueRef}
          defaultValue="n/a"
          detailRef={memoryDetailRef}
        />
      </div>
    </aside>
  );
}

function MetricRow({
  label,
  dotRef,
  valueRef,
  defaultValue,
  detailRef,
}: {
  label: string;
  dotRef: React.MutableRefObject<HTMLSpanElement | null>;
  valueRef: React.MutableRefObject<HTMLSpanElement | null>;
  defaultValue: string;
  detailRef?: React.MutableRefObject<HTMLSpanElement | null>;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "14px 78px 1fr", alignItems: "center", gap: 6 }}>
      <span
        ref={dotRef}
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: dotColor("healthy"),
          boxShadow: `0 0 8px ${dotColor("healthy")}99`,
          display: "inline-block",
        }}
      />
      <span style={{ color: "#94A3B8" }}>{label}</span>
      <span style={{ color: "#E2E8F0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <span ref={valueRef}>{defaultValue}</span>
        {detailRef ? <span ref={detailRef} style={{ color: "#94A3B8" }} /> : null}
      </span>
    </div>
  );
}

// Optional helper for pages/components that want accurate "last render cause".
// Call this immediately before a setState invocation.
export function markDevRenderCause(cause: string) {
  if (process.env.NODE_ENV !== "development") return;
  window.__DEV_HEALTH_LAST_RENDER_CAUSE__ = cause;
}

