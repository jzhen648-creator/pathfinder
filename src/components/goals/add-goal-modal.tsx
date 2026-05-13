"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { LIFE_AREA_CONFIG, LIFE_AREA_ORDER } from "@/components/tree/tree-data";
import { PATHFINDER_GOALS_CHANGED_EVENT } from "@/config/constants";
import type { CreateGoalGoalType } from "@/lib/validation/create-goal";
import {
  GOAL_TYPE_VALUES,
  createGoalPayloadSchema,
  type CreateGoalPayloadInput,
} from "@/lib/validation/create-goal";

export type AddGoalBranchOption = {
  id: string;
  lifeAreaId: string;
  /** Human-readable label for this hub */
  label: string;
};

const GOAL_LABELS: Record<CreateGoalGoalType, string> = {
  project: "Project (has an end date)",
  practice: "Practice (ongoing commitment)",
  identity: "Identity (who I'm becoming)",
};

const LIFE_AREA_ORDER_LIST = [...LIFE_AREA_ORDER];

function lifeAreaGroupLabel(lifeAreaId: string): string {
  return LIFE_AREA_CONFIG[lifeAreaId]?.label ?? lifeAreaId;
}

type FormValues = CreateGoalPayloadInput;

const defaultValues: FormValues = {
  title: "",
  description: "",
  branchId: "",
  goalType: "practice",
  deadline: "",
  significance: 3,
  hasMeasurableTarget: false,
  targetAmount: "",
  currentAmount: "",
  unit: "",
};

export type AddGoalModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: AddGoalBranchOption[];
  /** When set (e.g. branch pick), selects this DB branch until the user changes it. */
  defaultBranchId?: string | null;
  onGoalCreated?: (detail: { branchLabel: string; title: string }) => void;
  /**
   * Development: same as GET /api/branches?userId= — create the goal for that user’s branch row
   * (tree mock-user picker). Ignored in production.
   */
  devGoalsUserId?: string | null;
};

export function AddGoalModal({
  open,
  onOpenChange,
  branches,
  defaultBranchId = null,
  onGoalCreated,
  devGoalsUserId = null,
}: AddGoalModalProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const grouped = useMemo(() => {
    const byLifeArea = new Map<string, AddGoalBranchOption[]>();
    for (const lifeAreaId of LIFE_AREA_ORDER_LIST) {
      byLifeArea.set(lifeAreaId, []);
    }
    for (const b of branches) {
      const list = byLifeArea.get(b.lifeAreaId) ?? [];
      list.push(b);
      byLifeArea.set(b.lifeAreaId, list);
    }
    return byLifeArea;
  }, [branches]);

  const form = useForm<FormValues>({
    resolver: zodResolver(createGoalPayloadSchema),
    defaultValues,
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const goalType = useWatch({ control: form.control, name: "goalType", defaultValue: "practice" });
  const hasMeasurableTarget = useWatch({
    control: form.control,
    name: "hasMeasurableTarget",
    defaultValue: false,
  });
  const descriptionDraft = useWatch({ control: form.control, name: "description", defaultValue: "" });
  const significanceRaw = useWatch({ control: form.control, name: "significance", defaultValue: 3 });
  const significance =
    typeof significanceRaw === "number" && Number.isFinite(significanceRaw) ? significanceRaw : 3;

  useEffect(() => {
    if (!open) return;
    setServerError(null);
    form.reset({
      ...defaultValues,
      branchId: defaultBranchId?.trim() ?? "",
    });
  }, [open, defaultBranchId, form]);

  const submit = form.handleSubmit(
    async (values) => {
      setSubmitting(true);
      setServerError(null);
      const deadlineTrim = values.goalType === "project" ? values.deadline.trim() : "";
      try {
        const devQ =
          process.env.NODE_ENV === "development" && devGoalsUserId?.trim()
            ? `?userId=${encodeURIComponent(devGoalsUserId.trim())}`
            : "";
        const res = await fetch(`/api/goals${devQ}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: values.title.trim(),
            description: values.description,
            branchId: values.branchId.trim(),
            goalType: values.goalType,
            deadline: deadlineTrim,
            significance: values.significance,
            hasMeasurableTarget: values.hasMeasurableTarget,
            targetAmount: values.targetAmount,
            currentAmount: values.currentAmount,
            unit: values.unit,
          }),
        });
        const raw = await res.json().catch(() => ({}));
        if (!res.ok) {
          setServerError(
            typeof raw?.error === "string" && raw.error.trim()
              ? raw.error.trim()
              : `Could not create goal (${res.status}).`,
          );
          setSubmitting(false);
          return;
        }
        const branchLabel =
          typeof raw?.branchLabel === "string" && raw.branchLabel.trim()
            ? raw.branchLabel.trim()
            : typeof raw?.branch?.name === "string"
              ? raw.branch.name
              : "your hub";

        window.dispatchEvent(new CustomEvent(PATHFINDER_GOALS_CHANGED_EVENT));

        form.reset(defaultValues);
        onOpenChange(false);
        const title = typeof raw?.goal?.title === "string" ? raw.goal.title : values.title.trim();
        onGoalCreated?.({ branchLabel, title });
      } catch {
        setServerError("Network error — check your connection and try again.");
      } finally {
        setSubmitting(false);
      }
    },
    (_errors) => {
      /* inline field errors from RHF */
    },
  );

  const dismiss = useCallback(() => {
    if (submitting) return;
    onOpenChange(false);
    form.reset(defaultValues);
    setServerError(null);
  }, [form, submitting, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65 px-4 backdrop-blur-[1px]"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#141414] p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-goal-title"
        data-testid="add-goal-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="add-goal-title" className="text-xl font-semibold text-white">
              Add goal
            </h2>
            <p className="mt-1 text-sm text-zinc-400">Place it on a hub and tune the basics.</p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            disabled={submitting}
            className="rounded-md px-2 py-1 text-lg leading-none text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200 disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <form data-testid="add-goal-form" className="space-y-4" onSubmit={(e) => void submit(e)}>
          {serverError ? (
            <p
              role="alert"
              className="rounded-lg border border-rose-400/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-100"
            >
              {serverError}
            </p>
          ) : null}

          <div>
            <label htmlFor="add-goal-title-input" className="mb-1 block text-xs text-zinc-500">
              Title <span className="text-rose-300">*</span>
            </label>
            <input
              id="add-goal-title-input"
              data-testid="add-goal-title"
              maxLength={100}
              className="w-full rounded-lg border border-white/10 bg-[#151515] px-3 py-2 text-sm text-zinc-100 outline-none ring-indigo-500/40 placeholder:text-zinc-600 focus:ring"
              placeholder="Short, specific title"
              disabled={submitting}
              {...form.register("title")}
            />
            {form.formState.errors.title ? (
              <p className="mt-1 text-xs text-rose-300">{form.formState.errors.title.message}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="add-goal-desc" className="mb-1 block text-xs text-zinc-500">
              Description
            </label>
            <textarea
              id="add-goal-desc"
              data-testid="add-goal-description"
              maxLength={500}
              rows={3}
              className="w-full rounded-lg border border-white/10 bg-[#151515] px-3 py-2 text-sm text-zinc-100 outline-none ring-indigo-500/40 placeholder:text-zinc-600 focus:ring"
              placeholder="Optional context"
              disabled={submitting}
              {...form.register("description")}
            />
            <div className="mt-1 flex justify-end text-[10px] text-zinc-600">
              {(descriptionDraft ?? "").length}/500
            </div>
            {form.formState.errors.description ? (
              <p className="mt-1 text-xs text-rose-300">{form.formState.errors.description.message}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="add-goal-branch" className="mb-1 block text-xs text-zinc-500">
              Hub <span className="text-rose-300">*</span>
            </label>
            <select
              id="add-goal-branch"
              data-testid="add-goal-branch"
              className="w-full rounded-lg border border-white/10 bg-[#151515] px-3 py-2 text-sm text-zinc-100 outline-none ring-indigo-500/40 focus:ring disabled:opacity-60"
              disabled={submitting}
              {...form.register("branchId")}
            >
              <option value="">Choose a hub</option>
              {LIFE_AREA_ORDER_LIST.map((lifeAreaId) => {
                const opts = grouped.get(lifeAreaId) ?? [];
                if (!opts.length) return null;
                return (
                  <optgroup key={lifeAreaId} label={lifeAreaGroupLabel(lifeAreaId)}>
                    {[...opts]
                      .sort((a, b) => a.label.localeCompare(b.label))
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.label}
                        </option>
                      ))}
                  </optgroup>
                );
              })}
            </select>
            {form.formState.errors.branchId ? (
              <p className="mt-1 text-xs text-rose-300">{form.formState.errors.branchId.message}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="add-goal-type" className="mb-1 block text-xs text-zinc-500">
              Goal type <span className="text-rose-300">*</span>
            </label>
            <select
              id="add-goal-type"
              data-testid="add-goal-type"
              className="w-full rounded-lg border border-white/10 bg-[#151515] px-3 py-2 text-sm text-zinc-100 outline-none ring-indigo-500/40 focus:ring disabled:opacity-60"
              disabled={submitting}
              {...form.register("goalType", {
                validate: (v) =>
                  GOAL_TYPE_VALUES.includes(v as CreateGoalGoalType) || "Choose a goal type",
              })}
            >
              {(GOAL_TYPE_VALUES as readonly CreateGoalGoalType[]).map((v) => (
                <option key={v} value={v}>
                  {GOAL_LABELS[v]}
                </option>
              ))}
            </select>
            {form.formState.errors.goalType ? (
              <p className="mt-1 text-xs text-rose-300">{form.formState.errors.goalType.message}</p>
            ) : null}
          </div>

          {goalType === "project" ? (
            <div>
              <label htmlFor="add-goal-deadline" className="mb-1 block text-xs text-zinc-500">
                Deadline <span className="text-zinc-600">(optional)</span>
              </label>
              <input
                id="add-goal-deadline"
                data-testid="add-goal-deadline"
                type="date"
                className="w-full rounded-lg border border-white/10 bg-[#151515] px-3 py-2 text-sm text-zinc-100 outline-none ring-indigo-500/40 focus:ring disabled:opacity-60"
                disabled={submitting}
                {...form.register("deadline")}
              />
              {form.formState.errors.deadline ? (
                <p className="mt-1 text-xs text-rose-300">{form.formState.errors.deadline.message}</p>
              ) : null}
            </div>
          ) : null}

          <div>
            <div className="mb-2 flex justify-between gap-3 text-xs">
              <span className="text-zinc-500">Significance</span>
              <span className="tabular-nums text-zinc-300">{significance} / 5</span>
            </div>
            <Controller
              name="significance"
              control={form.control}
              render={({ field }) => (
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  className="w-full accent-indigo-500 disabled:opacity-60"
                  disabled={submitting}
                  value={typeof field.value === "number" ? field.value : Number(field.value)}
                  onChange={(ev) => field.onChange(Number(ev.target.value))}
                />
              )}
            />
            {form.formState.errors.significance ? (
              <p className="mt-1 text-xs text-rose-300">{form.formState.errors.significance.message}</p>
            ) : null}
          </div>

          <label className="flex cursor-pointer select-none items-center gap-3 text-sm text-zinc-200">
            <input
              type="checkbox"
              className="size-4 rounded border-white/20 bg-[#151515] text-indigo-500 focus:ring-indigo-400/60 disabled:opacity-60"
              disabled={submitting}
              {...form.register("hasMeasurableTarget")}
            />
            Has measurable target
          </label>

          {hasMeasurableTarget ? (
            <div className="grid gap-3 rounded-lg border border-white/10 bg-black/25 p-3 sm:grid-cols-2">
              <div className="sm:col-span-1">
                <label className="mb-1 block text-xs text-zinc-500">Target amount</label>
                <input
                  inputMode="decimal"
                  type="text"
                  data-testid="add-goal-target"
                  placeholder="e.g. 10"
                  className="w-full rounded-lg border border-white/10 bg-[#151515] px-3 py-2 text-sm text-zinc-100 outline-none ring-indigo-500/40 focus:ring disabled:opacity-60"
                  disabled={submitting}
                  {...form.register("targetAmount")}
                />
                {form.formState.errors.targetAmount ? (
                  <p className="mt-1 text-xs text-rose-300">{form.formState.errors.targetAmount.message}</p>
                ) : null}
              </div>
              <div className="sm:col-span-1">
                <label className="mb-1 block text-xs text-zinc-500">Current amount</label>
                <input
                  inputMode="decimal"
                  type="text"
                  placeholder="Optional"
                  className="w-full rounded-lg border border-white/10 bg-[#151515] px-3 py-2 text-sm text-zinc-100 outline-none ring-indigo-500/40 focus:ring disabled:opacity-60"
                  disabled={submitting}
                  {...form.register("currentAmount")}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs text-zinc-500">Unit</label>
                <input
                  type="text"
                  data-testid="add-goal-unit"
                  placeholder="e.g. hours, reps, kg"
                  className="w-full rounded-lg border border-white/10 bg-[#151515] px-3 py-2 text-sm text-zinc-100 outline-none ring-indigo-500/40 focus:ring disabled:opacity-60"
                  disabled={submitting}
                  {...form.register("unit")}
                />
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3 pt-3">
            <button
              type="button"
              onClick={() => form.reset()}
              disabled={submitting}
              className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 transition hover:border-white/20 disabled:opacity-50"
            >
              Reset
            </button>
            <button
              type="submit"
              disabled={submitting || branches.length === 0}
              data-testid="add-goal-submit"
              className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create goal"}
            </button>
          </div>
          {branches.length === 0 ? (
            <p className="text-center text-xs text-amber-200/90">Add at least one hub before creating goals.</p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
