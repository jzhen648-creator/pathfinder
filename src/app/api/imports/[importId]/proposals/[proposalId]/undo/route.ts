import { NextResponse } from "next/server";
import { requireApiSessionUserId } from "@/lib/api-auth";
import {
  ImportProposalApplicationConflictError,
  ImportProposalApplicationNotFoundError,
  undoImportProposalApplication,
} from "@/lib/imports/apply-import-proposal";

type RouteContext = {
  params: Promise<{ importId: string; proposalId: string }>;
};

function applicationEnabled(): boolean {
  return process.env.IMPORT_PROCESSING_ENABLED === "1" || process.env.AI_FAKE_PROVIDER === "1";
}

function safeErrorIdentity(error: unknown) {
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    code: error instanceof ImportProposalApplicationConflictError ? error.code : null,
  };
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
      await undoImportProposalApplication(auth.userId, importId, proposalId),
    );
  } catch (error) {
    if (error instanceof ImportProposalApplicationNotFoundError) {
      return NextResponse.json({ error: "Import proposal not found." }, { status: 404 });
    }
    if (error instanceof ImportProposalApplicationConflictError) {
      return NextResponse.json(
        { error: "This proposal cannot be undone in its current state.", code: error.code },
        { status: 409 },
      );
    }
    console.error("[imports] Failed to undo proposal", safeErrorIdentity(error));
    return NextResponse.json(
      { error: "Unable to undo this proposal. Please try again." },
      { status: 500 },
    );
  }
}
