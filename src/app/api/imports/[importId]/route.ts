import { NextResponse } from "next/server";
import { requireApiSessionUserId } from "@/lib/api-auth";
import {
  IMPORT_REVIEW_SOURCE_SELECT,
  serializeImportReviewSource,
} from "@/lib/imports/import-review";
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

type RouteContext = {
  params: Promise<{ importId: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  const { importId } = await params;
  if (!importId) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  try {
    const source = await prisma.importSource.findFirst({
      where: {
        id: importId,
        userId: auth.userId,
        deletedAt: null,
        state: { not: "DELETED" },
      },
      select: {
        ...IMPORT_REVIEW_SOURCE_SELECT,
        captureReceipts: {
          ...IMPORT_REVIEW_SOURCE_SELECT.captureReceipts,
          where: { userId: auth.userId, deletedAt: null },
        },
      },
    });

    if (!source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }
    const chapterOptions = await prisma.goal.findMany({
      where: { userId: auth.userId, archived: false },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: { id: true, title: true, themeId: true, status: true },
    });
    return NextResponse.json({
      source: serializeImportReviewSource(source),
      chapterOptions,
    });
  } catch (error) {
    console.error("[imports] Failed to load source", safeErrorIdentity(error));
    return NextResponse.json({ error: "Unable to load source. Please try again." }, { status: 500 });
  }
}
