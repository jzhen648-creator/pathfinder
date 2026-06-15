import { formatMapContext, type FormattedMapContext } from "@/lib/ai/format-map-context";
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

const STORY_PROMPT_BASE = [
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
  "",
  "VERBATIM TITLES (all map sizes): Refer to pursuits by their exact title as written in context.",
  "- \"£500,000 ISA\" must stay \"£500,000 ISA\" — never \"a significant ISA\", \"your savings goal\", or any paraphrase.",
  "",
  "BANNED PHRASES (all map sizes): Never use filler such as:",
  "- \"it will be interesting to see\", \"journey\", \"keep building\", \"as they take shape\", \"only time will tell\"",
  "- Similar motivational padding with no map information. Every sentence must carry information from the map.",
  "",
  "Voice: direct, informed advisor — calm and map-native. Warm but not flattery. No hedging.",
  "",
  "READING LENSES (not a checklist — one continuous voice, no sections):",
  "- Gap: where is significance high but movement absent, especially near a deadline?",
  "- Arrival: what's been completed, and what does the arc say about direction?",
  "Address only lenses the reading packet facts support. A reading may answer only one lens.",
  "",
  "WHOLE-MAP READING:",
  "- The reading sees what no single pursuit panel can: the shape of the map as a whole.",
  "- Do not inventory pursuits one by one — pursuit panels already do that.",
  "- Say one Gap observation and one Arrival observation (where the packet supports them) that only makes sense across the full map.",
  "- Do not repeat per-pursuit panel copy.",
  "- Use paragraph breaks between distinct observations. Each paragraph connects related pursuits — what they reveal together.",
  "- Two to three short paragraphs. Not a task list.",
].join("\n");

export function countMapPursuits(mapContext: FormattedMapContext): number {
  let total = 0;
  for (const theme of mapContext.themes) {
    for (const hub of theme.hubs) {
      total += hub.pursuits.length;
    }
  }
  return total;
}

export function buildStorySystemPrompt(totalPursuitCount: number): string {
  const depthRules =
    totalPursuitCount <= 2
      ? [
          "",
          `MAP DEPTH: This map has ${totalPursuitCount} pursuit${totalPursuitCount === 1 ? "" : "s"} total — SPARSE mode.`,
          "seasonRead:",
          "- Stay short and factual — one or two short paragraphs maximum.",
          "- Name pursuits verbatim by exact title when relevant.",
          "- One grounded Gap or Arrival observation tied to the data; one genuine question is OK.",
          "- Do NOT write a life narrative: forbid framing like \"focused approach\", \"intentional building\", \"period of\", \"chapter\", \"landscape of your life\", or cross-theme synthesis the data cannot support.",
          "- Do not invent patterns, momentum arcs, or theme interactions that are not evidenced.",
        ]
      : [
          "",
          `MAP DEPTH: This map has ${totalPursuitCount} pursuits — PANORAMIC mode.`,
          "seasonRead:",
          "- Two to three short paragraphs per WHOLE-MAP READING rules.",
          "- Connect related pursuits — what they reveal together that neither reveals alone.",
          "- When naming pursuits, prefer significance 4–5; name at most 2–4 total as examples of the overall shape.",
          "- Calm, specific, not prescriptive. No poster copy, no life-coach framing, no 'where you are' clichés.",
          "- When age AND location are known in User context, weave in one holistic benchmark (typical patterns, life stage, not a separate section).",
          "  Use approximate language (roughly, typically, around). Omit benchmark clause if age OR location is unknown.",
          "- Do not repeat pursuit counts, status counts, or milestone totals the UI shows elsewhere.",
          "- No peer-comparison template filler (\"valued in a competitive market\") without a concrete fact.",
        ];

  return [STORY_PROMPT_BASE, ...depthRules].join("\n");
}

/** @deprecated Use buildStorySystemPrompt — kept for tests referencing the export name. */
export const STORY_SYSTEM_PROMPT = buildStorySystemPrompt(3);

function buildUserMessage(
  mapJson: string,
  userContext: string,
  totalPursuitCount: number,
): string {
  return [
    userContext || "(No profile context yet.)",
    "",
    `Total pursuits on map: ${totalPursuitCount}`,
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

  const totalPursuitCount = countMapPursuits(mapContext);

  const raw = await generateJsonCompletion({
    system: buildStorySystemPrompt(totalPursuitCount),
    user: buildUserMessage(JSON.stringify(mapContext, null, 2), userContext, totalPursuitCount),
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
