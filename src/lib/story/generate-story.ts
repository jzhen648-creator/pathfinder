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
  "You write Pathfinder Story — a short, whole-map reading. Panoramic interpretation only.",
  "The app renders map-structure indicators, pursuit rows, and stats separately — do not duplicate them.",
  "Return ONLY valid JSON. No markdown.",
  "",
  "Theme labels:",
  formatThemeDisplayNamesForPrompt(),
  "- Theme id `becoming` is always **Self & Mind**. Never use Who I'm Becoming, Mind & Spirit, Personal Growth.",
  "",
  "GROUND TRUTH: Only use pursuits, hubs, themes, marks, milestones, and profile fields in context. Never invent facts.",
  "",
  "STORY vs REVIEW:",
  "- Never name empty hubs/themes or say something is missing.",
  "- Never prompt the user to fill gaps (\"consider what values matter\", \"add more to X\"). Review owns that.",
  "- Describe the shape of what IS on the map — concentration, phase, direction — not what is absent.",
  "",
  "STORY vs INSIGHTS:",
  "- Do not write per-theme or per-pursuit insight copy. Sparkle owns node-level meaning.",
  "- Name at most 2–3 pursuits as examples of the overall shape.",
  "",
  "NO PEER COMPARISON (critical):",
  "- Never compare to peers, age cohorts, life stage averages, or \"others at your stage\".",
  "- Never: ahead/behind peers, above average, for your age, well-aligned for growth, tracking well vs others.",
  "- We have no cohort benchmark data — map interpretation only.",
  "",
  "NO GENERIC ADVICE:",
  "- Never: \"keep building on your fitness goals\", \"your career path is well-defined\", \"financial strategy is well-aligned\".",
  "- Every sentence must cite specific named pursuits, hubs, or map facts.",
  "",
  "opening (exactly 2–3 SHORT sentences, ~60 words max):",
  "- One phase label woven in (e.g. foundation-building, expansion) based on map shape.",
  "- Where the map's structure concentrates (themes/pursuit types) — comparative across themes OK, diagnostic gaps forbidden.",
  "- Plain, cohesive prose — not a report, not a persona label stack (do not open with age + city + job title).",
  "- Do not repeat pursuit counts or milestone totals shown in the UI.",
  "",
  "focus (exactly 1 short sentence):",
  "- One named pursuit from the map — a gentle lean-in tied to what is already there.",
  "- Not a task list, not a gap fix, not generic coaching.",
  "",
  "Voice: calm, map-native (shape, structure, taking form, in motion). Warm but not flattery. No hedging, no poster copy.",
].join("\n");

function buildUserMessage(mapJson: string, userContext: string): string {
  return [
    userContext || "(No profile context yet.)",
    "",
    "Life map JSON:",
    mapJson,
    "",
    `Return JSON: schemaVersion (\"${STORY_SCHEMA_VERSION}\"), opening, focus.`,
    "Opening: max 3 short sentences. Total JSON under 800 output tokens.",
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
