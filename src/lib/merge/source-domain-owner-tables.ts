/**
 * Source-domain tables that carry their own `userId` and therefore need explicit
 * ownership transfer when a guest map is merged into a claimed account.
 *
 * Tables without a `userId` (SourceFragment, SourceEvidenceSpan, the evidence
 * join tables, ImportJob, ImportSegmentRun) derive ownership from a parent in
 * this list and must not be rewritten.
 *
 * Order matters. `ImportCaptureReceipt` has a composite foreign key
 * ("sourceId", "userId") -> ImportSource("id", "userId") with ON UPDATE CASCADE,
 * so moving ImportSource first carries its receipts automatically. Moving
 * receipts first would violate that key.
 */
export const SOURCE_DOMAIN_OWNER_TABLES = [
  "importSource",
  "importCaptureReceipt",
  "lifeObservation",
  "chapterObservation",
  "importProposal",
  "importProposalApplication",
  "chapterRevision",
  "interpretationCorrection",
] as const;

export type SourceDomainOwnerTable = (typeof SOURCE_DOMAIN_OWNER_TABLES)[number];
