import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { GeminiNotConfiguredError } from "@/lib/gemini";
import { extractProfileFactsForUser } from "@/lib/profile-memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await extractProfileFactsForUser(userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof GeminiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Profile extraction failed.";
    console.error("[POST /api/profile/extract] failed", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
