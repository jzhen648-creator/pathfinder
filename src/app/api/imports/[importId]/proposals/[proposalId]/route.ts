import { NextResponse } from "next/server";
import { requireApiSessionUserId } from "@/lib/api-auth";
import {
  ImportProposalReviewConflictError,
  ImportProposalReviewNotFoundError,
  reviewImportProposal,
  reviewImportProposalSchema,
} from "@/lib/imports/review-proposal";

type RouteContext = {
  params: Promise<{ importId: string; proposalId: string }>;
};

function processingEnabled(): boolean {
  return process.env.IMPORT_PROCESSING_ENABLED === "1" || process.env.AI_FAKE_PROVIDER === "1";
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;
  if (!processingEnabled()) {
    return NextResponse.json({ error: "Import review is not enabled." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }
  const parsed = reviewImportProposalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid review action" },
      { status: 400 },
    );
  }

  const { importId, proposalId } = await context.params;
  try {
    return NextResponse.json(
      await reviewImportProposal(auth.userId, importId, proposalId, parsed.data),
    );
  } catch (error) {
    if (error instanceof ImportProposalReviewNotFoundError) {
      return NextResponse.json({ error: "Import proposal not found." }, { status: 404 });
    }
    if (error instanceof ImportProposalReviewConflictError) {
      return NextResponse.json(
        { error: "This proposal cannot be changed in its current state.", code: error.code },
        { status: 409 },
      );
    }
    console.error("[imports] Failed to review proposal", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Unable to save this review. Please try again." },
      { status: 500 },
    );
  }
}
