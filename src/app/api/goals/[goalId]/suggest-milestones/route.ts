import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { aiRouteErrorResponse } from "@/lib/ai/ai-route-errors";
import { formatPursuitContext } from "@/lib/ai/format-map-context";
import { formatUserContext } from "@/lib/ai/format-user-context";
import { generateJsonCompletion, hasGeminiKey } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";

/** Model calls can exceed Vercel's default function timeout — give AI routes a real budget. */
export const maxDuration = 60;

type RouteProps = { params: Promise<{ goalId: string }> };

const requestSchema = z.object({
  goalId: z.string().trim().min(1, "goalId is required"),
  title: z.string().trim().min(1, "title is required"),
  description: z.string().trim().nullable().optional(),
  themeId: z.string().trim().min(1, "themeId is required"),
  hubName: z.string().trim().min(1, "hubName is required"),
});

const responseSchema = z.array(z.string()).min(1).max(7);

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  return match?.[1]?.trim() ?? trimmed;
}

function normalizeSuggestions(raw: string[], existingLower: Set<string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const title = item.trim();
    if (!title) continue;
    const key = title.toLowerCase();
    if (existingLower.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(title);
    if (out.length >= 7) break;
  }
  return out;
}

export async function POST(request: Request, props: RouteProps) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  if (!hasGeminiKey()) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured." }, { status: 503 });
  }

  const { goalId } = await props.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Invalid payload" }, { status: 400 });
  }

  if (parsed.data.goalId !== goalId) {
    return NextResponse.json({ error: "goalId mismatch" }, { status: 400 });
  }

  const goal = await prisma.goal.findFirst({
    where: { id: goalId, userId, archived: false },
    include: {
      themeCategory: { select: { id: true, label: true, themeId: true } },
      milestones: { select: { title: true } },
    },
  });

  if (!goal || goal.goalType === "moment" || goal.goalType === "event") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existingLower = new Set(goal.milestones.map((m) => m.title.trim().toLowerCase()).filter(Boolean));
  const [pursuitContext, userContext] = await Promise.all([
    formatPursuitContext(userId, goalId),
    formatUserContext(userId),
  ]);

  if (!pursuitContext) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const system = [
    "You suggest milestone titles for a personal pursuit.",
    "Return ONLY a JSON array of title strings (typically 3–6; up to 7 for complex pursuits).",
    "No markdown, no object wrapper, no numbering, no explanation.",
    "Do not repeat existing milestone titles (case-insensitive).",
    "",
    "Milestones are meaningful waypoints on a journey, not tasks to do.",
    "They mark moments when reality has changed and progress is real.",
    "Think chapters of a story arc, not bullet points on a to-do list.",
    "",
    "Every title must be:",
    "- An ACHIEVEMENT or OUTCOME, phrased so reality has to confirm it.",
    "- A real change in status — something is now true that wasn't before.",
    "- Specific to this pursuit, not generic self-help.",
    "- One completable outcome per title.",
    "",
    'GOOD framing: "CV updated and ready", "First application submitted",',
    '"Interview secured", "Offer received", "First day completed".',
    'Phrasings like "X achieved", "X secured", "X completed", "X done", "X ready" all work.',
    "",
    'BAD framing (do not use): "Do X", "Complete X task", "Research X",',
    '"Apply to N things", or anything starting with an instruction verb (Submit, Schedule, Draft, Log, Run).',
    "",
    "Order titles chronologically as a story arc from earliest to final.",
    "Title length: 3–8 words.",
    "If pursuit context (description) names specific facts, reflect THOSE in milestones — not generic steps.",
    "If status is PAUSED: include reassess/resume waypoints where appropriate.",
    "If status is MAINTAINING: focus on sustaining routines, not reaching a final endpoint.",
  ].join("\n");

  const user = [
    userContext ? `User profile (calibration only — do not put age/location in titles):\n${userContext}` : "",
    "",
    "Full pursuit context JSON:",
    JSON.stringify(pursuitContext, null, 2),
    "",
    "Existing milestone titles:",
    goal.milestones.length ? goal.milestones.map((m) => `- ${m.title}`).join("\n") : "(none)",
    "",
    "Suggest an appropriate number of milestones (typically 3–6) as a chronological story arc. Return only a JSON array of title strings.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const raw = await generateJsonCompletion({
      system,
      user,
      maxTokens: 512,
      temperature: 0.45,
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

    const responseParsed = responseSchema.safeParse(json);
    if (!responseParsed.success) {
      const issue = responseParsed.error.issues[0];
      return NextResponse.json(
        { error: issue?.message ?? "Parsed JSON did not match expected shape." },
        { status: 502 },
      );
    }

    const suggestions = normalizeSuggestions(responseParsed.data, existingLower);
    return NextResponse.json({ suggestions });
  } catch (err) {
    return aiRouteErrorResponse(err, "[POST /api/goals/[goalId]/suggest-milestones]");
  }
}
