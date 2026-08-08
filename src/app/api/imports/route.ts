import { NextResponse } from "next/server";
import { requireApiSessionUserId } from "@/lib/api-auth";
import {
  createImportSourceSchema,
  IMPORT_SOURCE_SUMMARY_SELECT,
  ImportIdempotencyConflictError,
  importListLimitSchema,
  ingestImportSource,
  serializeImportCaptureReceipt,
  serializeImportSourceSummary,
} from "@/lib/imports/ingest-source";
import { prisma } from "@/lib/prisma";

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

export async function GET(request: Request) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  const requestedLimit = new URL(request.url).searchParams.get("limit") ?? undefined;
  const limitResult = importListLimitSchema.safeParse(requestedLimit);
  if (!limitResult.success) {
    return NextResponse.json({ error: "limit must be an integer from 1 to 100" }, { status: 400 });
  }

  try {
    const sources = await prisma.importSource.findMany({
      where: {
        userId: auth.userId,
        deletedAt: null,
        state: { not: "DELETED" },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limitResult.data,
      select: IMPORT_SOURCE_SUMMARY_SELECT,
    });
    return NextResponse.json({ sources: sources.map(serializeImportSourceSummary) });
  } catch (error) {
    console.error("[imports] Failed to list sources", safeErrorIdentity(error));
    return NextResponse.json({ error: "Unable to load sources. Please try again." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const parsed = createImportSourceSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: issue?.message ?? "Invalid payload",
        field: issue?.path[0]?.toString(),
      },
      { status: 400 },
    );
  }

  try {
    const result = await ingestImportSource(auth.userId, parsed.data);
    return NextResponse.json(
      {
        source: serializeImportSourceSummary(result.source),
        receipt: serializeImportCaptureReceipt(result.receipt),
        disposition: result.disposition,
      },
      {
        status:
          result.disposition === "idempotent_retry" ? 200 : 201,
      },
    );
  } catch (error) {
    if (error instanceof ImportIdempotencyConflictError) {
      return NextResponse.json(
        { error: "clientImportId has already been used for another source" },
        { status: 409 },
      );
    }
    console.error("[imports] Failed to store source", safeErrorIdentity(error));
    return NextResponse.json({ error: "Unable to store source. Please try again." }, { status: 500 });
  }
}
