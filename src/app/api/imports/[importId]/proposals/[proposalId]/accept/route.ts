import { NextResponse } from "next/server";
import { requireApiSessionUserId } from "@/lib/api-auth";
import {
  ImportProposalReviewConflictError,
  ImportProposalReviewNotFoundError,
  reviewImportProposal,
} from "@/lib/imports/review-proposal";

type RouteContext = {
  params: Promise<{ importId: string; proposalId: string }>;
};

function applicationEnabled(): boolean {
  return process.env.IMPORT_PROCESSING_ENABLED === "1" || process.env.AI_FAKE_PROVIDER === "1";
}

function safeErrorIdentity(error: unknown) {
  const code =
    error instanceof ImportProposalReviewConflictError
      ? error.code
      : typeof error === "object" &&
          error !== null &&
          "code" in error &&
          typeof error.code === "string"
        ? error.code.slice(0, 64)
        : null;
  return { name: error instanceof Error ? error.name : "UnknownError", code };
}

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  if (!applicationEnabled()) {
    return NextResponse.json(
      { error: "Import proposal application is not enabled." },
      { status: 503 },
    );
  }

  const { importId, proposalId } = await context.params;
  try {
    return NextResponse.json(
      await reviewImportProposal(auth.userId, importId, proposalId, { action: "select" }),
    );
  } catch (error) {
    if (error instanceof ImportProposalReviewNotFoundError) {
      return NextResponse.json({ error: "Import proposal not found." }, { status: 404 });
    }
    if (error instanceof ImportProposalReviewConflictError) {
      return NextResponse.json(
        { error: "This proposal cannot be selected in its current state.", code: error.code },
        { status: 409 },
      );
    }
    console.error("[imports] Failed to select proposal", safeErrorIdentity(error));
    return NextResponse.json(
      { error: "Unable to select this proposal. Please try again." },
      { status: 500 },
    );
  }
}
