import { NextResponse } from "next/server";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { loadLivingTreeFoundations } from "@/lib/living-tree/load-details";

export async function GET() {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  try {
    return NextResponse.json({ foundations: await loadLivingTreeFoundations(auth.userId) });
  } catch (error) {
    console.error("[living-tree] Failed to load foundations", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Unable to load your foundations. Please try again." },
      { status: 500 },
    );
  }
}
