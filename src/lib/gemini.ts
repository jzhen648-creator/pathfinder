import { AiNotConfiguredError } from "./ai-client";

export {
  generateJsonCompletion,
  generateStructured,
  generateText,
  generateTextStream,
  hasAiKey as hasGeminiKey,
  AiNotConfiguredError as GeminiNotConfiguredError,
} from "./ai-client";

export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
// gemini-1.5-flash is no longer served; use a current flash model on the same endpoint.
export const GEMINI_MODEL = "gemini-2.5-flash";

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

export function hasGeminiTranscriptionKey() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
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
  const apiKey = getGeminiApiKey();
  const mimeType = inferAudioMimeType(blob, filename);
  const data = Buffer.from(await blob.arrayBuffer()).toString("base64");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: "Transcribe this audio exactly. Return only the spoken words, with no commentary. If there is no intelligible speech, return an empty string.",
              },
              {
                inline_data: {
                  mime_type: mimeType,
                  data,
                },
              },
            ],
          },
        ],
        generation_config: {
          temperature: 0,
          max_output_tokens: 512,
          thinking_config: { thinking_budget: 0 },
        },
      }),
    },
  );

  if (!response.ok) {
    throw normalizeGeminiError({ status: response.status });
  }

  const result = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const text = result.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("No speech detected in recording.");
  }
  return text;
}
