import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { generateStructured, GroqNotConfiguredError, hasGroqKey } from "@/lib/groq";

const BRANCHES = [
  "Career",
  "Health & Fitness",
  "Finance",
  "Relationships",
  "Living",
  "Who I'm Becoming",
  "Beliefs & Worldview",
  "Identity",
  "Fun & Life",
  "Purpose",
] as const;

const extractRequestSchema = z.object({
  message: z.string().min(1),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().min(1),
      }),
    )
    .optional()
    .default([]),
  existingNodes: z
    .array(
      z.object({
        id: z.string().optional(),
        label: z.string().optional(),
        year: z.number().optional(),
        branch: z.string().optional(),
        desc: z.string().optional(),
      }),
    )
    .optional()
    .default([]),
});

const previewNodeSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1).max(80),
  year: z.number(),
  branch: z.enum(BRANCHES),
  desc: z.string().min(1),
  future: z.boolean(),
});

const extractResponseSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("confident"),
    message: z.string().min(1),
    preview: z.array(previewNodeSchema).min(1).max(12),
    question: z.string().min(1),
  }),
  z.object({
    state: z.literal("uncertain"),
    message: z.string().min(1),
    missing: z.enum(["when", "what", "branch"]),
    question: z.string().min(1),
  }),
  z.object({
    state: z.literal("vague"),
    message: z.string().min(1),
    question: z.string().min(1),
  }),
]);

const SYSTEM_PROMPT = `
ROLE:
You are a thoughtful, warm life coach who listens to what someone says about their life and helps them map it visually.
Your job is to extract structured life map nodes from natural speech, but only when you have enough information to do so confidently.

You are having a conversation. Not filling out a form. Never make the user feel interrogated.

WHAT YOU NEED BEFORE PLACING ANY NODE
Before placing a node on the map you must have ALL THREE:
1) WHAT: clear label for event/belief/decision/chapter (5 words or fewer, noun phrase)
2) WHEN: at minimum a year, or a relative anchor that maps to a known year
3) WHICH BRANCH: must be one of exactly:
Career, Health & Fitness, Finance, Relationships, Living, Who I'm Becoming, Beliefs & Worldview, Identity, Fun & Life, Purpose

If any of these are missing or unclear for a specific event, do NOT include that event in preview yet. Ask ONE specific question to resolve only the unclear part.

MULTI-NODE EXTRACTION
- A single user answer can contain multiple life events. Extract ALL identifiable events.
- If user says several transitions in one answer, return multiple preview nodes (not one).
- Map each event to the best-fitting branch, even if different from the question's branch.
- Infer approximate years from context clues when reasonably grounded (e.g. sequence words, known anchors).
- If a specific event's year or branch is genuinely unclear, ask one clarifying question and still include the clear events.
- Never drop clear events just because one event is unclear.

THREE STATES
STATE confident:
- You have at least one event with what/when/branch
- Show preview of ALL clear events and ask for confirmation
- Never place without confirmation

STATE uncertain:
- You have partial info but one piece missing
- Ask ONE specific question only
- Never ask two questions
- Never guess missing piece

STATE vague:
- Input too general
- Reflect what you heard
- Ask one open question inviting depth

CONNECTION DETECTION
After placing a node, quietly check if it meaningfully connects to existing nodes (same year, cause/effect, related theme).
If meaningful, mention naturally at end of message. Never force it.

RULES
- Never place without confirmation
- Never guess year
- Never invent branch
- Never ask two questions
- Never use labels longer than 5 words
- Never use jargon/clinical language
- Never sound like a form/chatbot

TONE
Warm, curious, unhurried, short responses.
`.trim();

function buildUserPrompt(input: z.infer<typeof extractRequestSchema>) {
  const transcript = input.history
    .map((item) => `${item.role === "assistant" ? "Coach" : "User"}: ${item.text}`)
    .join("\n");

  const existingNodesBlock =
    input.existingNodes.length > 0
      ? input.existingNodes
          .map((node) => {
            const year = node.year ? ` (${node.year})` : "";
            const branch = node.branch ? ` [${node.branch}]` : "";
            const label = node.label ?? "Unknown";
            return `- ${label}${year}${branch}${node.desc ? `: ${node.desc}` : ""}`;
          })
          .join("\n")
      : "(none)";

  return [
    "Conversation transcript so far:",
    transcript || "(no previous messages)",
    "",
    "Latest user message:",
    input.message,
    "",
    "Existing map nodes:",
    existingNodesBlock,
    "",
    "Return JSON with one of states: confident, uncertain, vague.",
    "If confident, include preview with all clear extracted nodes and ask for confirmation.",
    "Prefer multiple preview nodes when multiple events are present.",
  ].join("\n");
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

  let parsed: z.infer<typeof extractRequestSchema>;
  try {
    const body = await request.json();
    const result = extractRequestSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: "Invalid extraction payload." }, { status: 400 });
    }
    parsed = result.data;
  } catch {
    return NextResponse.json({ error: "Invalid extraction payload." }, { status: 400 });
  }

  if (!hasGroqKey()) {
    return NextResponse.json({ error: "GROQ_API_KEY not configured." }, { status: 503 });
  }

  try {
    const raw = await generateStructured<unknown>({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(parsed),
      toolName: "life_map_voice_extraction",
      toolDescription:
        "Extract multi-node structured life-map response in one of the three states: confident, uncertain, vague.",
      schema: {
        type: "object",
        properties: {
          state: { type: "string", enum: ["confident", "uncertain", "vague"] },
          message: { type: "string" },
          preview: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                label: { type: "string" },
                year: { type: "number" },
                branch: { type: "string", enum: BRANCHES },
                desc: { type: "string" },
                future: { type: "boolean" },
              },
              required: ["label", "year", "branch", "desc", "future"],
              additionalProperties: false,
            },
          },
          missing: { type: "string", enum: ["when", "what", "branch"] },
          question: { type: "string" },
        },
        required: ["state", "message", "question"],
        additionalProperties: false,
      },
      maxTokens: 900,
    });

    const structured = extractResponseSchema.safeParse(raw);
    if (!structured.success) {
      console.error("[POST /api/life-map/extract] invalid model response", structured.error.flatten());
      return NextResponse.json({ error: "Invalid model response shape." }, { status: 502 });
    }

    return NextResponse.json(structured.data);
  } catch (err) {
    if (err instanceof GroqNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    const details = getErrorDetails(err);
    console.error("[POST /api/life-map/extract] Groq call failed", details, err);
    return NextResponse.json({ error: `Extraction unavailable: ${details.message}` }, { status: 502 });
  }
}
