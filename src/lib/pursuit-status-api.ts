/** Phase 3 — Prisma uses `status`; JSON mirrors legacy `bloomStatus` for mobile compat. */

export const PURSUIT_STATUS_VALUES = [
  "ACTIVE",
  "PAUSED",
  "COMPLETE",
  "MAINTAINING",
  "ABANDONED",
] as const;

export type PursuitStatusValue = (typeof PURSUIT_STATUS_VALUES)[number];

export type WithPursuitStatus = { status?: string | null };

/** @deprecated Use WithPursuitStatus */
export type WithBloomStatus = WithPursuitStatus;

export function normalizePursuitStatusValue(raw: unknown): PursuitStatusValue | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const upper = raw.trim().toUpperCase();
  if (upper === "ON_HOLD") return "PAUSED";
  if ((PURSUIT_STATUS_VALUES as readonly string[]).includes(upper)) {
    return upper as PursuitStatusValue;
  }
  return null;
}

export function withBloomStatusMirror<T extends WithPursuitStatus>(
  row: T,
): T & { bloomStatus: PursuitStatusValue | string | null } {
  const normalized = normalizePursuitStatusValue(row.status);
  return { ...row, bloomStatus: normalized ?? row.status ?? "ACTIVE" };
}

export function withBloomStatusMirrors<T extends WithPursuitStatus>(
  rows: T[],
): Array<T & { bloomStatus: PursuitStatusValue | string | null }> {
  return rows.map(withBloomStatusMirror);
}

/** @deprecated Use withBloomStatusMirror */
export const withPursuitStatusMirror = withBloomStatusMirror;

export const withPursuitStatusMirrors = withBloomStatusMirrors;

export function resolvePursuitStatusFromBody(body: {
  status?: unknown;
  bloomStatus?: unknown;
}): PursuitStatusValue | undefined {
  const fromStatus = normalizePursuitStatusValue(body.status);
  if (fromStatus) return fromStatus;
  return normalizePursuitStatusValue(body.bloomStatus) ?? undefined;
}

export function normalizePursuitStatusInBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const record = { ...(body as Record<string, unknown>) };
  const resolved = resolvePursuitStatusFromBody({
    status: record.status,
    bloomStatus: record.bloomStatus,
  });
  if (resolved) {
    record.status = resolved;
    record.bloomStatus = resolved;
  }
  return record;
}
