import type { FormattedMapPursuit } from "@/lib/ai/format-map-context";
import type { PursuitInsightTone } from "@/lib/insights/insight-types";
import { computePursuitSignal } from "@/lib/map/compile-reading-packet";
import {
  hasMinimumContextSignal,
  pursuitSignalFromGoal,
} from "@/lib/pursuit/pursuit-enrich-readiness";

export type PursuitToneGoalInput = {
  title: string;
  description: string | null;
  enrichAnswers: unknown;
  status: string;
  significance: number | null;
  deadline: Date | null;
  targetAmount: number | null;
  currentAmount: number | null;
  completedAt?: Date | null;
  milestones: Array<{ id?: string; title: string; completedAt: Date | null }>;
};

const LEGACY_TONE_MAP: Record<string, PursuitInsightTone> = {
  celebratory: "arrival",
  encouraging: "in_focus",
  nudge: "worth_a_look",
  informational: "context",
  reality_check: "context",
  arrival: "arrival",
  in_focus: "in_focus",
  worth_a_look: "worth_a_look",
  context: "context",
  paused: "paused",
};

function toFormattedMapPursuitSlice(goal: PursuitToneGoalInput): FormattedMapPursuit {
  const pursuit: FormattedMapPursuit = {
    id: "tone-resolve",
    title: goal.title,
    description: goal.description?.trim() ?? "",
    status: goal.status,
    significance: Math.min(5, Math.max(1, Math.round(goal.significance ?? 3))),
    milestones: goal.milestones.map((milestone, index) => {
      const row: FormattedMapPursuit["milestones"][number] = {
        id: milestone.id ?? `ms-${index}`,
        title: milestone.title,
        completed: Boolean(milestone.completedAt),
      };
      if (milestone.completedAt) {
        row.completedAt = milestone.completedAt.toISOString().slice(0, 10);
      }
      return row;
    }),
  };

  if (goal.deadline) pursuit.deadline = goal.deadline.toISOString().slice(0, 10);
  if (goal.targetAmount != null) pursuit.targetAmount = goal.targetAmount;
  if (goal.currentAmount != null) pursuit.currentAmount = goal.currentAmount;
  if (goal.completedAt) pursuit.completedAt = goal.completedAt.toISOString().slice(0, 10);

  return pursuit;
}

/** Map stale cache / model drift tones to the four-value contract. */
export function normalizeLegacyPursuitTone(raw: unknown): PursuitInsightTone {
  if (typeof raw !== "string" || !raw.trim()) return "context";
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z_]/g, "");
  if (normalized === "realitycheck") return LEGACY_TONE_MAP.reality_check;
  return LEGACY_TONE_MAP[normalized] ?? "context";
}

/**
 * Deterministic pursuit insight tone — precedence per INSIGHT-TONE-CONTRACT.md.
 * Model prose is separate; this assigns the kicker label only.
 */
export function resolvePursuitInsightTone(
  goal: PursuitToneGoalInput,
  now = Date.now(),
): PursuitInsightTone {
  if (goal.status === "COMPLETE") return "arrival";
  if (goal.status === "PAUSED") return "paused";

  const pursuit = toFormattedMapPursuitSlice(goal);
  if (computePursuitSignal(pursuit, now) === "gap") return "worth_a_look";

  const signal = pursuitSignalFromGoal(goal);
  if (!hasMinimumContextSignal(signal)) return "context";

  return "in_focus";
}
