import { NextResponse } from "next/server";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { createReviewContextPack } from "@/lib/imports/review-context-pack";

export async function GET() {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ contextPack: await createReviewContextPack(auth.userId) });
  } catch (error) {
    console.error("[context-pack] Failed to create review pack", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Unable to prepare your Almanac review. Please try again." },
      { status: 500 },
    );
  }
}
