import { z } from "zod";
import { GOAL_TYPE_VALUES } from "@/lib/validation/create-goal";

export const STREAM_BLOOM_VALUES = ["ACTIVE", "ON_HOLD", "COMPLETE"] as const;
export type StreamBloomStatus = (typeof STREAM_BLOOM_VALUES)[number];

export const STREAM_AMBIGUOUS_RESOLUTION_VALUES = ["done", "in_progress", "not_started"] as const;
export type StreamAmbiguousResolution = (typeof STREAM_AMBIGUOUS_RESOLUTION_VALUES)[number];

/**
 * Stable hub identifier for Stream routing — normalized slug from {@link normalizeHubLabelKey}
 * (e.g. "career", "skills", "safety net"). Never use display labels as ids.
 */
export const streamHubSlugSchema = z.string().min(1).max(64);

const pursuitRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("existing"), goalId: z.string().min(1) }),
  z.object({ kind: z.literal("new"), clientKey: z.string().min(1) }),
]);

export const extractedMarkSchema = z.object({
  title: z.string().min(1).max(100),
  date: z.union([z.string(), z.null()]),
  /** Theme routing — required for theme-level extract/commit; optional during hub-scoped migration. */
  hubId: streamHubSlugSchema.optional(),
});

export const extractedPursuitSchema = z.object({
  title: z.string().min(1).max(100),
  goalType: z.enum(GOAL_TYPE_VALUES),
  bloomStatus: z.enum(STREAM_BLOOM_VALUES),
  existingGoalId: z.string().min(1).nullable().optional(),
  clientKey: z.string().min(1).optional(),
  /** Parent pursuit on this hub (existing) or created this session (new clientKey). */
  parentRef: pursuitRefSchema.optional(),
  hubId: streamHubSlugSchema.optional(),
});

export const extractedMilestoneSchema = z.object({
  title: z.string().min(1).max(100),
  pursuitRef: pursuitRefSchema,
  hubId: streamHubSlugSchema.optional(),
});

export const ambiguousItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(120),
  reason: z.union([z.string(), z.null()]).optional(),
  /** Model's routing/status confidence for unresolved placement; below 0.65 should stay unresolved. */
  confidence: z.coerce.number().min(0).max(1).optional(),
  /** Theme Stream — hub slug when the uncertain item has a best-fit hub. */
  hubId: streamHubSlugSchema.optional(),
});

const streamItemOrderKindSchema = z
  .string()
  .transform((s) => s.toLowerCase())
  .pipe(z.enum(["mark", "pursuit", "milestone"]));

/** Pointer into marks[], pursuits[], or milestones[] for narrative confirmation order (ambiguous excluded). */
export const streamItemOrderEntrySchema = z.object({
  kind: streamItemOrderKindSchema,
  index: z.number().int().nonnegative(),
});

/** Marks → pursuits → milestones (used when itemOrder is missing or invalid). */
export function buildDefaultStreamItemOrder(counts: {
  markCount: number;
  pursuitCount: number;
  milestoneCount: number;
}): StreamItemOrderEntry[] {
  const order: StreamItemOrderEntry[] = [];
  for (let i = 0; i < counts.markCount; i++) order.push({ kind: "mark", index: i });
  for (let i = 0; i < counts.pursuitCount; i++) order.push({ kind: "pursuit", index: i });
  for (let i = 0; i < counts.milestoneCount; i++) {
    order.push({ kind: "milestone", index: i });
  }
  return order;
}

const ITEM_ORDER_KIND_ALIASES: Record<string, StreamItemOrderEntry["kind"]> = {
  mark: "mark",
  marks: "mark",
  pursuit: "pursuit",
  pursuits: "pursuit",
  milestone: "milestone",
  milestones: "milestone",
};

function coerceStreamItemOrderEntry(raw: unknown): StreamItemOrderEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as { kind?: unknown; index?: unknown };
  const kindRaw = typeof row.kind === "string" ? row.kind.trim().toLowerCase() : "";
  const kind = ITEM_ORDER_KIND_ALIASES[kindRaw];
  if (!kind) return null;
  const index = typeof row.index === "number" ? row.index : Number(row.index);
  if (!Number.isInteger(index) || index < 0) return null;
  return { kind, index };
}

export function parseStreamItemOrder(
  raw: unknown,
  counts: { markCount: number; pursuitCount: number; milestoneCount: number },
): StreamItemOrderEntry[] {
  if (Array.isArray(raw)) {
    const coerced = raw
      .map(coerceStreamItemOrderEntry)
      .filter((e): e is StreamItemOrderEntry => e !== null);
    const parsed = z.array(streamItemOrderEntrySchema).safeParse(coerced);
    if (parsed.success && parsed.data.length === counts.markCount + counts.pursuitCount + counts.milestoneCount) {
      return parsed.data;
    }
    if (parsed.success && parsed.data.length > 0) {
      return parsed.data;
    }
  }
  return buildDefaultStreamItemOrder(counts);
}

export const streamExtractResponseSchema = z
  .object({
    narrativeSentence: z.string().max(220),
    marks: z.array(extractedMarkSchema),
    pursuits: z.array(extractedPursuitSchema),
    milestones: z.array(extractedMilestoneSchema),
    ambiguous: z.array(ambiguousItemSchema),
    itemOrder: z.unknown().optional(),
    clarifyingQuestion: z.union([z.string(), z.null()]),
  })
  .transform((data) => ({
    narrativeSentence: data.narrativeSentence,
    marks: data.marks,
    pursuits: data.pursuits,
    milestones: data.milestones,
    ambiguous: data.ambiguous,
    clarifyingQuestion: data.clarifyingQuestion,
    committedAmbiguousCount: 0,
    itemOrder: parseStreamItemOrder(data.itemOrder, {
      markCount: data.marks.length,
      pursuitCount: data.pursuits.length,
      milestoneCount: data.milestones.length,
    }),
  }));

export type ExtractedMark = z.infer<typeof extractedMarkSchema>;
export type ExtractedPursuit = z.infer<typeof extractedPursuitSchema>;
export type ExtractedMilestone = z.infer<typeof extractedMilestoneSchema>;
export type AmbiguousItem = z.infer<typeof ambiguousItemSchema>;
export type StreamItemOrderEntry = z.infer<typeof streamItemOrderEntrySchema>;
export type StreamExtractResponse = z.infer<typeof streamExtractResponseSchema>;

/** @deprecated Hub-scoped extract context — use {@link StreamThemeHubContextInput} for theme Stream. */
export type StreamHubContextInput = {
  branchId: string;
  limbId: string;
  hubLabel: string;
  themeLabel: string;
  existingPursuits: Array<{
    goalId: string;
    title: string;
    goalType: string;
    bloomStatus: string;
    parentGoalId: string | null;
  }>;
  existingMarks: Array<{ title: string; date: string }>;
  /** Removed from map (hidden) — dedup only, not active tree context. */
  removedPursuits: Array<{ title: string }>;
  removedMarks: Array<{ title: string; date: string }>;
  /** Last 3 Stream mark titles (chronological), or "None yet". */
  previousStreamSessionSummary: string;
};

/** One hub slot within a theme — sent to theme-level extract. */
export type StreamThemeHubContextInput = {
  /** Normalized slug (e.g. "career"). */
  hubId: string;
  /** Display label for confirmation UI only. */
  hubLabel: string;
  /** Catalog "about" copy for this hub. */
  about: string;
  /** Catalog AI routing note for this hub. */
  aiRoutingNote: string;
  belongsHere: [string, string, string];
  doesNotBelongHere: [string, string, string];
  /** Example pursuits from hub catalog — sent to the model in every extract. */
  examples: string[];
  /** Resolved server-side; included for commit/preview, not sent to the model. */
  branchId: string;
  existingPursuits: Array<{
    goalId: string;
    title: string;
    goalType: string;
    bloomStatus: string;
    parentGoalId: string | null;
  }>;
  existingMarks: Array<{ title: string; date: string }>;
  /** Removed from map on this hub — dedup only. */
  removedPursuits: Array<{ title: string }>;
  removedMarks: Array<{ title: string; date: string }>;
};

export type StreamThemeContextInput = {
  themeId: string;
  themeName: string;
  hubs: StreamThemeHubContextInput[];
  /** Last 3 theme-level Stream session dumps (chronological), or "None yet". */
  previousThemeSessionContext: string;
};

export const STREAM_EXTRACT_INPUT_MAX_LENGTH = 8000;

export type StreamSessionSummary = {
  intent: "planning" | "reporting" | "reflecting" | "mixed";
  hubSlugs: string[];
  pursuitTitlesReferenced: string[];
  summary: string;
};

/** Raw dump + mode sent with theme Stream commit (persisted after successful commit). */
export const streamSessionCommitFieldsSchema = z.object({
  inputText: z.string().min(1).max(STREAM_EXTRACT_INPUT_MAX_LENGTH),
  inputMode: z.enum(["text", "voice"]),
  itemsAdded: z.number().int().nonnegative(),
  itemsSkipped: z.number().int().nonnegative(),
});

export type StreamSessionCommitFields = z.infer<typeof streamSessionCommitFieldsSchema>;

/** Single-hub extract (legacy hub panel entry). */
export const streamHubExtractRequestSchema = z.object({
  hubId: z.string().min(1),
  input: z.string().min(1).max(STREAM_EXTRACT_INPUT_MAX_LENGTH),
  inputMode: z.enum(["text", "voice"]),
});

export type StreamHubExtractRequest = z.infer<typeof streamHubExtractRequestSchema>;

export const streamThemeExtractRequestSchema = z.object({
  themeId: z.string().min(1),
  input: z.string().min(1).max(STREAM_EXTRACT_INPUT_MAX_LENGTH),
  inputMode: z.enum(["text", "voice"]),
});

export type StreamThemeExtractRequest = z.infer<typeof streamThemeExtractRequestSchema>;

/** Theme or hub extract — discriminated by presence of `themeId`. */
export const streamExtractRequestSchema = z.union([
  streamThemeExtractRequestSchema,
  streamHubExtractRequestSchema,
]);

export type StreamExtractRequest = z.infer<typeof streamExtractRequestSchema>;

export const resolvedAmbiguousSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(120),
  resolution: z.enum(STREAM_AMBIGUOUS_RESOLUTION_VALUES),
});

/** Theme-level commit — each item carries its own hubId slug. */
export const streamThemeCommitPayloadSchema = z
  .object({
    themeId: z.string().min(1),
    marks: z.array(extractedMarkSchema),
    pursuits: z.array(extractedPursuitSchema),
    milestones: z.array(extractedMilestoneSchema),
    resolvedAmbiguous: z.array(resolvedAmbiguousSchema).default([]),
  })
  .merge(streamSessionCommitFieldsSchema)
  .superRefine((data, ctx) => {
    const check = (items: Array<{ hubId?: string }>, path: string) => {
      items.forEach((item, index) => {
        if (!item.hubId?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "hubId required",
            path: [path, index, "hubId"],
          });
        }
      });
    };
    check(data.marks, "marks");
    check(data.pursuits, "pursuits");
    check(data.milestones, "milestones");
  });

export type StreamThemeCommitPayload = z.infer<typeof streamThemeCommitPayloadSchema>;

/** @deprecated Single-hub commit — theme Stream uses {@link streamThemeCommitPayloadSchema}. */
export const streamCommitPayloadSchema = z.object({
  hubId: z.string().min(1),
  marks: z.array(extractedMarkSchema),
  pursuits: z.array(extractedPursuitSchema),
  milestones: z.array(extractedMilestoneSchema),
  resolvedAmbiguous: z.array(resolvedAmbiguousSchema).default([]),
});

export type StreamCommitPayload = z.infer<typeof streamCommitPayloadSchema>;

/** Shared UI session options for tree Stream overlay and onboarding Stream Lite. */
export type StreamUiSessionOptions = {
  initialDraft?: string;
  initialPlaceholder?: string;
  /** Guided onboarding Stream Lite — constrained copy and first-card gate. */
  onboardingMode?: boolean;
  /** Hub-specific first-time question shown as the composer placeholder. */
  onboardingQuestion?: string;
};

export type StreamHubUiContext = {
  branchId: string;
  areaId: string;
  branchLabel: string;
  areaLabel: string;
  areaColor: string;
  /** Normalized hub slug for routing (e.g. "career"). */
  hubSlug?: string;
  /** For milestone labels on confirmation (existing pursuits on hub). */
  existingGoals?: Array<{ id: string; title: string }>;
};

/** Discriminated Stream UI session (hub or theme) with optional onboarding fields. */
export type StreamUiSession = StreamUiSessionOptions &
  (
    | { mode: "hub"; hub: StreamHubUiContext }
    | { mode: "theme"; theme: StreamThemeUiContext }
  );

/** Theme-scoped Stream session passed to the overlay. */
export type StreamThemeUiContext = {
  themeId: string;
  themeName: string;
  themeColor: string;
  /** All hubs in this theme (for routing dropdown + preview). */
  hubs: StreamHubUiContext[];
};
