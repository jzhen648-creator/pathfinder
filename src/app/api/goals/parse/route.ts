import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateJsonCompletion, GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";
import {
  parseGoalRequestSchema,
  parseGoalResponseSchema,
} from "@/lib/validation/parse-goal";

const PARSE_SYSTEM_PROMPT = [
  "You parse life goal statements into structured JSON.",
  "Return ONLY a valid JSON object with exactly these fields:",
  "title (string, cleaned goal title),",
  "type (milestone = clear endpoint, practice = ongoing habit → stored as project + Maintaining),",
  "targetDate (ISO date string if mentioned, otherwise null),",
  "significance (integer 1-5, infer from language intensity and life impact),",
  "confidence (float 0-1, how clearly input maps to a goal),",
  "branchId (string, use the provided value unless input strongly implies a different branch),",
  "areaId (string, use the provided value unless input strongly implies a different theme).",
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

  const reqParsed = parseGoalRequestSchema.safeParse(body);
  if (!reqParsed.success) {
    const issue = reqParsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
  }

  const { text, branchId, areaId } = reqParsed.data;
  const userMessage = [
    `Provided categoryId: ${branchId}`,
    `Provided areaId: ${areaId}`,
    "",
    "User goal statement:",
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

    const out = parseGoalResponseSchema.safeParse(json);
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
    console.error("[POST /api/goals/parse] Gemini failed", details, err);
    return NextResponse.json(
      { error: `Parse unavailable: ${details.message}` },
      { status: 502 },
    );
  }
}
