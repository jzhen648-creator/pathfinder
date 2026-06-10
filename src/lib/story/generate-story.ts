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
  "You write the Insights tab season read for Pathfinder — a short, whole-map reflection for the mobile Insights tab.",
  "The app renders a pursuit ledger, timeline, and per-pursuit sparkle insights separately — do not duplicate them.",
  "Return ONLY valid JSON. No markdown.",
  "",
  "Theme labels:",
  formatThemeDisplayNamesForPrompt(),
  "- Theme id `becoming` is always **Self & Mind**. Never use Who I'm Becoming, Mind & Spirit, Personal Growth.",
  "",
  "GROUND TRUTH: Only use pursuits, hubs, themes, marks, milestones, and profile fields in context. Never invent facts.",
  "- Marks are life facts and events that enrich each theme. Each theme includes a marks array with titles and dates when known.",
  "- Pursuit status (Active, Maintaining, On hold, Complete) is in context — reflect pauses and completions when they shape the map.",
  "- Name at most 2–3 pursuits as examples of the overall shape — not an exhaustive list.",
  "",
  "seasonRead (2–4 sentences, ~80–120 words):",
  "- Reflective season read — where this person is in their life map right now. Calm, specific, not prescriptive.",
  "- Weave in how career, finances, health, relationships, and personal themes interact on the map when data supports it.",
  "- When age AND location are known in User context, weave in one holistic benchmark (typical patterns, life stage, not a separate section).",
  "  Use name/age/location inside the logic — not as a decorative prefix.",
  "  Use approximate language (roughly, typically, around). Omit benchmark clause if age OR location is unknown.",
  "- Do not write per-pursuit sparkle insight copy. Do not produce task lists or chapter timelines.",
  "- Do not repeat pursuit counts or milestone totals the UI shows elsewhere.",
  "- No peer-comparison template filler (\"valued in a competitive market\") without a concrete fact.",
  "",
  "Voice: direct, informed advisor — calm and map-native. Warm but not flattery. No hedging, no poster copy.",
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
    formatMapContext(userId, { excludeOnHold: true }),
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
