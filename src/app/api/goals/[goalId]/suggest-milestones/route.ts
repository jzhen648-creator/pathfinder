import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { formatUserContext } from "@/lib/ai/format-user-context";
import { generateJsonCompletion, GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";

type RouteProps = { params: Promise<{ goalId: string }> };

const requestSchema = z.object({
  goalId: z.string().trim().min(1, "goalId is required"),
  title: z.string().trim().min(1, "title is required"),
  description: z.string().trim().nullable().optional(),
  themeId: z.string().trim().min(1, "themeId is required"),
  hubName: z.string().trim().min(1, "hubName is required"),
});

const responseSchema = z.array(z.string()).min(1).max(5);

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
    if (out.length >= 5) break;
  }
  return out;
}

function errorDetails(err: unknown) {
  if (err instanceof Error) {
    const maybeProvider = err as Error & { status?: number; requestID?: string; error?: unknown };
    return {
      message: maybeProvider.message,
      status: maybeProvider.status ?? null,
      requestId: maybeProvider.requestID ?? null,
      providerError: maybeProvider.error ?? null,
    };
  }
  return { message: String(err), status: null, requestId: null, providerError: null };
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
      branch: { select: { id: true, name: true, label: true, limbId: true } },
      milestones: { select: { title: true } },
    },
  });

  if (!goal || goal.goalType === "moment" || goal.goalType === "event") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const title = parsed.data.title || goal.title;
  const description = parsed.data.description ?? goal.description ?? "";
  const themeId = parsed.data.themeId || goal.branch?.limbId || "";
  const hubName = parsed.data.hubName || goal.branch?.label || goal.branch?.name || "";
  const existingLower = new Set(goal.milestones.map((m) => m.title.trim().toLowerCase()).filter(Boolean));
  const userContext = await formatUserContext(userId);

  const system = [
    "You suggest realistic, actionable milestones for a personal pursuit.",
    "Return only a JSON array of 3 to 5 title strings.",
    "No markdown, no object wrapper, no numbering, no explanation.",
    "Keep each title short, concrete, and action-oriented.",
    "Do not repeat existing milestone titles.",
  ].join(" ");

  const user = [
    `Given this pursuit: ${title}`,
    `Theme area of life: ${themeId}`,
    `Hub: ${hubName}`,
    description ? `Description: ${description}` : null,
    userContext
      ? [
          "",
          "User context (use for personalisation only):",
          userContext,
          "",
          "Use this context to make milestone suggestions more relevant to this specific person's situation.",
          "Do not invent milestones not relevant to the pursuit.",
        ].join("\n")
      : null,
    "",
    "Existing milestone titles:",
    goal.milestones.length ? goal.milestones.map((m) => `- ${m.title}`).join("\n") : "(none)",
    "",
    "Suggest 3-5 realistic actionable milestones. Return only a JSON array of title strings.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const raw = await generateJsonCompletion({
      system,
      user,
      maxTokens: 512,
      temperature: 0.45,
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
    if (err instanceof GeminiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const details = errorDetails(err);
    console.error("[POST /api/goals/[goalId]/suggest-milestones] Gemini failed", details, err);
    return NextResponse.json(
      { error: `Suggest unavailable: ${details.message}` },
      { status: 502 },
    );
  }
}
