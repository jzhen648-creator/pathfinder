import { formatMapContext, type FormattedMapContext } from "@/lib/ai/format-map-context";
import { isAmountImpactEligible, amountImpactReadingPromptLines } from "@/lib/ai/amount-impact-eligibility";
import { formatUserContext } from "@/lib/ai/format-user-context";
import { formatThemeDisplayNamesForPrompt } from "@/lib/life-areas";
import { generateJsonCompletion, GeminiNotConfiguredError, hasGeminiKey } from "@/lib/gemini";
import { isHolisticBenchmarkEligible } from "@/lib/pursuit/pursuit-enrich-readiness";
import { loadAllPursuitSignals } from "@/lib/pursuit/load-pursuit-signals";
import { sanitizeStoryGeneration } from "./sanitize-story";
import {
  validateSeasonReadAgainstPursuits,
  type PursuitStatusCheck,
} from "./validate-season-read";
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
  "Write in second person, present tense, declarative. The Reading IS the observation — never narrate the app, the map, or the Reading itself.",
  "",
  "VOICE ANTI-PATTERNS (never use in seasonRead):",
  "- Do not open with the user's name (\"Alex, ...\") — use name only inside benchmark logic when age and location support it.",
  "- Do not say \"your map shows\", \"the app sees\", \"this Reading reflects\", or similar meta-framing.",
  "- Do not use \"significant\" as a filler adjective — name the specific thing that matters.",
  "- Do not write \"You have been making progress\" — state what the progress actually is.",
  "- Do not narrate structure (\"First, let's look at...\", \"In summary...\", \"In your Work theme...\").",
  "- Wrong: \"Alex, your map shows a significant financial arrival.\" Right: \"Clearing the credit card debt ahead of schedule is a real financial milestone.\"",
  "",
  "READING LENSES (not a checklist — one continuous voice, no sections):",
  "- Arrival: a whole PURSUIT is complete — only when its status is COMPLETE, or it carries signal: arrival in the reading packet.",
  "  A completed milestone (kind: milestone_complete in recentEvents, or any milestonePaceFacts entry) is PROGRESS, not arrival.",
  "  NEVER describe an ACTIVE, PAUSED, or MAINTAINING pursuit as completed, finished, or achieved.",
  "  If a pursuit's status is not COMPLETE, you may note progress but must not state or imply the pursuit itself is done.",
  "Address only when the reading packet and map context support it. A reading may use only this lens if nothing else fits.",
  "",
  "WHOLE-MAP READING:",
  "- The reading sees what no single pursuit panel can: the shape of the map as a whole — what carries weight, what genuinely arrived, how themes relate.",
  "- Do not inventory pursuits one by one — pursuit panels already do that.",
  "- Say one Arrival observation (where the packet supports whole-pursuit completion) that only makes sense across the full map, and/or relate themes and pursuits to each other.",
  "- Do not repeat per-pursuit panel copy.",
  "- Use paragraph breaks between distinct observations. Each paragraph connects related pursuits or themes — what they reveal together.",
  "- The packet may flag pursuits with signal: arrival (whole-pursuit completion within the arrival window). Use only those flags for arrival prose.",
  "- Ignore gapFacts, milestonePaceFacts, and per-pursuit signal: gap in the reading packet when writing whole-map Reading — those fields are for pursuit panels only.",
  "- Do NOT audit milestones (present/absent/how many) and do NOT evaluate whether a pursuit is on track for its deadline — that is the pursuit panel's job.",
  "- You may name an imminent deadline ONLY as life-weight (e.g. \"a near-term debt deadline is pulling focus\"), never as a progress audit.",
  "- One or two short paragraphs. Not a task list.",
  "",
  "WORD COUNT (hard constraint — applies to every seasonRead):",
  "1. Your response MUST be 100–140 words. Never exceed 150 words.",
  "2. Do not write a closing paragraph of generic advice — no \"could open doors to new opportunities\", \"keep building on what's working\", \"stay the course\", or similar filler.",
  "3. Every sentence must be grounded in a specific, named pursuit and its status, or in a real relationship between pursuits or themes. Do not pad with generic statements.",
  "4. End on an observation, not a suggestion. At most ONE concrete suggestion in the entire reading.",
].join("\n");

function buildStoryDepthRules(
  totalPursuitCount: number,
  holisticBenchmarkEligible: boolean,
): string[] {
  return totalPursuitCount <= 2
      ? [
          "",
          `MAP DEPTH: This map has ${totalPursuitCount} pursuit${totalPursuitCount === 1 ? "" : "s"} total — SPARSE mode.`,
          "seasonRead:",
          "- Stay within the WORD COUNT block (100–140 words, hard max 150).",
          "- One or two short paragraphs maximum.",
          "- Name pursuits verbatim by exact title when relevant.",
          "- One grounded Arrival or cross-theme observation tied to the data; one genuine question is OK.",
          "- Do NOT write a life narrative: forbid framing like \"focused approach\", \"intentional building\", \"period of\", \"chapter\", \"landscape of your life\", or cross-theme synthesis the data cannot support.",
          "- Do not invent patterns, momentum arcs, or theme interactions that are not evidenced.",
        ]
      : [
          "",
          `MAP DEPTH: This map has ${totalPursuitCount} pursuits — PANORAMIC mode.`,
          "seasonRead:",
          "- Stay within the WORD COUNT block (100–140 words, hard max 150).",
          "- One or two short paragraphs — connect related pursuits and themes; what they reveal together that neither reveals alone.",
          "- Actively relate themes to each other when map data supports it — not only pursuits within one theme.",
          "- When naming pursuits, prefer significance 4–5; name at most 2–4 total as examples of the overall shape.",
          "- Calm, specific, not prescriptive. No poster copy, no life-coach framing, no 'where you are' clichés.",
          ...(holisticBenchmarkEligible
            ? [
                "- When age AND location are known in User context, weave in one holistic benchmark (typical patterns, life stage, not a separate section).",
                "  Use approximate language (roughly, typically, around). Omit benchmark clause if age OR location is unknown.",
              ]
            : []),
          "- Do not repeat pursuit counts, status counts, or milestone totals the UI shows elsewhere.",
          "- No peer-comparison template filler (\"valued in a competitive market\") without a concrete fact.",
        ];
}

export function countMapPursuits(mapContext: FormattedMapContext): number {
  let total = 0;
  for (const theme of mapContext.themes) {
    for (const hub of theme.hubs) {
      total += hub.pursuits.length;
    }
  }
  return total;
}

export function buildStorySystemPrompt(
  totalPursuitCount: number,
  amountImpactEligible = false,
  holisticBenchmarkEligible = false,
): string {
  const depthRules = buildStoryDepthRules(totalPursuitCount, holisticBenchmarkEligible);

  return [
    STORY_PROMPT_BASE,
    ...amountImpactReadingPromptLines(amountImpactEligible),
    ...depthRules,
  ].join("\n");
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
    "seasonRead must be 100–140 words (hard max 150).",
    "Total JSON under 800 output tokens.",
  ].join("\n");
}

function collectPursuitStatusChecks(mapContext: FormattedMapContext): PursuitStatusCheck[] {
  const out: PursuitStatusCheck[] = [];
  for (const theme of mapContext.themes) {
    for (const hub of theme.hubs) {
      for (const pursuit of hub.pursuits) {
        out.push({ title: pursuit.title, status: pursuit.status });
      }
    }
  }
  return out;
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

  const [mapContext, userContext, pursuitSignals] = await Promise.all([
    formatMapContext(userId),
    formatUserContext(userId),
    loadAllPursuitSignals(userId),
  ]);

  const totalPursuitCount = countMapPursuits(mapContext);

  const amountImpactEligible = isAmountImpactEligible(mapContext);
  const holisticBenchmarkEligible = isHolisticBenchmarkEligible(pursuitSignals);

  const raw = await generateJsonCompletion({
    system: buildStorySystemPrompt(
      totalPursuitCount,
      amountImpactEligible,
      holisticBenchmarkEligible,
    ),
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

  const story = sanitizeStoryGeneration(parsed.data);
  validateSeasonReadAgainstPursuits(
    story.seasonRead,
    collectPursuitStatusChecks(mapContext),
  );
  return story;
}
