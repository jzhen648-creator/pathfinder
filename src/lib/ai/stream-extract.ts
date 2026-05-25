import { generateJsonCompletion } from "@/lib/gemini";
import { truncateStreamNarrative } from "@/lib/ai/stream-extract-narrative";
import type { FormattedMapContext } from "@/lib/ai/format-map-context";
import { hubPanelCopy, type HubCatalogEntry } from "@/lib/hub-catalog";
import { getLifeArea } from "@/lib/life-areas";
import { normalizeStreamHubSlug } from "@/lib/resolve-hub-branch";
import {
  parseStreamItemOrder,
  streamExtractResponseSchema,
  type StreamExtractResponse,
  type StreamHubContextInput,
  type StreamThemeContextInput,
} from "@/types/stream";

export const STREAM_THEME_EXTRACT_MAX_TOKENS = 4000;
export const STREAM_EXTRACT_LOW_CONFIDENCE_THRESHOLD = 0.65;

type StreamExtractContextOptions = {
  userContext?: string;
  mapContext?: FormattedMapContext;
};

const STREAM_EXTRACT_BOUNDARY_PAIRS = [
  ["Skills", "Career"],
  ["Purpose", "Inner life"],
  ["Safety net", "Assets"],
  ["Appearance", "Inner life"],
] as const;

const STREAM_EXTRACT_BOUNDARY_PAIR_TEXT = STREAM_EXTRACT_BOUNDARY_PAIRS.map(
  ([a, b]) => `${a} / ${b}`,
).join("; ");

const STREAM_EXTRACT_BOUNDARY_TRIGGER_TEXT = [
  `Use ambiguous[] with confidence < ${STREAM_EXTRACT_LOW_CONFIDENCE_THRESHOLD} for these known adjacent-hub boundaries unless one side is clearly stronger:`,
  "- Skills / Career: learning, credentials, confidence, practice, or mentorship that may be about role progression.",
  "- Purpose / Inner life: meaning, direction, values, identity, or existential reflection with unclear action area.",
  "- Safety net / Assets: insurance, buffers, emergency funds, savings, debt protection, or investable reserves.",
  "- Appearance / Inner life: body image, confidence, mirrors/photos, grooming, shame, self-worth, or presentation.",
  "For each such item, put it only in ambiguous[] with { id, label, reason, confidence }. Keep labels 2-8 words and max 40 characters when possible. In theme-scoped extraction, also include the best-fit hubId slug so the unresolved node appears on the tree.",
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
  stripNullObjectFields(row, ["hubId"]);
  return row;
}

function sanitizeExtractedPursuit(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = { ...(raw as Record<string, unknown>) };
  const parentRef =
    sanitizePursuitRef(row.parentRef) ??
    sanitizeFlatPursuitRef(row, "parentExistingGoalId", "parentClientKey");
  if (parentRef) row.parentRef = parentRef;
  else delete row.parentRef;
  stripNullObjectFields(row, ["clientKey", "hubId"]);
  return row;
}

function sanitizeExtractedMilestone(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = { ...(raw as Record<string, unknown>) };
  const pursuitRef =
    sanitizePursuitRef(row.pursuitRef) ??
    sanitizeFlatPursuitRef(row, "pursuitExistingGoalId", "pursuitClientKey");
  if (!pursuitRef) return null;
  stripNullObjectFields(row, ["hubId"]);
  return { ...row, pursuitRef };
}

function sanitizeAmbiguousItem(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const row = { ...(raw as Record<string, unknown>) };
  stripNullObjectFields(row, ["confidence", "hubId"]);
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
  return {
    ...row,
    narrativeSentence:
      typeof row.narrativeSentence === "string" ? row.narrativeSentence.trim() : "",
    marks,
    pursuits,
    milestones,
    ambiguous: Array.isArray(row.ambiguous) ? row.ambiguous.map(sanitizeAmbiguousItem) : [],
    clarifyingQuestion: row.clarifyingQuestion ?? null,
    itemOrder: parseStreamItemOrder(row.itemOrder, {
      markCount: marks.length,
      pursuitCount: pursuits.length,
      milestoneCount: milestones.length,
    }),
  };
}

function formatStreamExtractParseError(err: { issues: Array<{ message: string; path: PropertyKey[] }> }): string {
  const issue = err.issues[0];
  if (!issue) return "Parsed JSON did not match expected shape.";
  const path = issue.path.length > 0 ? issue.path.map(String).join(".") : "root";
  return `${issue.message} (at ${path})`;
}

export const STREAM_EXTRACT_SYSTEM_PROMPT = [
  "You are Pathfinder Stream: a hub-scoped extractor that turns a free-form brain dump into structured tree updates for ONE hub only.",
  "",
  "You receive:",
  "- Hub metadata (name, theme, catalog description)",
  "- Existing pursuits on this hub (goalId, title, goalType, bloomStatus, parentGoalId — parentGoalId: null means it is currently a root pursuit)",
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
  "Uncertainty about one item must not suppress other confident items. Put only the uncertain item in ambiguous[] and continue extracting the rest.",
  "When the user is changing the shape of an existing map goal — evolving it, picking it back up, stretching the target, pausing it, or pivoting from it — still emit the relevant pursuit update instead of dropping the item.",
  "",
  "Marks always belong to the hub — never to a specific pursuit. Do not set pursuitExistingGoalId or pursuitClientKey on any mark. A mark is a standalone moment on the hub branch, not a checkpoint within a pursuit. Milestones do that job.",
  "",
  "## Pursuit titles (distilled, plain language)",
  "",
  "Pursuit titles are short summaries of the outcome the user cares about — how they would say it in conversation — not a transcript of every treatment, tool, or clause they mentioned.",
  "",
  "- Good: \"Improve my teeth\", \"Move into Head of Product\", \"Build emergency fund\"",
  "- Bad: \"Fix teeth with onlay, composite bonding, and orthodontics\"",
  "- Bad: \"Head of Product transition including mentor search and LinkedIn update\"",
  "",
  "Rules:",
  "- Aim for ~3–8 words: the umbrella outcome or life theme.",
  "- Do NOT stack procedures, brands, modalities, or comma-separated methods in a pursuit title.",
  "- Put named treatments, tactics, appointments, providers, and sub-steps in milestones[] (or child pursuits with flat parent fields only when Rule 6A applies — see Hierarchy inference).",
  "- Marks and milestones may keep slightly more specific wording than the pursuit title; the pursuit title stays the simplest umbrella.",
  "",
  "1. Read before writing",
  "   - Process ALL existing hub data before extracting anything.",
  "   - Never propose a new pursuit whose title clearly matches an existing pursuit on this hub (same intent, paraphrase, or obvious synonym).",
  "   - Exception: a higher/later target for the same activity is a continuation (Rule 6B), not a duplicate peer — use parentExistingGoalId or parentClientKey instead of skipping or duplicating.",
  "   - Never propose a mark whose title clearly matches an existing mark on this hub.",
  "",
  "2. Completion over creation",
  "   - If the user describes something DONE and an open pursuit on this hub already tracks it (ACTIVE), do NOT create a duplicate pursuit.",
  "   - Instead: set existingGoalId to that pursuit's id and bloomStatus \"COMPLETE\". Do not also add a mark for the same fact unless the user is recording a distinct timeline moment (e.g. a specific renewal date) that is not merely \"I finished the pursuit.\"",
  "",
  "3. Classify each distinct item the user mentions",
  "",
  "   DONE (completed fact, past win, already in place):",
  "   → Prefer a mark (timeline moment) when it is a concrete event or state reached at a point in time (insurance renewed, fund hit, certificate received).",
  "   → Prefer completing an existing pursuit (existingGoalId + bloomStatus \"COMPLETE\") when the user is saying a tracked pursuit is finished.",
  "   → Do NOT create a new pursuit with bloomStatus \"COMPLETE\" unless there was no existing pursuit and a mark would be a poor fit (rare).",
  "",
  "   IN PROGRESS or NOT STARTED (actively working, maintaining, gap, plan):",
  "   → If a matching open pursuit exists: do not duplicate; omit from pursuits or update title only (embellishment).",
  "   → If no matching pursuit: new pursuit with bloomStatus \"ACTIVE\", goalType inferred from nature of the work.",
  "",
  "   PAUSED / ON HOLD (shelved, not pursuing for now, taking a break):",
  "   → Match an existing pursuit on this hub and set existingGoalId + bloomStatus \"ON_HOLD\". Do not create a new pursuit.",
  "",
  "   RESUMING (picking back up an ON_HOLD pursuit):",
  "   → existingGoalId + bloomStatus \"ACTIVE\". Do not create a new pursuit.",
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
  "   - Never add milestones to pursuits with goalType \"practice\" or goalType \"identity\" — these have no fixed end state.",
  "   - Max 5 milestones per pursuit. Short actionable titles.",
  "",
  "5. Honest about uncertainty",
  "   - If you cannot tell whether something is done vs in progress vs not started, do NOT guess.",
  `   - If your confidence is below ${STREAM_EXTRACT_LOW_CONFIDENCE_THRESHOLD} for an item's status or hub fit, do NOT guess.`,
  "   - If hub placement, user intent, or pursuit-vs-mark classification is unclear, err toward flagging: put the item only in ambiguous[] with confidence below 0.6.",
  `   - Explicit low-confidence boundary pairs: ${STREAM_EXTRACT_BOUNDARY_PAIR_TEXT}. If the current hub is one side of a boundary pair and the item could belong to the other side, use ambiguous[] unless this hub is clearly stronger.`,
  STREAM_EXTRACT_BOUNDARY_TRIGGER_TEXT,
  "   - Add it to ambiguous[] only; the app will surface it as a needsResolution node for the user.",
  `   - Add an entry to ambiguous[] with a stable id (use a short slug like "amb-1"), a 2-8 word label describing the item (max 40 characters when possible), confidence below ${STREAM_EXTRACT_LOW_CONFIDENCE_THRESHOLD}, and an optional reason.`,
  "   - Do not place uncertain items in marks, pursuits, or milestones — only in ambiguous[]. They appear on the tree immediately for the user to resolve by tapping the node.",
  "",
  "6. One clarifying question max",
  "   - If the dump is too vague to extract anything useful (e.g. one word, no specifics), set clarifyingQuestion to ONE specific question that would unlock extraction.",
  "   - Otherwise clarifyingQuestion must be null.",
  "   - clarifyingQuestion does NOT block extraction: still return any items you can extract with confidence.",
  "",
  "7. Cross-session deduplication",
  "   - Natural speech is repetitive across many sessions. Before creating any new pursuit or mark, check existing pursuits, existing marks, AND removed-from-map pursuits/marks (hidden but still on the user's record).",
  "   - If the user mentions something that is clearly the same as an active OR removed item — same intent, paraphrase, or obvious synonym — do NOT create a duplicate.",
  "   - Instead add an entry to ambiguous[] with label describing the item and reason: \"This already exists on your map (or was removed from it).\" The user resolves it on the tree.",
  "   - Also deduplicate within this extraction: if two marks in the same dump describe the same event — same achievement, same date, same title or obvious paraphrase — extract it once only using the most specific version.",
  "",
  "8. Embellishment over duplication",
  "   - If the user adds detail to an existing pursuit or mark, do NOT create a duplicate row.",
  "   - For pursuits: use existingGoalId + unchanged bloomStatus. Update the pursuit title only if the new wording is a clearer or shorter distilled summary — never replace a short title with a longer verbatim list of methods.",
  "   - Route new methods, treatments, steps, or tactics mentioned in the dump to milestones[] on that pursuit (pursuitExistingGoalId for existing goals), not into the pursuit title.",
  "   - For marks: add a new mark only when the detail is a genuinely distinct timeline moment, not a restatement.",
  "",
  "## Existing-pursuit-first checklist (required before any new pursuit)",
  "",
  "For every candidate new pursuit, scan same-hub existing pursuits first (including removed-from-map titles for dedup):",
  "",
  "1. Same intent / paraphrase / synonym → do not create; use existingGoalId, milestone, or ambiguous[] per other rules.",
  "2. Step, method, treatment, tactic, or named subtask toward an existing pursuit → milestone on that existing pursuit using pursuitExistingGoalId, not a new pursuit and not a peer.",
  "3. Later chapter / higher target / next phase of an existing pursuit → continuation child using parentExistingGoalId, not a peer.",
  "4. No plausible same-hub parent, predecessor, or duplicate exists → new peer pursuit with distilled title.",
  "5. If you cannot decide between milestone vs new pursuit or mark vs pursuit, use ambiguous[] with confidence below 0.6.",
  "",
  "When one brain dump introduces an umbrella outcome AND specific methods:",
  "- One new pursuit with distilled title (e.g. \"Improve my teeth\").",
  "- Methods as milestones on that pursuit (same session: clientKey + pursuitClientKey).",
  "- Never also create peer pursuits for each method.",
  "",
  "## Pursuit types (goalType)",
  "",
  "- \"project\" — has a definable end state or deliverable (write a will, build a fund, get insurance in place)",
  "- \"practice\" — ongoing commitment without a fixed end (review finances monthly, meditate)",
  "- \"identity\" — who I am becoming (be someone who prioritises health)",
  "",
  "## Dates",
  "",
  "- marks[].date: ISO YYYY-MM-DD when inferable from the dump; null if unknown (client defaults to today).",
  "- Resolve relative dates (\"last March\", \"three months ago\") against today's date provided in the user message.",
  "",
  "## Linking milestones to pursuits",
  "",
  "- For an existing pursuit: set milestone.pursuitExistingGoalId to the goalId from hub context and set pursuitClientKey to null.",
  "- For a new pursuit in this extraction: assign a unique clientKey (e.g. \"pursuit-1\") on the pursuit object; set milestone.pursuitClientKey to the same key and pursuitExistingGoalId to null.",
  "- Every new pursuit that has milestones MUST have a clientKey.",
  "",
  "## Hierarchy inference (parent-child pursuits)",
  "",
  "Milestone vs child pursuit (flat parent fields):",
  "- Milestone: a step, method, treatment, or tactic within the same outcome (how to get there).",
  "- Child pursuit (Rule 6A): a distinct sub-goal with its own deliverable that could stand as its own row (e.g. \"Open stocks and shares ISA\" under \"Build £1M ISA portfolio\") — use sparingly; prefer milestones when the user lists implementation options under one outcome.",
  "- When in doubt between a peer pursuit and a milestone on an existing umbrella pursuit, prefer the milestone.",
  "",
  "Rule 6 — Two kinds of parent-child link (same flat parent field mechanism):",
  "",
  "A) Enabler / sub-component — one pursuit is a step toward another still-active goal (not a later chapter):",
  "   'Find a mentor' → child of 'Move into Head of Product'; 'Open a stocks and shares ISA' → child of 'Build £1M ISA portfolio'; 'Update LinkedIn' → child of 'Position for senior roles'.",
  "",
  "B) Continuation (longitudinal progression) — same activity on this hub, later chapter: higher numeric target, later deadline, or explicit 'next level' after an existing pursuit. NOT a duplicate — a successor row:",
  "   - Existing: 'Reach 5,000 subscribers on YouTube by end of 2026'. User adds: 'Reach 10,000 subscribers on YouTube by end of 2027' → NEW pursuit with parentExistingGoalId set to the 5k goal id. Do NOT leave both as peers (parentGoalId null).",
  "   - Existing: 'Build £500k ISA'. User: 'Grow ISA to £1M by 2030' → continuation child of the £500k pursuit.",
  "   - Existing: 'Run first marathon'. User: 'Run sub-3:30 marathon in 2027' → continuation, not a peer.",
  "   Signals: same domain/activity wording, escalating target or later end date, phrases like 'next', 'after that', 'once I hit X', 'stretch goal', 'phase 2', 'evolving into', 'next version', 'picking this back up', 'same goal but', or 'changed shape'.",
  "   If an existing pursuit is a likely predecessor by intent, prefer parentExistingGoalId to that existing goal over creating a fresh peer with no parent.",
  "   Counter-examples (stay peers): unrelated pursuits on the same hub ('Ship newsletter' + 'Learn Figma'); parallel tracks ('Client A revenue' + 'Client B revenue'); same topic but genuinely different goals with no progression ('Start YouTube channel' + 'Guest on podcasts').",
  "",
  "Set the flat parent fields on the child (never on the parent). Use parentExistingGoalId when parent is on this hub (goalId from hub context); use parentClientKey when parent is created in this session (clientKey).",
  "When uncertain between continuation and peer, prefer continuation only when progression is explicit; otherwise leave parentExistingGoalId and parentClientKey unset.",
  "",
  "- Only infer hierarchy within this session or against existing hub pursuits — never cross-hub or cross-theme.",
  "- New continuation pursuit: parentExistingGoalId or parentClientKey is required when Rule 6B applies; do not also set existingGoalId (that is for updating the same row).",
  "- Existing pursuit wrongly stored as a peer: you may set parentExistingGoalId on an embellishment (existingGoalId + unchanged bloomStatus) to link it under the predecessor — same as reparenting an existing row.",
  "- Never set parentExistingGoalId or parentClientKey on existingGoalId when bloomStatus is \"COMPLETE\" or \"ON_HOLD\" (status-only updates).",
  "",
  "Rule 9 — Pursuit status changes (no new row):",
  "When the user is only updating lifecycle status of an existing pursuit — not describing new work — use existingGoalId + bloomStatus. Never create a new pursuit for status-only updates. Do not add milestones on status-only updates.",
  "- Finished / done / launched / completed / achieved / wrapped up → existingGoalId + bloomStatus \"COMPLETE\".",
"- Paused / on hold / shelved / not pursuing right now / taking a break from / dropping for now / deprioritising / back burner → existingGoalId + bloomStatus \"ON_HOLD\".",
"- Resuming / back on / picking up again / active again / returning to it (especially when the pursuit is currently ON_HOLD) → existingGoalId + bloomStatus \"ACTIVE\".",
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
  "Existing pursuits: [{ \"goalId\": \"g1\", \"title\": \"Improve my teeth\", \"bloomStatus\": \"ACTIVE\", ... }]",
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
  "  pursuits: [{ \"title\": \"Improve my teeth\", \"goalType\": \"project\", \"bloomStatus\": \"ACTIVE\", \"clientKey\": \"p1\" }]",
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
  '      "goalType": "project|practice|identity",',
  '      "bloomStatus": "ACTIVE|ON_HOLD|COMPLETE",',
  '      "existingGoalId": "string or omit/null — when updating, completing, pausing, or resuming an existing pursuit; use with unchanged bloomStatus for embellishment (distilled title only if clearer/shorter), or ACTIVE|ON_HOLD|COMPLETE for status changes; do not create a new row",',
  '      "clientKey": "string or omit — required when this is a new pursuit referenced by milestones or as a parent via flat parent fields",',
  '      "parentExistingGoalId": "string or null — existing parent goalId for continuation/child pursuits; null otherwise",',
  '      "parentClientKey": "string or null — parent clientKey when parent is created in this extraction; null otherwise"',
  "    }",
  "  ],",
  '  "milestones": [',
  "    {",
  '      "title": "string",',
  '      "pursuitExistingGoalId": "string or null — existing pursuit goalId this milestone belongs to",',
  '      "pursuitClientKey": "string or null — clientKey of new pursuit this milestone belongs to"',
  "    }",
  "  ],",
  '  "ambiguous": [',
  "    {",
  '      "id": "string",',
  '      "label": "2-8 words, max 40 characters when possible",',
  `      "confidence": "number below ${STREAM_EXTRACT_LOW_CONFIDENCE_THRESHOLD}; below 0.6 when hub, intent, or pursuit-vs-mark is unclear",`,
  '      "reason": "string or null"',
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
  "- Pursuit titles: distilled plain-language outcomes (~3–8 words when possible); never verbatim multi-clause dumps.",
  "- Milestone titles: short, actionable; may name a specific method or treatment.",
  "- Mark titles: concise moment labels; max ~80 characters.",
  "- Ambiguous labels: 2-8 words, max 40 characters when possible.",
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

function formatHubCatalogForPrompt(copy: HubCatalogEntry): string {
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
  hub: StreamHubContextInput,
  input: string,
  options: StreamExtractContextOptions = {},
): string {
  const catalog = formatHubCatalogForPrompt(hubPanelCopy(hub.limbId, hub.hubLabel));
  const includePriorContext = shouldIncludePriorContext(input);
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
    `- hubId (branchId): ${hub.branchId}`,
    `- hubName: ${hub.hubLabel}`,
    `- themeName: ${hub.themeLabel}`,
    `- themeId (limbId): ${hub.limbId}`,
    "",
    "## Hub catalog (scope + routing)",
    catalog,
    "",
    "## Existing pursuits on this hub",
    JSON.stringify(capPromptPursuits(hub.existingPursuits)),
    "",
    "## Existing marks on this hub",
    JSON.stringify(capPromptMarks(hub.existingMarks)),
    "",
    ...(includePriorContext
      ? [
          "## Removed from map (dedup only — hidden pursuits)",
          JSON.stringify(capPromptPursuits(hub.removedPursuits)),
          "",
          "## Removed from map (dedup only — hidden marks)",
          JSON.stringify(capPromptMarks(hub.removedMarks)),
          "",
        ]
      : []),
    ...(includePriorContext
      ? [
          "## Previous Stream sessions on this hub (summary)",
          hub.previousStreamSessionSummary,
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
      bloomStatus: "ACTIVE",
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
  hub: StreamHubContextInput,
  input: string,
  options: StreamExtractContextOptions = {},
): Promise<StreamExtractResponse> {
  const raw = await generateJsonCompletion({
    system: STREAM_EXTRACT_SYSTEM_PROMPT,
    user: buildStreamExtractUserMessage(hub, input, options),
    maxTokens: 4000,
    temperature: 0.2,
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

  const parsed = streamExtractResponseSchema.safeParse(preprocessStreamExtractJson(json));
  if (!parsed.success) {
    throw new Error(formatStreamExtractParseError(parsed.error));
  }

  return assignMissingClientKeys(withTruncatedNarrative(parsed.data));
}

export const STREAM_EXTRACT_THEME_SYSTEM_PROMPT = [
  "You are Pathfinder Stream: a theme-scoped extractor that turns a free-form brain dump into structured tree updates across the provided relevant hubs in ONE life theme.",
  "",
  "You receive:",
  "- Theme metadata (themeId, themeName)",
  "- For each provided hub in this theme: hubId (normalized slug — use exactly as given), hubLabel (display only), catalog description, existing pursuits (goalId, title, goalType, bloomStatus, parentGoalId — parentGoalId: null means it is currently a root pursuit), existing marks",
  "- Optional full-map context for cross-theme placement and deduplication",
  "- Optional user background context for subtle calibration only",
  "- Previous theme-level Stream sessions (truncated text of up to 3 prior brain dumps on this theme)",
  "- The user's brain dump (typed or transcribed)",
  "",
  "Your job: return one warm narrativeSentence plus proposed marks, pursuits, and milestones with correct hub routing, plus flagged ambiguities — never write prose outside JSON, never explain, never ask questions in running text. Return ONLY one valid JSON object matching the schema below.",
  "",
  "## Extraction coverage (read this before routing)",
  "",
  "Messy/contradictory input is normal. Process the whole dump; do not stop after the first obvious cards.",
  "Extract every distinct concrete mark, pursuit, milestone/step, continuation, pause, resume, and status change.",
  "Cross-theme extraction rule: extract ALL concrete items from the input even when they belong outside the theme/hub where Stream was opened. Use map context to route them to the correct hubId. Hub/pursuit context is a placement hint only; do not drop items because they are cross-theme.",
  "Uncertainty about one item must not suppress other confident items: put only that item in ambiguous[] and keep extracting.",
  "If an existing map goal evolves, resumes, stretches, pauses, or pivots, emit the pursuit update instead of dropping it.",
  "Before writing the JSON response, scan the input once more. For each hub topic mentioned, confirm you have emitted at least one structured item (mark, pursuit, or milestone). If a topic has no structured item and you are confident about it, add it now.",
  "If the user's input mentions N distinct concrete outcomes, do not return fewer than N-1 structured items without placing the remainder in ambiguous[].",
  "",
  "## Hub routing (critical)",
  "",
  "- Every mark, pursuit, and milestone MUST include hubId — the normalized slug from hub context (e.g. \"career\", \"skills\", \"builds & launches\" for Work & Career).",
  "- Never use display labels (\"Career\", \"Skills\") as hubId — only the slug.",
  "- Route each item to the hub whose catalog scope and AI routing note best fit the user's intent.",
  "- Work & Career examples: promotions, roles, pivots → career; learning, credentials, mentors, deliberate practice → skills; shipping, portfolios, concrete deliverables → builds & launches.",
  `- When an item could fit two hubs and your routing confidence is below ${STREAM_EXTRACT_LOW_CONFIDENCE_THRESHOLD}, use ambiguous[] instead of guessing. The app will surface it as a needsResolution node.`,
  "- If hub placement, user intent, or pursuit-vs-mark classification is unclear, err toward flagging: put the item only in ambiguous[] with confidence below 0.6.",
  `- Explicit low-confidence boundary pairs: ${STREAM_EXTRACT_BOUNDARY_PAIR_TEXT}. If the user intent sits on one of these boundaries and neither side is clearly stronger, add one ambiguous[] item with confidence below ${STREAM_EXTRACT_LOW_CONFIDENCE_THRESHOLD} and the best-fit hubId slug for where the unresolved node should appear.`,
  STREAM_EXTRACT_BOUNDARY_TRIGGER_TEXT,
  "",
  "## Core principles",
  "",
  "narrativeSentence is a one-sentence, second-person reflection of what you heard. Keep it warm, specific, and at most 20 words.",
  "",
  "Marks always belong to the hub — never to a specific pursuit. Do not set pursuitExistingGoalId or pursuitClientKey on any mark. A mark is a standalone moment on the hub branch, not a checkpoint within a pursuit. Milestones do that job.",
  "",
  "Pursuit titles (same as hub Stream): distilled plain-language outcomes (~3–8 words); never verbatim multi-clause dumps. Named methods, treatments, and sub-steps go in milestones[], not in the pursuit title.",
  "",
  "Existing-pursuit-first checklist (per hub, before any new pursuit): (1) same intent → no new row; (2) step/method/treatment/tactic toward existing outcome → milestone with pursuitExistingGoalId; (3) later chapter/higher target → continuation with parentExistingGoalId; (4) no plausible same-hub parent/predecessor/duplicate → new peer with distilled title; (5) unclear milestone-vs-pursuit or mark-vs-pursuit → ambiguous[] with confidence below 0.6. Umbrella + methods in one dump → one pursuit + milestones, never peer pursuits per method.",
  "",
  "1. Read before writing — check all provided hubs' existing pursuits and marks before extracting. A higher/later target for the same activity is a continuation (Rule 6B), not a duplicate peer.",
  "2. Completion over creation — complete existing pursuits (existingGoalId + COMPLETE) instead of duplicating.",
  "3. Classify: DONE → mark or complete pursuit; PAUSED / dropped / deprioritised → existingGoalId + ON_HOLD; RESUMING / picking back up → existingGoalId + ACTIVE; otherwise → ACTIVE pursuit (new or embellishment).",
  "Rule 9 — Pursuit status changes (no new row): finished → existingGoalId + COMPLETE; paused/on hold/shelved/dropping for now/deprioritised/back burner → existingGoalId + ON_HOLD; resuming/back on/picking up again → existingGoalId + ACTIVE. Never create a new pursuit for status-only updates. No milestones on status-only updates.",
  "4A. User-named steps → milestones on the matching pursuit (existing or new this session), even if one visit/session; not peer pursuits.",
  "4B. Do not invent milestone structure; never on practice/identity; max 5 per pursuit.",
  `5. Honest about uncertainty — use ambiguous[] when status, hub placement, user intent, or pursuit-vs-mark classification is unclear, or when confidence is below ${STREAM_EXTRACT_LOW_CONFIDENCE_THRESHOLD}; use confidence below 0.6 for these flagged cases.`,
  "6. One clarifying question max (clarifyingQuestion) — still extract confident items.",
  "7. Cross-session deduplication — no duplicates of active OR removed-from-map pursuits/marks on the assigned hub.",
  "8. Embellishment — route new methods/treatments to milestones; never lengthen pursuit title with verbatim method lists.",
  "",
  "Example (hub-scoped): existing \"Improve my teeth\" + user lists Invisalign and bonding → milestones on that goalId only, no peer treatment pursuits.",
  "",
  "## Hierarchy inference (parent-child pursuits)",
  "",
  "Milestone vs child pursuit: prefer milestones for methods/treatments/tactics under one outcome; use flat parent fields for distinct sub-goals (Rule 6A). When in doubt, milestone; when classification itself is unclear, use ambiguous[].",
  "",
  "Rule 6 — Two kinds of parent-child link (same flat parent field mechanism):",
  "",
  "A) Enabler / sub-component — step toward another still-active goal: 'Find a mentor' → child of 'Move into Head of Product'; 'Open a stocks and shares ISA' → child of 'Build £1M ISA portfolio'.",
  "",
  "B) Continuation — same activity, later chapter/higher target/later deadline/next level. Existing '5k YouTube' + user wants '10k' → NEW pursuit with parentExistingGoalId set to the 5k goal id, not peer. Same for £500k ISA→£1M, first marathon→sub-3:30.",
  "   Signals: same activity wording, escalating numbers, later dates, 'next' / 'after that' / 'phase 2' / 'evolving into' / 'next version' / 'picking this back up' / 'same goal but' / 'changed shape'.",
  "   If an existing pursuit is a likely predecessor by intent, prefer parentExistingGoalId to that existing goal over creating a fresh peer with no parent.",
  "",
  "Set flat parent fields on the child. Use parentExistingGoalId when parent is listed under #### Existing pursuits; use parentClientKey when parent is created this session.",
  "",
  "- Only infer hierarchy within this session or against existing hub pursuits — never cross-hub or cross-theme.",
  "- When a new pursuit is clearly a child, enabler, OR continuation of an EXISTING pursuit on this hub, set parentExistingGoalId to the goalId from existing pursuits.",
  "- If an existing pursuit has parentGoalId: null but clearly belongs under another existing pursuit on the same hub (especially continuations stored as peers), propose parentExistingGoalId on that existing pursuit — embellishment card (existingGoalId + unchanged bloomStatus), not a new pursuit.",
  "- Never set parentExistingGoalId or parentClientKey on a pursuit that has existingGoalId when bloomStatus is \"COMPLETE\" or \"ON_HOLD\" (status-only updates).",
  "",
  "Examples: £10k ISA→£15k ISA = continuation with parentExistingGoalId; pause flat deposit = existingGoalId + ON_HOLD; dropping broker but keeping CEMAP = ON_HOLD broker plus concrete active CEMAP/planning items.",
  "",
  "## Pursuit types, mark types, dates, flat milestone refs, itemOrder",
  "",
  "Same rules as hub-scoped Stream: distilled pursuit titles; existing-pursuit-first checklist; 4A user-named steps → milestones; 4B no invented structure; goalType project|practice|identity; mark types checkpoint|setback|realisation|decision|achievement; ISO dates; clientKey for new pursuits referenced by milestones; itemOrder follows first mention in the brain dump.",
  "",
  "## Output schema (exact keys)",
  "",
  "{",
  '  "narrativeSentence": "one warm second-person sentence, 20 words max",',
  '  "marks": [{ "title": "string", "date": "YYYY-MM-DD or null", "type": "...", "hubId": "slug" }],',
  '  "pursuits": [{ "title": "string", "goalType": "...", "bloomStatus": "...", "hubId": "slug", "existingGoalId": "optional/null", "clientKey": "optional/null", "parentExistingGoalId": "optional/null", "parentClientKey": "optional/null" }],',
  '  "milestones": [{ "title": "string", "hubId": "slug", "pursuitExistingGoalId": "string or null", "pursuitClientKey": "string or null" }],',
  `  "ambiguous": [{ "id": "string", "label": "2-8 words, max 40 characters when possible", "confidence": "number below ${STREAM_EXTRACT_LOW_CONFIDENCE_THRESHOLD}; below 0.6 when hub, intent, or pursuit-vs-mark is unclear", "reason": "string or null", "hubId": "required slug for theme-scoped ambiguous items" }],`,
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
  const hubBlocks = theme.hubs.map((h) =>
    [
      `### Hub: ${h.hubLabel}`,
      `- hubId (slug, required on every item): ${h.hubId}`,
      `- branchId (internal, do not echo in output): ${h.branchId}`,
      "",
      "#### Hub catalog (scope + routing)",
      formatHubCatalogForPrompt({
        about: h.about,
        aiRoutingNote: h.aiRoutingNote,
        belongsHere: h.belongsHere,
        doesNotBelongHere: h.doesNotBelongHere,
        why: "",
        examples: h.examples,
        firstTimeQuestion: "",
        coachMarkHubInstruction: "",
      }),
      "",
      "#### Existing pursuits",
      JSON.stringify(capPromptPursuits(h.existingPursuits)),
      "",
      "#### Existing marks",
      JSON.stringify(capPromptMarks(h.existingMarks)),
      ...(includePriorContext
        ? [
            "",
            "#### Removed from map (dedup only — pursuits)",
            JSON.stringify(capPromptPursuits(h.removedPursuits)),
            "",
            "#### Removed from map (dedup only — marks)",
            JSON.stringify(capPromptMarks(h.removedMarks)),
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
          "Use to place items in correct hub. Complete existing pursuits before creating new ones. Avoid creating duplicate pursuits. Cross-theme items should still be extracted and routed to their correct hubId.",
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
    "## Relevant hubs in this theme",
    hubBlocks.join("\n\n"),
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

function scoreHubForText(text: string, hub: StreamThemeContextInput["hubs"][number]): number {
  const lower = text.toLowerCase();
  let score = 0;
  if (lower.includes(hub.hubId.toLowerCase())) score += 4;
  const label = hub.hubLabel.toLowerCase();
  if (label && lower.includes(label)) score += 3;
  for (const token of `${hub.about} ${hub.aiRoutingNote}`
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 4)) {
    if (lower.includes(token)) score += 1;
  }
  return score;
}

function fillThemeExtractHubIds(
  data: StreamExtractResponse,
  theme: StreamThemeContextInput,
): StreamExtractResponse {
  const validHubSlugs = new Set(theme.hubs.map((h) => h.hubId));
  const defaultHub = theme.hubs[0]?.hubId;
  const goalIdToHub = new Map<string, string>();
  for (const hub of theme.hubs) {
    for (const p of hub.existingPursuits) {
      goalIdToHub.set(p.goalId, hub.hubId);
    }
  }

  const resolveRawHub = (raw: string | undefined): string | null => {
    if (!raw?.trim()) return null;
    const slug = normalizeStreamHubSlug(raw);
    return validHubSlugs.has(slug) ? slug : slug;
  };

  const inferHub = (title: string, hint?: string | null): string => {
    const fromHint = hint ? resolveRawHub(hint) : null;
    if (fromHint) return fromHint;

    let best = defaultHub ?? "";
    let bestScore = -1;
    for (const hub of theme.hubs) {
      const score = scoreHubForText(title, hub);
      if (score > bestScore) {
        bestScore = score;
        best = hub.hubId;
      }
    }
    return best;
  };

  const clientKeyToHub = new Map<string, string>();
  const pursuits = data.pursuits.map((p, i) => {
    let hubId =
      resolveRawHub(p.hubId) ??
      (p.existingGoalId ? goalIdToHub.get(p.existingGoalId) ?? null : null);
    if (!hubId) {
      hubId = inferHub(p.title, p.hubId);
      console.warn(`[runStreamThemeExtract] inferred hubId for pursuits[${i}]: ${hubId}`);
    }
    if (p.clientKey) clientKeyToHub.set(p.clientKey, hubId);
    return { ...p, hubId };
  });

  const marks = data.marks.map((m, i) => {
    let hubId = resolveRawHub(m.hubId);
    if (!hubId) {
      hubId = inferHub(m.title, m.hubId);
      console.warn(`[runStreamThemeExtract] inferred hubId for marks[${i}]: ${hubId}`);
    }
    return { ...m, hubId };
  });

  const milestones = data.milestones.map((ms, i) => {
    let hubId: string | null = null;
    if (ms.pursuitRef.kind === "existing") {
      hubId = goalIdToHub.get(ms.pursuitRef.goalId) ?? null;
    } else {
      hubId = clientKeyToHub.get(ms.pursuitRef.clientKey) ?? null;
    }
    hubId = hubId ?? resolveRawHub(ms.hubId);
    if (!hubId) {
      hubId = inferHub(ms.title, ms.hubId);
      console.warn(`[runStreamThemeExtract] inferred hubId for milestones[${i}]: ${hubId}`);
    }
    return { ...ms, hubId };
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

  const parsed = streamExtractResponseSchema.safeParse(preprocessStreamExtractJson(json));
  if (!parsed.success) {
    throw new Error(formatStreamExtractParseError(parsed.error));
  }

  const withKeys = assignMissingClientKeys(withTruncatedNarrative(parsed.data));
  return fillThemeExtractHubIds(withKeys, theme);
}

export function buildStreamHubContextInput(args: {
  branchId: string;
  limbId: string;
  hubLabel: string;
  existingPursuits: StreamHubContextInput["existingPursuits"];
  existingMarks: StreamHubContextInput["existingMarks"];
  removedPursuits: StreamHubContextInput["removedPursuits"];
  removedMarks: StreamHubContextInput["removedMarks"];
  previousStreamSessionSummary: string;
}): StreamHubContextInput {
  const themeLabel = getLifeArea(args.limbId)?.label ?? args.limbId;
  return {
    branchId: args.branchId,
    limbId: args.limbId,
    hubLabel: args.hubLabel,
    themeLabel,
    existingPursuits: args.existingPursuits,
    existingMarks: args.existingMarks,
    removedPursuits: args.removedPursuits,
    removedMarks: args.removedMarks,
    previousStreamSessionSummary: args.previousStreamSessionSummary,
  };
}
