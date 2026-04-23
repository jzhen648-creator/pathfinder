import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { generateStructured, GroqNotConfiguredError, hasGroqKey } from "@/lib/groq";

const suggestionInputSchema = z.object({
  branches: z.array(
    z.object({
      name: z.string().min(1),
      nodes: z.array(
        z.object({
          label: z.string().min(1),
          year: z.number(),
          desc: z.string().optional(),
          progress: z.number().optional(),
        }),
      ),
    }),
  ),
});

const suggestionSchema = z.object({
  branch: z.string().min(1),
  label: z.string().min(1).max(80),
  year: z.number(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1),
});

const suggestionResponseSchema = z.object({
  suggestions: z.array(suggestionSchema),
});

const SYSTEM_PROMPT = `
You are an expert life-story mapper.
You are looking at someone's life map. Based on everything across branches (career, living, relationships, timeline), suggest 2-3 likely nodes for each empty or sparse branch.

Rules:
- Suggestions must be informed by existing map context.
- Be specific to this person, never generic.
- Each suggestion must include: branch, label (max 5 words), likely year, confidence (0-1), rationale.
- Only include suggestions with confidence > 0.6.
- Return at most 3 suggestions per branch.
- Never invent branch names outside provided branch list.
- Prefer realistic near-future or plausible timeline continuations.
`.trim();

function buildUserPrompt(input: z.infer<typeof suggestionInputSchema>) {
  const branchBlock = input.branches
    .map((branch) => {
      const nodeLines =
        branch.nodes.length > 0
          ? branch.nodes
              .map(
                (node) =>
                  `- ${node.year}: ${node.label}${node.desc ? ` (${node.desc})` : ""}${
                    typeof node.progress === "number" ? ` [progress ${node.progress}%]` : ""
                  }`,
              )
              .join("\n")
          : "- (empty)";
      return `${branch.name}\n${nodeLines}`;
    })
    .join("\n\n");

  return `Life map context:\n${branchBlock}\n\nReturn structured suggestions.`;
}

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
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let parsed: z.infer<typeof suggestionInputSchema>;
  try {
    const body = await request.json();
    const result = suggestionInputSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: "Invalid suggestion payload." }, { status: 400 });
    }
    parsed = result.data;
  } catch {
    return NextResponse.json({ error: "Invalid suggestion payload." }, { status: 400 });
  }

  if (!hasGroqKey()) {
    return NextResponse.json({ error: "GROQ_API_KEY not configured." }, { status: 503 });
  }

  try {
    const raw = await generateStructured<unknown>({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(parsed),
      toolName: "life_map_suggestions",
      toolDescription:
        "Generate branch-aware life-map ghost suggestions based on full existing map context.",
      schema: {
        type: "object",
        properties: {
          suggestions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                branch: { type: "string" },
                label: { type: "string" },
                year: { type: "number" },
                confidence: { type: "number" },
                rationale: { type: "string" },
              },
              required: ["branch", "label", "year", "confidence", "rationale"],
              additionalProperties: false,
            },
          },
        },
        required: ["suggestions"],
        additionalProperties: false,
      },
      maxTokens: 1300,
    });

    const structured = suggestionResponseSchema.safeParse(raw);
    if (!structured.success) {
      console.error(
        "[POST /api/life-map/suggestions] invalid model response",
        structured.error.flatten(),
      );
      return NextResponse.json({ error: "Invalid model response shape." }, { status: 502 });
    }

    const byBranch = new Map<string, Array<z.infer<typeof suggestionSchema>>>();
    for (const s of structured.data.suggestions) {
      if (s.confidence <= 0.6) continue;
      const branchSuggestions = byBranch.get(s.branch) ?? [];
      if (branchSuggestions.length < 3) {
        branchSuggestions.push(s);
        byBranch.set(s.branch, branchSuggestions);
      }
    }

    const suggestions = Array.from(byBranch.values()).flatMap((list) => list);
    return NextResponse.json({ suggestions });
  } catch (err) {
    if (err instanceof GroqNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const details = getErrorDetails(err);
    console.error("[POST /api/life-map/suggestions] Groq call failed", details, err);
    return NextResponse.json(
      { error: `Suggestion service unavailable: ${details.message}` },
      { status: 502 },
    );
  }
}
