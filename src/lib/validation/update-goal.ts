import { z } from "zod";
import { isValidStoredPursuitIconSlug } from "@/lib/icons/validate-pursuit-icon-slug";
import { AMOUNT_BASIS_VALUES } from "@/lib/pursuit/category-amount-profile";
import { PURSUIT_STATUS_VALUES } from "@/lib/pursuit-status-api";

const pursuitStatusSchema = z.enum(PURSUIT_STATUS_VALUES);

/** PATCH `/api/goals/[goalId]` — at least one field required. */
const calendarDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const updateGoalPayloadSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    /** User-authored background; `null` clears. Stored exactly as typed — max 1000 chars. */
    background: z.string().max(1000).nullable().optional(),
    /** 1–5 when set; null clears user significance. */
    significance: z.coerce.number().int().nullable().optional(),
    /** Explicit swimlane start; `null` clears override (falls back to createdAt). */
    timelineStart: calendarDaySchema.nullable().optional(),
    /** Target end date; `null` clears deadline. */
    deadline: calendarDaySchema.nullable().optional(),
    /** Calendar day the pursuit was completed — use with `status: COMPLETE`. */
    completedAt: calendarDaySchema.optional(),
    /** `false` revives a pursuit removed from the map. */
    archived: z.boolean().optional(),
    /** Canonical pursuit status (preferred over bloomStatus). */
    status: pursuitStatusSchema.optional(),
    /** @deprecated Use `status` — mirrored for transition. */
    bloomStatus: pursuitStatusSchema.optional(),
    /** World axial hex q on the mobile map lattice; `null` clears a pin. */
    mapGridQ: z.number().int().nullable().optional(),
    /** World axial hex r on the mobile map lattice; `null` clears a pin. */
    mapGridR: z.number().int().nullable().optional(),
    /** Lucide kebab-case slug; `null` clears stored icon (hub / auto fallback at render). */
    iconName: z.string().nullable().optional(),
    currentAmount: z.number().nullable().optional(),
    targetAmount: z.number().nullable().optional(),
    unit: z.string().nullable().optional(),
    amountBasis: z.enum(AMOUNT_BASIS_VALUES).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const hasField =
      data.title !== undefined ||
      data.description !== undefined ||
      data.background !== undefined ||
      data.significance !== undefined ||
      data.timelineStart !== undefined ||
      data.deadline !== undefined ||
      data.completedAt !== undefined ||
      data.archived !== undefined ||
      data.status !== undefined ||
      data.bloomStatus !== undefined ||
      data.mapGridQ !== undefined ||
      data.mapGridR !== undefined ||
      data.iconName !== undefined ||
      data.currentAmount !== undefined ||
      data.targetAmount !== undefined ||
      data.unit !== undefined ||
      data.amountBasis !== undefined;
    if (!hasField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one field is required",
      });
      return;
    }
    if (data.title !== undefined) {
      const title = data.title.trim();
      if (title.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Title is required",
          path: ["title"],
        });
      } else if (title.length > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Title must be at most 100 characters",
          path: ["title"],
        });
      }
    }
    if (data.description !== undefined && data.description.length > 500) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Description must be at most 500 characters",
        path: ["description"],
      });
    }
    if (data.background != null && data.background !== undefined && data.background.length > 1000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Background must be at most 1000 characters",
        path: ["background"],
      });
    }
    if (
      data.significance != null &&
      data.significance !== undefined &&
      (data.significance < 1 || data.significance > 5)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Significance must be between 1 and 5",
        path: ["significance"],
      });
    }
    const qSet = data.mapGridQ !== undefined;
    const rSet = data.mapGridR !== undefined;
    if (qSet !== rSet) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "mapGridQ and mapGridR must be updated together",
      });
    }
    if (qSet && rSet && data.mapGridQ != null && data.mapGridR == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "mapGridQ and mapGridR must both be set or both null",
      });
    }
    if (qSet && rSet && data.mapGridQ == null && data.mapGridR != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "mapGridQ and mapGridR must both be set or both null",
      });
    }
    if (data.iconName !== undefined && data.iconName != null) {
      const slug = data.iconName.trim().toLowerCase();
      if (!slug || !isValidStoredPursuitIconSlug(slug)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "iconName must be a valid Lucide slug or null",
          path: ["iconName"],
        });
      }
    }
    if (data.targetAmount != null && data.targetAmount <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Target amount must be positive",
        path: ["targetAmount"],
      });
    }
    if (data.currentAmount != null && data.currentAmount < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Current amount cannot be negative",
        path: ["currentAmount"],
      });
    }
    if (data.timelineStart != null && data.timelineStart !== undefined) {
      const start = new Date(`${data.timelineStart}T00:00:00.000Z`);
      const today = new Date();
      today.setUTCHours(23, 59, 59, 999);
      if (start.getTime() > today.getTime()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Start date cannot be in the future",
          path: ["timelineStart"],
        });
      }
    }
  });

export type UpdateGoalPayload = z.infer<typeof updateGoalPayloadSchema>;
