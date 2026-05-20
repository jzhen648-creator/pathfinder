import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateJsonCompletion, GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";
import { parseMarkRequestSchema, parseMarkResponseSchema } from "@/lib/validation/parse-mark";

const PARSE_SYSTEM_PROMPT = [
  "You parse short user statements into a structured timeline moment (mark) for a life roadmap.",
  "Return ONLY a valid JSON object with exactly these fields:",
  "title (string, concise moment title, max ~80 chars),",
  "description (string short supporting detail, or null if none),",
  "date (ISO date YYYY-MM-DD when the moment occurred if inferable from the text, otherwise null),",
  "confidence (float 0-1),",
  "branchId (string, use the provided value unless the user clearly names a different hub on the same theme),",
  "limbId (string, use the provided value unless input clearly implies a different theme).",
  "No text outside the JSON object.",
].join(" ");

function getErrorDetails(err: unknown) {
  if (err instanceof Error) {
    const e = err as Error & { status?: number; requestID?: string; error?: unknown };
    return {
      message: e.message,
      status: e.status ?? null,
      requestId: e.requestID ?? null,
      providerError: e.error ?? null,
    };
  }
  return { message: String(err), status: null, requestId: null, providerError: null };
}

function stripJsonFence(raw: string): string {
  const t = raw.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(t);
  return m?.[1]?.trim() ?? t;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasGeminiKey()) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const reqParsed = parseMarkRequestSchema.safeParse(body);
  if (!reqParsed.success) {
    const issue = reqParsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
  }

  const { text, branchId, limbId } = reqParsed.data;
  const userMessage = [
    `Provided branchId (hub): ${branchId}`,
    `Provided limbId (theme): ${limbId}`,
    "",
    "User moment statement:",
    text.trim(),
  ].join("\n");

  try {
    const raw = await generateJsonCompletion({
      system: PARSE_SYSTEM_PROMPT,
      user: userMessage,
      maxTokens: 512,
      temperature: 0.2,
    });

    if (!raw) {
      return NextResponse.json({ error: "Empty parse response." }, { status: 502 });
    }

    let json: unknown;
    try {
      json = JSON.parse(stripJsonFence(raw));
    } catch {
      return NextResponse.json({ error: "Model returned invalid JSON." }, { status: 502 });
    }

    const out = parseMarkResponseSchema.safeParse(json);
    if (!out.success) {
      const issue = out.error.issues[0];
      return NextResponse.json(
        { error: issue?.message ?? "Parsed JSON did not match expected shape." },
        { status: 502 },
      );
    }

    return NextResponse.json(out.data);
  } catch (err) {
    if (err instanceof GeminiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const details = getErrorDetails(err);
    console.error("[POST /api/marks/parse] Gemini failed", details, err);
    return NextResponse.json(
      { error: `Parse unavailable: ${details.message}` },
      { status: 502 },
    );
  }
}
