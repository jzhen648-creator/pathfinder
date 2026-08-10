import { NextResponse } from "next/server";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { loadLivingTreeChapterDetail } from "@/lib/living-tree/load-details";

type RouteContext = { params: Promise<{ goalId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;
  const { goalId } = await params;

  try {
    const chapter = await loadLivingTreeChapterDetail(auth.userId, goalId);
    if (!chapter) {
      return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
    }
    return NextResponse.json({ chapter });
  } catch (error) {
    console.error("[living-tree] Failed to load chapter detail", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Unable to load this chapter. Please try again." },
      { status: 500 },
    );
  }
}
