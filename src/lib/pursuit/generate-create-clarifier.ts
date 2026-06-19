import { generateJsonCompletion } from "@/lib/gemini";
import { CREATE_CLARIFIER_MILESTONE_GROUNDING } from "@/lib/pursuit/clarifier-prompt-blocks";
import {
  filterClarifiersAgainstMilestones,
  type MilestoneGroundingInput,
} from "@/lib/pursuit/filter-clarifiers-against-milestones";
import {
  clarifierSchema,
  type Clarifier,
} from "@/lib/pursuit/pursuit-enrich-types";

const CREATE_CLARIFIER_SYSTEM = [
  "You suggest ONE optional quick question for someone creating a new pursuit on their life map.",
  "Return ONLY valid JSON: { \"clarifier\": { \"id\": string, \"prompt\": string, \"options\": string[] } | null }.",
  "",
  CREATE_CLARIFIER_MILESTONE_GROUNDING,
  "",
  "When to return null:",
  "- Title is already fully specific (amount, deadline, and outcome all clear)",
  "- No domain-specific detail would meaningfully change how this pursuit should be read",
  "- Completed milestones already answer every plausible question",
  "",
  "When to return a clarifier:",
  "- Ask about the domain-specific detail that would MOST change how this pursuit should be understood",
  "- Use world knowledge: credit cards, mortgages, races, qualifications, ISAs, weddings, etc.",
  "- Title-disambiguation is allowed when the title alone is ambiguous",
  "",
  "RULES:",
  "- Exactly 0 or 1 clarifier",
  "- 3–4 specific, plausible answer options — not generic Yes/No/Not sure",
  "- Concrete answers only — not open reflection (\"How do you feel?\")",
  "- NEVER ask how one pursuit relates to another",
  "- NEVER ask the user to evaluate their motivation or commitment",
  "",
  "RELATIONSHIP QUESTIONS — DO NOT GENERATE:",
  '- Never ask how one pursuit relates to another ("How does X relate to Y?")',
  "- Never ask whether pursuits support, compete, or overlap",
].join("\n");

function stripMarkdownFence(raw: string): string {
  const trimmed = raw.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}

function slugFromPrompt(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return slug || "create-qq";
}

function normalizeClarifier(raw: unknown): Clarifier | null {
  if (raw == null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const prompt = typeof record.prompt === "string" ? record.prompt : "";
  if (!prompt.trim()) return null;
  const withId = {
    ...record,
    id:
      typeof record.id === "string" && record.id.trim()
        ? record.id.trim()
        : slugFromPrompt(prompt),
  };
  const parsed = clarifierSchema.safeParse(withId);
  return parsed.success ? parsed.data : null;
}

export type SuggestCreateClarifierInput = {
  title: string;
  themeLabel: string;
  categoryLabel: string;
  deadline?: string | null;
  milestones?: MilestoneGroundingInput[];
  userContext: string;
  queueKey?: string | null;
};

export async function suggestCreateClarifier(
  input: SuggestCreateClarifierInput,
): Promise<Clarifier | null> {
  const title = input.title.trim();
  if (title.length < 3) return null;

  const milestones = input.milestones ?? [];
  const completedMilestones = milestones.filter((m) => m.completed && m.title.trim());

  const user = [
    input.userContext ? `User profile:\n${input.userContext}` : "(No profile context yet.)",
    "",
    "New pursuit (not on map yet):",
    JSON.stringify(
      {
        title,
        theme: input.themeLabel,
        category: input.categoryLabel,
        deadline: input.deadline?.trim() || null,
        ...(milestones.length > 0
          ? {
              milestones: milestones.map((m) => ({
                title: m.title,
                completed: m.completed,
              })),
            }
          : {}),
      },
      null,
      2,
    ),
    ...(completedMilestones.length > 0
      ? [
          "",
          "Completed milestones already on this pursuit — do not ask what they prove or offer contradicting options.",
        ]
      : []),
    "",
    'Return JSON: { "clarifier": { "id", "prompt", "options" } | null }',
  ].join("\n");

  const raw = await generateJsonCompletion({
    system: CREATE_CLARIFIER_SYSTEM,
    user,
    maxTokens: 512,
    temperature: 0.4,
    queueKey: input.queueKey,
  });

  let json: unknown;
  try {
    json = JSON.parse(stripMarkdownFence(raw));
  } catch {
    throw new Error("Create clarifier response was not valid JSON.");
  }

  const clarifierRaw = (json as { clarifier?: unknown }).clarifier;
  const clarifier = normalizeClarifier(clarifierRaw);
  if (!clarifier) return null;

  const filtered = filterClarifiersAgainstMilestones([clarifier], milestones);
  return filtered[0] ?? null;
}
