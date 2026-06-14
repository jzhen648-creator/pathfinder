import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSessionUserId } from "@/lib/api-auth";
import { aiRouteErrorResponse } from "@/lib/ai/ai-route-errors";
import { generateJsonCompletion, hasGeminiKey } from "@/lib/gemini";

const requestSchema = z.object({
  educationLevel: z.enum(["secondary", "further", "higher"]),
  educationCountry: z.string().trim().min(1),
  currentCountry: z.string().trim().optional(),
  age: z.number().int().min(10).max(120).nullable().optional(),
  occupation: z
    .object({
      industry: z.string().trim(),
      jobTitle: z.string().trim(),
    })
    .nullable()
    .optional(),
});

const responseSchema = z.object({
  tone: z.enum(["encouraging", "reflective", "celebratory", "nudge"]),
  headline: z.string().trim().min(1),
  body: z.string().trim().min(1),
});

const SYSTEM_PROMPT = [
  "You write a short pursuit insight for a guided onboarding tutorial.",
  'Return ONLY JSON: {"tone": string, "headline": string, "body": string}.',
  "tone must be one of: encouraging, reflective, celebratory, nudge.",
  "headline: 4–10 words. body: 2–4 sentences, plain prose (no bullet lists).",
  "The pursuit is Finished formal education — milestones through their stated level are already complete.",
  "Acknowledge completing formal education at their level. If higher education, affirm the arc is done.",
  "Invite them to archive this practice pursuit and build a real one next.",
  "Do not mention statistics, percentiles, or population benchmarks.",
  "Use education country and current country only when it naturally grounds the prose.",
].join("\n");

function educationLevelLabel(level: "secondary" | "further" | "higher"): string {
  switch (level) {
    case "secondary":
      return "secondary school";
    case "further":
      return "further education (A-levels, college, or equivalent)";
    case "higher":
      return "higher education (university degree)";
  }
}

function stripJsonFence(raw: string): string {
  const t = raw.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(t);
  return m?.[1]?.trim() ?? t;
}

export async function POST(request: Request) {
  const auth = await requireApiSessionUserId();
  if (!auth.ok) return auth.response;

  if (!hasGeminiKey()) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured." }, { status: 503 });
  }

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

  const lines = [
    `Highest formal education: ${educationLevelLabel(parsed.data.educationLevel)}`,
    `Education country: ${parsed.data.educationCountry}`,
  ];
  if (parsed.data.currentCountry?.trim()) {
    lines.push(`Current country: ${parsed.data.currentCountry.trim()}`);
  }
  if (parsed.data.age != null) lines.push(`Age: ${parsed.data.age}`);
  if (parsed.data.occupation?.jobTitle?.trim()) {
    const industry = parsed.data.occupation.industry?.trim();
    lines.push(
      industry
        ? `Occupation: ${parsed.data.occupation.jobTitle.trim()} (${industry})`
        : `Occupation: ${parsed.data.occupation.jobTitle.trim()}`,
    );
  }

  try {
    const raw = await generateJsonCompletion({
      system: SYSTEM_PROMPT,
      user: lines.join("\n"),
      temperature: 0.6,
    });
    const json = JSON.parse(stripJsonFence(raw)) as unknown;
    const out = responseSchema.safeParse(json);
    if (!out.success) {
      return NextResponse.json({ error: "Invalid AI response shape" }, { status: 502 });
    }
    return NextResponse.json(out.data);
  } catch (err) {
    console.error("[onboarding/tutorial-insight]", err);
    return aiRouteErrorResponse(err, "onboarding/tutorial-insight");
  }
}
