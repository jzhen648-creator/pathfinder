import type { Prisma } from "@prisma/client";

export type ImportProposalReviewDecision = "accept";

function payloadObject(payload: unknown): Record<string, unknown> {
  if (!payload || Array.isArray(payload) || typeof payload !== "object") return {};
  return { ...(payload as Record<string, unknown>) };
}

export function parseProposalReviewDecision(
  payload: unknown,
): ImportProposalReviewDecision | null {
  if (!payload || Array.isArray(payload) || typeof payload !== "object") return null;
  return (payload as Record<string, unknown>).reviewDecision === "accept" ? "accept" : null;
}

export function withProposalReviewDecision(
  payload: unknown,
  decision: ImportProposalReviewDecision,
): Prisma.InputJsonObject {
  return { ...payloadObject(payload), reviewDecision: decision } as Prisma.InputJsonObject;
}

export function withoutProposalReviewDecision(
  payload: unknown,
): Prisma.InputJsonObject {
  const next = payloadObject(payload);
  delete next.reviewDecision;
  return next as Prisma.InputJsonObject;
}
