import { NextResponse } from "next/server";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { ImportProposalApplicationConflictError } from "@/lib/imports/apply-import-proposal";
import {
  confirmLifeUpdate,
  LifeUpdateConfirmationConflictError,
  LifeUpdateConfirmationNotFoundError,
} from "@/lib/imports/confirm-life-update";

type RouteContext = { params: Promise<{ importId: string }> };

function applicationEnabled(): boolean {
  return process.env.IMPORT_PROCESSING_ENABLED === "1" || process.env.AI_FAKE_PROVIDER === "1";
}

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;
  if (!applicationEnabled()) {
    return NextResponse.json({ error: "Import proposal application is not enabled." }, { status: 503 });
  }

  const { importId } = await context.params;
  try {
    return NextResponse.json(await confirmLifeUpdate(auth.userId, importId));
  } catch (error) {
    if (error instanceof LifeUpdateConfirmationNotFoundError) {
      return NextResponse.json({ error: "Import source not found." }, { status: 404 });
    }
    if (error instanceof LifeUpdateConfirmationConflictError) {
      return NextResponse.json(
        { error: "Review every primary item before applying this Life Update.", code: error.code },
        { status: 409 },
      );
    }
    if (error instanceof ImportProposalApplicationConflictError) {
      return NextResponse.json(
        { error: "One item changed and the Life Update was not applied.", code: error.code },
        { status: 409 },
      );
    }
    console.error("[imports] Failed to confirm Life Update", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Unable to apply this Life Update. Please try again." },
      { status: 500 },
    );
  }
}
