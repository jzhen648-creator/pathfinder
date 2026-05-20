import type { BloomStatus } from "@prisma/client";

export type BloomBadgeBucket = "active" | "complete" | "on_hold";

/** User-facing pursuit status label. */
export function formatBloomStatusLabel(status: BloomStatus | string): string {
  switch (status) {
    case "ACTIVE":
      return "Active";
    case "ON_HOLD":
      return "On Hold";
    case "COMPLETE":
      return "Complete";
    default:
      return String(status).replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export function badgeBucketFromBloom(status: BloomStatus | string): BloomBadgeBucket {
  if (status === "ON_HOLD") return "on_hold";
  if (status === "COMPLETE") return "complete";
  return "active";
}

/** Map legacy persisted values during transition (pre-migration rows). */
export function normalizeLegacyBloomStatus(status: string): BloomStatus | null {
  if (status === "ACTIVE" || status === "ON_HOLD" || status === "COMPLETE") return status;
  if (status === "ENDED") return "ON_HOLD";
  if (status === "BLOOMED") return "COMPLETE";
  if (status === "BUD" || status === "GROWING" || status === "BRANCHED") return "ACTIVE";
  return null;
}
