export type ProposalDeletionRow = {
  id: string;
  sourceId: string;
  status: "PENDING" | "ACCEPTED" | "DISMISSED" | "DEFERRED" | "SUPERSEDED";
};

export type ProvenanceLink = {
  sourceId: string;
  derivedId: string;
};

export type SourceDeletionImpact = {
  proposalIdsRemoved: string[];
  acceptedProposalIdsLosingSourceRecord: string[];
  observationIdsLosingEvidence: string[];
  observationIdsOrphaned: string[];
  revisionIdsLosingEvidence: string[];
  revisionIdsOrphaned: string[];
};

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function impactForLinks(sourceId: string, links: readonly ProvenanceLink[]) {
  const affected = uniqueSorted(
    links.filter((link) => link.sourceId === sourceId).map((link) => link.derivedId),
  );
  const orphaned = affected.filter(
    (derivedId) => !links.some((link) => link.derivedId === derivedId && link.sourceId !== sourceId),
  );
  return { affected, orphaned };
}

/**
 * Pure disclosure plan for permanent deletion. A soft-delete/tombstone does
 * not execute this plan; the user sees this impact before hard deletion.
 */
export function planHardSourceDeletion(input: {
  sourceId: string;
  proposals: readonly ProposalDeletionRow[];
  observationEvidence: readonly ProvenanceLink[];
  revisionEvidence: readonly ProvenanceLink[];
}): SourceDeletionImpact {
  const sourceProposals = input.proposals.filter((proposal) => proposal.sourceId === input.sourceId);
  const observations = impactForLinks(input.sourceId, input.observationEvidence);
  const revisions = impactForLinks(input.sourceId, input.revisionEvidence);

  return {
    proposalIdsRemoved: uniqueSorted(sourceProposals.map((proposal) => proposal.id)),
    acceptedProposalIdsLosingSourceRecord: uniqueSorted(
      sourceProposals
        .filter((proposal) => proposal.status === "ACCEPTED")
        .map((proposal) => proposal.id),
    ),
    observationIdsLosingEvidence: observations.affected,
    observationIdsOrphaned: observations.orphaned,
    revisionIdsLosingEvidence: revisions.affected,
    revisionIdsOrphaned: revisions.orphaned,
  };
}
