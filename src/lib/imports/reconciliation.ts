import type { ImportCandidateEvidence, ImportExtractionCandidate } from "./extraction-contract";

export const PRIMARY_PROPOSAL_LIMIT = 5;

export type ReconciliationClass = ImportExtractionCandidate["classification"];

export type ReconciliationEvidence = ImportCandidateEvidence & {
  segmentId: string;
};

export type ReconciliationCandidate = Omit<
  ImportExtractionCandidate,
  "evidence" | "targetGoalIds"
> & {
  id: string;
  evidence: readonly ReconciliationEvidence[];
  targetGoalIds?: readonly string[];
};

export type ConsolidatedCandidate = Omit<ReconciliationCandidate, "evidence" | "targetGoalIds"> & {
  candidateIds: string[];
  evidence: ReconciliationEvidence[];
  targetGoalIds: string[];
};

export type ProposalPartition = {
  primary: ConsolidatedCandidate[];
  overflow: ConsolidatedCandidate[];
  retainedOnly: ConsolidatedCandidate[];
};

const REVIEW_PRIORITY: Record<ReconciliationClass, number> = {
  conflict: 0,
  update: 1,
  possible_connection: 2,
  new_chapter: 3,
  new: 4,
  reinforcement: 5,
  uncertain: 6,
  no_durable_value: 7,
};

function uniqueSorted(values: readonly string[] | undefined): string[] {
  return [...new Set(values ?? [])].sort((a, b) => a.localeCompare(b));
}

function evidenceKey(evidence: ReconciliationEvidence): string {
  return [
    evidence.segmentId,
    evidence.startOffset,
    evidence.endOffset,
    evidence.role,
    evidence.supportType,
  ].join(":");
}

function uniqueEvidence(values: readonly ReconciliationEvidence[]): ReconciliationEvidence[] {
  const evidence = new Map<string, ReconciliationEvidence>();
  for (const value of values) evidence.set(evidenceKey(value), value);
  return [...evidence.values()].sort((a, b) => evidenceKey(a).localeCompare(evidenceKey(b)));
}

function normalizedCanonicalKey(candidate: ReconciliationCandidate): string {
  return candidate.canonicalKey?.trim().toLocaleLowerCase() ?? "";
}

const MEANING_STOP_WORDS = new Set([
  "a",
  "about",
  "above",
  "an",
  "and",
  "another",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "by",
  "described",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "his",
  "in",
  "is",
  "it",
  "its",
  "maya",
  "not",
  "of",
  "on",
  "or",
  "project",
  "projects",
  "repeat",
  "repeated",
  "repeating",
  "repeats",
  "same",
  "second",
  "separate",
  "she",
  "that",
  "the",
  "their",
  "them",
  "they",
  "this",
  "those",
  "to",
  "user",
  "was",
  "were",
  "will",
  "with",
]);

const MONTH_WORDS = new Set([
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
]);

function singularMeaningToken(value: string): string {
  if (value.endsWith("ies") && value.length > 4) return `${value.slice(0, -3)}y`;
  if (value.endsWith("s") && !value.endsWith("ss") && value.length > 4) {
    return value.slice(0, -1);
  }
  return value;
}

function meaningTokens(value: string): Set<string> {
  const normalized = value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(
    normalized
      .filter((token) => token.length >= 3 && !/^\d+$/.test(token))
      .filter((token) => !MEANING_STOP_WORDS.has(token) && !MONTH_WORDS.has(token))
      .map(singularMeaningToken),
  );
}

function tokenSimilarity(left: string, right: string): { containment: number; shared: number } {
  const leftTokens = meaningTokens(left);
  const rightTokens = meaningTokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return { containment: 0, shared: 0 };
  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) shared += 1;
  }
  return { containment: shared / Math.min(leftTokens.size, rightTokens.size), shared };
}

function sameSubject(
  left: Pick<ConsolidatedCandidate, "subjectType" | "subjectLabel">,
  right: Pick<ConsolidatedCandidate, "subjectType" | "subjectLabel">,
): boolean {
  return (
    left.subjectType === right.subjectType &&
    (left.subjectLabel?.trim().toLocaleLowerCase() ?? "") ===
      (right.subjectLabel?.trim().toLocaleLowerCase() ?? "")
  );
}

function sameTargets(left: ConsolidatedCandidate, right: ConsolidatedCandidate): boolean {
  return left.targetGoalIds.join("|") === right.targetGoalIds.join("|");
}

function compatibleReinforcementScope(
  candidate: ConsolidatedCandidate,
  reinforcement: ConsolidatedCandidate,
): boolean {
  if (!sameTargets(candidate, reinforcement)) return false;
  if (candidate.memoryDestination === reinforcement.memoryDestination) {
    return !(
      candidate.memoryDestination === "background" &&
      candidate.backgroundCategory &&
      reinforcement.backgroundCategory &&
      candidate.backgroundCategory !== reinforcement.backgroundCategory
    );
  }
  return reinforcement.memoryDestination === "source_only";
}

function hasDisjointEvidenceSegments(
  left: ConsolidatedCandidate,
  right: ConsolidatedCandidate,
): boolean {
  const leftSegments = new Set(left.evidence.map((evidence) => evidence.segmentId));
  return right.evidence.every((evidence) => !leftSegments.has(evidence.segmentId));
}

function mergeCandidateEvidence(
  primary: ConsolidatedCandidate,
  duplicate: ConsolidatedCandidate,
): ConsolidatedCandidate {
  return {
    ...primary,
    candidateIds: uniqueSorted([...primary.candidateIds, ...duplicate.candidateIds]),
    evidence: uniqueEvidence([...primary.evidence, ...duplicate.evidence]),
    targetGoalIds: uniqueSorted([...primary.targetGoalIds, ...duplicate.targetGoalIds]),
    confidence: Math.max(primary.confidence, duplicate.confidence),
  };
}

function hasExplicitRepetitionCue(value: string): boolean {
  return /\b(?:same|repeat(?:s|ed|ing)?|described above|not (?:a|an|another) (?:second|separate|new))\b/i.test(
    value,
  );
}

function mergeExplicitCrossSegmentReinforcement(
  candidates: readonly ConsolidatedCandidate[],
): ConsolidatedCandidate[] {
  const working = [...candidates];
  const removed = new Set<number>();

  for (let reinforcementIndex = 0; reinforcementIndex < working.length; reinforcementIndex += 1) {
    const reinforcement = working[reinforcementIndex]!;
    if (
      removed.has(reinforcementIndex) ||
      reinforcement.classification !== "reinforcement"
    ) {
      continue;
    }
    const explicitRepetition = hasExplicitRepetitionCue(reinforcement.proposedText);

    const matches = working
      .map((candidate, index) => {
        if (
          index === reinforcementIndex ||
          removed.has(index) ||
          candidate.classification === "reinforcement" ||
          candidate.classification === "no_durable_value" ||
          candidate.classification === "uncertain" ||
          !sameSubject(candidate, reinforcement) ||
          !compatibleReinforcementScope(candidate, reinforcement) ||
          !hasDisjointEvidenceSegments(candidate, reinforcement)
        ) {
          return null;
        }
        const similarity = tokenSimilarity(candidate.proposedText, reinforcement.proposedText);
        const sufficientlySimilar = explicitRepetition
          ? similarity.shared >= 3 && similarity.containment >= 0.5
          : (similarity.shared >= 3 && similarity.containment >= 0.65) ||
            (similarity.shared >= 2 && similarity.containment >= 0.9);
        return sufficientlySimilar ? { index, ...similarity } : null;
      })
      .filter((match): match is { index: number; containment: number; shared: number } => Boolean(match))
      .sort((left, right) => {
        const byContainment = right.containment - left.containment;
        if (byContainment !== 0) return byContainment;
        return right.shared - left.shared;
      });

    const best = matches[0];
    const runnerUp = matches[1];
    if (!best || (runnerUp && best.containment - runnerUp.containment < 0.15)) continue;

    working[best.index] = mergeCandidateEvidence(working[best.index]!, reinforcement);
    removed.add(reinforcementIndex);
  }

  return working.filter((_, index) => !removed.has(index));
}

function hasCorrectionCue(value: string): boolean {
  return /\b(?:not|instead|rather than|changed from|no longer)\b/i.test(value);
}

function explicitDates(value: string): Set<string> {
  const dates = new Set<string>();
  const normalized = value.toLocaleLowerCase();
  for (const match of normalized.matchAll(
    /\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/g,
  )) {
    dates.add(`${Number(match[1])} ${match[2]} ${match[3]}`);
  }
  for (const match of normalized.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    dates.add(`${match[1]}-${match[2]}-${match[3]}`);
  }
  return dates;
}

function sharesExplicitDate(left: string, right: string): boolean {
  const leftDates = explicitDates(left);
  if (leftDates.size === 0) return false;
  const rightDates = explicitDates(right);
  for (const date of leftDates) {
    if (rightDates.has(date)) return true;
  }
  return false;
}

function mergeExactDateUpdateConflicts(
  candidates: readonly ConsolidatedCandidate[],
): ConsolidatedCandidate[] {
  const working = [...candidates];
  const removed = new Set<number>();

  for (let conflictIndex = 0; conflictIndex < working.length; conflictIndex += 1) {
    const conflict = working[conflictIndex]!;
    if (
      removed.has(conflictIndex) ||
      conflict.classification !== "conflict" ||
      !hasCorrectionCue(conflict.proposedText)
    ) {
      continue;
    }

    const matches = working
      .map((candidate, index) => {
        const sameStructuredDate =
          conflict.temporal.precision === "exact" &&
          candidate.temporal.precision === "exact" &&
          Boolean(conflict.temporal.effectiveFrom) &&
          candidate.temporal.effectiveFrom === conflict.temporal.effectiveFrom &&
          candidate.temporal.effectiveTo === conflict.temporal.effectiveTo;
        const sameWrittenDate = sharesExplicitDate(
          candidate.proposedText,
          conflict.proposedText,
        );
        if (
          removed.has(index) ||
          candidate.classification !== "update" ||
          candidate.memoryDestination !== conflict.memoryDestination ||
          (!sameStructuredDate && !sameWrittenDate) ||
          !sameSubject(candidate, conflict) ||
          !sameTargets(candidate, conflict) ||
          !hasDisjointEvidenceSegments(candidate, conflict)
        ) {
          return null;
        }
        const similarity = tokenSimilarity(candidate.proposedText, conflict.proposedText);
        return similarity.shared >= 2 && similarity.containment >= 0.35
          ? { index, ...similarity }
          : null;
      })
      .filter((match): match is { index: number; containment: number; shared: number } => Boolean(match))
      .sort((left, right) => {
        const byContainment = right.containment - left.containment;
        if (byContainment !== 0) return byContainment;
        return right.shared - left.shared;
      });

    const best = matches[0];
    const runnerUp = matches[1];
    if (!best || (runnerUp && best.containment - runnerUp.containment < 0.15)) continue;

    const update = working[best.index]!;
    const merged = mergeCandidateEvidence(conflict, update);
    working[conflictIndex] =
      !conflict.temporal.effectiveFrom && update.temporal.effectiveFrom
        ? { ...merged, temporal: update.temporal }
        : merged;
    removed.add(best.index);
  }

  return working.filter((_, index) => !removed.has(index));
}

/**
 * Merge only candidates already classified as the same meaning. Different
 * reconciliation classes never collapse into one another.
 */
function consolidationKey(candidate: ReconciliationCandidate): string {
  const canonicalKey = normalizedCanonicalKey(candidate);
  if (!canonicalKey) return `candidate:${candidate.id}`;
  const observation = candidate.existingObservationId ?? "";
  const goals = uniqueSorted(candidate.targetGoalIds).join(",");
  return [
    candidate.classification,
    candidate.informationType,
    candidate.subjectType,
    candidate.subjectLabel ?? "",
    candidate.memoryDestination,
    canonicalKey,
    observation,
    goals,
  ].join("|");
}

export function consolidateReconciliationCandidates(
  candidates: readonly ReconciliationCandidate[],
): ConsolidatedCandidate[] {
  const groups = new Map<string, ConsolidatedCandidate>();

  for (const candidate of candidates) {
    const key = consolidationKey(candidate);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        ...candidate,
        candidateIds: [candidate.id],
        evidence: uniqueEvidence(candidate.evidence),
        targetGoalIds: uniqueSorted(candidate.targetGoalIds),
      });
      continue;
    }

    existing.candidateIds = uniqueSorted([...existing.candidateIds, candidate.id]);
    existing.evidence = uniqueEvidence([...existing.evidence, ...candidate.evidence]);
    existing.targetGoalIds = uniqueSorted([
      ...existing.targetGoalIds,
      ...(candidate.targetGoalIds ?? []),
    ]);
    existing.confidence = Math.max(existing.confidence, candidate.confidence);
    if (candidate.proposedText.length > existing.proposedText.length) {
      existing.proposedText = candidate.proposedText;
    }
    if ((candidate.rationale?.length ?? 0) > (existing.rationale?.length ?? 0)) {
      existing.rationale = candidate.rationale;
    }
  }

  const exactGroups = [...groups.values()];
  const crossSegmentGroups = mergeExactDateUpdateConflicts(
    mergeExplicitCrossSegmentReinforcement(exactGroups),
  );

  return crossSegmentGroups.sort((a, b) => {
    const byPriority = REVIEW_PRIORITY[a.classification] - REVIEW_PRIORITY[b.classification];
    if (byPriority !== 0) return byPriority;
    const byConfidence = b.confidence - a.confidence;
    if (byConfidence !== 0) return byConfidence;
    return a.id.localeCompare(b.id);
  });
}

export function partitionProposalCandidates(
  candidates: readonly ReconciliationCandidate[],
  primaryLimit = PRIMARY_PROPOSAL_LIMIT,
): ProposalPartition {
  const consolidated = consolidateReconciliationCandidates(candidates);
  const reviewable = consolidated.filter(
    (candidate) =>
      candidate.classification !== "reinforcement" &&
      candidate.classification !== "no_durable_value" &&
      candidate.classification !== "uncertain",
  );
  const retainedOnly = consolidated.filter(
    (candidate) =>
      candidate.classification === "reinforcement" ||
      candidate.classification === "no_durable_value" ||
      candidate.classification === "uncertain",
  );

  const safeLimit = Math.max(0, Math.floor(primaryLimit));
  return {
    primary: reviewable.slice(0, safeLimit),
    overflow: reviewable.slice(safeLimit),
    retainedOnly,
  };
}

export type ProposalDecisionState =
  | { status: "PENDING"; revisionId?: null }
  | { status: "DEFERRED"; revisionId?: null }
  | { status: "DISMISSED" | "SUPERSEDED"; revisionId?: null }
  | { status: "ACCEPTED"; revisionId: string };

export type ProposalApplyPlan =
  | { action: "apply" }
  | { action: "already_applied"; revisionId: string }
  | { action: "blocked"; reason: "dismissed" | "superseded" };

/** Applying an accepted proposal is idempotent; dismissed/superseded work is blocked. */
export function planProposalApplication(state: ProposalDecisionState): ProposalApplyPlan {
  if (state.status === "ACCEPTED") {
    return { action: "already_applied", revisionId: state.revisionId };
  }
  if (state.status === "DISMISSED") return { action: "blocked", reason: "dismissed" };
  if (state.status === "SUPERSEDED") return { action: "blocked", reason: "superseded" };
  return { action: "apply" };
}
