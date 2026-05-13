import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { detectGoalDomain, getDomainQuestions } from "@/lib/goal-discovery";
import { generateText, hasGroqKey } from "@/lib/groq";
import { sha256 } from "@/lib/hash";

const evaluateSchema = z.object({
  lifeArea: z.string().min(2),
  title: z.string().min(3),
  description: z.string().min(10),
  deadline: z.string().min(1),
  discoveryAnswers: z.array(z.object({ question: z.string(), answer: z.string() })).min(1),
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

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = evaluateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid evaluation payload." }, { status: 400 });
  }

  const domain = detectGoalDomain({
    lifeArea: parsed.data.lifeArea,
    title: parsed.data.title,
    description: parsed.data.description,
  });
  const domainQuestions = getDomainQuestions(domain);

  // Hash the inputs so identical re-submissions (retry after error, modal
  // re-opened with same draft, React double-render under StrictMode) reuse
  // the previous evaluation instead of re-billing Groq.
  const inputHash = sha256([
    parsed.data.lifeArea.trim().toLowerCase(),
    parsed.data.title.trim(),
    parsed.data.description.trim(),
    parsed.data.deadline.trim(),
    parsed.data.discoveryAnswers.map((a) => ({
      q: a.question.trim(),
      a: a.answer.trim(),
    })),
  ]);

  try {
    const cached = await prisma.goalEvaluationCache.findUnique({
      where: { userId_inputHash: { userId, inputHash } },
      select: { evaluation: true },
    });
    if (cached) {
      return NextResponse.json({
        evaluation: cached.evaluation,
        domainQuestions,
        cached: true,
      });
    }
  } catch (err) {
    // Cache read failure is not fatal — fall through to live generation.
    console.error("[POST /api/goals/evaluate] cache lookup failed:", err);
  }

  let user: { onboardingProfileText: string | null; careerEducationContextText: string | null } | null = null;
  try {
    user = await prisma.user.findUnique({
      where: { id: userId },
      select: { onboardingProfileText: true, careerEducationContextText: true },
    });
  } catch (err) {
    console.error("[POST /api/goals/evaluate] prisma lookup failed:", err);
    return NextResponse.json({ error: "Failed to load user context." }, { status: 500 });
  }

  if (!hasGroqKey()) {
    return NextResponse.json({
      error: "Groq API is not configured (missing GROQ_API_KEY).",
    }, { status: 503 });
  }

  const context = parsed.data.discoveryAnswers
    .map((entry, index) => `${index + 1}. ${entry.question}\nAnswer: ${entry.answer}`)
    .join("\n\n");

  let evaluation: string;
  try {
    evaluation = await generateText({
      system:
        "You are an expert coach. Return 3 to 5 honest sentences: assess starting position, identify key gaps/challenges, judge timeline realism, and flag risks. Be direct but constructive.",
      messages: [
        {
          role: "user",
          content: `Goal: ${parsed.data.title}
Theme: ${parsed.data.lifeArea}
Description: ${parsed.data.description}
Deadline: ${parsed.data.deadline}
Domain: ${domain}
Discovery context:
${context}

Profile context:
${user?.onboardingProfileText ?? "No profile"}

Document context:
${user?.careerEducationContextText ?? "None"}`,
        },
      ],
      maxTokens: 600,
    });
    if (!evaluation.trim()) {
      return NextResponse.json(
        { error: "Groq returned an empty evaluation response." },
        { status: 502 },
      );
    }
  } catch (err) {
    const details = getErrorDetails(err);
    console.error("[POST /api/goals/evaluate] Groq call failed", details, err);
    return NextResponse.json({
      error: `Groq evaluation failed: ${details.message}`,
    }, { status: 502 });
  }

  // Cache the successful evaluation. `upsert` handles the rare race where two
  // concurrent submits both write for the same hash.
  try {
    await prisma.goalEvaluationCache.upsert({
      where: { userId_inputHash: { userId, inputHash } },
      update: { evaluation },
      create: { userId, inputHash, evaluation },
    });
  } catch (err) {
    // Cache write failure is not fatal — we still return the evaluation.
    console.error("[POST /api/goals/evaluate] cache write failed:", err);
  }

  return NextResponse.json({ evaluation, domainQuestions });
}
