import { NextResponse } from "next/server";
import { requireApiSessionUserId } from "@/lib/api-auth";
import {
  ImportSourceProcessingNotFoundError,
  processImportSource,
} from "@/lib/imports/process-source";

type RouteContext = { params: Promise<{ importId: string }> };

function processingEnabled(): boolean {
  return process.env.IMPORT_PROCESSING_ENABLED === "1" || process.env.AI_FAKE_PROVIDER === "1";
}

function safeErrorIdentity(error: unknown) {
  const code =
    typeof error === "object" &&
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

  if (!processingEnabled()) {
    return NextResponse.json(
      { error: "Import processing is not enabled." },
      { status: 503 },
    );
  }

  const { importId } = await context.params;
  try {
    const result = await processImportSource(auth.userId, importId);
    const status =
      result.status === "needs_retry" ||
      result.status === "more_pending" ||
      result.status === "already_processing"
        ? 202
        : result.status === "failed"
          ? 422
          : 200;
    return NextResponse.json(result, { status });
  } catch (error) {
    if (error instanceof ImportSourceProcessingNotFoundError) {
      return NextResponse.json({ error: "Import source not found." }, { status: 404 });
    }
    console.error("[imports] Failed to process source", safeErrorIdentity(error));
    return NextResponse.json(
      { error: "Unable to process this source. Please try again." },
      { status: 500 },
    );
  }
}
