"use client";

import type { ApiBranchRow } from "@/lib/api-branch-row";
import type { SequenceAnchor } from "@/lib/branch-sequence";
import { LIFE_AREAS } from "@/lib/life-areas";
import type { LimbId } from "@/lib/types";
import { PF_NATIVE_SELECT_CLASS, pfNativeSelectStyle } from "@/lib/ui/native-select-style";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose: () => void;
  branches: ApiBranchRow[];
  defaultLifeAreaId: LimbId;
  /** When opening from tree insert, pre-select this hub when it exists on the theme. */
  defaultBranchId?: string | null;
  /** Optional sequence anchor (e.g. insert between two branch-line nodes). */
  defaultAnchor?: SequenceAnchor | null;
  onCreated: () => void | Promise<void>;
};

function todayInputDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function CreateMarkModal({
  open,
  onClose,
  branches,
  defaultLifeAreaId,
  defaultBranchId = null,
  defaultAnchor = null,
  onCreated,
}: Props) {
  const insertAnchorRef = useRef<SequenceAnchor | null>(null);
  const [selectedLifeAreaId, setSelectedLifeAreaId] = useState<LimbId>(defaultLifeAreaId);
  const [branchId, setBranchId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayInputDate);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { activeBranchesForLifeArea, dormantBranchesForLifeArea } = useMemo(() => {
    const inArea = branches.filter((b) => b.limbId === selectedLifeAreaId && !b.parentBranchId);
    return {
      activeBranchesForLifeArea: inArea.filter((b) => b.isActive !== false),
      dormantBranchesForLifeArea: inArea.filter((b) => b.isActive === false),
    };
  }, [branches, selectedLifeAreaId]);

  useEffect(() => {
    if (!open) return;
    setSelectedLifeAreaId(defaultLifeAreaId);
    setTitle("");
    setDescription("");
    setDate(todayInputDate());
    setError(null);
  }, [open, defaultLifeAreaId]);

  useEffect(() => {
    if (!open) return;
    insertAnchorRef.current = defaultAnchor ?? null;
  }, [open, defaultAnchor]);

  useEffect(() => {
    if (!open) return;
    const allInArea = [...activeBranchesForLifeArea, ...dormantBranchesForLifeArea];
    const first = allInArea[0]?.id ?? "";
    const preferred =
      defaultBranchId?.trim() && allInArea.some((b) => b.id === defaultBranchId.trim())
        ? defaultBranchId.trim()
        : null;
    setBranchId((prev) => {
      if (preferred) return preferred;
      if (prev && allInArea.some((b) => b.id === prev)) return prev;
      return first;
    });
  }, [open, activeBranchesForLifeArea, dormantBranchesForLifeArea, defaultBranchId]);

  const submit = useCallback(async () => {
    if (!branchId) {
      setError("Choose a hub or add one from the tree first.");
      return;
    }
    const t = title.trim();
    if (!t) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/marks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limbId: selectedLifeAreaId,
          branchId,
          title: t,
          description: description.trim() || undefined,
          date: `${date}T12:00:00.000Z`,
          ...(insertAnchorRef.current != null ? { anchor: insertAnchorRef.current } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      await onCreated();
      onClose();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }, [branchId, date, description, selectedLifeAreaId, onClose, onCreated, title]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const mutedTextStyle = { color: "var(--rm-text3,#6B7280)" };

  const overlay = (
    <div
      className="fixed inset-0 z-200000 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border p-5 shadow-xl"
        style={{
          borderColor: "var(--rm-border, #D8D9DC)",
          background: "var(--rm-bgEl, #fff)",
          color: "var(--rm-text1, #1A1C1E)",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pf-create-mark-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id="pf-create-mark-title" className="text-lg font-medium">
            Add mark
          </h2>
          <button
            type="button"
            className="rounded-lg border-0 bg-transparent px-2 py-1 text-sm"
            style={mutedTextStyle}
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="flex flex-col gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span style={mutedTextStyle}>Theme</span>
            <select
              className={`rounded-lg ${PF_NATIVE_SELECT_CLASS}`}
              style={pfNativeSelectStyle}
              value={selectedLifeAreaId}
              onChange={(e) => {
                insertAnchorRef.current = null;
                setSelectedLifeAreaId(e.target.value as LimbId);
              }}
            >
              {LIFE_AREAS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span style={mutedTextStyle}>Hub</span>
            {/* UI: group dormant hubs under "Add a new area"; POST /api/marks activates dormant hub inline. */}
            <select
              className={`rounded-lg ${PF_NATIVE_SELECT_CLASS}`}
              style={pfNativeSelectStyle}
              value={branchId}
              onChange={(e) => {
                insertAnchorRef.current = null;
                setBranchId(e.target.value);
              }}
            >
              {activeBranchesForLifeArea.length === 0 && dormantBranchesForLifeArea.length === 0 ? (
                <option value="">No hubs in this theme yet</option>
              ) : (
                <>
                  {activeBranchesForLifeArea.map((b) => (
                    <option key={b.id} value={b.id}>
                      {(b.name ?? b.label ?? b.id).toString()}
                    </option>
                  ))}
                  {dormantBranchesForLifeArea.length > 0 ? (
                    <optgroup label="Add a new area">
                      {dormantBranchesForLifeArea.map((b) => (
                        <option key={b.id} value={b.id}>
                          {(b.name ?? b.label ?? b.id).toString()}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </>
              )}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span style={mutedTextStyle}>Title</span>
            <input
              className="rounded-lg border px-2 py-2"
              style={{ borderColor: "var(--rm-border)", color: "var(--rm-text1)" }}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span style={mutedTextStyle}>Date</span>
            <input
              type="date"
              className="rounded-lg border px-2 py-2"
              style={{ borderColor: "var(--rm-border)", color: "var(--rm-text1)" }}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span style={mutedTextStyle}>Description (optional)</span>
            <textarea
              className="min-h-[80px] rounded-lg border px-2 py-2"
              style={{ borderColor: "var(--rm-border)", color: "var(--rm-text1)" }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
            />
          </label>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--rm-border)" }}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-lg border-0 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: "var(--rm-ink900, #1A1C1E)" }}
              disabled={saving || !branchId}
              onClick={() => void submit()}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}
