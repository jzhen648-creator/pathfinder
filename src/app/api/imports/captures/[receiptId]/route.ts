import { NextResponse } from "next/server";
import { requireApiSessionUserId } from "@/lib/api-auth";
import {
  deleteImportCaptureReceipt,
  ImportCaptureReceiptNotFoundError,
} from "@/lib/imports/capture-receipts";

type RouteContext = { params: Promise<{ receiptId: string }> };

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

export async function DELETE(_request: Request, { params }: RouteContext) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  const { receiptId } = await params;
  try {
    const result = await deleteImportCaptureReceipt(auth.userId, receiptId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ImportCaptureReceiptNotFoundError) {
      return NextResponse.json({ error: "Capture not found." }, { status: 404 });
    }
    console.error("[imports] Failed to delete capture", safeErrorIdentity(error));
    return NextResponse.json(
      { error: "Unable to delete this capture. Please try again." },
      { status: 500 },
    );
  }
}
