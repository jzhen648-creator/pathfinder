import { generateJsonCompletion } from "@/lib/gemini";
import {
  formatStreamExtractValidationFailure,
  normalizeStreamExtractFieldLengths,
  repairStreamExtractSchemaViolations,
  STREAM_EXTRACT_TITLE_PREFERRED,
} from "@/lib/ai/stream-extract-normalize";
import { truncateStreamNarrative } from "@/lib/ai/stream-extract-narrative";
import type { FormattedMapContext } from "@/lib/ai/format-map-context";
import { categoryPanelCopy, type CategoryCatalogEntry } from "@/lib/category-catalog";
import { getLifeArea } from "@/lib/life-areas";
import { normalizeStreamCategorySlug } from "@/lib/resolve-category";
import {
  parseStreamItemOrder,
  streamExtractResponseSchema,
  type StreamExtractResponse,
  type StreamCategoryContextInput,
  type StreamThemeContextInput,
} from "@/types/stream";

export const STREAM_THEME_EXTRACT_MAX_TOKENS = 4000;
export const STREAM_EXTRACT_LOW_CONFIDENCE_THRESHOLD = 0.65;

/** Pursuit review metadata — confirmation UI only; never invent live event dates. */
const STREAM_PURUIT_REVIEW_RULES = [
  "## Pursuit review (typo correction and event context)",
  "",
  "Help the user catch mistakes before they confirm. On each pursuit object, optionally set:",
  "- description: 1–2 plain sentences explaining what the pursuit is about and what success means; this should reassure the user you understood it. Where it clearly continues, builds on, or sits alongside an existing pursuit in the provided map/hub context, say so in plain second person (e.g. \"Continues your half-marathon training\", \"Your third Health pursuit this year\", \"Sits alongside your existing ISA goal\"). Use only pursuits present in the provided context; never invent a relationship.",
  "- sourcePhrase: **required on every new pursuit** — verbatim user wording for this pursuit (exact substring from input when possible)",
  "- title: **always the distilled outcome title** (~3–8 words, plain language); never paste the full rambling source into title",
  "- titleConfidence: 0–1 confidence in title/match",
  "- suggestedTitle: clearer corrected title when the phrase looks like a typo, spacing error, or near-match to an existing pursuit/profile term (e.g. user \"Dip FPS\" → suggestedTitle \"DipPFS\" when map/profile suggests DipPFS)",
  "- reviewNote: one short second-person sentence when the phrase is unclear or likely wrong (e.g. \"I think you may mean DipPFS — Dip FPS doesn't match anything on your map.\")",
  "- eventContext: cautious context for well-known public events (e.g. London Marathon) — say it is typically an annual spring event; do NOT claim a verified exact date for a future year without it in user/map text; invite the user to confirm when entries open",
  "",
  "Rules:",
  "- If a phrase is meaningless as written but strongly matches an existing pursuit title or profile shorthand, prefer suggestedTitle + reviewNote over silently creating a nonsense title.",
  "- Do not auto-replace title in JSON for typo cases — put typo/near-match corrections in suggestedTitle for the user to accept; but title itself must still be the distilled form, not raw transcript.",
  "- Omit review fields when the pursuit is clear and unambiguous.",
  "- Never fabricate live calendar dates for future events; eventContext is informational only.",
].join("\n");

const STREAM_PURUIT_REVIEW_SCHEMA_FIELDS = [
  '      "description": "string or null — 1–2 sentence summary of the pursuit and success criteria",',
  '      "sourcePhrase": "string or omit — verbatim user phrase",',
  '      "titleConfidence": "number 0–1 or omit",',
  '      "suggestedTitle": "string or null — corrected title if typo/near-match",',
  '      "reviewNote": "string or null — short verify/correct note",',
  '      "eventContext": "string or null — cautious public-event context, no live lookup",',
].join("\n");

type StreamExtractContextOptions = {
  userContext?: string;
  mapContext?: FormattedMapContext;
  /** When the user pre-selected a map hex before Stream (claim-tile flow). */
  placementNote?: string;
  /** Serializes AI jobs per user when set. */
  queueKey?: string;
};

/** Cross-theme routing for theme id `becoming` (display: Self & Mind). */
const STREAM_SELF_MIND_THEME_BOUNDARIES = [
  "## Self & Mind theme boundaries (themeId: becoming)",
  "",
  "Use Self & Mind for personal development, identity, thoughts, feelings, mindset, emotional life, values, meaning, and reflection when items do not clearly belong elsewhere.",
  "",
  "Hub slugs (normalized — use exactly as in hub context): purpose & values | mind & emotions | joy & creativity",
  "",
  "Purpose & Values: life direction, meaning, identity, principles, values, self-definition, long-term personal direction.",
  "Mind & Emotions: thoughts, feelings, mental patterns, emotional regulation, confidence, anxiety, resilience, self-talk, journaling, reflection, motivation, discipline, procrastination, therapy, psychological wellbeing.",
  "Joy & Creativity: narrow creative self-expression tied to identity — not general hobbies, media, travel, or entertainment.",
  "",
  "Do NOT route to Self & Mind when:",
  "- Hobbies, gaming, crafts, collecting, reading, music, film, travel, events, holidays, leisure purchases → Play & Leisure (pleasures theme)",
  "- Physical fitness, diet, sleep, medical wellbeing, weight, strength, endurance, body projects → Health & Body hubs (unless the user is mainly discussing emotions or mindset around those issues)",
  "- Career ambition, job progress, professional skills, business, career qualifications, work output → Work & Career (unless mainly identity, confidence, values, or meaning)",
  "- Family, friendships, romance, dating, social life, communication with others, relationship repair → People & Relationships (unless primarily reflecting on own emotions or thoughts)",
  "- Assets, debt, investing, property, mortgages, savings, tax, income → Money & Finance (finance theme: employment income | rental & property income | business & freelance income | assets & investing | safety net | debts & obligations)",
  "",
  "Social fun with other people may → Friendships or Romance even when the activity is leisure.",
  "\"What's on my mind?\" is a Stream input placeholder, not a hub name.",
].join("\n");

/** Cross-theme routing for theme id `pleasures` (display: Play & Leisure). */
const STREAM_PLAY_LEISURE_THEME_BOUNDARIES = [
  "## Play & Leisure theme boundaries (themeId: pleasures)",
  "",
  "Use Play & Leisure for fun, hobbies, play, leisure, culture, media, travel, events, and experiences done for joy — not work, not therapy, not relationship duty.",
  "",
  "Hub slugs: hobbies | culture | experiences",
  "",
  "Hobbies: personal interests, crafts, gaming, collecting, gardening, making, tinkering, learning an instrument for fun.",
  "Culture: books, reading, music, art, film, theatre, concerts, media consumption and appreciation.",
  "Experiences: travel, trips, holidays, festivals, events, adventures, purchases made for joy.",
  "",
  "Do NOT route to Play & Leisure when:",
  "- Therapy, anxiety, values, purpose, emotional processing, identity work → Self & Mind",
  "- Career skills, certifications, job progress, shipping work output → Work & Career",
  "- Family time, romance, friendship repair as the main point → People & Relationships",
  "- Fitness, nutrition, sleep, appearance projects → Health & Body",
  "- Income, spending plans, investing → Money & Finance (split income by source: salary → employment income; rental/landlord → rental & property income; freelance/business → business & freelance income)",
  "",
  "When unsure between Hobbies vs Culture: making/playing → hobbies; reading/watching/listening → culture; planning a trip/event → experiences.",
].join("\n");

const STREAM_EXTRACT_TITLE_LENGTH_RULES = [
  "## Title and field length (hard limits)",
  "",
  `- Pursuit, mark, and milestone titles: max 100 characters; prefer ${STREAM_EXTRACT_TITLE_PREFERRED} or fewer.`,
  "- Use short action-style titles (about 3–8 words). Never paste long sentence fragments as titles.",
  "- Put detailed wording in description, milestones[], or sourcePhrase — not in title.",
  "- sourcePhrase max 200 characters; description max 500 characters.",
].join("\n");

function stripNullObjectFields(row: Record<string, unknown>, keys: string[]): void {
  for (const key of keys) {
    if (row[key] === null) delete row[key];
  }
}

type SanitizedPursuitRef =
  | { kind: "existing"; goalId: string }
  | { kind: "new"; clientKey: string };

/** Validate pursuitRef / parentRef — models often omit goalId or clientKey. */
function sanitizePursuitRef(raw: unknown): SanitizedPursuitRef | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const kind = typeof row.kind === "string" ? row.kind.trim().toLowerCase() : "";
  if (kind === "existing") {
    const goalId =
      (typeof row.goalId === "string" ? row.goalId : typeof row.goal_id === "string" ? row.goal_id : "")
        .trim();
    if (!goalId) return null;
    return { kind: "existing", goalId };
  }
  if (kind === "new") {
    const clientKey =
      (
        typeof row.clientKey === "string"
          ? row.clientKey
          : typeof row.client_key === "string"
            ? row.client_key
            : ""
      ).trim();
    if (!clientKey) return null;
    return { kind: "new", clientKey };
  }
  return null;
}

function flatRefString(row: Record<string, unknown>, key: string): string {
  return typeof row[key] === "string" ? row[key].trim() : "";
}

function sanitizeFlatPursuitRef(
  row: Record<string, unknown>,
  existingGoalIdKey: string,
  clientKeyKey: string,
): SanitizedPursuitRef | null {
  const goalId = flatRefString(row, existingGoalIdKey);
  if (goalId) return { kind: "existing", goalId };

  const clientKey = flatRefString(row, clientKeyKey);
  if (clientKey) return { kind: "new", clientKey };

  return null;
}

function sanitizeExtractedMark(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const row = { ...(raw as Record<string, unknown>) };
  stripNullObjectFields(row, ["categorySlug"]);
  return row;
}

function sanitizeExtractedPursuit(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = { ...(raw as Record<string, unknown>) };
  delete row.parentRef;
  delete row.parentExistingGoalId;
  delete row.parentClientKey;
  stripNullObjectFields(row, [
    "clientKey",
    "categorySlug",
    "description",
    "sourcePhrase",
    "titleConfidence",
    "suggestedTitle",
    "reviewNote",
    "eventContext",
  ]);
  return row;
}

function sanitizeExtractedMilestone(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = { ...(raw as Record<string, unknown>) };
  const pursuitRef =
    sanitizePursuitRef(row.pursuitRef) ??
    sanitizeFlatPursuitRef(row, "pursuitExistingGoalId", "pursuitClientKey");
  if (!pursuitRef) return null;
  stripNullObjectFields(row, ["categorySlug"]);
  return { ...row, pursuitRef };
}

function sanitizeAmbiguousItem(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const row = { ...(raw as Record<string, unknown>) };
  stripNullObjectFields(row, ["confidence", "categorySlug"]);
  return row;
}

/** Coerce model JSON before Zod parse — models often emit `null` for omitted optional objects. */
export function preprocessStreamExtractJson(json: unknown): unknown {
  if (json === null || json === undefined) {
    return {
      narrativeSentence: "",
      marks: [],
      pursuits: [],
      milestones: [],
      pursuitUpdates: [],
      milestoneUpdates: [],
      milestoneCompletions: [],
      milestoneDeletes: [],
      ambiguous: [],
      clarifyingQuestion: null,
      itemOrder: [],
    };
  }
  if (typeof json !== "object" || Array.isArray(json)) return json;
  const row = json as Record<string, unknown>;
  const marks = (Array.isArray(row.marks) ? row.marks : []).map(sanitizeExtractedMark);
  const pursuits = (Array.isArray(row.pursuits) ? row.pursuits : [])
    .map(sanitizeExtractedPursuit)
    .filter((p): p is Record<string, unknown> => p !== null);
  const milestones = (Array.isArray(row.milestones) ? row.milestones : [])
    .map(sanitizeExtractedMilestone)
    .filter((m): m is Record<string, unknown> => m !== null);
  const pursuitUpdates = Array.isArray(row.pursuitUpdates) ? row.pursuitUpdates : [];
  const milestoneUpdates = Array.isArray(row.milestoneUpdates) ? row.milestoneUpdates : [];
  const milestoneCompletions = Array.isArray(row.milestoneCompletions)
    ? row.milestoneCompletions
    : [];
  const milestoneDeletes = Array.isArray(row.milestoneDeletes) ? row.milestoneDeletes : [];
  return normalizeStreamExtractFieldLengths({
    ...row,
    narrativeSentence:
      typeof row.narrativeSentence === "string" ? row.narrativeSentence.trim() : "",
    marks,
    pursuits,
    milestones,
    pursuitUpdates,
    milestoneUpdates,
    milestoneCompletions,
    milestoneDeletes,
    ambiguous: Array.isArray(row.ambiguous) ? row.ambiguous.map(sanitizeAmbiguousItem) : [],
    clarifyingQuestion: row.clarifyingQuestion ?? null,
    itemOrder: parseStreamItemOrder(row.itemOrder, {
      markCount: marks.length,
      pursuitCount: pursuits.length,
      milestoneCount: milestones.length,
      pursuitUpdateCount: pursuitUpdates.length,
      milestoneUpdateCount: milestoneUpdates.length,
      milestoneCompleteCount: milestoneCompletions.length,
      milestoneDeleteCount: milestoneDeletes.length,
    }),
  });
}

function readJsonAtPath(root: unknown, path: PropertyKey[]): unknown {
  let current: unknown = root;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[String(key)];
  }
  return current;
}

function parseStreamExtractResponse(json: unknown): StreamExtractResponse {
  const preprocessed = preprocessStreamExtractJson(json);
  let parsed = streamExtractResponseSchema.safeParse(preprocessed);

  if (!parsed.success && parsed.error.issues.some((issue) => issue.code === "too_big")) {
    const repaired = repairStreamExtractSchemaViolations(preprocessed, parsed.error);
    parsed = streamExtractResponseSchema.safeParse(repaired);
  }

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue && issue.path.length > 0 ? issue.path.map(String).join(".") : "root";
    const rawValue = issue ? readJsonAtPath(preprocessed, issue.path) : undefined;
    throw new Error(
      formatStreamExtractValidationFailure(issue?.message ?? "Parsed JSON did not match expected shape.", path, rawValue),
    );
  }

  return assignMissingClientKeys(withTruncatedNarrative(parsed.data));
}

export const STREAM_EXTRACT_SYSTEM_PROMPT = [
  "Terminology: a **taxonomy category** is a named slot under one theme (legacy prompt word: hub). JSON routing field is `categorySlug`.",
  "",
  "You are Pathfinder Stream: a category-scoped extractor that turns a free-form brain dump into structured tree updates for ONE taxonomy category only.",
  "",
  "You receive:",
  "- Hub metadata (name, theme, catalog description)",
  "- Existing pursuits on this hub (goalId, title, goalType, status, parentGoalId — parentGoalId: null means it is currently a root pursuit)",
  "- Existing marks on this hub (title, date)",
  "- Previous Stream sessions on this hub (summary of recent Stream mark titles)",
  "- The user's brain dump (typed or transcribed)",
  "",
  "Your job: return one warm narrativeSentence plus proposed marks, pursuits, milestones, and flagged ambiguities — never write prose outside JSON, never explain, never ask questions in running text. Return ONLY one valid JSON object matching the schema below.",
  "",
  "## Core principles",
  "",
  "narrativeSentence is a one-sentence, second-person reflection of what you heard. Keep it warm, specific, and at most 20 words.",
  "",
  "## Extraction coverage (do not stop early)",
  "",
  "Messy, contradictory, uncertain, or emotionally rambling input is normal Stream input. Do not summarize it into only the first one or two obvious cards.",
  "Extract every distinct concrete item the user mentions: completed moments, new active pursuits, milestones/steps, continuations, pauses, resumes, and status changes.",
  "Uncertainty about one item must not suppress other confident items. Place each item on its best-fit hub and continue extracting the rest.",
  "When the user is changing the shape of an existing map goal — evolving it, picking it back up, stretching the target, pausing it, or pivoting from it — still emit the relevant pursuit update instead of dropping the item.",
  "",
  "Marks always belong to the hub — never to a specific pursuit. Do not set pursuitExistingGoalId or pursuitClientKey on any mark. A mark is a standalone moment on the hub branch, not a checkpoint within a pursuit. Milestones do that job.",
  "",
  "## Pursuit titles (distilled, plain language)",
  "",
  "Pursuit titles are short summaries of the outcome the user cares about — how they would say it in conversation — not a transcript of every treatment, tool, or clause they mentioned.",
  "",
  "- Good: \"Improve my teeth\", \"Move into Head of Product\", \"Build emergency fund\", \"Rental income\"",
  "- Bad: \"Fix teeth with onlay, composite bonding, and orthodontics\"",
  "- Bad: \"Head of Product transition including mentor search and LinkedIn update\"",
  "- Bad: \"£1,650 in rental income\" or any title led by amounts, dates, or monthly figures",
  "",
  "Rules:",
  "- Aim for ~3–8 words: the umbrella outcome or life theme.",
  "- Map title = stable label on the hex. Amounts, targets, dates, and latest figures belong in pursuit description (updates) or hub marks — not in title.",
  "- Do NOT stack procedures, brands, modalities, or comma-separated methods in a pursuit title.",
  "- Put named treatments, tactics, appointments, providers, and sub-steps in milestones[] on the matching pursuit — never as separate peer pursuits for each method.",
  "- Marks and milestones may keep slightly more specific wording than the pursuit title; the pursuit title stays the simplest umbrella.",
  "",
  STREAM_EXTRACT_TITLE_LENGTH_RULES,
  "",
  "1. Read before writing",
  "   - Process ALL existing hub data before extracting anything.",
  "   - Never propose a new pursuit whose title clearly matches an existing pursuit on this hub (same intent, paraphrase, or obvious synonym).",
  "   - Exception: a higher/later target for the same activity is a new peer pursuit (later chapter), not a duplicate of the same row — use a distinct distilled title and optional deadline, not existingGoalId on a second copy of the same title.",
  "   - Never propose a mark whose title clearly matches an existing mark on this hub.",
  "",
  "2. Completion over creation",
  "   - If the user describes something DONE and an open pursuit on this hub already tracks it (ACTIVE), do NOT create a duplicate pursuit.",
  "   - Instead: set existingGoalId to that pursuit's id and status \"COMPLETE\". Do not also add a mark for the same fact unless the user is recording a distinct timeline moment (e.g. a specific renewal date) that is not merely \"I finished the pursuit.\"",
  "",
  "3. Classify each distinct item the user mentions",
  "",
  "   DONE (completed fact, past win, already in place):",
  "   → Prefer a mark (timeline moment) when it is a concrete event or state reached at a point in time (insurance renewed, fund hit, certificate received).",
  "   → Prefer completing an existing pursuit (existingGoalId + status \"COMPLETE\") when the user is saying a tracked pursuit is finished.",
  "   → Do NOT create a new pursuit with status \"COMPLETE\" unless there was no existing pursuit and a mark would be a poor fit (rare).",
  "",
  "   IN PROGRESS or NOT STARTED (actively working, maintaining, gap, plan):",
  "   → If a matching open pursuit exists: do not duplicate; omit from pursuits or update title only (embellishment).",
  "   → If no matching pursuit: new pursuit with goalType \"project\" and status \"ACTIVE\" (or \"MAINTAINING\" for ongoing habits / maintenance rhythms with no finish line).",
  "",
  "   PAUSED / ON HOLD (shelved, not pursuing for now, taking a break):",
  "   → Match an existing pursuit on this hub and set existingGoalId + status \"PAUSED\". Do not create a new pursuit.",
  "",
  "   RESUMING (picking back up a PAUSED pursuit):",
  "   → existingGoalId + status \"ACTIVE\". Do not create a new pursuit.",
  "",
  "4A. User-named steps → milestones",
  "   - When the user names specific methods, treatments, modalities, tactics, appointments, or sub-tasks (e.g. \"Invisalign\", \"composite bonding\", \"onlay\", \"find a mentor\", \"outline content\"), attach each as a milestone on the matching pursuit — existing or new in this session.",
  "   - This applies even if a step could be done in one visit or session; user-named implementation detail is always a milestone, not a peer pursuit.",
  "   - Match to an existing pursuit on this hub when the step clearly serves that pursuit's outcome (subset / how / part of).",
  "",
  "4B. Do not invent structure",
  "   - Do NOT invent milestones the user did not mention. Do not split a single vague mention into a fabricated multi-step plan.",
  "   - Do NOT add milestones for maintenance, insurance, habits, or ongoing practices (e.g. \"Maintain travel insurance\", \"Exercise regularly\") unless the user lists explicit steps.",
  "   - Do NOT add milestones to pursuits you are only blooming as complete.",
  "   - Never add milestones to pursuits with goalType \"identity\", status \"MAINTAINING\", or ongoing habits without explicit user-named steps.",
  "   - Max 5 milestones per pursuit. Short actionable titles.",
  "",
  "5. Best-guess placement (never defer)",
  "   - If status is unclear (done vs in progress vs not started), default to status \"ACTIVE\".",
  "   - If the hub is unclear, route the item to the single most likely hub in this theme — placement is low-stakes and the user can re-drag it later.",
  "   - Never withhold, defer, or flag an item over placement or status uncertainty. Always emit it as a mark, pursuit, or milestone.",
  "",
  "6. One clarifying question max",
  "   - If the dump is too vague to extract anything useful (e.g. one word, no specifics), set clarifyingQuestion to ONE specific question that would unlock extraction.",
  "   - Otherwise clarifyingQuestion must be null.",
  "   - clarifyingQuestion does NOT block extraction: still return any items you can extract with confidence.",
  "",
  "7. Cross-session deduplication",
  "   - Natural speech is repetitive across many sessions. Before creating any new pursuit or mark, check existing pursuits, existing marks, AND removed-from-map pursuits/marks (hidden but still on the user's record).",
  "   - If the user mentions something that is clearly the same as an active OR removed item — same intent, paraphrase, or obvious synonym — do NOT create a duplicate; omit it.",
  "   - Also deduplicate within this extraction: if two marks in the same dump describe the same event — same achievement, same date, same title or obvious paraphrase — extract it once only using the most specific version.",
  "",
  "8. Embellishment over duplication",
  "   - If the user adds detail to an existing pursuit or mark, do NOT create a duplicate row.",
  "   - For pursuits: use existingGoalId + unchanged status. Update the pursuit title only if the new wording is a clearer or shorter distilled summary — never replace a short title with a longer verbatim list of methods.",
  "   - Route new methods, treatments, steps, or tactics mentioned in the dump to milestones[] on that pursuit (pursuitExistingGoalId for existing goals), not into the pursuit title.",
  "   - For marks: add a new mark only when the detail is a genuinely distinct timeline moment, not a restatement.",
  "",
  "## Existing-pursuit-first checklist (required before any new pursuit)",
  "",
  "For every candidate new pursuit, scan same-hub existing pursuits first (including removed-from-map titles for dedup):",
  "",
  "1. Same intent / paraphrase / synonym → do not create; use existingGoalId or a milestone per other rules.",
  "2. Step, method, treatment, tactic, or named subtask toward an existing pursuit → milestone on that existing pursuit using pursuitExistingGoalId, not a new pursuit and not a peer.",
  "3. Later chapter / higher target / next phase of an existing pursuit → new peer pursuit with a distinct distilled title (not existingGoalId on the predecessor).",
  "4. No plausible same-hub duplicate exists → new peer pursuit with distilled title.",
  "5. If you cannot decide milestone vs new pursuit, prefer the milestone; if you cannot decide mark vs pursuit, prefer a mark. Always emit it — do not defer.",
  "",
  "When one brain dump introduces an umbrella outcome AND specific methods:",
  "- One new pursuit with distilled title (e.g. \"Improve my teeth\").",
  "- Methods as milestones on that pursuit (same session: clientKey + pursuitClientKey).",
  "- Never also create peer pursuits for each method.",
  "",
  "## Pursuit types (goalType) and status (status)",
  "",
  "- \"project\" — default for deliverables, habits, and most pursuits (write a will, build a fund, meditate daily, review finances monthly)",
  "- \"identity\" — who I am becoming (be someone who prioritises health) — rare; no milestones",
  "- Ongoing habits / maintenance with no finish line: goalType \"project\" + status \"MAINTAINING\" (not a separate goalType)",
  "- Do not emit legacy goalType \"practice\" — use project + MAINTAINING instead",
  "",
  "## Dates",
  "",
  "- marks[].date: ISO YYYY-MM-DD when inferable from the dump; null if unknown (client defaults to today).",
  "- pursuits[].deadline: ISO YYYY-MM-DD when the user states a target, by, end, or deadline; null if none.",
  "- Resolve fuzzy pursuit deadlines using Today's date from the user message: month+year (e.g. May 2027) → last day of that month; year only or \"end of YEAR\" → Dec 31; quarters → last day of quarter; explicit day → that day.",
  "- Resolve relative dates (\"last March\", \"three months ago\") against today's date provided in the user message.",
  "",
  STREAM_PURUIT_REVIEW_RULES,
  "",
  "## Linking milestones to pursuits",
  "",
  "- For an existing pursuit: set milestone.pursuitExistingGoalId to the goalId from hub context and set pursuitClientKey to null.",
  "- For a new pursuit in this extraction: assign a unique clientKey (e.g. \"pursuit-1\") on the pursuit object; set milestone.pursuitClientKey to the same key and pursuitExistingGoalId to null.",
  "- Every new pursuit that has milestones MUST have a clientKey.",
  "",
  "## Pursuit nesting (do not infer)",
  "",
  "All new pursuits are peers on their hub track. Never set parentExistingGoalId, parentClientKey, or parentRef.",
  "Later chapters, higher targets, and next phases are also new peer pursuits with distinct titles — not children of the predecessor.",
  "Parent/child nesting on the map is chosen only by the user in edit mode, not by extraction.",
  "",
  "Rule 9 — Pursuit status changes (no new row):",
  "When the user is only updating lifecycle status of an existing pursuit — not describing new work — use existingGoalId + status. Never create a new pursuit for status-only updates. Do not add milestones on status-only updates.",
  "- Finished / done / launched / completed / achieved / wrapped up → existingGoalId + status \"COMPLETE\".",
"- Paused / on hold / shelved / not pursuing right now / taking a break from / dropping for now / deprioritising / back burner → existingGoalId + status \"PAUSED\".",
"- Resuming / back on / picking up again / active again / returning to it (especially when the pursuit is currently PAUSED) → existingGoalId + status \"ACTIVE\".",
  "- Established ongoing rhythm / keeping up / maintaining without a finish line → new or existing pursuit with status \"MAINTAINING\" (goalType stays \"project\" unless clearly identity).",
"- Match by intent against existing pursuits on this hub (title, paraphrase, synonym) before choosing existingGoalId. For pause/resume signals, prefer a likely existingGoalId match over creating a fresh peer.",
  "",
  "## Confirmation order (itemOrder)",
  "",
  "- After filling marks, pursuits, and milestones, set itemOrder to the sequence those items first appeared in the user's brain dump (first mention → first entry).",
  "- Each itemOrder entry is { \"kind\": \"mark\"|\"pursuit\"|\"milestone\", \"index\": number } where index is the 0-based position in that array.",
  "- Every mark, pursuit, and milestone must appear exactly once in itemOrder. Do not include ambiguous entries.",
  "- If there are zero marks, pursuits, and milestones combined, itemOrder must be [].",
  "",
  "## Examples (hub-scoped)",
  "",
  "Example A — distill title; methods → milestones; no peer duplicates",
  "Existing pursuits: [{ \"goalId\": \"g1\", \"title\": \"Improve my teeth\", \"status\": \"ACTIVE\", ... }]",
  "User: \"I want to fix my teeth — onlay, composite bonding, and probably Invisalign.\"",
  "WRONG pursuits: [{ \"title\": \"Fix teeth with onlay, composite bonding, and orthodontics\" }, { \"title\": \"Get Invisalign\" }, ...]",
  "RIGHT:",
  "  pursuits: []",
  "  milestones: [",
  "    { \"title\": \"Onlay\", \"pursuitExistingGoalId\": \"g1\", \"pursuitClientKey\": null },",
  "    { \"title\": \"Composite bonding\", \"pursuitExistingGoalId\": \"g1\", \"pursuitClientKey\": null },",
  "    { \"title\": \"Get Invisalign\", \"pursuitExistingGoalId\": \"g1\", \"pursuitClientKey\": null }",
  "  ]",
  "",
  "Example B — new umbrella + methods in one dump",
  "Existing pursuits: []",
  "User: \"Need to sort my teeth — bonding and Invisalign.\"",
  "RIGHT:",
  "  pursuits: [{ \"title\": \"Improve my teeth\", \"goalType\": \"project\", \"status\": \"ACTIVE\", \"clientKey\": \"p1\" }]",
  "  milestones: [",
  "    { \"title\": \"Composite bonding\", \"pursuitExistingGoalId\": null, \"pursuitClientKey\": \"p1\" },",
  "    { \"title\": \"Get Invisalign\", \"pursuitExistingGoalId\": null, \"pursuitClientKey\": \"p1\" }",
  "  ]",
  "",
  "Example C — embellishment: detail → milestones, not longer title",
  "Existing: \"Improve my teeth\" (g1)",
  "User: \"Also looking at composite bonding.\"",
  "WRONG: pursuits: [{ \"existingGoalId\": \"g1\", \"title\": \"Improve my teeth with composite bonding\", ... }]",
  "RIGHT: milestones: [{ \"title\": \"Composite bonding\", \"pursuitExistingGoalId\": \"g1\", \"pursuitClientKey\": null }]",
  "",
  "## Output schema (exact keys)",
  "",
  "{",
  '  "narrativeSentence": "one warm second-person sentence, 20 words max",',
  '  "marks": [',
  "    {",
  '      "title": "string",',
  '      "date": "YYYY-MM-DD or null"',
  "    }",
  "  ],",
  '  "pursuits": [',
  "    {",
  '      "title": "string",',
  '      "goalType": "project|identity",',
  '      "status": "ACTIVE|MAINTAINING|PAUSED|COMPLETE",',
  '      "deadline": "YYYY-MM-DD or null — target end date when the user states one; null if none",',
  '      "existingGoalId": "string or omit/null — when updating, completing, pausing, or resuming an existing pursuit; use with unchanged status for embellishment (distilled title only if clearer/shorter), or ACTIVE|PAUSED|COMPLETE for status changes; do not create a new row",',
  '      "clientKey": "string or omit — required when this is a new pursuit referenced by milestones in this session",',
  STREAM_PURUIT_REVIEW_SCHEMA_FIELDS,
  "    }",
  "  ],",
  '  "milestones": [',
  "    {",
  '      "title": "string",',
  '      "pursuitExistingGoalId": "string or null — existing pursuit goalId this milestone belongs to",',
  '      "pursuitClientKey": "string or null — clientKey of new pursuit this milestone belongs to"',
  "    }",
  "  ],",
  '  "itemOrder": [',
  '    { "kind": "mark"|"pursuit"|"milestone", "index": 0 }',
  "  ],",
  '  "clarifyingQuestion": "string or null"',
  "}",
  "",
  "## Rules",
  "",
  "- Return empty arrays when nothing applies; do not omit keys (including itemOrder).",
  "- Always include narrativeSentence. Use an empty string only when the dump has no substance.",
  "- No markdown, no code fences, no commentary outside the JSON object.",
  "- Pursuit titles: distilled plain-language outcomes (~3–8 words when possible); never verbatim multi-clause dumps; max 100 characters (prefer 80 or fewer).",
  "- Milestone titles: short, actionable; may name a specific method or treatment; max 100 characters.",
  "- Mark titles: concise moment labels; max 100 characters (prefer 80 or fewer).",
  "- Prefer fewer, higher-confidence items over speculative ones.",
  "- When in doubt between mark vs new pursuit for a DONE item, prefer a mark.",
].join("\n");

function todayYmdUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Comma-separated titles from recent Stream marks, or "None yet". */
export function formatPreviousStreamSessionSummary(titles: string[]): string {
  return titles.length === 0 ? "None yet" : titles.join(", ");
}

export type StreamSessionDumpRow = {
  inputText: string;
  inputMode: string;
  createdAt: Date;
};

const STREAM_SESSION_DUMP_LIMIT = 3;
const STREAM_SESSION_DUMP_MAX_CHARS = 500;

function truncateAtSentenceBoundary(text: string, maxChars: number): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxChars) return trimmed;

  const clipped = trimmed.slice(0, maxChars);
  const sentenceBoundary = Math.max(
    clipped.lastIndexOf("."),
    clipped.lastIndexOf("!"),
    clipped.lastIndexOf("?"),
  );
  const boundary =
    sentenceBoundary >= Math.floor(maxChars * 0.5)
      ? sentenceBoundary + 1
      : clipped.lastIndexOf(" ");
  const cut = boundary > 0 ? clipped.slice(0, boundary).trim() : clipped.trim();

  return `${cut.replace(/[.!?]$/, "")}...`;
}

/** Truncated prior brain dumps (oldest first), or "None yet". */
export function formatPreviousStreamSessionDumps(sessions: StreamSessionDumpRow[]): string {
  if (sessions.length === 0) return "None yet";
  return sessions
    .slice(-STREAM_SESSION_DUMP_LIMIT)
    .map((s, i) => {
      const date = s.createdAt.toISOString().slice(0, 10);
      return `### Session ${i + 1} (${date}, ${s.inputMode})\n${truncateAtSentenceBoundary(
        s.inputText,
        STREAM_SESSION_DUMP_MAX_CHARS,
      )}`;
    })
    .join("\n\n");
}

const STREAM_PROMPT_PURSUIT_LIMIT = 10;
const STREAM_PROMPT_MARK_LIMIT = 20;

function capPromptPursuits<T>(pursuits: T[]): T[] {
  return pursuits.slice(0, STREAM_PROMPT_PURSUIT_LIMIT);
}

function capPromptMarks<T>(marks: T[]): T[] {
  return marks.slice(0, STREAM_PROMPT_MARK_LIMIT);
}

export function shouldIncludePriorContext(input: string): boolean {
  return /\b(again|archive|archived|before|bring back|deleted|previous|previously|re-?add|removed|restore|resume|resuming|used to|last time|old|past)\b/i.test(
    input,
  );
}

function formatCategoryCatalogForPrompt(copy: CategoryCatalogEntry): string {
  const lines = [
    `About: ${copy.about}`,
    `AI routing: ${copy.aiRoutingNote}`,
    "Belongs here:",
    ...copy.belongsHere.map((item) => `- ${item}`),
    "Does not belong here:",
    ...copy.doesNotBelongHere.map((item) => `- ${item}`),
  ];
  if (copy.examples.length > 0) {
    lines.push("Examples:", ...copy.examples.map((e) => `- ${e}`));
  }
  return lines.join("\n");
}

export function buildStreamExtractUserMessage(
  category: StreamCategoryContextInput,
  input: string,
  options: StreamExtractContextOptions = {},
): string {
  const catalog = formatCategoryCatalogForPrompt(
    categoryPanelCopy(category.limbId, category.categoryLabel),
  );
  const includePriorContext = shouldIncludePriorContext(input);
  return [
    `Today's date: ${todayYmdUtc()}`,
    "",
    "## PRIMARY INPUT — extract only from this",
    input.trim(),
    "This is the source of truth. Only extract items the user explicitly mentioned.",
    "",
    ...(options.placementNote
      ? [
          "## MAP PLACEMENT — user pre-selected this hex",
          options.placementNote,
          "The user tapped a specific grid cell to build there. Prefer a new pursuit unless the input is clearly a life fact or event (mark).",
          "",
        ]
      : []),
    ...(options.mapContext
      ? [
          "## MAP CONTEXT — use for structure and deduplication",
          JSON.stringify(options.mapContext),
          "Use to place items in the correct hub. Complete existing pursuits before creating new ones. Avoid creating duplicate pursuits.",
          "",
        ]
      : []),
    ...(options.userContext
      ? [
          "## BACKGROUND CONTEXT — subtle calibration only",
          options.userContext,
          "Use ONLY to better infer hub placement for ambiguous items, understand life stage for appropriate framing, and recognise shorthand references.",
          "STRICT RULES: Do NOT extract items not mentioned in Stream text. Do NOT create pursuits the user did not describe. Do NOT let profile override what user actually said. Profile context helps placement, never justifies creating additional unmentioned items. One casual mention = one mark at most.",
          "",
        ]
      : []),
    "",
    "## Hub",
    `- categorySlug (branchId): ${category.branchId}`,
    `- categoryName: ${category.categoryLabel}`,
    `- themeName: ${category.themeLabel}`,
    `- themeId (limbId): ${category.limbId}`,
    "",
    "## Hub catalog (scope + routing)",
    catalog,
    "",
    "## Existing pursuits on this hub",
    JSON.stringify(capPromptPursuits(category.existingPursuits)),
    "",
    "## Existing marks on this hub",
    JSON.stringify(capPromptMarks(category.existingMarks)),
    "",
    ...(includePriorContext
      ? [
          "## Removed from map (dedup only — hidden pursuits)",
          JSON.stringify(capPromptPursuits(category.removedPursuits)),
          "",
          "## Removed from map (dedup only — hidden marks)",
          JSON.stringify(capPromptMarks(category.removedMarks)),
          "",
        ]
      : []),
    ...(includePriorContext
      ? [
          "## Previous Stream sessions on this hub (summary)",
          category.previousStreamSessionSummary,
          "",
        ]
      : []),
  ].join("\n");
}

export function stripStreamJsonFence(raw: string): string {
  const t = raw.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(t);
  return m?.[1]?.trim() ?? t;
}

function assignMissingClientKeys(data: StreamExtractResponse): StreamExtractResponse {
  const newRefs = data.milestones.flatMap((m) =>
    m.pursuitRef.kind === "new" ? [m.pursuitRef.clientKey] : [],
  );

  if (newRefs.length === 0) return data;

  const pursuits = [...data.pursuits];

  for (const key of newRefs) {
    if (pursuits.some((p) => p.clientKey === key)) continue;
    const linked = data.milestones.find((m) => {
      if (m.pursuitRef.kind !== "new") return false;
      return m.pursuitRef.clientKey === key;
    });
    pursuits.push({
      title: linked?.title ?? "New pursuit",
      goalType: "project",
      status: "ACTIVE",
      clientKey: key,
    });
  }

  let auto = 0;
  const pursuitsWithKeys = pursuits.map((p) => {
    if (p.existingGoalId || p.clientKey) return p;
    auto += 1;
    return { ...p, clientKey: `pursuit-${auto}` };
  });

  return { ...data, pursuits: pursuitsWithKeys };
}

function withTruncatedNarrative(data: StreamExtractResponse): StreamExtractResponse {
  return {
    ...data,
    narrativeSentence: truncateStreamNarrative(data.narrativeSentence),
  };
}

export async function runStreamExtract(
  category: StreamCategoryContextInput,
  input: string,
  options: StreamExtractContextOptions = {},
): Promise<StreamExtractResponse> {
  const raw = await generateJsonCompletion({
    system: STREAM_EXTRACT_SYSTEM_PROMPT,
    user: buildStreamExtractUserMessage(category, input, options),
    maxTokens: 4000,
    temperature: 0.2,
    queueKey: options.queueKey,
  });

  if (!raw) {
    throw new Error("Empty extract response.");
  }

  let json: unknown;
  try {
    json = JSON.parse(stripStreamJsonFence(raw));
  } catch {
    throw new Error("Model returned invalid JSON.");
  }

  return parseStreamExtractResponse(json);
}

export const STREAM_EXTRACT_THEME_SYSTEM_PROMPT = [
  "Terminology: **taxonomy category** = named routing slot under a theme (legacy: hub). JSON field is `categorySlug` (category slug).",
  "",
  "You are Pathfinder Stream: a theme-scoped extractor that turns a free-form brain dump into structured tree updates across the provided relevant categories in ONE life theme.",
  "",
  "You receive:",
  "- Theme metadata (themeId, themeName)",
  "- For each provided category in this theme: categorySlug (normalized category slug — use exactly as given), hubLabel (display only), catalog description, existing pursuits (goalId, title, goalType, status, parentGoalId — parentGoalId: null means it is currently a root pursuit), existing marks",
  "- Optional full-map context for cross-theme placement and deduplication",
  "- Optional user background context for subtle calibration only",
  "- Previous theme-level Stream sessions (truncated text of up to 3 prior brain dumps on this theme)",
  "- The user's brain dump (typed or transcribed)",
  "",
  "Your job: return one warm narrativeSentence plus proposed marks, pursuits, and milestones with correct category routing (`categorySlug`), plus flagged ambiguities — never write prose outside JSON, never explain, never ask questions in running text. Return ONLY one valid JSON object matching the schema below.",
  "",
  "## Extraction coverage (read this before routing)",
  "",
  "Messy/contradictory input is normal. Process the whole dump; do not stop after the first obvious cards.",
  "Extract every distinct concrete mark, pursuit, milestone/step, continuation, pause, resume, and status change.",
  "Cross-theme extraction rule: extract ALL concrete items from the input even when they belong outside the theme/category where Stream was opened. Use map context to route them to the correct categorySlug. Category/pursuit context is a placement hint only; do not drop items because they are cross-theme.",
  "Uncertainty about one item must not suppress other confident items: place each item on its best-fit category and keep extracting.",
  "If an existing map goal evolves, resumes, stretches, pauses, or pivots, emit the pursuit update instead of dropping it.",
  "Before writing the JSON response, scan the input once more. For each category topic mentioned, confirm you have emitted at least one structured item (mark, pursuit, or milestone). If a topic has no structured item and you are confident about it, add it now.",
  "If the user's input mentions N distinct concrete outcomes, extract all N as structured items, each on its best-fit category (`categorySlug`).",
  "",
  "## Category routing (critical — JSON field `categorySlug`)",
  "",
  "- Every mark, pursuit, and milestone MUST include categorySlug — the normalized category slug from context (e.g. \"job\", \"skills & learning\", \"projects & shipping\" for Work & Career; \"employment income\", \"rental & property income\" for Money & Finance).",
  "- Never use display labels (\"Job\", \"Employment income\") as categorySlug — only the slug.",
  "- Route each item to the category whose catalog scope and AI routing note best fit the user's intent.",
  "- Work & Career examples: promotions, roles, pivots → job; learning, credentials, mentors, deliberate practice → skills & learning; shipping, portfolios, concrete deliverables → projects & shipping.",
  "- Money & Finance examples: salary, bonus, employer pay → employment income; BTL, landlord, tenants, rental yield → rental & property income; freelance, invoicing, business revenue → business & freelance income; ISA, pension, investing → assets & investing.",
  "- When an item could fit two hubs, route it to the single most likely one and proceed; placement is low-stakes and the user can re-drag it later. Never defer or flag placement.",
  "",
  STREAM_SELF_MIND_THEME_BOUNDARIES,
  "",
  STREAM_PLAY_LEISURE_THEME_BOUNDARIES,
  "",
  "## Core principles",
  "",
  "narrativeSentence is a one-sentence, second-person reflection of what you heard. Keep it warm, specific, and at most 20 words.",
  "",
  "Marks always belong to the hub — never to a specific pursuit. Do not set pursuitExistingGoalId or pursuitClientKey on any mark. A mark is a standalone moment on the hub branch, not a checkpoint within a pursuit. Milestones do that job.",
  "",
  "Pursuit titles (same as hub Stream): distilled plain-language outcomes (~3–8 words); never verbatim multi-clause dumps. Named methods, treatments, and sub-steps go in milestones[], not in the pursuit title.",
  "",
  STREAM_EXTRACT_TITLE_LENGTH_RULES,
  "",
  "Existing-pursuit-first checklist (per hub, before any new pursuit): (1) same intent → no new row; (2) step/method/treatment/tactic toward existing outcome → milestone with pursuitExistingGoalId; (3) later chapter/higher target → new peer pursuit with distinct title; (4) no plausible same-hub duplicate → new peer with distilled title; (5) unclear milestone-vs-pursuit → prefer the milestone; unclear mark-vs-pursuit → prefer a mark; always emit it. Umbrella + methods in one dump → one pursuit + milestones, never peer pursuits per method.",
  "",
  "1. Read before writing — check all provided hubs' existing pursuits and marks before extracting. A higher/later target for the same activity is a new peer pursuit (later chapter), not a duplicate row on the predecessor.",
  "2. Completion over creation — complete existing pursuits (existingGoalId + COMPLETE) instead of duplicating.",
  "3. Classify: DONE → mark or complete pursuit; PAUSED / dropped / deprioritised → existingGoalId + PAUSED; RESUMING / picking back up → existingGoalId + ACTIVE; otherwise → ACTIVE pursuit (new or embellishment).",
  "Rule 9 — Pursuit status changes (no new row): finished → existingGoalId + COMPLETE; paused/on hold/shelved/dropping for now/deprioritised/back burner → existingGoalId + PAUSED; resuming/back on/picking up again → existingGoalId + ACTIVE. Never create a new pursuit for status-only updates. No milestones on status-only updates.",
  "4A. User-named steps → milestones on the matching pursuit (existing or new this session), even if one visit/session; not peer pursuits.",
  "4B. Do not invent milestone structure; never on identity or MAINTAINING pursuits; max 5 per pursuit.",
  "5. Best-guess placement (never defer) — if status is unclear default to ACTIVE; if the hub is unclear route to the single most likely hub and proceed. Always emit the item; never withhold or flag it over placement or status uncertainty.",
  "6. One clarifying question max (clarifyingQuestion) — still extract confident items.",
  "7. Cross-session deduplication — no duplicates of active OR removed-from-map pursuits/marks on the assigned hub.",
  "8. Embellishment — route new methods/treatments to milestones; never lengthen pursuit title with verbatim method lists.",
  "",
  "Example (hub-scoped): existing \"Improve my teeth\" + user lists Invisalign and bonding → milestones on that goalId only, no peer treatment pursuits.",
  "",
  "## Pursuit nesting (do not infer)",
  "",
  "All new pursuits are peers on their hub track. Never set parentExistingGoalId, parentClientKey, or parentRef.",
  "Later chapters and higher targets are new peer pursuits with distinct titles. Nesting is user-only via edit mode.",
  "",
  "## Pursuit types, mark types, dates, flat milestone refs, itemOrder",
  "",
  "Same rules as hub-scoped Stream: distilled pursuit titles; existing-pursuit-first checklist; 4A user-named steps → milestones; 4B no invented structure; goalType project|identity; habits → MAINTAINING; mark types checkpoint|setback|realisation|decision|achievement; ISO mark dates and pursuit deadlines (fuzzy targets → last day of month/year/quarter); clientKey for new pursuits referenced by milestones; itemOrder follows first mention in the brain dump.",
  "",
  STREAM_PURUIT_REVIEW_RULES,
  "",
  "## Output schema (exact keys)",
  "",
  "{",
  '  "narrativeSentence": "one warm second-person sentence, 20 words max",',
  '  "marks": [{ "title": "string", "date": "YYYY-MM-DD or null", "type": "...", "categorySlug": "slug" }],',
  '  "pursuits": [{ "title": "string", "description": "1-2 sentence summary or null", "goalType": "...", "status": "...", "categorySlug": "slug", "deadline": "YYYY-MM-DD or null", "existingGoalId": "optional/null", "clientKey": "optional/null", "sourcePhrase": "optional", "titleConfidence": "optional", "suggestedTitle": "optional/null", "reviewNote": "optional/null", "eventContext": "optional/null" }],',
  '  "milestones": [{ "title": "string", "categorySlug": "slug", "pursuitExistingGoalId": "string or null", "pursuitClientKey": "string or null" }],',
  '  "itemOrder": [{ "kind": "mark"|"pursuit"|"milestone", "index": 0 }],',
  '  "clarifyingQuestion": "string or null"',
  "}",
  "",
  "- Return empty arrays when nothing applies; do not omit keys.",
  "- Always include narrativeSentence. Use an empty string only when the dump has no substance.",
  "- No markdown, no code fences, no commentary outside JSON.",
].join("\n");

export function buildStreamThemeExtractUserMessage(
  theme: StreamThemeContextInput,
  input: string,
  options: StreamExtractContextOptions = {},
): string {
  const includePriorContext = shouldIncludePriorContext(input);
  const categoryBlocks = theme.categories.map((c) =>
    [
      `### Category: ${c.categoryLabel}`,
      `- categorySlug (slug, required on every item): ${c.categorySlug}`,
      `- branchId (internal, do not echo in output): ${c.branchId}`,
      "",
      "#### Category catalog (scope + routing)",
      formatCategoryCatalogForPrompt({
        about: c.about,
        aiRoutingNote: c.aiRoutingNote,
        belongsHere: c.belongsHere,
        doesNotBelongHere: c.doesNotBelongHere,
        why: "",
        examples: c.examples,
        firstTimeQuestion: "",
        coachMarkHubInstruction: "",
      }),
      "",
      "#### Existing pursuits",
      JSON.stringify(capPromptPursuits(c.existingPursuits)),
      "",
      "#### Existing marks",
      JSON.stringify(capPromptMarks(c.existingMarks)),
      ...(includePriorContext
        ? [
            "",
            "#### Removed from map (dedup only — pursuits)",
            JSON.stringify(capPromptPursuits(c.removedPursuits)),
            "",
            "#### Removed from map (dedup only — marks)",
            JSON.stringify(capPromptMarks(c.removedMarks)),
          ]
        : []),
    ].join("\n"),
  );

  return [
    `Today's date: ${todayYmdUtc()}`,
    "",
    "## PRIMARY INPUT — extract only from this",
    input.trim(),
    "This is the source of truth. Only extract items the user explicitly mentioned.",
    "",
    ...(options.mapContext
      ? [
          "## MAP CONTEXT — use for structure and deduplication",
          JSON.stringify(options.mapContext),
          "Use to place items in correct hub. Complete existing pursuits before creating new ones. Avoid creating duplicate pursuits. Cross-theme items should still be extracted and routed to their correct categorySlug.",
          "",
        ]
      : []),
    ...(options.userContext
      ? [
          "## BACKGROUND CONTEXT — subtle calibration only",
          options.userContext,
          "Use ONLY to better infer hub placement for ambiguous items, understand life stage for appropriate framing, and recognise shorthand references the user makes.",
          "STRICT RULES: Do NOT extract items not mentioned in Stream text. Do NOT create pursuits the user did not describe. Do NOT let profile override what user actually said. Profile context helps placement, never justifies creating additional unmentioned items. One casual mention = one mark at most.",
          "",
        ]
      : []),
    "",
    "## Theme",
    `- themeId: ${theme.themeId}`,
    `- themeName: ${theme.themeName}`,
    "",
    "## Relevant categories in this theme",
    categoryBlocks.join("\n\n"),
    "",
    ...(includePriorContext
      ? [
          "## Previous theme-level Stream sessions",
          theme.previousThemeSessionContext,
          "",
        ]
      : []),
  ].join("\n");
}

function scoreCategoryForText(
  text: string,
  category: StreamThemeContextInput["categories"][number],
): number {
  const lower = text.toLowerCase();
  let score = 0;
  if (lower.includes(category.categorySlug.toLowerCase())) score += 4;
  const label = category.categoryLabel.toLowerCase();
  if (label && lower.includes(label)) score += 3;
  for (const token of `${category.about} ${category.aiRoutingNote}`
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 4)) {
    if (lower.includes(token)) score += 1;
  }
  return score;
}

function fillThemeExtractCategorySlugs(
  data: StreamExtractResponse,
  theme: StreamThemeContextInput,
): StreamExtractResponse {
  const validCategorySlugs = new Set(theme.categories.map((c) => c.categorySlug));
  const defaultCategory = theme.categories[0]?.categorySlug;
  const goalIdToCategory = new Map<string, string>();
  for (const category of theme.categories) {
    for (const p of category.existingPursuits) {
      goalIdToCategory.set(p.goalId, category.categorySlug);
    }
  }

  const resolveRawHub = (raw: string | undefined): string | null => {
    if (!raw?.trim()) return null;
    const slug = normalizeStreamCategorySlug(raw);
    return validCategorySlugs.has(slug) ? slug : null;
  };

  const inferCategory = (title: string, hint?: string | null): string => {
    const fromHint = hint ? resolveRawHub(hint) : null;
    if (fromHint) return fromHint;

    let best = defaultCategory ?? "";
    let bestScore = -1;
    for (const category of theme.categories) {
      const score = scoreCategoryForText(title, category);
      if (score > bestScore) {
        bestScore = score;
        best = category.categorySlug;
      }
    }
    return best;
  };

  const clientKeyToHub = new Map<string, string>();
  const pursuits = data.pursuits.map((p, i) => {
    let categorySlug =
      resolveRawHub(p.categorySlug) ??
      (p.existingGoalId ? goalIdToCategory.get(p.existingGoalId) ?? null : null);
    if (!categorySlug) {
      categorySlug = inferCategory(p.title, p.categorySlug);
      console.warn(`[runStreamThemeExtract] inferred categorySlug for pursuits[${i}]: ${categorySlug}`);
    }
    if (p.clientKey) clientKeyToHub.set(p.clientKey, categorySlug);
    return { ...p, categorySlug };
  });

  const marks = data.marks.map((m, i) => {
    let categorySlug = resolveRawHub(m.categorySlug);
    if (!categorySlug) {
      categorySlug = inferCategory(m.title, m.categorySlug);
      console.warn(`[runStreamThemeExtract] inferred categorySlug for marks[${i}]: ${categorySlug}`);
    }
    return { ...m, categorySlug };
  });

  const milestones = data.milestones.map((ms, i) => {
    let categorySlug: string | null = null;
    if (ms.pursuitRef.kind === "existing") {
      categorySlug = goalIdToCategory.get(ms.pursuitRef.goalId) ?? null;
    } else {
      categorySlug = clientKeyToHub.get(ms.pursuitRef.clientKey) ?? null;
    }
    categorySlug = categorySlug ?? resolveRawHub(ms.categorySlug);
    if (!categorySlug) {
      categorySlug = inferCategory(ms.title, ms.categorySlug);
      console.warn(`[runStreamThemeExtract] inferred categorySlug for milestones[${i}]: ${categorySlug}`);
    }
    return { ...ms, categorySlug };
  });

  return { ...data, marks, pursuits, milestones };
}

export async function runStreamThemeExtract(
  theme: StreamThemeContextInput,
  input: string,
  options: StreamExtractContextOptions = {},
): Promise<StreamExtractResponse> {
  const raw = await generateJsonCompletion({
    system: STREAM_EXTRACT_THEME_SYSTEM_PROMPT,
    user: buildStreamThemeExtractUserMessage(theme, input, options),
    maxTokens: STREAM_THEME_EXTRACT_MAX_TOKENS,
    temperature: 0.2,
    queueKey: options.queueKey,
  });

  if (!raw) {
    throw new Error("Empty extract response.");
  }

  let json: unknown;
  try {
    json = JSON.parse(stripStreamJsonFence(raw));
  } catch {
    throw new Error("Model returned invalid JSON.");
  }

  const withKeys = parseStreamExtractResponse(json);
  return fillThemeExtractCategorySlugs(withKeys, theme);
}

export const STREAM_EXTRACT_GLOBAL_SYSTEM_PROMPT = [
  "Terminology: **taxonomy category** (legacy: hub). JSON routing field is `categorySlug`.",
  "",
  "You are Pathfinder Stream V3: a map-wide extractor that turns free-form user text into confirmed life-map operations.",
  "",
  "You receive the user's full active map. Categories use branch ids in map context. For every NEW mark, pursuit, or milestone, set categorySlug to the exact category id from map context.",
  "For every UPDATE/COMPLETE/HOLD/DELETE operation, reference exact goalId and milestoneId values from map context.",
  "",
  "Core Phase 1 capabilities:",
  "- Create marks and pursuits.",
  "- Do NOT create new milestone cards in global Stream. Keep milestones[] empty; the user can add or confirm milestones later after opening the pursuit.",
  "- Update a pursuit title when the user clearly renames or clarifies it.",
  "- Complete or put on hold an existing pursuit.",
  "- Rename, complete, or delete an existing milestone.",
  "",
  "Ambiguity rule (critical safety):",
  "- Never guess among multiple plausible existing items.",
  "- If more than one existing pursuit or milestone matches the user's description, return NO operation for that intent.",
  "- If the target item is not clearly present in map context, return NO operation for that intent.",
  "- Example: if two milestones contain \"CV\" and the user says \"complete the CV milestone\", do not pick one; omit milestoneCompletions for that phrase.",
  "- Continue extracting other confident items from the same input.",
  "",
  "## Relationship pursuits (People / Family hub)",
  "",
  "When the user states a clear ongoing relationship intention — not mere reflection — extract an ACTIVE pursuit on the Family hub (people theme):",
  '- "I want to protect those bonds…" → pursuit "Protect family bonds" (identity)',
  '- "I want to be present for my children" → pursuit "Be present for my children" (identity or project + MAINTAINING)',
  '- "I am trying to repair / preserve / strengthen…" → short pursuit title reflecting that aim',
  "",
  "Require clear intention phrasing: \"I want to…\", \"I am trying to…\", \"my task is to…\" for ongoing aims.",
  "Do NOT force every emotional sentence into a pursuit. Pure reflection without an ongoing aim stays out of pursuits[].",
  "",
  STREAM_SELF_MIND_THEME_BOUNDARIES,
  "",
  STREAM_PLAY_LEISURE_THEME_BOUNDARIES,
  "",
  "## Purpose & Values vs Job category routing",
  "",
  "Moral/spiritual identity language → Purpose & Values hub (becoming / Self & Mind theme), even when the paragraph also mentions politics or law:",
  '- "keep the ideal alive", moral core, dignity, hope, forgiveness, reconciliation, legacy, conscience → purpose & values',
  "",
  "Career/work language → Job category (work theme):",
  '- legal practice, law firm, attorney, ANC leadership, election campaign, voter education → job',
  "",
  STREAM_EXTRACT_TITLE_LENGTH_RULES,
  "",
  "Creation rules:",
  "- Do not create duplicates of existing pursuits or milestones.",
  "- Never break a new pursuit into milestones during global Stream, even if the user mentions possible steps. Put the overall outcome in pursuits[] only.",
  "- If the user describes a status change for an existing pursuit, use pursuitUpdates, not a new pursuit.",
  "- If the user describes a change to an existing milestone, use milestoneUpdates, milestoneCompletions, or milestoneDeletes, not a new milestone.",
  "- Marks are standalone timeline moments on a hub; milestones belong to pursuits.",
  "- For new pursuits, set deadline when the user states a target/by/end date (ISO YYYY-MM-DD); null if none. Fuzzy: month+year → last day of month; year only or end of year → Dec 31; quarters → last day of quarter.",
  "",
  STREAM_PURUIT_REVIEW_RULES,
  "",
  "Output schema (exact keys, all arrays required):",
  "{",
  '  "narrativeSentence": "one warm second-person sentence, 20 words max",',
  '  "marks": [{ "title": "string", "date": "YYYY-MM-DD or null", "categorySlug": "hub branch id" }],',
  '  "pursuits": [{ "title": "string", "description": "1-2 sentence summary or null", "goalType": "project|identity", "status": "ACTIVE|MAINTAINING|PAUSED|COMPLETE", "categorySlug": "hub branch id", "deadline": "YYYY-MM-DD or null", "clientKey": "optional", "sourcePhrase": "optional", "titleConfidence": "optional", "suggestedTitle": "optional/null", "reviewNote": "optional/null", "eventContext": "optional/null" }],',
  '  "milestones": [],',
  '  "pursuitUpdates": [{ "goalId": "existing goal id", "title": "optional new title", "status": "optional ACTIVE|MAINTAINING|PAUSED|COMPLETE" }],',
  '  "milestoneUpdates": [{ "goalId": "parent goal id", "milestoneId": "existing milestone id", "title": "new milestone title" }],',
  '  "milestoneCompletions": [{ "goalId": "parent goal id", "milestoneId": "existing milestone id", "completedAt": "YYYY-MM-DD or null/omit" }],',
  '  "milestoneDeletes": [{ "goalId": "parent goal id", "milestoneId": "existing milestone id" }],',
  '  "ambiguous": [],',
  '  "itemOrder": [{ "kind": "mark|pursuit|pursuit_update|milestone_update|milestone_complete|milestone_delete", "index": 0 }],',
  '  "clarifyingQuestion": "string or null"',
  "}",
  "",
  "Return empty arrays when nothing applies; do not omit keys. No markdown or commentary outside JSON.",
].join("\n");

export function buildStreamGlobalExtractUserMessage(
  input: string,
  options: StreamExtractContextOptions,
): string {
  return [
    `Today's date: ${todayYmdUtc()}`,
    "",
    "## PRIMARY INPUT — extract only from this",
    input.trim(),
    "This is the source of truth. Only extract items the user explicitly mentioned.",
    "",
    "## FULL MAP CONTEXT",
    JSON.stringify(options.mapContext ?? { themes: [] }),
    "Use exact ids from this context. Hub ids here are branch ids and must be echoed as categorySlug for new items.",
    "",
    ...(options.userContext
      ? [
          "## BACKGROUND CONTEXT — subtle calibration only",
          options.userContext,
          "Use only to interpret shorthand; never create items not mentioned in the primary input.",
          "",
        ]
      : []),
  ].join("\n");
}

export async function runStreamGlobalExtract(
  input: string,
  options: StreamExtractContextOptions,
): Promise<StreamExtractResponse> {
  const raw = await generateJsonCompletion({
    system: STREAM_EXTRACT_GLOBAL_SYSTEM_PROMPT,
    user: buildStreamGlobalExtractUserMessage(input, options),
    maxTokens: STREAM_THEME_EXTRACT_MAX_TOKENS,
    temperature: 0.2,
    queueKey: options.queueKey,
  });

  if (!raw) {
    throw new Error("Empty extract response.");
  }

  let json: unknown;
  try {
    json = JSON.parse(stripStreamJsonFence(raw));
  } catch {
    throw new Error("Model returned invalid JSON.");
  }

  return parseStreamExtractResponse(json);
}

export function buildStreamCategoryContextInput(args: {
  branchId: string;
  themeId: string;
  categoryLabel: string;
  existingPursuits: StreamCategoryContextInput["existingPursuits"];
  existingMarks: StreamCategoryContextInput["existingMarks"];
  removedPursuits: StreamCategoryContextInput["removedPursuits"];
  removedMarks: StreamCategoryContextInput["removedMarks"];
  previousStreamSessionSummary: string;
}): StreamCategoryContextInput {
  const themeLabel = getLifeArea(args.themeId)?.label ?? args.themeId;
  return {
    branchId: args.branchId,
    limbId: args.themeId,
    categoryLabel: args.categoryLabel,
    themeLabel,
    existingPursuits: args.existingPursuits,
    existingMarks: args.existingMarks,
    removedPursuits: args.removedPursuits,
    removedMarks: args.removedMarks,
    previousStreamSessionSummary: args.previousStreamSessionSummary,
  };
}

/** @deprecated Use {@link buildStreamCategoryContextInput}. */
export function buildStreamHubContextInput(
  args: Parameters<typeof buildStreamCategoryContextInput>[0] & { hubLabel?: string },
): StreamCategoryContextInput {
  return buildStreamCategoryContextInput({
    ...args,
    categoryLabel: args.categoryLabel ?? args.hubLabel ?? "",
  });
}
