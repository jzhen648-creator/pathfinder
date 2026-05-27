import { z } from "zod";
import { zodErrorMessage } from "@/lib/validation/zod-helpers";

export { zodErrorMessage };
export const MARK_TITLE_MAX = 100;
export const MARK_DESCRIPTION_MAX = 500;
export const BRANCH_NAME_MAX = 50;
export const BRANCH_GOAL_MAX = 200;

const markValueField = z.union([z.number(), z.null()]).optional();

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Resolves a mark date from `date` (ISO) and/or `year` + `month` (month 1-12, optional).
 * Returns an error if nothing usable was provided or the value is not a real date.
 */
export function resolveMarkInputDate(input: {
  date?: string;
  year?: number;
  month?: number | null;
}):
  | { ok: true; d: Date }
  | { ok: false; message: string } {
  if (input.date != null && String(input.date).trim() !== "") {
    const d = new Date(String(input.date));
    if (Number.isNaN(d.getTime())) {
      return { ok: false, message: "Date must be a valid date." };
    }
    return { ok: true, d };
  }
  if (input.year === undefined) {
    return { ok: false, message: "Date is required (provide date or year)." };
  }
  if (!Number.isFinite(Number(input.year))) {
    return { ok: false, message: "Year must be a valid number between 1900 and 2100." };
  }
  const y = Math.trunc(Number(input.year));
  if (y < 1900 || y > 2100) {
    return { ok: false, message: "Year must be a valid number between 1900 and 2100." };
  }
  const rawM = input.month;
  if (rawM == null) {
    const d = new Date(`${y}-01-01T00:00:00.000Z`);
    return { ok: true, d };
  }
  if (!Number.isFinite(Number(rawM))) {
    return { ok: false, message: "Month must be a number from 1 to 12 if provided." };
  }
  const m = Math.trunc(Number(rawM));
  if (m < 1 || m > 12) {
    return { ok: false, message: "Month must be a number from 1 to 12 if provided." };
  }
  const d = new Date(`${y}-${pad2(m)}-01T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, message: "Date must be a valid date." };
  }
  return { ok: true, d };
}

/** True if the calendar moment is after the end of the local "today". */
export function isMarkDateInTheFuture(d: Date): boolean {
  const endToday = new Date();
  endToday.setHours(23, 59, 59, 999);
  return d.getTime() > endToday.getTime();
}

const markDescriptionField = z
  .string()
  .max(MARK_DESCRIPTION_MAX, `Description must be at most ${MARK_DESCRIPTION_MAX} characters.`)
  .nullable()
  .optional();

const markSequenceAnchorSchema = z
  .union([
    z.object({ kind: z.literal("append") }),
    z.object({ kind: z.literal("after"), nodeId: z.string().min(1) }),
    z.object({ kind: z.literal("before"), nodeId: z.string().min(1) }),
    z.object({
      kind: z.literal("between"),
      afterNodeId: z.string().min(1),
      beforeNodeId: z.string().min(1),
    }),
  ])
  .optional();

const createMarkBaseFields = {
  limbId: z.string().min(1, "Theme (limbId) is required."),
  branchId: z.string().min(1, "Branch is required."),
  title: z
    .string()
    .max(MARK_TITLE_MAX, `Title must be at most ${MARK_TITLE_MAX} characters.`)
    .optional(),
  label: z
    .string()
    .max(MARK_TITLE_MAX, `Title must be at most ${MARK_TITLE_MAX} characters.`)
    .optional(),
  description: markDescriptionField,
  date: z.string().optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  month: z.number().int().min(1).max(12).nullable().optional(),
  value: markValueField,
  sentiment: z.enum(["positive", "neutral", "negative"]).optional(),
  archived: z.boolean().optional(),
  future: z.boolean().optional(),
  significance: z.number().int().min(1).max(3).optional(),
  location: z.string().nullable().optional(),
  subtype: z.string().max(40).nullable().optional(),
  /** Provenance tag — `mark` (user/manual) or `stream` (AI Stream). Defaults to `mark` on the server. */
  kind: z.enum(["mark", "stream"]).optional(),
  /** Optional insert-and-reflow anchor — omit to append at the end of the branch line. */
  anchor: markSequenceAnchorSchema,
};

export const createMarkBodySchema = z
  .object(createMarkBaseFields)
  .superRefine((data, ctx) => {
    const t = (data.title ?? "").trim();
    const l = (data.label ?? "").trim();
    if (!t && !l) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Title is required (1–100 characters).", path: ["title"] });
    } else if (t && (t.length < 1 || t.length > MARK_TITLE_MAX)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Title must be 1–${MARK_TITLE_MAX} characters.`,
        path: ["title"],
      });
    } else if (!t && l && (l.length < 1 || l.length > MARK_TITLE_MAX)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Title must be 1–${MARK_TITLE_MAX} characters.`,
        path: ["label"],
      });
    }
    const resolved = resolveMarkInputDate(data);
    if (!resolved.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: resolved.message, path: ["date"] });
    } else if (isMarkDateInTheFuture(resolved.d) && data.kind !== "stream") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Date cannot be in the future.",
        path: ["date"],
      });
    }
  });

const updateMarkFieldShape = {
  branchId: z.string().min(1).optional(),
  limbId: z.string().min(1).optional(),
  title: z
    .string()
    .max(MARK_TITLE_MAX, `Title must be at most ${MARK_TITLE_MAX} characters.`)
    .optional(),
  label: z
    .string()
    .max(MARK_TITLE_MAX, `Title must be at most ${MARK_TITLE_MAX} characters.`)
    .optional(),
  description: markDescriptionField,
  date: z.string().optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  month: z.number().int().min(1).max(12).nullable().optional(),
  value: markValueField,
  sentiment: z.enum(["positive", "neutral", "negative"]).optional(),
  archived: z.boolean().optional(),
  /** Life-area display label; resolved to limbId on the server */
  branch: z.string().min(1).optional(),
};

export const updateMarkBodySchema = z
  .object(updateMarkFieldShape)
  .superRefine((data, ctx) => {
    if (data.title != null) {
      const t = (data.title ?? "").trim();
      if (t.length < 1 || t.length > MARK_TITLE_MAX) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Title must be 1–${MARK_TITLE_MAX} characters.`,
          path: ["title"],
        });
      }
    }
    if (data.label != null) {
      const l = (data.label ?? "").trim();
      if (l.length < 1 || l.length > MARK_TITLE_MAX) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Title must be 1–${MARK_TITLE_MAX} characters.`,
          path: ["label"],
        });
      }
    }
    if (data.description != null) {
      if (String(data.description).length > MARK_DESCRIPTION_MAX) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Description must be at most ${MARK_DESCRIPTION_MAX} characters.`,
          path: ["description"],
        });
      }
    }
  });

export const createBranchBodySchema = z
  .object({
    limbId: z.string().min(1, "Theme (limbId) is required."),
    name: z
      .string()
      .max(BRANCH_NAME_MAX, `Branch name must be at most ${BRANCH_NAME_MAX} characters.`)
      .optional(),
    label: z
      .string()
      .max(BRANCH_NAME_MAX, `Branch name must be at most ${BRANCH_NAME_MAX} characters.`)
      .optional(),
    mapAngleOffset: z.number().default(0),
    goal: z
      .union([z.string().max(BRANCH_GOAL_MAX, `Branch pursuit must be at most ${BRANCH_GOAL_MAX} characters.`), z.null()])
      .optional(),
    goalValue: z.union([z.number().positive(), z.null()]).optional(),
  })
  .superRefine((data, ctx) => {
    const raw = (data.name ?? data.label ?? "").trim();
    if (raw.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Branch name is required (1–50 characters).",
        path: ["name"],
      });
    } else if (raw.length > BRANCH_NAME_MAX) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Branch name must be 1–${BRANCH_NAME_MAX} characters.`,
        path: ["name"],
      });
    }
  });

export type CreateMarkBody = z.infer<typeof createMarkBodySchema>;
export type UpdateMarkBody = z.infer<typeof updateMarkBodySchema>;
export type CreateBranchBody = z.infer<typeof createBranchBodySchema>;

/**
 * Merges PATCH fields with the existing mark date, then resolves a calendar date.
 * Used to validate "not in the future" when the client sends partial `year` / `month`.
 */
export function resolveMarkDateForPatch(
  input: { date?: string; year?: number; month?: number | null | undefined },
  existingDate: Date,
): { ok: true; d: Date } | { ok: false; message: string } {
  if (input.date != null && String(input.date).trim() !== "") {
    return resolveMarkInputDate({ date: input.date });
  }
  if (input.year === undefined && input.month === undefined) {
    return { ok: true, d: existingDate };
  }
  const y = input.year !== undefined ? input.year : existingDate.getUTCFullYear();
  if (input.month === undefined) {
    return resolveMarkInputDate({ year: y, month: existingDate.getUTCMonth() + 1 });
  }
  return resolveMarkInputDate({ year: y, month: input.month });
}

export function displayMarkTitleFromInput(title?: string, label?: string): string {
  return (title ?? label ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 7)
    .join(" ");
}

/** Client-side checks for a moment save (aligns with API rules). */
export function validateClientMomentFields(input: {
  title: string;
  description: string;
  year: number;
}): { ok: true } | { ok: false; message: string } {
  const t = input.title.trim();
  if (t.length < 1) return { ok: false, message: "Title is required (1–100 characters)." };
  if (t.length > MARK_TITLE_MAX) return { ok: false, message: `Title must be 1–${MARK_TITLE_MAX} characters.` };
  if (input.description.length > MARK_DESCRIPTION_MAX) {
    return { ok: false, message: `Description must be at most ${MARK_DESCRIPTION_MAX} characters.` };
  }
  if (!Number.isFinite(input.year) || input.year < 1900 || input.year > 2100) {
    return { ok: false, message: "Year must be a number from 1900 to 2100." };
  }
  // Align with API: year-only dates resolve to 1 Jan of that year
  const d = new Date(input.year, 0, 1, 12, 0, 0, 0);
  if (isMarkDateInTheFuture(d)) {
    return { ok: false, message: "Date cannot be in the future." };
  }
  return { ok: true };
}
