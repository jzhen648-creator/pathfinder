import { NextResponse } from "next/server";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { loadAtlas } from "@/lib/atlas/load-atlas";

export async function GET() {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ atlas: await loadAtlas(auth.userId) });
  } catch (error) {
    console.error("[atlas] Failed to load projection", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Unable to load your Atlas. Please try again." },
      { status: 500 },
    );
  }
}
