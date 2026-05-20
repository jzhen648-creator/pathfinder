import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  GeminiProviderError,
  GeminiNotConfiguredError,
  hasGeminiTranscriptionKey,
  transcribeAudioBlob,
} from "@/lib/gemini";

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasGeminiTranscriptionKey()) {
    return NextResponse.json(
      { error: "Voice transcription requires GEMINI_API_KEY." },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const audio = formData.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "Missing audio recording." }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ error: "Recording is too long." }, { status: 400 });
  }

  const name =
    audio instanceof File && audio.name.trim().length > 0
      ? audio.name
      : audio.type.includes("mp4")
        ? "recording.mp4"
        : "recording.webm";

  try {
    const text = await transcribeAudioBlob(audio, name);
    return NextResponse.json({ text });
  } catch (err) {
    if (err instanceof GeminiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof GeminiProviderError) {
      const status = err.status === 429 || (err.status !== null && err.status >= 500) ? 503 : 502;
      return NextResponse.json(
        { error: "Voice transcription is temporarily unavailable. Try again in a moment." },
        { status },
      );
    }
    if (err instanceof Error && err.message === "No speech detected in recording.") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[POST /api/transcribe]", err);
    return NextResponse.json(
      { error: "Voice transcription failed. Try again in a moment." },
      { status: 502 },
    );
  }
}
