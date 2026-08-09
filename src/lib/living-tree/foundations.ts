import type { LifeBackgroundCategory } from "@prisma/client";
import type { FoundationObservationInput, FoundationsSummary } from "@/lib/living-tree/types";

/**
 * Foundations shows four buckets over eight stored background categories.
 * Anything that is not identity, people or places is durable supporting fact.
 */
const BUCKET_BY_CATEGORY: Record<LifeBackgroundCategory, keyof FoundationsSummary> = {
  IDENTITY: "identity",
  PEOPLE: "people",
  PLACES: "places",
  WORK_QUALIFICATIONS: "durableFacts",
  ASSETS_FINANCES: "durableFacts",
  HEALTH: "durableFacts",
  PREFERENCES_CONSTRAINTS: "durableFacts",
  OTHER: "durableFacts",
};

/**
 * Deduplicate on category, subject and canonical key together.
 *
 * Never on canonicalKey alone: the same canonical fact held about the user and
 * about a named other person, or filed under two categories, is two distinct
 * pieces of context and must be counted twice.
 */
export function foundationDedupeKey(observation: FoundationObservationInput): string {
  return [
    observation.backgroundCategory ?? "UNCATEGORISED",
    observation.subjectType,
    observation.subjectLabel ?? "",
    observation.canonicalKey ?? observation.id,
  ].join(" ");
}

/** Counts of unique active confirmed background observations. Never branches. */
export function buildFoundations(observations: FoundationObservationInput[]): FoundationsSummary {
  const seen = new Set<string>();
  const summary: FoundationsSummary = { identity: 0, people: 0, places: 0, durableFacts: 0 };

  for (const observation of observations) {
    const key = foundationDedupeKey(observation);
    if (seen.has(key)) continue;
    seen.add(key);
    const bucket = observation.backgroundCategory
      ? BUCKET_BY_CATEGORY[observation.backgroundCategory]
      : "durableFacts";
    summary[bucket] += 1;
  }
  return summary;
}
