import { format, isValid, parse } from "date-fns";

export const DMY_FORMAT = "dd/MM/yyyy";

export function formatDateDMY(value: Date | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  if (!isValid(date)) return "";
  return format(date, DMY_FORMAT);
}

export function parseDateDMY(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = parse(trimmed, DMY_FORMAT, new Date());
  return isValid(parsed) ? parsed : null;
}

export function dmyToIsoDate(value: string): string | null {
  const parsed = parseDateDMY(value);
  return parsed ? format(parsed, "yyyy-MM-dd") : null;
}
