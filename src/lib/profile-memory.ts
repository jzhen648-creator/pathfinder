import type { ProfileFactCategory, ProfileFactSource } from "@prisma/client";
import { z } from "zod";
import { generateJsonCompletion, GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";

export const PROFILE_FACT_CATEGORIES = [
  "personal",
  "career",
  "financial",
  "health",
  "relationships",
  "preferences",
  "strengths",
] as const satisfies readonly ProfileFactCategory[];

export const profileFactCategorySchema = z.enum(PROFILE_FACT_CATEGORIES);

export const profileFactInputSchema = z.object({
  category: profileFactCategorySchema,
  key: z.string().trim().min(1).max(80).optional(),
  value: z.string().trim().min(1).max(500),
});

const extractedFactSchema = z.object({
  category: profileFactCategorySchema,
  key: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(500),
  confidence: z.coerce.number().min(0).max(1).optional(),
});

const extractionResponseSchema = z.object({
  facts: z.array(extractedFactSchema).max(40),
});

export type ClassifiedProfileFact = z.infer<typeof extractedFactSchema>;

export const classifyProfileTextSchema = z.object({
  text: z.string().trim().min(1).max(2_000),
});

type ProfileFactRow = {
  id: string;
  category: ProfileFactCategory;
  key: string;
  value: string;
  confidence: number | null;
  source: ProfileFactSource;
  createdAt: Date;
  updatedAt: Date;
};

export type SerializedProfileFact = {
  id: string;
  category: ProfileFactCategory;
  key: string;
  value: string;
  confidence: number | null;
  source: ProfileFactSource;
  createdAt: string;
  updatedAt: string;
};

export type GroupedProfileFacts = Record<ProfileFactCategory, SerializedProfileFact[]>;

const SYSTEM_PROMPT = [
  "You extract durable profile-memory facts for Pathfinder, a mobile-first life mapping app.",
  'Return ONLY JSON: {"facts":[{"category":"personal|career|financial|health|relationships|preferences|strengths","key":"stable_snake_case_key","value":"concise fact","confidence":0.0-1.0}]}',
  "",
  "Profile facts are background context only.",
  "Never create pursuits, marks, milestones, deadlines, branches, or map nodes.",
  "Extract stable facts that would help future personalization, suggestions, or insights.",
  "Do not extract temporary tasks, one-off todos, or vague aspirations unless they reveal a stable preference, situation, constraint, or strength.",
  "Extract profile facts from peripheral mentions too — if the user mentions something in passing (age, language, pet, hobby, life situation) extract it even if it was not the main topic. Peripheral mentions are often the most valuable profile signals.",
  "Deduplicate against existing facts. If new input updates or contradicts an existing fact, return the same category/key with the newer value.",
  "Use concise values. Prefer human-readable phrases over full sentences.",
  "Use low confidence when uncertain. If there are no useful facts, return an empty facts array.",
].join("\n");

const MANUAL_CLASSIFY_PROMPT = [
  SYSTEM_PROMPT,
  "",
  "The user is intentionally adding profile memory in their own words (typed or spoken).",
  "Split one message into multiple facts when appropriate (e.g. location, languages, role).",
  "Assign the best category and a stable snake_case key for each fact automatically.",
  "If the message is too vague, empty, or contains no durable profile signal, return {\"facts\":[]}.",
  "Never invent facts that are not supported by the text.",
].join("\n");

export function normalizeProfileFactKey(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return normalized || "profile_fact";
}

export function serializeProfileFact(fact: ProfileFactRow): SerializedProfileFact {
  return {
    id: fact.id,
    category: fact.category,
    key: fact.key,
    value: fact.value,
    confidence: fact.confidence,
    source: fact.source,
    createdAt: fact.createdAt.toISOString(),
    updatedAt: fact.updatedAt.toISOString(),
  };
}

export function groupProfileFacts(rows: ProfileFactRow[]): GroupedProfileFacts {
  const grouped: GroupedProfileFacts = {
    personal: [],
    career: [],
    financial: [],
    health: [],
    relationships: [],
    preferences: [],
    strengths: [],
  };
  for (const row of rows) {
    grouped[row.category].push(serializeProfileFact(row));
  }
  return grouped;
}

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  return match?.[1]?.trim() ?? trimmed;
}

async function parseFactsFromModelJson(raw: string): Promise<ClassifiedProfileFact[]> {
  let json: unknown;
  try {
    json = JSON.parse(stripJsonFence(raw));
  } catch {
    throw new Error("Profile extraction returned invalid JSON.");
  }

  const parsed = extractionResponseSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(issue?.message ?? "Profile extraction response did not match expected shape.");
  }

  return parsed.data.facts.map((fact) => ({
    ...fact,
    key: normalizeProfileFactKey(fact.key),
  }));
}

function buildManualClassifyUserMessage(input: {
  text: string;
  existingFacts: ProfileFactRow[];
}) {
  const existing = input.existingFacts.length
    ? input.existingFacts
        .map((fact) => `- ${fact.category}.${fact.key}: ${fact.value}`)
        .join("\n")
    : "(none)";

  return [
    "Existing profile facts:",
    existing,
    "",
    "User message to classify:",
    input.text.slice(0, 2_000),
  ].join("\n");
}

function buildExtractionUserMessage(input: {
  entries: Array<{ createdAt: Date; themeId: string; inputText: string }>;
  existingFacts: ProfileFactRow[];
}) {
  const existing = input.existingFacts.length
    ? input.existingFacts
        .map((fact) => `- ${fact.category}.${fact.key}: ${fact.value} (${fact.source})`)
        .join("\n")
    : "(none)";

  const entries = input.entries
    .map((entry, index) =>
      [
        `Entry ${index + 1}`,
        `Theme: ${entry.themeId}`,
        `Created: ${entry.createdAt.toISOString()}`,
        "Raw Stream:",
        entry.inputText.slice(0, 8_000),
      ].join("\n"),
    )
    .join("\n\n---\n\n");

  return [
    "Existing profile facts:",
    existing,
    "",
    "New Stream entries to process:",
    entries,
    "",
    "Extract only stable profile-memory facts. Include useful peripheral mentions.",
  ].join("\n");
}

export async function classifyProfileFactsFromText(
  userId: string,
  text: string,
): Promise<ClassifiedProfileFact[]> {
  if (!hasGeminiKey()) {
    throw new GeminiNotConfiguredError("GEMINI_API_KEY not configured.");
  }

  const existingFacts = await prisma.profileFact.findMany({
    where: { userId },
    orderBy: [{ category: "asc" }, { updatedAt: "desc" }],
  });

  const raw = await generateJsonCompletion({
    system: MANUAL_CLASSIFY_PROMPT,
    user: buildManualClassifyUserMessage({ text, existingFacts }),
    maxTokens: 1024,
    temperature: 0.15,
  });

  return parseFactsFromModelJson(raw);
}

export async function upsertProfileFactsForUser(
  userId: string,
  facts: ClassifiedProfileFact[],
  source: "user_manual" = "user_manual",
) {
  let createdFacts = 0;
  let updatedFacts = 0;
  let skippedManualFacts = 0;

  await prisma.$transaction(async (tx) => {
    for (const fact of facts) {
      const key = normalizeProfileFactKey(fact.key);
      const existing = await tx.profileFact.findUnique({
        where: {
          userId_category_key: {
            userId,
            category: fact.category,
            key,
          },
        },
      });

      if (existing?.source === "user_manual" && source !== "user_manual") {
        skippedManualFacts += 1;
        continue;
      }

      if (existing) {
        await tx.profileFact.update({
          where: { id: existing.id },
          data: {
            value: fact.value,
            confidence: fact.confidence ?? null,
            ...(source === "user_manual" ? { source: "user_manual", confidence: null } : {}),
          },
        });
        updatedFacts += 1;
      } else {
        await tx.profileFact.create({
          data: {
            userId,
            category: fact.category,
            key,
            value: fact.value,
            confidence: source === "user_manual" ? null : (fact.confidence ?? null),
            source,
          },
        });
        createdFacts += 1;
      }
    }
  });

  return { createdFacts, updatedFacts, skippedManualFacts };
}

export async function getGroupedProfileFacts(userId: string): Promise<GroupedProfileFacts> {
  const facts = await prisma.profileFact.findMany({
    where: { userId },
    orderBy: [{ category: "asc" }, { updatedAt: "desc" }],
  });
  return groupProfileFacts(facts);
}

/** Stream-based extraction retired — manual classify/batch upsert remains. */
export async function extractProfileFactsForUser(_userId: string) {
  return {
    processedEntries: 0,
    createdFacts: 0,
    updatedFacts: 0,
    skippedManualFacts: 0,
  };
}
