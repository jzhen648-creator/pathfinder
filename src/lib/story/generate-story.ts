import { formatMapContext } from "@/lib/ai/format-map-context";
import { formatUserContext } from "@/lib/ai/format-user-context";
import { formatThemeDisplayNamesForPrompt } from "@/lib/life-areas";
import { generateJsonCompletion, GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";
import { sanitizeStoryGeneration } from "./sanitize-story";
import {
  STORY_SCHEMA_VERSION,
  storyGenerationSchema,
  type StoryGenerationResult,
} from "./story-types";

export class StoryGenerationResponseError extends Error {
  status = 503;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StoryGenerationResponseError";
  }
}

export const STORY_SYSTEM_PROMPT = [
  "You write the Insights tab reading for Pathfinder — one short, whole-map reflection for the mobile Insights tab.",
  "This is the ONLY content on that tab. The Map shows pursuits spatially; Timeline shows dated events and significance filters; per-pursuit ✦ insights on the map go deeper on individual pursuits.",
  "Do not duplicate those surfaces: no task lists, no deadline roll-ups, no status buckets, no pursuit inventory, no milestone checklists, no per-pursuit sparkle copy.",
  "Return ONLY valid JSON. No markdown.",
  "",
  "Theme labels:",
  formatThemeDisplayNamesForPrompt(),
  "- Theme id `becoming` is always **Self & Mind**. Never use Who I'm Becoming, Mind & Spirit, Personal Growth.",
  "",
  "GROUND TRUTH: Only use pursuits, hubs, themes, marks, milestones, and profile fields in context. Never invent facts.",
  "- Marks are life facts and events that enrich each theme. Each theme includes a marks array with titles and dates when known.",
  "- Pursuit status (Active, Maintaining, Paused, Complete), iconName, shortLabel, living description, and significance (1–5) are in context.",
  "- Hub section labels and hub-scoped marks provide category and life-fact background.",
  "- Weave completions, what is actively carrying weight, and meaningful pauses into one narrative — not as labeled sections.",
  "- When naming pursuits, prefer significance 4–5; name at most 2–4 total as examples of the overall shape.",
  "",
  "seasonRead (3–5 sentences, ~100–140 words):",
  "- One reflective reading of the whole map — patterns across themes, momentum, tension, recent wins, what is paused.",
  "- Calm, specific, not prescriptive. No poster copy, no life-coach framing, no 'where you are' clichés.",
  "- Weave in how career, finances, health, relationships, and personal themes interact when data supports it.",
  "- When age AND location are known in User context, weave in one holistic benchmark (typical patterns, life stage, not a separate section).",
  "  Use name/age/location inside the logic — not as a decorative prefix.",
  "  Use approximate language (roughly, typically, around). Omit benchmark clause if age OR location is unknown.",
  "- Do not repeat pursuit counts, status counts, or milestone totals the UI shows elsewhere.",
  "- No peer-comparison template filler (\"valued in a competitive market\") without a concrete fact.",
  "",
  "Voice: direct, informed advisor — calm and map-native. Warm but not flattery. No hedging.",
].join("\n");

function buildUserMessage(mapJson: string, userContext: string): string {
  return [
    userContext || "(No profile context yet.)",
    "",
    "Life map JSON:",
    mapJson,
    "",
    `Return JSON: schemaVersion (\"${STORY_SCHEMA_VERSION}\"), seasonRead.`,
    "Total JSON under 800 output tokens.",
  ].join("\n");
}

function stripMarkdownFence(raw: string): string {
  const t = raw.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(t);
  return m?.[1]?.trim() ?? t;
}

export async function generateStory(userId: string): Promise<StoryGenerationResult> {
  if (!hasGeminiKey()) {
    throw new GeminiNotConfiguredError();
  }

  const [mapContext, userContext] = await Promise.all([
    formatMapContext(userId, { excludeAbandoned: true }),
    formatUserContext(userId),
  ]);

  const raw = await generateJsonCompletion({
    system: STORY_SYSTEM_PROMPT,
    user: buildUserMessage(JSON.stringify(mapContext, null, 2), userContext),
    maxTokens: 2048,
    temperature: 0.5,
    queueKey: userId,
  });

  let json: unknown;
  try {
    json = JSON.parse(stripMarkdownFence(raw)) as unknown;
  } catch (err) {
    console.error("[story] Gemini returned invalid/truncated JSON", { raw });
    throw new StoryGenerationResponseError(
      "Story generation returned incomplete JSON. Please try again.",
      { cause: err },
    );
  }

  const parsed = storyGenerationSchema.safeParse(json);
  if (!parsed.success) {
    console.error("[story] Gemini returned JSON with invalid story shape", {
      issues: parsed.error.issues,
      raw,
    });
    throw new StoryGenerationResponseError(
      `Story generation returned an invalid response shape: ${
        parsed.error.issues[0]?.message ?? "unknown"
      }`,
    );
  }

  return sanitizeStoryGeneration(parsed.data);
}
