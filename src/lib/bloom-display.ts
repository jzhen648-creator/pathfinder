import type { BloomStatus } from "@prisma/client";

export type BloomBadgeBucket = "active" | "complete" | "on_hold";

/** User-facing pursuit status label. */
export function formatBloomStatusLabel(status: BloomStatus | string): string {
  switch (status) {
    case "ACTIVE":
      return "Active";
    case "PAUSED":
    case "ON_HOLD":
      return "Paused";
    case "COMPLETE":
      return "Complete";
    case "MAINTAINING":
      return "Maintaining";
    case "ABANDONED":
      return "Abandoned";
    default:
      return String(status).replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export function badgeBucketFromBloom(status: BloomStatus | string): BloomBadgeBucket {
  if (status === "PAUSED" || status === "ON_HOLD") return "on_hold";
  if (status === "COMPLETE") return "complete";
  return "active";
}

/** Map legacy persisted values during transition (pre-migration rows and inbound JSON). */
export function normalizeLegacyBloomStatus(status: string): BloomStatus | null {
  if (status === "ON_HOLD") return "PAUSED";
  if (
    status === "ACTIVE" ||
    status === "PAUSED" ||
    status === "COMPLETE" ||
    status === "MAINTAINING" ||
    status === "ABANDONED"
  ) {
    return status;
  }
  if (status === "ENDED") return "PAUSED";
  if (status === "BLOOMED") return "COMPLETE";
  if (status === "BUD" || status === "GROWING" || status === "BRANCHED") return "ACTIVE";
  return null;
}
