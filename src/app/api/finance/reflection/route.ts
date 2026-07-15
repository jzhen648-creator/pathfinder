import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { generateText, hasGeminiKey, GeminiNotConfiguredError } from "@/lib/gemini";

/** Model calls can exceed Vercel's default function timeout — give AI routes a real budget. */
export const maxDuration = 60;

const payloadSchema = z.object({
  nodes: z.array(
    z.object({
      label: z.string(),
      year: z.number(),
      description: z.string().optional(),
      practicalData: z.record(z.string(), z.any()).optional(),
    }),
  ),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasGeminiKey()) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured." }, { status: 503 });
  }

  try {
    const body = await request.json();
    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const reflection = await generateText({
      system:
        "You are reading someone's financial life story. Based on the nodes provided, write 2-3 sentences that reflect their relationship with money — their patterns, decisions, and what their financial choices reveal about their values. Be warm, honest and specific to their actual story. Never give financial advice. Never use jargon.",
      messages: [
        {
          role: "user",
          content: JSON.stringify(parsed.data.nodes),
        },
      ],
      maxTokens: 220,
      temperature: 0.6,
    });

    return NextResponse.json({ reflection: reflection.trim() });
  } catch (err) {
    if (err instanceof GeminiNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("[POST /api/finance/reflection] failed", err);
    return NextResponse.json({ error: "Failed to generate reflection." }, { status: 500 });
  }
}
