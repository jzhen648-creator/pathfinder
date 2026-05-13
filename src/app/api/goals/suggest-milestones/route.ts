import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { generateJsonCompletion, GroqNotConfiguredError, hasGroqKey } from "@/lib/groq";

const requestSchema = z.object({
  goalTitle: z.string().trim().min(1, "goalTitle is required"),
  existing: z.array(z.string()),
});

const responseSchema = z.object({
  suggestions: z.array(z.string()).max(5),
});

const SYSTEM_PROMPT = [
  "You suggest concrete, actionable milestones for a personal goal.",
  "Return ONLY a JSON object with shape {\"suggestions\": string[]}.",
  "Each string in suggestions is a milestone title.",
  "Maximum 5 suggestions in the array.",
  "Do not repeat any titles in the existing list (case-insensitive match).",
  "Keep titles short (under 8 words), specific, and actionable.",
  "No numbering, no explanation, just the JSON object.",
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

function normalizeSuggestions(raw: string[], existingLower: Set<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of raw) {
    const t = typeof s === "string" ? s.trim() : "";
    if (!t) continue;
    const low = t.toLowerCase();
    if (existingLower.has(low) || seen.has(low)) continue;
    seen.add(low);
    out.push(t);
    if (out.length >= 5) break;
  }
  return out;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasGroqKey()) {
    return NextResponse.json({ error: "GROQ_API_KEY not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const reqParsed = requestSchema.safeParse(body);
  if (!reqParsed.success) {
    const issue = reqParsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
  }

  const { goalTitle, existing } = reqParsed.data;
  const existingLower = new Set(existing.map((t) => t.trim().toLowerCase()).filter(Boolean));

  const userMessage = [
    `Goal title: ${goalTitle}`,
    "",
    "Existing milestone titles (do not repeat):",
    existing.length ? existing.map((t) => `- ${t}`).join("\n") : "(none)",
  ].join("\n");

  try {
    const raw = await generateJsonCompletion({
      system: SYSTEM_PROMPT,
      user: userMessage,
      maxTokens: 512,
      temperature: 0.4,
    });

    if (!raw) {
      return NextResponse.json({ error: "Empty suggest response." }, { status: 502 });
    }

    let json: unknown;
    try {
      json = JSON.parse(stripJsonFence(raw));
    } catch {
      return NextResponse.json({ error: "Model returned invalid JSON." }, { status: 502 });
    }

    const parsed = responseSchema.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json(
        { error: issue?.message ?? "Parsed JSON did not match expected shape." },
        { status: 502 },
      );
    }

    const suggestions = normalizeSuggestions(parsed.data.suggestions, existingLower);

    return NextResponse.json({ suggestions });
  } catch (err) {
    if (err instanceof GroqNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const details = getErrorDetails(err);
    console.error("[POST /api/goals/suggest-milestones] Groq failed", details, err);
    return NextResponse.json(
      { error: `Suggest unavailable: ${details.message}` },
      { status: 502 },
    );
  }
}
