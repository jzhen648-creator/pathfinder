import { z } from "zod";

export function safeJsonParse<T>(
  value: unknown,
  schema: z.ZodSchema<T>,
): { ok: true; data: T } | { ok: false; error: z.ZodError<T> } {
  const parsed = schema.safeParse(value);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, error: parsed.error };
}

export function zodErrorMessage(error: z.ZodError): string {
  return error.issues.map((i) => i.message).join("; ");
}

