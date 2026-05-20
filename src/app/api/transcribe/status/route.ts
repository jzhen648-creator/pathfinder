import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { hasGeminiTranscriptionKey } from "@/lib/gemini";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasGeminiTranscriptionKey()) {
    return NextResponse.json({
      available: false,
      reason: "Voice transcription requires GEMINI_API_KEY.",
    });
  }

  return NextResponse.json({ available: true, reason: null });
}
