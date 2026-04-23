import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { GroqNotConfiguredError, generateText, hasGroqKey } from "@/lib/groq";

const chatSchema = z.object({
  history: z
    .array(
      z.object({
        role: z.enum(["assistant", "user"]),
        text: z.string().min(1),
      }),
    )
    .min(1),
  mode: z.enum(["ack_and_ask", "stage_transition", "final_validation"]),
  nextQuestion: z.string().optional(),
  goalContext: z
    .object({
      lifeArea: z.string().optional(),
      title: z.string().optional(),
      description: z.string().optional(),
      deadline: z.string().optional(),
    })
    .optional(),
});

function getErrorDetails(err: unknown) {
  if (err instanceof Error) {
    const e = err as Error & { status?: number; requestID?: string; error?: unknown };
    return {
      message: e.message,
      status: e.status ?? null,
      requestId: e.requestID ?? null,
      providerError: e.error ?? null,
      stack: e.stack ?? null,
    };
  }
  return { message: String(err), status: null, requestId: null, providerError: null, stack: null };
}

const SYSTEM_PROMPT = [
  "You are a warm, insightful life coach running a real consultation — not a form.",
  "Keep every reply short (1-3 sentences), specific to what the user just said, and human.",
  "Start each ack_and_ask and stage_transition reply with a brief, natural acknowledgment of the user's latest answer before asking the next question.",
  "Vary your acknowledgments (e.g. 'Got it', 'That makes sense', 'Thanks for sharing', 'Helpful context') so the conversation does not sound repetitive.",
  "Do NOT echo the user's answer back verbatim. React to it — notice a detail, reflect meaning, or give a brief affirming observation.",
  "Never say 'Great!' alone, never use corporate filler, and never repeat the same transition phrase twice in a conversation.",
  "When a next question is provided, ask it naturally at the end of your reply. You may rephrase it in your own voice as long as you preserve its intent.",
  "When asked to validate the final goal, briefly reflect the whole picture (life area + title + deadline + discovery details) and give honest encouragement before we move to evaluation.",
  "Tone: grounded, curious, encouraging without being sycophantic.",
].join(" ");

function buildUserPrompt(input: z.infer<typeof chatSchema>) {
  const transcript = input.history
    .map((entry) => `${entry.role === "assistant" ? "Coach" : "User"}: ${entry.text}`)
    .join("\n");

  const contextLines: string[] = [];
  if (input.goalContext?.lifeArea) contextLines.push(`Life area: ${input.goalContext.lifeArea}`);
  if (input.goalContext?.title) contextLines.push(`Goal title: ${input.goalContext.title}`);
  if (input.goalContext?.description)
    contextLines.push(`Reason / description: ${input.goalContext.description}`);
  if (input.goalContext?.deadline) contextLines.push(`Deadline: ${input.goalContext.deadline}`);
  const contextBlock = contextLines.length
    ? `Known goal context so far:\n${contextLines.join("\n")}\n\n`
    : "";

  if (input.mode === "final_validation") {
    return `${contextBlock}Conversation so far:\n${transcript}\n\nTask: Give a warm, honest final validation (2-3 sentences). Acknowledge what's promising about the goal, name one realistic challenge you noticed, and say we'll now do the honest evaluation together. Do not ask another question.`;
  }

  if (input.mode === "stage_transition") {
    return `${contextBlock}Conversation so far:\n${transcript}\n\nTask: We're transitioning from foundational setup into deeper discovery. Write a short, natural bridge (1-2 sentences) that acknowledges what they've shared and sets up why the next questions get more specific. Then ask this next question naturally: "${input.nextQuestion ?? ""}".`;
  }

  return `${contextBlock}Conversation so far:\n${transcript}\n\nTask: Respond to the user's last message in 1-2 sentences like a real coach would (not a form). React to the substance of what they said. Then ask this next question naturally in your own voice, preserving its intent: "${input.nextQuestion ?? ""}".`;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let parsed: z.infer<typeof chatSchema>;
  try {
    const body = await request.json();
    const result = chatSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: "Invalid chat payload." }, { status: 400 });
    }
    parsed = result.data;
  } catch {
    return NextResponse.json({ error: "Invalid chat payload." }, { status: 400 });
  }

  if (!hasGroqKey()) {
    return NextResponse.json(
      { error: "GROQ_API_KEY not configured." },
      { status: 503 },
    );
  }

  try {
    const message = await generateText({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(parsed) }],
      maxTokens: 400,
      temperature: 0.7,
    });

    if (!message) {
      return NextResponse.json({ error: "Empty coach response." }, { status: 502 });
    }
    return NextResponse.json({ message });
  } catch (err) {
    if (err instanceof GroqNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const details = getErrorDetails(err);
    console.error("[POST /api/goals/chat] Groq call failed", details, err);
    return NextResponse.json(
      { error: `Coach unavailable: ${details.message}` },
      { status: 502 },
    );
  }
}
