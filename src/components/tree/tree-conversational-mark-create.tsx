"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { parseLocalDateOnly } from "@/lib/validation/create-goal";
import {
  isMarkDateInTheFuture,
  MARK_DESCRIPTION_MAX,
  MARK_TITLE_MAX,
} from "@/lib/validation/marks-and-branches";
import type { ParseMarkResponse } from "@/lib/validation/parse-mark";
import type { AddMomentTreeContext } from "./tree-view-types";

type Phase = "input" | "confirm" | "adjust";

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatWhenLine(ymd: string): string | null {
  const parsed = parseLocalDateOnly(ymd);
  if (!parsed) return null;
  return parsed.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function normalizeMarkDateYmd(raw: string | null | undefined): string {
  const fallback = todayYmd();
  if (!raw?.trim()) return fallback;
  const ymd = /^(\d{4}-\d{2}-\d{2})/.exec(raw.trim());
  const candidate = ymd?.[1] ?? raw.trim().slice(0, 10);
  const d = parseLocalDateOnly(candidate);
  if (!d) return fallback;
  if (isMarkDateInTheFuture(d)) return fallback;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function isoYmdToDateInput(iso: string | null): string {
  if (!iso?.trim()) return "";
  const ymd = /^(\d{4}-\d{2}-\d{2})/.exec(iso.trim());
  return ymd?.[1] ?? "";
}

export type TreeConversationalMarkCreateProps = {
  context: AddMomentTreeContext;
  onClose: () => void;
  onMarkCreated: () => void;
};

export function TreeConversationalMarkCreate({
  context,
  onClose,
  onMarkCreated,
}: TreeConversationalMarkCreateProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<Phase>("input");
  const [draft, setDraft] = useState("");
  const [parsed, setParsed] = useState<ParseMarkResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [adjTitle, setAdjTitle] = useState("");
  const [adjDesc, setAdjDesc] = useState("");
  const [adjDate, setAdjDate] = useState("");

  const areaDisplay = context.areaLabel.trim() || context.limbId;
  const branchDisplay = context.branchLabel.trim() || context.branchId;

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
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/marks/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          branchId: context.branchId,
          limbId: context.limbId,
        }),
      });
      const raw = (await res.json().catch(() => ({}))) as { error?: string } & Partial<ParseMarkResponse>;
      if (!res.ok) {
        setError(typeof raw.error === "string" && raw.error.trim() ? raw.error.trim() : `Parse failed (${res.status}).`);
        setBusy(false);
        return;
      }
      const ok = raw as ParseMarkResponse;
      if (!ok.title) {
        setError("Unexpected parse response.");
        setBusy(false);
        return;
      }
      setParsed(ok);
      setAdjTitle(ok.title.trim().slice(0, MARK_TITLE_MAX));
      const desc = typeof ok.description === "string" ? ok.description.trim() : "";
      setAdjDesc(desc.slice(0, MARK_DESCRIPTION_MAX));
      setAdjDate(normalizeMarkDateYmd(isoYmdToDateInput(ok.date) || ok.date));
      setPhase("confirm");
    } catch {
      setError("Network error while parsing.");
    } finally {
      setBusy(false);
    }
  }, [busy, context.branchId, context.limbId, draft]);

  const submitCreate = useCallback(
    async (input: { title: string; description: string; dateYmd: string }) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      const dateYmd = normalizeMarkDateYmd(input.dateYmd);
      const title = input.title.trim().slice(0, MARK_TITLE_MAX);
      if (!title) {
        setError("Title is required.");
        setBusy(false);
        return;
      }
      const desc = input.description.trim().slice(0, MARK_DESCRIPTION_MAX);
      try {
        const res = await fetch("/api/marks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            limbId: context.limbId.trim(),
            branchId: context.branchId.trim(),
            title,
            ...(desc ? { description: desc } : {}),
            date: `${dateYmd}T12:00:00.000Z`,
            ...(context.sequenceAnchor != null ? { anchor: context.sequenceAnchor } : {}),
          }),
        });
        const raw = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setError(
            typeof raw?.error === "string" && raw.error.trim()
              ? raw.error.trim()
              : `Could not add mark (${res.status}).`,
          );
          setBusy(false);
          return;
        }
        window.dispatchEvent(new CustomEvent("bark:saved"));
        onMarkCreated();
        onClose();
      } catch {
        setError("Network error — check your connection and try again.");
      } finally {
        setBusy(false);
      }
    },
    [busy, context.branchId, context.limbId, context.sequenceAnchor, onClose, onMarkCreated],
  );

  const cardStyle: CSSProperties = {
    position: "fixed",
    left: context.anchorClient.x,
    top: context.anchorClient.y,
    transform: "translate(-50%, 10px)",
    zIndex: 210,
    width: "min(300px, calc(100vw - 24px))",
    maxWidth: 300,
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
      <div ref={rootRef} style={cardStyle} role="dialog" aria-label="Describe your mark">
        <div style={muted}>What happened on {branchDisplay}?</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            ref={inputRef}
            type="text"
            autoComplete="off"
            placeholder="In a sentence or two…"
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
    const whenLine = formatWhenLine(normalizeMarkDateYmd(isoYmdToDateInput(parsed.date) || parsed.date));
    const descOne =
      typeof parsed.description === "string" && parsed.description.trim()
        ? parsed.description.trim().slice(0, 160)
        : null;
    return (
      <div ref={rootRef} style={cardStyle} role="dialog" aria-label="Confirm mark">
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 6, lineHeight: 1.35 }}>{parsed.title}</div>
        <div style={{ ...muted, marginBottom: 8 }}>
          {areaDisplay} · {branchDisplay}
        </div>
        {whenLine ? (
          <div style={{ fontSize: 14, color: "var(--color-text-secondary, #d6d3d1)", marginBottom: 8 }}>When: {whenLine}</div>
        ) : null}
        {descOne ? (
          <div style={{ fontSize: 13, color: "var(--color-text-secondary, #a8a29e)", marginBottom: 10, lineHeight: 1.45 }}>
            {descOne}
            {typeof parsed.description === "string" && parsed.description.trim().length > 160 ? "…" : ""}
          </div>
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void submitCreate({
                title: parsed.title,
                description: typeof parsed.description === "string" ? parsed.description : "",
                dateYmd: normalizeMarkDateYmd(isoYmdToDateInput(parsed.date) || parsed.date),
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
            Tweak
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
      <div ref={rootRef} style={{ ...cardStyle, maxWidth: 320 }} role="dialog" aria-label="Edit mark">
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Tweak mark</div>
        <label style={{ display: "grid", gap: 4, marginBottom: 8, fontSize: 13, color: muted.color }}>
          Title
          <input
            type="text"
            value={adjTitle}
            disabled={busy}
            onChange={(e) => setAdjTitle(e.target.value.slice(0, MARK_TITLE_MAX))}
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
        <label style={{ display: "grid", gap: 4, marginBottom: 8, fontSize: 13, color: muted.color }}>
          Note (optional)
          <input
            type="text"
            value={adjDesc}
            disabled={busy}
            onChange={(e) => setAdjDesc(e.target.value.slice(0, MARK_DESCRIPTION_MAX))}
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
        <label style={{ display: "grid", gap: 4, marginBottom: 8, fontSize: 13, color: muted.color }}>
          Date it happened
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
        <button
          type="button"
          disabled={busy || !adjTitle.trim()}
          onClick={() =>
            void submitCreate({
              title: adjTitle,
              description: adjDesc,
              dateYmd: adjDate,
            })
          }
          style={{
            ...btnBase,
            width: "100%",
            background: "rgba(123,104,200,0.28)",
            color: "#f5f3ff",
          }}
        >
          Add mark
        </button>
        {error ? (
          <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--color-text-danger, #f87171)" }}>{error}</p>
        ) : null}
      </div>
    );
  }

  return null;
}
