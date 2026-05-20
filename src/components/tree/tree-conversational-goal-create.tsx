"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { PATHFINDER_GOALS_CHANGED_EVENT } from "@/config/constants";
import { formatUserInput } from "@/utils/text";
import { parseLocalDateOnly } from "@/lib/validation/create-goal";
import type { ParseGoalResponse } from "@/lib/validation/parse-goal";
import type { AddGoalHubContext } from "./tree-view-types";

type Phase = "input" | "confirm" | "adjust";

function parseTypeToGoalType(t: "milestone" | "practice"): "project" | "practice" {
  return t === "milestone" ? "project" : "practice";
}

function normalizeDeadlineForApi(targetDate: string | null, parseType: "milestone" | "practice"): string {
  if (parseType !== "milestone" || !targetDate?.trim()) return "";
  const raw = targetDate.trim();
  const ymd = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  const candidate = ymd?.[1] ?? raw;
  const parsed = parseLocalDateOnly(ymd?.[1] ?? candidate.slice(0, 10));
  if (!parsed) return "";
  const y = parsed.getFullYear();
  const mo = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

function formatTargetLine(targetDate: string | null): string | null {
  if (!targetDate?.trim()) return null;
  const raw = targetDate.trim();
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  const base = ymd
    ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
    : new Date(raw);
  if (Number.isNaN(base.getTime())) return null;
  return base.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function isoOrEmptyToDateInput(iso: string | null): string {
  if (!iso?.trim()) return "";
  const raw = iso.trim();
  const ymd = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (ymd) return ymd[1]!;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function clampSig(n: number): number {
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, Math.round(n)));
}

export type TreeConversationalGoalCreateProps = {
  context: AddGoalHubContext;
  onClose: () => void;
  onGoalCreated: (detail: { branchLabel: string; title: string }) => void;
};

export function TreeConversationalGoalCreate({
  context,
  onClose,
  onGoalCreated,
}: TreeConversationalGoalCreateProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<Phase>("input");
  const [draft, setDraft] = useState("");
  const [parsed, setParsed] = useState<ParseGoalResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [adjTitle, setAdjTitle] = useState("");
  const [adjType, setAdjType] = useState<"milestone" | "practice">("practice");
  const [adjDate, setAdjDate] = useState("");
  const [adjSig, setAdjSig] = useState(3);

  const areaDisplay =
    context.areaLabel.trim() ||
    parsed?.areaId ||
    context.areaId;

  const branchDisplay =
    context.branchLabel.trim() ||
    parsed?.branchId ||
    context.branchId;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent | PointerEvent) => {
      const el = rootRef.current;
      if (!el || busy) return;
      const t = e.target;
      if (t instanceof Node && !el.contains(t)) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [busy, onClose]);

  const runParse = useCallback(async () => {
    const text = formatUserInput(draft);
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/goals/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          branchId: context.branchId,
          areaId: context.areaId,
        }),
      });
      const raw = (await res.json().catch(() => ({}))) as { error?: string } & Partial<ParseGoalResponse>;
      if (!res.ok) {
        setError(typeof raw.error === "string" && raw.error.trim() ? raw.error.trim() : `Parse failed (${res.status}).`);
        setBusy(false);
        return;
      }
      const ok = raw as ParseGoalResponse;
      if (!ok.title || !ok.type) {
        setError("Unexpected parse response.");
        setBusy(false);
        return;
      }
      setParsed(ok);
      setAdjTitle(ok.title.trim());
      setAdjType(ok.type);
      setAdjDate(isoOrEmptyToDateInput(ok.targetDate));
      setAdjSig(clampSig(ok.significance));
      setPhase("confirm");
    } catch {
      setError("Network error while parsing.");
    } finally {
      setBusy(false);
    }
  }, [busy, context.areaId, context.branchId, draft]);

  const submitCreate = useCallback(
    async (input: {
      title: string;
      parseType: "milestone" | "practice";
      targetDate: string | null;
      significance: number;
      branchId: string;
    }) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      const goalType = parseTypeToGoalType(input.parseType);
      const deadline = normalizeDeadlineForApi(input.targetDate, input.parseType);
      try {
        const res = await fetch("/api/goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: input.title.trim(),
            description: "",
            branchId: input.branchId.trim(),
            goalType,
            deadline: goalType === "project" ? deadline : "",
            significance: clampSig(input.significance),
            hasMeasurableTarget: false,
            targetAmount: "",
            currentAmount: "",
            unit: "",
            generateRoadmap: true,
            ...(context.sequenceAnchor != null ? { anchor: context.sequenceAnchor } : {}),
          }),
        });
        const raw = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(
            typeof raw?.error === "string" && raw.error.trim()
              ? raw.error.trim()
              : `Could not create pursuit (${res.status}).`,
          );
          setBusy(false);
          return;
        }
        const branchLabel =
          typeof raw?.branchLabel === "string" && raw.branchLabel.trim()
            ? raw.branchLabel.trim()
            : branchDisplay;
        const title =
          typeof raw?.goal?.title === "string" && raw.goal.title.trim()
            ? raw.goal.title.trim()
            : input.title.trim();
        window.dispatchEvent(new CustomEvent(PATHFINDER_GOALS_CHANGED_EVENT));
        onGoalCreated({ branchLabel, title });
        onClose();
      } catch {
        setError("Network error — check your connection and try again.");
      } finally {
        setBusy(false);
      }
    },
    [branchDisplay, busy, context.sequenceAnchor, onClose, onGoalCreated],
  );

  const cardStyle: CSSProperties = {
    position: "fixed",
    left: context.anchorClient.x,
    top: context.anchorClient.y,
    transform: "translate(-50%, 10px)",
    zIndex: 210,
    width: "min(280px, calc(100vw - 24px))",
    maxWidth: 280,
    padding: "12px 14px",
    borderRadius: 10,
    background: "var(--rm-bgEl, rgba(12,11,17,0.96))",
    border: "1px solid rgba(255,255,255,0.12)",
    boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
    color: "var(--color-text-primary, #e7e5e4)",
  };

  const muted: CSSProperties = {
    fontSize: 13,
    color: "var(--color-text-tertiary, #a8a29e)",
    lineHeight: 1.45,
    marginBottom: 8,
  };

  const btnBase: CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    padding: "6px 10px",
    borderRadius: 8,
    cursor: busy ? "wait" : "pointer",
    border: "1px solid rgba(255,255,255,0.14)",
    opacity: busy ? 0.75 : 1,
  };

  if (phase === "input") {
    return (
      <div ref={rootRef} style={cardStyle} role="dialog" aria-label="Describe your pursuit">
        <div style={muted}>What&apos;s your pursuit for {branchDisplay}?</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            ref={inputRef}
            type="text"
            autoComplete="off"
            placeholder="Describe your pursuit..."
            value={draft}
            disabled={busy}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void runParse();
              }
            }}
            style={{
              flex: 1,
              minWidth: 0,
              padding: "7px 9px",
              borderRadius: 8,
              border: "1px solid var(--color-border-secondary, rgba(255,255,255,0.12))",
              background: "var(--color-background-primary, #0c0a09)",
              color: "var(--color-text-primary, #fafaf9)",
              fontSize: 16,
            }}
          />
          <button
            type="button"
            aria-label="Submit"
            disabled={busy || !draft.trim()}
            onClick={() => void runParse()}
            style={{
              ...btnBase,
              flexShrink: 0,
              background: "rgba(123,104,200,0.25)",
              color: "#e9e4ff",
            }}
          >
            {busy ? "…" : "→"}
          </button>
        </div>
        {error ? (
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--color-text-danger, #f87171)" }}>{error}</p>
        ) : null}
      </div>
    );
  }

  if (phase === "confirm" && parsed) {
    const targetLine = formatTargetLine(parsed.targetDate);
    return (
      <div ref={rootRef} style={cardStyle} role="dialog" aria-label="Confirm pursuit">
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6, lineHeight: 1.35 }}>{parsed.title}</div>
        <div style={{ ...muted, marginBottom: 10 }}>
          {areaDisplay} · {branchDisplay} · {parsed.type}
        </div>
        {targetLine ? (
          <div style={{ fontSize: 14, color: "var(--color-text-secondary, #d6d3d1)", marginBottom: 10 }}>
            Target: {targetLine}
          </div>
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void submitCreate({
                title: parsed.title,
                parseType: parsed.type,
                targetDate: parsed.targetDate,
                significance: parsed.significance,
                branchId: parsed.branchId,
              })
            }
            style={{
              ...btnBase,
              background: "rgba(52, 211, 153, 0.18)",
              color: "#a7f3d0",
            }}
          >
            Add to tree
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setPhase("adjust");
              setError(null);
            }}
            style={{
              ...btnBase,
              background: "rgba(255,255,255,0.06)",
              color: "var(--color-text-secondary, #d6d3d1)",
            }}
          >
            Adjust
          </button>
        </div>
        {error ? (
          <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--color-text-danger, #f87171)" }}>{error}</p>
        ) : null}
      </div>
    );
  }

  if (phase === "adjust" && parsed) {
    return (
      <div ref={rootRef} style={{ ...cardStyle, maxWidth: 300 }} role="dialog" aria-label="Edit pursuit details">
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Adjust pursuit</div>
        <label style={{ display: "grid", gap: 4, marginBottom: 8, fontSize: 13, color: muted.color }}>
          Title
          <input
            type="text"
            value={adjTitle}
            disabled={busy}
            onChange={(e) => setAdjTitle(e.target.value)}
            style={{
              padding: "7px 9px",
              borderRadius: 8,
              border: "1px solid var(--color-border-secondary, rgba(255,255,255,0.12))",
              background: "var(--color-background-primary, #0c0a09)",
              color: "var(--color-text-primary, #fafaf9)",
              fontSize: 16,
            }}
          />
        </label>
        <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: muted.color }}>Type</span>
          <div style={{ display: "flex", gap: 8 }}>
            {(["milestone", "practice"] as const).map((t) => (
              <label key={t} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, cursor: busy ? "wait" : "pointer" }}>
                <input
                  type="radio"
                  name="cg-type"
                  checked={adjType === t}
                  disabled={busy}
                  onChange={() => setAdjType(t)}
                />
                {t}
              </label>
            ))}
          </div>
        </div>
        <label style={{ display: "grid", gap: 4, marginBottom: 8, fontSize: 13, color: muted.color }}>
          Target date {adjType === "practice" ? "(optional)" : ""}
          <input
            type="date"
            value={adjDate}
            disabled={busy}
            onChange={(e) => setAdjDate(e.target.value)}
            style={{
              padding: "7px 9px",
              borderRadius: 8,
              border: "1px solid var(--color-border-secondary, rgba(255,255,255,0.12))",
              background: "var(--color-background-primary, #0c0a09)",
              color: "var(--color-text-primary, #fafaf9)",
              fontSize: 16,
            }}
          />
        </label>
        <label style={{ display: "grid", gap: 4, marginBottom: 12, fontSize: 13, color: muted.color }}>
          Significance (1–5)
          <input
            type="number"
            min={1}
            max={5}
            step={1}
            value={adjSig}
            disabled={busy}
            onChange={(e) => setAdjSig(clampSig(Number(e.target.value)))}
            style={{
              padding: "7px 9px",
              borderRadius: 8,
              border: "1px solid var(--color-border-secondary, rgba(255,255,255,0.12))",
              background: "var(--color-background-primary, #0c0a09)",
              color: "var(--color-text-primary, #fafaf9)",
              fontSize: 16,
            }}
          />
        </label>
        <button
          type="button"
          disabled={busy || !adjTitle.trim()}
          onClick={() =>
            void submitCreate({
              title: adjTitle,
              parseType: adjType,
              targetDate: adjDate.trim() ? adjDate.trim() : null,
              significance: adjSig,
              branchId: parsed.branchId,
            })
          }
          style={{
            ...btnBase,
            width: "100%",
            background: "rgba(123,104,200,0.28)",
            color: "#f5f3ff",
          }}
        >
          Create pursuit
        </button>
        {error ? (
          <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--color-text-danger, #f87171)" }}>{error}</p>
        ) : null}
      </div>
    );
  }

  return null;
}
