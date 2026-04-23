import { z } from "zod";
import {
  GroqNotConfiguredError,
  generateStructured,
  hasGroqKey,
} from "@/lib/groq";

const actionRoadmapSchema = z.object({
  goalType: z.literal("action"),
  milestones: z.array(
    z.object({
      title: z.string().min(1),
      description: z.string().min(1),
      quickWins: z.array(
        z.object({
          title: z.string().min(1),
          dailyTasks: z.array(z.object({ title: z.string().min(1) })).min(2).max(5),
        }),
      ).length(4),
    }),
  ).length(5),
});

const outcomeRoadmapSchema = z.object({
  goalType: z.literal("outcome"),
  finance: z
    .object({
      // Optional because not every outcome goal has a numeric money target.
      // Models occasionally emit 0/"0"/null when no target exists; normalize
      // those to undefined so validation does not hard-fail goal creation.
      targetAmount: z.preprocess((value) => {
        if (value === null || value === undefined || value === "") return undefined;
        const num = typeof value === "string" ? Number(value) : value;
        if (typeof num !== "number" || Number.isNaN(num) || num <= 0) return undefined;
        return num;
      }, z.number().positive().optional()),
    })
    .optional(),
  milestones: z.array(
    z.object({
      title: z.string().min(1),
      description: z.string().min(1),
      quickWins: z.array(
        z.object({
          title: z.string().min(1),
          checkpoints: z.array(z.object({ title: z.string().min(1) })).min(2).max(3),
        }),
      ).length(4),
    }),
  ).length(5),
});

const roadmapSchema = z.union([actionRoadmapSchema, outcomeRoadmapSchema]);

export type GeneratedRoadmap = z.infer<typeof roadmapSchema>;

export class RoadmapGenerationError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "RoadmapGenerationError";
  }
}

type RoadmapInput = {
  title: string;
  description: string;
  lifeArea: string;
  startingPoint: string;
  biggestObstacle: string;
  hoursPerWeek: string;
  deadline: string;
  profileContext?: string;
};

/**
 * Deterministic, domain-aware fallback roadmap used when the AI provider is
 * unavailable (no credits, rate-limited, outage). Always returns the same
 * shape the AI version produces, so downstream DB writes don't branch.
 *
 * The copy references the actual goal title + life area so it is not purely
 * generic. Callers should also set `Goal.aiGenerated = false` so the UI can
 * surface "regenerate with AI" affordances.
 */
export function buildFallbackRoadmap(input: RoadmapInput): GeneratedRoadmap {
  const topic = input.title.trim() || input.lifeArea || "your goal";
  const area = input.lifeArea.trim() || "this life area";

  const phases: Array<{ title: string; description: string }> = [
    {
      title: `Week 1–2 · Clarify your ${topic} starting line`,
      description: `Set a measurable baseline for ${topic} and remove the biggest ambiguity in ${area} so every later milestone has a yardstick.`,
    },
    {
      title: `Week 3–4 · Build core habits for ${topic}`,
      description: `Install the two or three repeated behaviours that compound over the plan. Make them boring, short, and non-negotiable.`,
    },
    {
      title: `Month 2 · First visible proof in ${area}`,
      description: `Ship or achieve the first thing you can point at as evidence that ${topic} is moving, even if it is small.`,
    },
    {
      title: `Month 3 · Scale what is working`,
      description: `Double down on the 20% of actions that produced the first results and drop the noise. Tighten the feedback loop.`,
    },
    {
      title: `Final push · Lock in ${topic}`,
      description: `Convert progress into something durable: a result, a credential, a system, or a relationship that keeps ${topic} alive past the deadline.`,
    },
  ];

  const actionQuickWinTemplates = [
    "Clarify what 'done' actually looks like",
    "Remove the biggest friction blocking progress",
    "Put in a daily repeatable practice",
    "Share progress with someone who holds you accountable",
  ];
  const actionDailyTaskTemplates = [
    `Spend 20 minutes on ${topic} today`,
    `Write one line reflecting on today's ${topic} progress`,
    `Review tomorrow's single most important ${topic} action`,
  ];

  const outcomeQuickWinTemplates = [
    "Define the measurable target in one sentence",
    "Identify and contact the person who unblocks the next step",
    "Complete the single highest-leverage task for this phase",
    "Review progress against target and adjust plan",
  ];
  const outcomeCheckpointTemplates = [
    "Draft the artefact or decision needed",
    "Get one external review or validation",
    "Submit / ship / finalise the item",
  ];

  // Use "outcome" goalType when the description/title implies a measurable
  // target, otherwise default to "action" (habit / ongoing pursuit).
  const haystack = `${input.title} ${input.description}`.toLowerCase();
  const looksLikeOutcome =
    /\b(save|raise|reach|earn|hit|complete|finish|launch|publish|pass|buy|reach|£|\$|€|usd|gbp|eur|kg|lbs|%|target|by |before )/i.test(
      haystack,
    );

  if (looksLikeOutcome) {
    const outcome: z.infer<typeof outcomeRoadmapSchema> = {
      goalType: "outcome",
      milestones: phases.map((phase) => ({
        title: phase.title,
        description: phase.description,
        quickWins: outcomeQuickWinTemplates.map((qw) => ({
          title: qw,
          checkpoints: outcomeCheckpointTemplates.map((cp) => ({ title: cp })),
        })),
      })) as z.infer<typeof outcomeRoadmapSchema>["milestones"],
    };
    return outcome;
  }

  const action: z.infer<typeof actionRoadmapSchema> = {
    goalType: "action",
    milestones: phases.map((phase) => ({
      title: phase.title,
      description: phase.description,
      quickWins: actionQuickWinTemplates.map((qw) => ({
        title: qw,
        dailyTasks: actionDailyTaskTemplates.map((dt) => ({ title: dt })),
      })),
    })) as z.infer<typeof actionRoadmapSchema>["milestones"],
  };
  return action;
}

// Groq JSON-mode generation works best with a flattened top-level schema, so we
// describe a single flattened schema where daily tasks are optional and
// checkpoints are optional — the model fills whichever matches the goalType
// it chose. We then validate strictly with Zod on the server.
const ROADMAP_TOOL_SCHEMA = {
  type: "object",
  properties: {
    goalType: {
      type: "string",
      enum: ["action", "outcome"],
      description:
        "'action' for skill-building/habit/ongoing pursuits (uses dailyTasks). 'outcome' for a measurable one-time target (uses checkpoints).",
    },
    finance: {
      type: "object",
      description: "Only include for outcome goals with a numeric target.",
      properties: {
        targetAmount: { type: "number" },
      },
      additionalProperties: false,
    },
    milestones: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          quickWins: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                dailyTasks: {
                  type: "array",
                  minItems: 2,
                  maxItems: 5,
                  description:
                    "Use for action-type goals. Each item { title }.",
                  items: {
                    type: "object",
                    properties: { title: { type: "string" } },
                    required: ["title"],
                  },
                },
                checkpoints: {
                  type: "array",
                  minItems: 2,
                  maxItems: 3,
                  description:
                    "Use for outcome-type goals. Each item { title }.",
                  items: {
                    type: "object",
                    properties: { title: { type: "string" } },
                    required: ["title"],
                  },
                },
              },
              required: ["title"],
            },
          },
        },
        required: ["title", "description", "quickWins"],
      },
    },
  },
  required: ["goalType", "milestones"],
} as const;

const SYSTEM_PROMPT = [
  "You are an expert coach who optimizes for momentum, not perfection.",
  "Core philosophy: every early task should be something the user can do TODAY with no money, no appointments, and no external dependencies.",
  "Assume the user starts with only a phone, internet access, and their own body/time.",
  "",
  "Rules:",
  "- First decide goalType: 'action' (skill-building, habit change, ongoing pursuit — uses dailyTasks) vs 'outcome' (a measurable target reached once — uses checkpoints).",
  "- Return exactly 5 milestones in chronological order, each with exactly 4 quick wins.",
  "- For every quick win, include EITHER dailyTasks (when goalType='action') OR checkpoints (when goalType='outcome'), never both.",
  "- For outcome goals, each quick win must contain 2-3 checkpoints maximum (never more than 3).",
  "- Milestone 1 must be completable in the first week with zero setup cost.",
  "- Early milestones (especially 1-2) must avoid tasks that require booking, paying, waiting, or third-party approvals unless legally required.",
  "- No professional consultations unless the goal literally requires licensing/compliance steps (e.g. FCA for mortgage broking). Do NOT suggest: 'consult a nutritionist', 'hire a personal trainer', 'see a financial advisor' in normal cases.",
  "- Bias toward doing over researching. Prefer immediate execution actions (e.g. track, draft, record, practice, submit) over open-ended research.",
  "- Every task/checkpoint must be one single action doable in one sitting and calendar-ready for tomorrow morning.",
  "- Every task/checkpoint title must start with a strong action verb (e.g. Log, Do, Write, Record, Complete, Register, Submit, Download, Call, Email, Watch).",
  "- Avoid weak/open-ended starts like 'Invest in', 'Gather', 'Explore', 'Think about', 'Work on'.",
  "- Never include generic self-help tasks (e.g. 'Create a vision board', 'Subscribe to a magazine', 'Stay motivated').",
  "- Keep tasks concrete and specific to the domain/context. Example style: 'Download MyFitnessPal and log your first day of meals'.",
  "- Use named entities only when they reduce ambiguity and are actionable now (e.g. CeMAP, FCA Register, AMI, GOV.UK guidance, free tools/apps).",
  "- Every title must reference the user's actual domain, location, field, or subject. Never write placeholders like 'Milestone 1', 'Quick Win 1', 'Task 1', 'Step 1', 'Phase 1'.",
  "- Milestone descriptions must be 1–2 sentences explaining what must be completed in that phase and why it matters next.",
  "- Task mix must vary inside each milestone: include a blend of practical action types (execution, practice, lightweight research, outreach) while keeping friction low.",
  "- If the goal is financial or has a numeric target, set finance.targetAmount when inferable.",
  "- If context is thin, infer pragmatic low-friction steps from the title/life area instead of generic advice.",
].join("\n");

export async function generateGoalRoadmap(input: {
  title: string;
  description: string;
  lifeArea: string;
  startingPoint: string;
  biggestObstacle: string;
  hoursPerWeek: string;
  deadline: string;
  profileContext?: string;
}) {
  if (!hasGroqKey()) {
    throw new RoadmapGenerationError(
      "GROQ_API_KEY is not configured. Set it in .env to generate AI-powered roadmaps.",
    );
  }

  const userPrompt = `Goal title: ${input.title}
Description / reason: ${input.description}
Life area: ${input.lifeArea}
Current starting point: ${input.startingPoint}
Biggest obstacle: ${input.biggestObstacle}
Time available per week: ${input.hoursPerWeek}
Deadline: ${input.deadline}
Personal profile context: ${input.profileContext ?? "Not provided"}`;

  let rawJson: unknown;
  try {
    rawJson = await generateStructured<unknown>({
      system: SYSTEM_PROMPT,
      user: userPrompt,
      toolName: "submit_goal_roadmap",
      toolDescription:
        "Submit a structured roadmap with exactly 5 milestones and 4 quick wins each.",
      schema: ROADMAP_TOOL_SCHEMA,
      maxTokens: 4096,
    });
    // Keep a full trace of what the model generated so we can distinguish
    // prompt-quality issues from UI mapping/storage issues.
    console.info(
      "[milestone-generator] Raw AI roadmap payload:",
      JSON.stringify(rawJson, null, 2),
    );
  } catch (err) {
    if (err instanceof GroqNotConfiguredError) {
      throw new RoadmapGenerationError(err.message, err);
    }
    console.error("[milestone-generator] Groq call failed:", err);
    throw new RoadmapGenerationError(
      "Groq roadmap generation failed.",
      err,
    );
  }

  // Defensive normalization: some models emit `finance: { targetAmount: 0 }`
  // or `finance: {}` for non-finance goals. Strip that object entirely so the
  // roadmap can still validate and persist.
  if (rawJson && typeof rawJson === "object" && !Array.isArray(rawJson)) {
    const obj = rawJson as { finance?: { targetAmount?: unknown } };
    const rawAmount = obj.finance?.targetAmount;
    const normalizedAmount =
      rawAmount === null || rawAmount === undefined || rawAmount === ""
        ? undefined
        : typeof rawAmount === "string"
          ? Number(rawAmount)
          : rawAmount;
    if (
      !obj.finance ||
      typeof normalizedAmount !== "number" ||
      Number.isNaN(normalizedAmount) ||
      normalizedAmount <= 0
    ) {
      delete obj.finance;
    }
  }

  const parseResult = roadmapSchema.safeParse(rawJson);
  if (!parseResult.success) {
    console.error(
      "[milestone-generator] Roadmap failed schema validation:",
      parseResult.error.issues,
      "raw:",
      rawJson,
    );
    throw new RoadmapGenerationError(
      "Groq response did not match the expected roadmap schema.",
      parseResult.error,
    );
  }

  return parseResult.data;
}
