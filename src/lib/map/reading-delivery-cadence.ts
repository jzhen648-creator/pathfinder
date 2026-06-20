import { prisma } from "@/lib/prisma";

/** Free-tier minimum interval between AI reading deliveries (Gemini-bearing syncs). */
export const DEFAULT_READING_DELIVERY_INTERVAL_MS = 2 * 60 * 60 * 1000;

export type ReadingDeliveryGateResult = {
  allowed: boolean;
  retryAfterMs: number;
  lastDeliveredAt: Date | null;
  intervalMs: number;
};

function deliveryIntervalMs(): number {
  const raw = process.env.AI_READING_DELIVERY_INTERVAL_MS;
  if (raw === "0") return 0;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  return DEFAULT_READING_DELIVERY_INTERVAL_MS;
}

/** Dev / ops bypass — set `AI_READING_DELIVERY_BYPASS=true` on Vercel for testing. */
export function isReadingDeliveryBypassed(): boolean {
  return process.env.AI_READING_DELIVERY_BYPASS === "true";
}

export async function checkReadingDeliveryGate(
  userId: string,
  options?: { force?: boolean; hasInsightCache?: boolean },
): Promise<ReadingDeliveryGateResult> {
  const intervalMs = deliveryIntervalMs();
  if (options?.force === true || isReadingDeliveryBypassed() || intervalMs === 0) {
    return { allowed: true, retryAfterMs: 0, lastDeliveredAt: null, intervalMs };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastReadingDeliveredAt: true },
  });

  const lastDeliveredAt = user?.lastReadingDeliveredAt ?? null;

  // First reading — no insight cache yet; allow delivery without waiting.
  if (!options?.hasInsightCache && !lastDeliveredAt) {
    return { allowed: true, retryAfterMs: 0, lastDeliveredAt, intervalMs };
  }

  if (!lastDeliveredAt) {
    return { allowed: true, retryAfterMs: 0, lastDeliveredAt, intervalMs };
  }

  const elapsed = Date.now() - lastDeliveredAt.getTime();
  if (elapsed >= intervalMs) {
    return { allowed: true, retryAfterMs: 0, lastDeliveredAt, intervalMs };
  }

  return {
    allowed: false,
    retryAfterMs: intervalMs - elapsed,
    lastDeliveredAt,
    intervalMs,
  };
}

export async function recordReadingDelivery(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { lastReadingDeliveredAt: new Date() },
  });
}
