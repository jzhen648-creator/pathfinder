import { prisma } from "@/lib/prisma";

/** Default interval between full-map reflect regens (theme synthesis + all pursuits). */
export const DEFAULT_FULL_REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

function fullRefreshIntervalMs(): number {
  const raw = process.env.AI_FULL_REFRESH_INTERVAL_MS;
  if (raw === "0") return 0;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  return DEFAULT_FULL_REFRESH_INTERVAL_MS;
}

/**
 * Whether a periodic full-map reflect is due when the dirty ledger is empty and cache is fresh.
 *
 * Skips when `lastFullReflectAt` is null but insight cache exists — initial fill was already full.
 * Disabled when `AI_FULL_REFRESH_INTERVAL_MS=0`.
 */
export async function isPeriodicFullRefreshDue(userId: string): Promise<boolean> {
  const intervalMs = fullRefreshIntervalMs();
  if (intervalMs === 0) return false;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastFullReflectAt: true },
  });

  const lastFullReflectAt = user?.lastFullReflectAt ?? null;

  // Initial fill already ran full reflect — wait until interval elapses after first recorded full.
  if (!lastFullReflectAt) return false;

  return Date.now() - lastFullReflectAt.getTime() >= intervalMs;
}

export async function recordFullReflectDelivery(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { lastFullReflectAt: new Date() },
  });
}
