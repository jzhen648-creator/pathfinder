import { generateJsonCompletion } from "@/lib/gemini";
import { buildCreateClarifierSystemPrompt } from "@/lib/pursuit/clarifier-prompt-blocks";
import {
  filterClarifiersAgainstMilestones,
  type MilestoneGroundingInput,
} from "@/lib/pursuit/filter-clarifiers-against-milestones";
import {
  clarifierSchema,
  type Clarifier,
} from "@/lib/pursuit/pursuit-enrich-types";

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
  timelineStart?: string | null;
  /** When COMPLETE — user is adding a historical record, not an active pursuit. */
  status?: "ACTIVE" | "COMPLETE" | null;
  milestones?: MilestoneGroundingInput[];
  userContext: string;
  queueKey?: string | null;
};

export async function suggestCreateClarifier(
  input: SuggestCreateClarifierInput,
): Promise<Clarifier | null> {
  const title = input.title.trim();
  if (title.length < 3) return null;
  if (input.status === "COMPLETE") return null;

  const milestones = input.milestones ?? [];
  const completedMilestones = milestones.filter((m) => m.completed && m.title.trim());

  const user = [
    input.userContext ? `User profile:\n${input.userContext}` : "(No profile context yet.)",
    "",
    "New chapter (not on map yet):",
    JSON.stringify(
      {
        title,
        theme: input.themeLabel,
        category: input.categoryLabel,
        deadline: input.deadline?.trim() || null,
        timelineStart: input.timelineStart?.trim() || null,
        status: input.status ?? "ACTIVE",
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
          "Completed milestones already on this chapter — do not ask what they prove or offer contradicting options.",
        ]
      : []),
    "",
    'Return JSON: { "clarifier": { "id", "prompt", "options", "kind"?: "clarify"|"retrospective" } | null }',
  ].join("\n");

  const raw = await generateJsonCompletion({
    system: buildCreateClarifierSystemPrompt(),
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
