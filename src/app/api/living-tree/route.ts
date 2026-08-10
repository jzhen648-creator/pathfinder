import { NextResponse } from "next/server";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { loadLivingTreeProjection } from "@/lib/living-tree/load-projection";

export async function GET() {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ tree: await loadLivingTreeProjection(auth.userId) });
  } catch (error) {
    console.error("[living-tree] Failed to load projection", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Unable to load your Living Tree. Please try again." },
      { status: 500 },
    );
  }
}
