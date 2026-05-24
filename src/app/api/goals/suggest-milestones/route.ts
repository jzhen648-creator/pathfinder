import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { generateJsonCompletion, GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";

const requestSchema = z.object({
  goalTitle: z.string().trim().min(1, "goalTitle is required"),
  existing: z.array(z.string()),
  goalDescription: z.string().trim().optional(),
  themeName: z.string().trim().optional(),
  hubName: z.string().trim().optional(),
});

const responseSchema = z.object({
  suggestions: z.array(z.string()).max(5),
});

const SYSTEM_PROMPT = [
  "You suggest milestone titles for a personal pursuit (goal).",
  'Return ONLY a JSON object: {"suggestions": string[]}.',
  "Maximum 5 suggestions. Do not repeat existing titles (case-insensitive).",
  "",
  "Every title must be:",
  "- ACTIONABLE: starts with a strong verb (Complete, Log, Run, Draft, Schedule, Submit, Register, etc.). The user knows the first physical step.",
  "- MEASURABLE or OBSERVABLE: include a number, frequency, duration, date window, named deliverable, or unambiguous done-state (e.g. \"3 sessions\", \"7 days\", \"first draft\", \"5K\", \"without stopping\", \"by end of month\").",
  "- SPECIFIC to the pursuit and life theme — not generic self-help.",
  "- ONE completable outcome per title — not an ongoing vague habit or a multi-step project in one line.",
  "",
  "Avoid vague planning phrases unless the deliverable is named: Improve, Work on, Learn about, Research, Explore, Think about, Get better at.",
  "Avoid appointments with professionals unless legally required.",
  "Avoid placeholders (Milestone 1, Step 2).",
  "Title length: 4–12 words. No numbering, no explanation outside the JSON object.",
].join("\n");

function buildUserMessage(input: {
  goalTitle: string;
  existing: string[];
  goalDescription?: string;
  themeName?: string;
  hubName?: string;
}): string {
  const lines = [`Pursuit title: ${input.goalTitle}`];
  if (input.goalDescription) lines.push(`Description: ${input.goalDescription}`);
  if (input.themeName) lines.push(`Life theme: ${input.themeName}`);
  if (input.hubName) lines.push(`Hub: ${input.hubName}`);
  lines.push(
    "",
    "Existing milestones (do not repeat):",
    input.existing.length ? input.existing.map((t) => `- ${t}`).join("\n") : "(none)",
    "",
    "Suggest 3–5 NEW milestones that are the next logical steps toward this pursuit.",
    "Each title must be actionable and include a clear measure or deliverable.",
  );
  return lines.join("\n");
}

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

  if (!hasGeminiKey()) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured." }, { status: 503 });
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

  const { goalTitle, existing, goalDescription, themeName, hubName } = reqParsed.data;
  const existingLower = new Set(existing.map((t) => t.trim().toLowerCase()).filter(Boolean));

  const userMessage = buildUserMessage({
    goalTitle,
    existing,
    goalDescription,
    themeName,
    hubName,
  });

  try {
    const raw = await generateJsonCompletion({
      system: SYSTEM_PROMPT,
      user: userMessage,
      maxTokens: 512,
      temperature: 0.35,
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
    if (err instanceof GeminiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const details = getErrorDetails(err);
    console.error("[POST /api/goals/suggest-milestones] Gemini failed", details, err);
    return NextResponse.json(
      { error: `Suggest unavailable: ${details.message}` },
      { status: 502 },
    );
  }
}
