import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { formatUserContext } from "@/lib/ai/format-user-context";
import { aiRouteErrorResponse } from "@/lib/ai/ai-route-errors";
import { generateJsonCompletion, hasGeminiKey } from "@/lib/gemini";

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
  "You suggest milestone titles for a personal pursuit.",
  'Return ONLY a JSON object: {"suggestions": string[]}.',
  "Maximum 5 suggestions. Do not repeat existing titles (case-insensitive).",
  "",
  "Milestones are meaningful waypoints on a journey, not tasks to do.",
  "They mark moments when reality has changed and progress is real.",
  "Think chapters of a story arc, not bullet points on a to-do list.",
  "",
  "Every milestone title must be:",
  "- An ACHIEVEMENT or OUTCOME, phrased so reality has to confirm it.",
  "- A real change in status — something is now true that wasn't before.",
  "- Specific to this pursuit, not generic self-help.",
  "- One completable outcome per title.",
  "",
  "GOOD framing (achievements that mark real change):",
  '- "CV updated and ready"',
  '- "First application submitted"',
  '- "Interview secured"',
  '- "Offer received"',
  '- "First day completed"',
  'Phrasings like "X achieved", "X secured", "X completed", "X done", "X ready" all work.',
  "",
  "BAD framing (tasks the user controls — do not use):",
  '- "Do X", "Complete X task", "Research X", "Apply to N things"',
  '- "Write targeted cover letters", "Research 5 mortgage broker firms"',
  "- Anything starting with an instruction verb aimed at the user (Submit, Schedule, Draft, Log, Run).",
  "",
  "Return 3–5 milestones, ordered as a story arc from earliest to final.",
  "Title length: 3–8 words. No numbering, no explanation outside the JSON object.",
].join("\n");

function buildUserMessage(input: {
  goalTitle: string;
  existing: string[];
  goalDescription?: string;
  themeName?: string;
  hubName?: string;
  userContext?: string;
}): string {
  const lines = [`Pursuit title: ${input.goalTitle}`];
  if (input.goalDescription) lines.push(`Description: ${input.goalDescription}`);
  if (input.themeName) lines.push(`Life theme: ${input.themeName}`);
  if (input.hubName) lines.push(`Hub: ${input.hubName}`);
  if (input.userContext) {
    lines.push(
      "",
      "User context (subtle calibration only):",
      input.userContext,
      "",
      "Use this only to remove milestones that would be irrelevant for this person.",
      "Do NOT add location, age, or demographic assumptions into milestone titles.",
      "Profile context never drives milestone content; the pursuit itself does.",
    );
  }
  lines.push(
    "",
    "Existing milestones (do not repeat):",
    input.existing.length ? input.existing.map((t) => `- ${t}`).join("\n") : "(none)",
    "",
    "Suggest 3–5 NEW milestones as a story arc of meaningful waypoints toward this pursuit.",
    "Each title must be an achievement reality can confirm, not a task to do.",
  );
  return lines.join("\n");
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
  const userId = session.user.id;
  const userContext = await formatUserContext(userId);

  const userMessage = buildUserMessage({
    goalTitle,
    existing,
    goalDescription,
    themeName,
    hubName,
    userContext,
  });

  try {
    const raw = await generateJsonCompletion({
      system: SYSTEM_PROMPT,
      user: userMessage,
      maxTokens: 512,
      temperature: 0.35,
      queueKey: userId,
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
    return aiRouteErrorResponse(err, "[POST /api/goals/suggest-milestones]");
  }
}
