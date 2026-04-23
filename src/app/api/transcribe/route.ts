import { NextResponse } from "next/server";

// Groq API does not offer direct server-side audio transcription in
// this app integration.
// Voice input is disabled until a dedicated speech-to-text provider is wired up.
// The Create Goal modal already falls back gracefully when this returns an error.
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Voice transcription is not available. Groq does not support this audio flow here — type your answer instead.",
    },
    { status: 501 },
  );
}
