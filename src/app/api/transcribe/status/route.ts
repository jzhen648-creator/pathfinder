import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { hasGroqTranscriptionKey } from "@/lib/gemini";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasGroqTranscriptionKey()) {
    return NextResponse.json({
      available: false,
      reason: "Voice transcription requires GROQ_API_KEY.",
    });
  }

  return NextResponse.json({ available: true, reason: null });
}
