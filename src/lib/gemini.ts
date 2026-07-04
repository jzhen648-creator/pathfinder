import {
  AiNotConfiguredError,
  type AiTokenUsage,
  generateJsonCompletion as generateJsonCompletionRaw,
  generateStructured as generateStructuredRaw,
  generateText as generateTextRaw,
  generateTextStream as generateTextStreamRaw,
  hasAiKey,
} from "./ai-client";

export { hasAiKey as hasGeminiKey, AiNotConfiguredError as GeminiNotConfiguredError };
export type { AiTokenUsage };

export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
// gemini-1.5-flash is no longer served; use a current flash model on the same endpoint.
export const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

async function withNormalizedGeminiError<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (err) {
    throw normalizeGeminiError(err);
  }
}

export async function generateJsonCompletion(
  input: Parameters<typeof generateJsonCompletionRaw>[0],
): Promise<string> {
  return withNormalizedGeminiError(() => generateJsonCompletionRaw(input));
}

export async function generateStructured<T = unknown>(
  input: Parameters<typeof generateStructuredRaw>[0],
): Promise<T> {
  return withNormalizedGeminiError(() => generateStructuredRaw<T>(input));
}

export async function generateText(
  input: Parameters<typeof generateTextRaw>[0],
): Promise<string> {
  return withNormalizedGeminiError(() => generateTextRaw(input));
}

export async function* generateTextStream(
  input: Parameters<typeof generateTextStreamRaw>[0],
): AsyncGenerator<string> {
  try {
    yield* generateTextStreamRaw(input);
  } catch (err) {
    throw normalizeGeminiError(err);
  }
}

export class GeminiProviderError extends Error {
  status: number | null;

  constructor(message: string, options?: { status?: number | null; cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = "GeminiProviderError";
    this.status = options?.status ?? null;
  }
}

function getProviderStatus(err: unknown): number | null {
  if (err instanceof GeminiProviderError) return err.status;
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: unknown }).status;
    return typeof status === "number" ? status : null;
  }
  return null;
}

function normalizeGeminiError(err: unknown): GeminiProviderError {
  if (err instanceof GeminiProviderError) return err;

  const status = getProviderStatus(err);
  const rawMessage = err instanceof Error ? err.message : String(err);

  if (status === 401 || status === 403) {
    return new GeminiProviderError("Gemini API authentication failed. Check GEMINI_API_KEY.", {
      status,
      cause: err,
    });
  }
  if (status === 404) {
    return new GeminiProviderError(
      "Gemini model or endpoint was not found. Check the configured model and base URL.",
      { status, cause: err },
    );
  }
  if (status === 429) {
    return new GeminiProviderError("Gemini quota or rate limit was exceeded. Try again later.", {
      status,
      cause: err,
    });
  }
  if (status !== null && status >= 500) {
    return new GeminiProviderError("Gemini is temporarily unavailable. Try again later.", {
      status,
      cause: err,
    });
  }

  return new GeminiProviderError(rawMessage || "Gemini request failed.", { status, cause: err });
}

function getGeminiApiKey() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new AiNotConfiguredError("GEMINI_API_KEY is not configured.");
  return apiKey;
}

export function hasGroqTranscriptionKey() {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

function inferAudioMimeType(blob: Blob, filename: string) {
  if (blob.type) return blob.type;
  const lower = filename.toLowerCase();
  if (lower.endsWith(".mp4") || lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".ogg") || lower.endsWith(".oga")) return "audio/ogg";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  return "audio/webm";
}

/** Transcribe short voice clips (Stream press-and-hold). */
export async function transcribeAudioBlob(
  blob: Blob,
  filename = "recording.webm",
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new AiNotConfiguredError("GROQ_API_KEY is not configured.");
  }
  const mimeType = inferAudioMimeType(blob, filename);
  const form = new FormData();
  form.append("file", blob, filename);
  form.append("model", "whisper-large-v3-turbo");

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    body: form,
  });

  let body: unknown = null;
  const raw = await response.text();
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw;
    }
  }

  if (!response.ok) {
    const providerMessage =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error?: { message?: unknown } }).error?.message === "string"
        ? (body as { error: { message: string } }).error.message
        : "Transcription provider request failed.";
    throw new GeminiProviderError(providerMessage, { status: response.status, cause: body });
  }

  const text =
    typeof body === "object" &&
    body !== null &&
    "text" in body &&
    typeof (body as { text: unknown }).text === "string"
      ? (body as { text: string }).text.trim()
      : "";

  if (!text) {
    throw new Error("No speech detected in recording.");
  }
  return text;
}
