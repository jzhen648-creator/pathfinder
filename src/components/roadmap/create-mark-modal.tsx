"use client";

import type { ApiBranchRow } from "@/lib/api-branch-row";
import { LIFE_AREAS } from "@/lib/life-areas";
import type { LimbId } from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose: () => void;
  branches: ApiBranchRow[];
  defaultLifeAreaId: LimbId;
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
  onCreated,
}: Props) {
  const [selectedLifeAreaId, setSelectedLifeAreaId] = useState<LimbId>(defaultLifeAreaId);
  const [branchId, setBranchId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayInputDate);
  const [type, setType] = useState<"milestone" | "decision" | "realisation" | "setback" | "achievement">(
    "milestone",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const branchesForLifeArea = useMemo(
    () => branches.filter((b) => b.limbId === selectedLifeAreaId),
    [branches, selectedLifeAreaId],
  );

  useEffect(() => {
    if (!open) return;
    setSelectedLifeAreaId(defaultLifeAreaId);
    setTitle("");
    setDescription("");
    setDate(todayInputDate());
    setType("milestone");
    setError(null);
  }, [open, defaultLifeAreaId]);

  useEffect(() => {
    if (!open) return;
    const first = branchesForLifeArea[0]?.id ?? "";
    setBranchId((prev) => {
      if (prev && branchesForLifeArea.some((b) => b.id === prev)) return prev;
      return first;
    });
  }, [open, branchesForLifeArea]);

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
          type,
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
  }, [branchId, date, description, selectedLifeAreaId, onClose, onCreated, title, type]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const overlay = (
    <div
      className="fixed inset-0 z-[200000] flex items-center justify-center p-4"
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
            Add timeline note
          </h2>
          <button
            type="button"
            className="rounded-lg border-0 bg-transparent px-2 py-1 text-sm text-[var(--rm-text3,#6B7280)] hover:text-[var(--rm-text1,#1A1C1E)]"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="flex flex-col gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-[var(--rm-text3,#6B7280)]">Theme</span>
            <select
              className="rounded-lg border px-2 py-2"
              style={{ borderColor: "var(--rm-border)", color: "var(--rm-text1)" }}
              value={selectedLifeAreaId}
              onChange={(e) => setSelectedLifeAreaId(e.target.value as LimbId)}
            >
              {LIFE_AREAS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[var(--rm-text3,#6B7280)]">Hub</span>
            <select
              className="rounded-lg border px-2 py-2"
              style={{ borderColor: "var(--rm-border)", color: "var(--rm-text1)" }}
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              {branchesForLifeArea.length === 0 ? (
                <option value="">No hubs in this theme yet</option>
              ) : (
                branchesForLifeArea.map((b) => (
                  <option key={b.id} value={b.id}>
                    {(b.name ?? b.label ?? b.id).toString()}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[var(--rm-text3,#6B7280)]">Title</span>
            <input
              className="rounded-lg border px-2 py-2"
              style={{ borderColor: "var(--rm-border)", color: "var(--rm-text1)" }}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[var(--rm-text3,#6B7280)]">Date</span>
            <input
              type="date"
              className="rounded-lg border px-2 py-2"
              style={{ borderColor: "var(--rm-border)", color: "var(--rm-text1)" }}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[var(--rm-text3,#6B7280)]">Type</span>
            <select
              className="rounded-lg border px-2 py-2"
              style={{ borderColor: "var(--rm-border)", color: "var(--rm-text1)" }}
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
            >
              <option value="milestone">Milestone</option>
              <option value="decision">Decision</option>
              <option value="realisation">Realisation</option>
              <option value="setback">Setback</option>
              <option value="achievement">Achievement</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[var(--rm-text3,#6B7280)]">Description (optional)</span>
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
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}
