/**
 * AI-driven Mandela user simulation — builds the map from scratch via Stream + marks.
 *
 * PREREQUISITE: Run this first so the account is empty with 17 hubs and themes unlocked:
 *   npm run wipe:user-tree -- --email nelson.mandela@pathfinder.test --unlock-themes
 *
 * This script assumes an empty Mandela account with onboarding skipped.
 *
 * BRAIN DUMP DISCLAIMER: The 15 first-person reflections are fictionalized test inputs
 * inspired by public biographical knowledge — not authentic diary entries or quotations.
 *
 * Run (do not execute as part of build):
 *   npx tsx scripts/simulate-mandela.ts
 *
 * Replay Stream commits from checkpoint (no extract API calls; requires rawExtraction in JSON):
 *   REPLAY_STREAM_CHECKPOINT=1 npx tsx scripts/simulate-mandela.ts
 *
 * Smoke mode (first N brain dumps only):
 *   MAX_STREAM_SESSIONS=3 API_BASE=http://localhost:3001 npx tsx scripts/simulate-mandela.ts
 *
 * Smoke mode without Story/Insights AI (Stream + marks + routing checks only):
 *   MAX_STREAM_SESSIONS=3 SKIP_STORY_INSIGHTS=1 API_BASE=http://localhost:3001 npx tsx scripts/simulate-mandela.ts
 *
 * Skip specific brain dumps (no extract call; session recorded as skipped):
 *   SKIP_BRAIN_DUMP_IDS=03-underground-rivonia MAX_STREAM_SESSIONS=6 npx tsx scripts/simulate-mandela.ts
 *
 * Requires: GEMINI_API_KEY on the API server, API_BASE pointing at a running backend.
 * Production/Vercel targets require ALLOW_PROD_SIMULATION=1.
 */
import "dotenv/config";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LIFE_AREAS } from "../src/lib/life-areas";
import { normalizeHubLabelKey } from "../src/lib/taxonomy";
import type { LifeAreaId } from "../src/lib/types";
import type {
  ExtractedMark,
  ExtractedMilestone,
  ExtractedPursuit,
  StreamExtractResponse,
  StreamGlobalCommitPayload,
} from "../src/types/stream";
import type { StoryPayload } from "../src/lib/story/story-types";
import type { InsightCachePayload } from "../src/lib/insights/insight-types";

// ——— Config ———

const MANDELA_EMAIL = "nelson.mandela@pathfinder.test";
const MANDELA_PASSWORD = "password123";
const AI_CALL_DELAY_MS = Number(process.env.AI_CALL_DELAY_MS ?? "60000");
const DB_WRITE_DELAY_MS = Number(process.env.DB_WRITE_DELAY_MS ?? "10000");
const MAX_STREAM_SESSIONS = Number(process.env.MAX_STREAM_SESSIONS ?? "15");
const REPLAY_STREAM_CHECKPOINT = process.env.REPLAY_STREAM_CHECKPOINT === "1";
const SKIP_STORY_INSIGHTS = process.env.SKIP_STORY_INSIGHTS === "1";
const SKIP_STORY_INSIGHTS_REASON =
  "SKIP_STORY_INSIGHTS=1 (smoke harness — Story/Insights AI calls omitted)";
const SKIP_BRAIN_DUMP_REASON = "Skipped by SKIP_BRAIN_DUMP_IDS";

function parseSkipBrainDumpIds(): Set<string> {
  const raw = process.env.SKIP_BRAIN_DUMP_IDS?.trim();
  if (!raw) return new Set();
  return new Set(raw.split(",").map((id) => id.trim()).filter(Boolean));
}

const SKIP_BRAIN_DUMP_IDS = parseSkipBrainDumpIds();
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
/** Always next to this script — not `process.cwd()` — so runs from any directory write the same file. */
const RESULTS_PATH = resolve(SCRIPT_DIR, "simulate-mandela-results.json");

type SimulationStatus = "running" | "completed" | "failed";

function createRunId(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `mandela-${stamp}-pid${process.pid}`;
}

/** Extra cooldown applied before the next AI call after a 429 exhausts retries. */
let pendingAiCooldownMs = 0;

const BRAIN_DUMP_DISCLAIMER =
  "Fictionalized first-person test reflections inspired by public biographical knowledge — " +
  "not authentic diary entries or quotations.";

function looksLikeProductionApiBase(base: string): boolean {
  const lower = base.toLowerCase();
  if (lower.includes("vercel.app") || lower.includes("vercel.com")) return true;
  if (!lower.startsWith("https://")) return false;
  return !lower.includes("localhost") && !lower.includes("127.0.0.1");
}

function resolveApiBase(): string {
  const base = (process.env.API_BASE ?? "http://localhost:3000").replace(/\/$/, "");
  if (looksLikeProductionApiBase(base) && process.env.ALLOW_PROD_SIMULATION !== "1") {
    throw new Error(
      `Refusing production API base "${base}". Set ALLOW_PROD_SIMULATION=1 to opt in explicitly.`,
    );
  }
  return base;
}

const API_BASE = resolveApiBase();

function estimateMinimumRuntimeMs(sessionCount: number): number {
  const interSessionDelays = Math.max(0, sessionCount - 1);
  const storyInsightDelays = SKIP_STORY_INSIGHTS ? 0 : 2;
  return interSessionDelays * AI_CALL_DELAY_MS + storyInsightDelays * AI_CALL_DELAY_MS + 4 * DB_WRITE_DELAY_MS;
}

function streamSessionsToRun(): readonly (typeof BRAIN_DUMPS)[number][] {
  const limit = Math.min(Math.max(1, MAX_STREAM_SESSIONS), BRAIN_DUMPS.length);
  return BRAIN_DUMPS.slice(0, limit);
}

// ——— Brain dumps (Phase 2) ———

const BRAIN_DUMPS: readonly { id: string; label: string; text: string }[] = [
  {
    id: "01-law-anc",
    label: "Early law career and ANC",
    text: `I qualified as an attorney in Johannesburg and opened Mandela and Tambo with Oliver Tambo — the first Black law firm in the country. Every day we sat with people whose dignity the state refused to recognise. That work taught me that law could shield the vulnerable, but also that courts alone would never dismantle apartheid. In 1944 I joined the ANC Youth League because I wanted organised political action, not passive petitioning. I am trying to build a legal practice that sustains my family while I grow into national leadership within the movement.`,
  },
  {
    id: "02-winnie-family",
    label: "Marriage to Winnie and family",
    text: `Marrying Winnie changed the texture of my life. She carried courage I admired and bore costs I could not always shield her from. Our daughters needed a father present, yet the struggle kept pulling me into meetings, trials, and long absences. I think often of my children in the Transkei and later in Soweto — their schooling, their safety, the ordinary moments I missed. Family is not separate from the cause; it is the reason the cause must succeed. I want to protect those bonds even when the movement demands everything.`,
  },
  {
    id: "03-underground-rivonia",
    label: "Underground activism and Rivonia",
    text: `After Sharpeville the state banned the ANC and left us little choice but to go underground. We debated non-violence against a regime that answered protest with massacre. I accepted that MK would exist, even as I feared where it might lead. The Rivonia raid in 1963 ended that chapter abruptly. In the dock I tried to speak for a nation, not for myself alone. I know the state wants to break the leadership; my task now is to keep the ideal alive whatever sentence follows.`,
  },
  {
    id: "04-robben-early-years",
    label: "First years on Robben Island",
    text: `Robben Island in those first years was designed to crush the spirit — cold cells, hard labour in the quarry, petty humiliations from warders who enjoyed our suffering. Many nights I wondered whether we would die anonymous on this rock. Yet something in me refused to let them define my inner life. We created routines: exercise when allowed, shared news smuggled in, discipline where we could. Dignity became a daily practice, not a slogan. I am learning that survival itself can be a form of resistance when the state wants you erased.`,
  },
  {
    id: "05-prison-study-hope",
    label: "Study, reading, and hope in prison",
    text: `On the island I continued studying toward my LLB through correspondence, reading history, law, and poetry when books reached us. Education became proof that they had not closed my mind. I copied notes by hand, debated cases with comrades, and kept a long view when the present felt unbearable. Hope is not naive optimism — it is the decision to prepare for a country we had not yet seen. I want to finish my legal studies and sharpen the arguments we will need when negotiations finally become possible.`,
  },
  {
    id: "06-prisoner-bonds",
    label: "Bonds with fellow prisoners",
    text: `Walter Sisulu, Ahmed Kathrada, and so many others became brothers on the island. We disagreed, laughed, mourned comrades who did not survive, and held each other accountable to the standards we preached outside. Friendship inside prison is not leisure — it is mutual protection against despair. I learned as much from their integrity as from any book. When one of us broke under pressure, we asked how the collective failed him. I want to honour those friendships and the loyalty that kept the movement coherent across decades inside.`,
  },
  {
    id: "07-secret-talks",
    label: "Secret negotiations with government",
    text: `By the mid-1980s it was clear that neither side could win by force alone. Through careful channels I began speaking with government emissaries while still a prisoner. Many comrades feared betrayal; I understood that fear. My conviction was that we had to test whether a negotiated settlement was possible without abandoning one person one vote. Each secret meeting carried risk — for me, for Winnie, for the movement. I am trying to explore peace without surrendering the moral core of our struggle.`,
  },
  {
    id: "08-release",
    label: "Release after 27 years",
    text: `Walking out of Victor Verster on 11 February 1990 felt unreal — cameras, crowds, the world's eyes, and inside me a mix of joy and grave responsibility. Freedom is not the end of the struggle; it is the moment the real political work accelerates. I told supporters to put down weapons and channel energy into building. Some thought me too cautious; I feared civil war more than I feared being called soft. I want to reunite with family, rebuild the ANC in the open, and prove that prison did not poison my commitment to democracy.`,
  },
  {
    id: "09-reconciliation-trc",
    label: "Reconciliation and the TRC",
    text: `Reconciliation does not mean forgetting. After liberation I believed we needed truth before we could build trust. The Truth and Reconciliation Commission was painful for victims and awkward for former oppressors, yet silence would have rotted the new country from within. I watched mothers describe murders and felt the weight of every life lost. Forgiveness is a gift the injured may offer; it cannot be commanded. My role is to model that we can disagree fiercely without becoming the mirror of what we fought — and to keep national unity from collapsing into revenge.`,
  },
  {
    id: "10-election",
    label: "Presidential election campaign",
    text: `The 1994 election was the prize and the test. We campaigned across a fractured country where fear still lived in every township and farm. I travelled constantly, urging calm when violence flared, reminding people that their vote was the weapon we had always wanted. Winning mattered less than legitimacy — the world had to see South Africans choose democracy together. I am focused on voter education, party unity, and ensuring the transition government actually hands over power if we win. This is the culmination of everything since 1944.`,
  },
  {
    id: "11-governing-economy",
    label: "Governing and economic challenges",
    text: `As president the inbox was merciless — housing, unemployment, crumbling schools, a economy built to exclude most Black South Africans. The Reconstruction and Development Programme was our promise to redirect resources toward ordinary people, not just elites swapping seats. International investors watched for stability; our people watched for houses and clinics. I had to balance growth and redistribution without pretending trade-offs did not exist. Every cabinet meeting reminded me that liberation without material improvement would breed cynicism faster than any opposition party.`,
  },
  {
    id: "12-children-grandchildren",
    label: "Children and grandchildren",
    text: `Public life stole years from my children that no apology can fully return. Zindzi and Zenani grew up with a father more present in headlines than at the dinner table. Now I see grandchildren and feel time compress — I want them to know the man, not only the myth. Family gatherings are brief and precious. Winnie and I walked separate paths, yet love for the children remained constant. I am trying to be present now, to listen more than I lecture, and to leave them integrity rather than merely a famous surname.`,
  },
  {
    id: "13-health-decline",
    label: "Health decline in later years",
    text: `Age eventually speaks louder than will. Recurrent lung problems from the quarry dust, prostate treatment, fatigue that no schedule respects — I have had to accept that the body sets limits the spirit resists. Hospital stays feel like interruptions in work still unfinished. Doctors advise rest; my mind still drafts speeches. I want to manage my health honestly so I can remain useful to the foundation and to younger leaders. There is no shame in slowing down if one does not abandon the commitments that matter.`,
  },
  {
    id: "14-legacy-elders",
    label: "Legacy and The Elders",
    text: `Stepping down after one term was as important as winning office — democracies die when leaders cling to power. The Nelson Mandela Foundation, 46664, and later The Elders let me channel influence without holding office. I choose causes carefully: HIV stigma, peace mediation, education. Legacy is not statues; it is whether institutions outlive the personality that founded them. I want younger Africans to inherit tools for dialogue, not dependency on a single old man. The work continues through them.`,
  },
  {
    id: "15-full-arc-reflection",
    label: "Full-life reflection across themes",
    text: `Looking back from Johannesburg across nearly a century, I see one continuous thread: dignity for people the system treated as less than human. Law, prison, negotiation, presidency, family, illness — different chapters, same question. Did we leave South Africans freer and more responsible for one another? Finance and housing still betray the promise for too many. Relationships sustained and wounded me. Inner life kept me sane. I am not finished while inequality persists, but I am at peace knowing the struggle was never mine alone.`,
  },
];

// ——— Types ———

type AuthSession = { token: string; email: string };

type BranchRow = {
  id: string;
  limbId: string;
  label: string | null;
  name: string | null;
  isSystemCategory?: boolean;
  parentCategoryId?: string | null;
};

type GoalRow = {
  id: string;
  title: string;
  categoryId: string | null;
  limbId: string | null;
  goalType?: string | null;
};

type ExtractedCardLog = {
  type: string;
  targetHub: string;
  confidence: string;
  title: string;
  resolvedHub?: string;
  resolutionConfidence?: HubResolutionConfidence;
};

type HubResolutionConfidence =
  | "exact"
  | "alias"
  | "theme-default"
  | "keyword"
  | "fallback"
  | "unresolved";

type HubResolution = {
  hubId: string | null;
  hubLabel?: string;
  themeId?: LifeAreaId;
  confidence: HubResolutionConfidence;
  reason: string;
  inferredTheme?: LifeAreaId;
  extractedTheme?: LifeAreaId | null;
  conflictOverride?: boolean;
};

type HubResolutionLog = {
  itemType: string;
  itemTitle: string;
  extractedTarget: string;
  inferredTheme?: LifeAreaId;
  extractedTheme?: LifeAreaId | null;
  resolvedHubId: string | null;
  resolvedHubLabel?: string;
  themeId?: LifeAreaId;
  confidence: HubResolutionConfidence;
  conflictOverride?: boolean;
  reason: string;
};

type HubResolutionStats = {
  exact: number;
  alias: number;
  "theme-default": number;
  keyword: number;
  fallback: number;
  unresolved: number;
  skipped: number;
};

type StreamSummary = {
  sessionsExtracted: number;
  sessionsCommitted: number;
  cardsSkippedUnresolvedHub: number;
  extractedMarksSkipped: number;
  manualMarksCreated: number;
  hubResolution: HubResolutionStats;
  pursuitsByTheme: Record<string, number>;
  pursuitsByHub: Record<string, number>;
  skippedStoryInsights: boolean;
  skippedBrainDumpIds?: string[];
  titleQualityWarnings?: TitleQualityWarning[];
};

type TitleQualityWarning = {
  title: string;
  sourceBrainDumpId?: string;
  issues: Array<"over_preferred_length" | "ellipsis" | "truncated_fragment">;
  detail: string;
};

type StreamSessionResult = {
  id: string;
  label: string;
  input: string;
  skipped?: boolean;
  skipReason?: string;
  extractStatus: number;
  extractError: string | null;
  extractErrorKind?: "extract_validation_error" | "rate_limit" | "service_error" | null;
  extractValidationPath?: string | null;
  rawExtraction?: StreamExtractResponse;
  extractedCards: ExtractedCardLog[];
  skippedStreamMarks?: ExtractedCardLog[];
  hubResolutionLogs?: HubResolutionLog[];
  unsupportedOrUncommitted: ExtractedCardLog[];
  commitStatus: number | null;
  commitError: string | null;
  commitCreated: { marks: number; pursuits: number; milestones: number } | null;
  pursuitsCreatedThisSession: CreatedPursuitRecord[];
};

type CreatedPursuitRecord = {
  id: string;
  title: string;
  hubLabel: string;
  categoryId: string;
  limbId: LifeAreaId;
  sourceBrainDumpId: string;
};

type MarkRecord = {
  title: string;
  hubLabel: string;
  limbId: LifeAreaId;
  categoryId: string;
  date: string;
};

type CheckStrength = "strong" | "weak" | "fail";

type QualityCheck = {
  id: string;
  label: string;
  passed: boolean;
  strength: CheckStrength;
  detail: string;
  pursuitNamed?: boolean;
};

type RateLimitEvent = {
  at: string;
  path: string;
  label: string;
  attempt: number;
  waitMs: number;
  retryAfterHeader: string | null;
};

type HubRoutingResult = {
  approximatePercent: number;
  matched: number;
  misrouted: number;
  unknown: number;
  total: number;
  detail: string;
  misroutedExamples: string[];
  unknownExamples: string[];
};

type PhaseSkippedResult = { skipped: true; reason: string };
type PhaseStoryResult = { generate: unknown; fetch: unknown };
type PhaseInsightResult = { generate: unknown; fetch: unknown };

type SimulationResults = {
  runId: string;
  status: SimulationStatus;
  maxStreamSessions: number;
  startedAt: string;
  completedAt?: string;
  email: string;
  apiBase: string;
  config: {
    aiCallDelayMs: number;
    dbWriteDelayMs: number;
    estimatedMinRuntimeMs: number;
    maxStreamSessions: number;
    skipStoryInsights: boolean;
    skipBrainDumpIds?: string[];
  };
  rateLimitEvents: RateLimitEvent[];
  phase1?: { ok: boolean; factCount: number; response: unknown };
  phase2?: { sessions: StreamSessionResult[] };
  phase3?: { marks: MarkRecord[] };
  phase4?: PhaseStoryResult | PhaseSkippedResult;
  phase5?: PhaseInsightResult | PhaseSkippedResult;
  phase6?: {
    mode: "full" | "smoke";
    storyChecks: QualityCheck[];
    insightChecks: QualityCheck[];
    smokeChecks?: QualityCheck[];
    hubRouting: HubRoutingResult;
    titleQualityWarnings?: TitleQualityWarning[];
  };
  createdPursuits: CreatedPursuitRecord[];
  streamSummary?: StreamSummary;
  skippedStoryInsights?: boolean;
  stats: { aiCalls: number; runtimeMs: number };
};

type EvalContext = {
  pursuits: CreatedPursuitRecord[];
  pursuitTitles: string[];
  hubLabels: string[];
  themeIds: LifeAreaId[];
};

// ——— Helpers ———

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitWithCountdown(label: string, ms: number): Promise<void> {
  const totalSec = Math.ceil(ms / 1000);
  for (let remaining = totalSec; remaining > 0; remaining -= 1) {
    process.stdout.write(`\r${label} ${remaining}s...   `);
    await sleep(1000);
  }
  process.stdout.write(`\r${label} done.          \n`);
}

async function apiFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: T; headers: Headers }> {
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: T;
  try {
    body = text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    body = { error: text } as T;
  }
  return { status: res.status, body, headers: res.headers };
}

async function waitBeforeAiCall(label: string): Promise<void> {
  const total = AI_CALL_DELAY_MS + pendingAiCooldownMs;
  pendingAiCooldownMs = 0;
  if (total > 0) {
    await waitWithCountdown(label, total);
  }
}

async function apiFetchAi<T>(
  token: string,
  path: string,
  init: RequestInit,
  results: SimulationResults,
  label: string,
): Promise<{ status: number; body: T }> {
  const maxRetries = 2;
  let attempt = 0;

  while (true) {
    const { status, body, headers } = await apiFetch<T>(token, path, init);

    if (status === 429 && attempt < maxRetries) {
      const retryAfterHeader = headers.get("Retry-After");
      let waitMs = AI_CALL_DELAY_MS * 2;
      if (retryAfterHeader) {
        const sec = Number.parseInt(retryAfterHeader, 10);
        if (Number.isFinite(sec) && sec > 0) waitMs = sec * 1000;
      }
      results.rateLimitEvents.push({
        at: new Date().toISOString(),
        path,
        label,
        attempt: attempt + 1,
        waitMs,
        retryAfterHeader,
      });
      saveCheckpoint(results);
      console.warn(`\n  Rate limited on ${label} (HTTP 429). Waiting ${Math.round(waitMs / 1000)}s before retry ${attempt + 1}/${maxRetries}.`);
      await waitWithCountdown(`Rate limited (${label})`, waitMs);
      attempt += 1;
      continue;
    }

    if (status === 429) {
      pendingAiCooldownMs = AI_CALL_DELAY_MS * 2;
    }

    return { status, body };
  }
}

async function loginMobile(email: string, password: string): Promise<AuthSession> {
  const res = await fetch(`${API_BASE}/api/auth/mobile-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as { token?: string; error?: string; user?: { email?: string } };
  if (!res.ok || !body.token) {
    throw new Error(`Mobile login failed (${res.status}): ${body.error ?? "no token"}`);
  }
  return { token: body.token, email: body.user?.email ?? email };
}

function assertWritableResultsPath(): void {
  const normalized = RESULTS_PATH.replace(/\\/g, "/").toLowerCase();
  if (normalized.includes(".bak.") || normalized.endsWith(".bak.json")) {
    throw new Error(`Refusing to write checkpoint to backup path: ${RESULTS_PATH}`);
  }
}

function writeCheckpointAtomic(results: SimulationResults): void {
  assertWritableResultsPath();
  const tmpPath = `${RESULTS_PATH}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(results, null, 2), "utf8");
  renameSync(tmpPath, RESULTS_PATH);
}

/** First write after backup — takes ownership of the results file for this run. */
function claimCheckpoint(results: SimulationResults): void {
  writeCheckpointAtomic(results);
}

function saveCheckpoint(results: SimulationResults): void {
  if (existsSync(RESULTS_PATH)) {
    try {
      const onDisk = JSON.parse(readFileSync(RESULTS_PATH, "utf8")) as SimulationResults;
      if (onDisk.runId && onDisk.runId !== results.runId) {
        throw new Error(
          `Checkpoint runId mismatch: ${RESULTS_PATH} belongs to run ${onDisk.runId}, not ${results.runId}. ` +
            "Another simulation process may be writing concurrently — aborting.",
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Checkpoint runId mismatch:")) {
        throw err;
      }
      // Unreadable checkpoint — overwrite with this run's data.
    }
  }

  writeCheckpointAtomic(results);
}

function backupResultsCheckpointIfExists(): string | null {
  if (!existsSync(RESULTS_PATH)) return null;
  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  const backupPath = resolve(SCRIPT_DIR, `simulate-mandela-results.${stamp}.bak.json`);
  copyFileSync(RESULTS_PATH, backupPath);
  return backupPath;
}

function loadCheckpoint(): SimulationResults | null {
  if (!existsSync(RESULTS_PATH)) return null;
  try {
    return JSON.parse(readFileSync(RESULTS_PATH, "utf8")) as SimulationResults;
  } catch {
    return null;
  }
}

function emptyHubResolutionStats(): HubResolutionStats {
  return {
    exact: 0,
    alias: 0,
    "theme-default": 0,
    keyword: 0,
    fallback: 0,
    unresolved: 0,
    skipped: 0,
  };
}

function bumpResolutionStat(stats: HubResolutionStats, confidence: HubResolutionConfidence): void {
  if (confidence === "unresolved") {
    stats.unresolved += 1;
    stats.skipped += 1;
  } else {
    stats[confidence] += 1;
  }
}

function hubLabelFromBranch(branch: BranchRow | undefined): string {
  if (!branch) return "(unknown)";
  return (branch.label ?? branch.name ?? branch.id).trim() || branch.id;
}

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase();
}

function titleMatchesAny(text: string, titles: string[]): boolean {
  const hay = normalizeTitle(text);
  return titles.some((t) => {
    const needle = normalizeTitle(t);
    return needle.length > 0 && hay.includes(needle);
  });
}

const THEME_DISPLAY: Record<LifeAreaId, string[]> = {
  work: ["work", "career", "work & career"],
  people: ["people", "family", "relationships", "people & relationships"],
  becoming: ["becoming", "purpose", "inner life"],
  health: ["health", "movement", "rest", "nutrition"],
  finance: ["finance", "money", "income", "assets", "economic"],
};

const MANDELA_CONTEXT_KEYWORDS = [
  "mandela",
  "robben",
  "rivonia",
  "anc",
  "winnie",
  "apartheid",
  "soweto",
  "trc",
  "reconciliation",
  "victor verster",
  "tambo",
  "sisulu",
  "kathrada",
  "nobel",
  "presidency",
  "johannesburg",
  "south africa",
  "transkei",
  "46664",
  "elders",
  "rdp",
  "1994",
  "27 years",
];

function mandelaContextMatch(text: string): boolean {
  const lower = text.toLowerCase();
  return MANDELA_CONTEXT_KEYWORDS.some((k) => lower.includes(k));
}

function hubOrThemeMatch(text: string, hubLabels: string[], themeIds: LifeAreaId[]): boolean {
  const lower = text.toLowerCase();
  if (hubLabels.some((h) => h.length > 2 && lower.includes(h.toLowerCase()))) return true;
  for (const themeId of themeIds) {
    if (lower.includes(themeId)) return true;
    for (const alias of THEME_DISPLAY[themeId]) {
      if (lower.includes(alias)) return true;
    }
  }
  return false;
}

function matchContent(text: string, ctx: EvalContext): { strength: CheckStrength; pursuitNamed: boolean; detail: string } {
  const pursuitNamed = titleMatchesAny(text, ctx.pursuitTitles);
  if (pursuitNamed) {
    return { strength: "strong", pursuitNamed: true, detail: "References a created pursuit title." };
  }
  if (hubOrThemeMatch(text, ctx.hubLabels, ctx.themeIds) && mandelaContextMatch(text)) {
    return {
      strength: "weak",
      pursuitNamed: false,
      detail: "References hub/theme with Mandela-specific context (weak pass).",
    };
  }
  return { strength: "fail", pursuitNamed: false, detail: "No pursuit, hub/theme, or Mandela-specific reference." };
}

function buildEvalContext(pursuits: CreatedPursuitRecord[]): EvalContext {
  return {
    pursuits,
    pursuitTitles: [...new Set(pursuits.map((p) => p.title))],
    hubLabels: [...new Set(pursuits.map((p) => p.hubLabel))],
    themeIds: [...new Set(pursuits.map((p) => p.limbId))],
  };
}

function collectProse(story: StoryPayload): string {
  return [
    story.opening,
    ...story.strengths.map((s) => `${s.pursuitTitle} ${s.body}`),
    ...story.gaps.map((g) => `${g.pursuitTitle} ${g.body}`),
    story.comparison,
    story.focus,
    story.closing,
  ].join("\n");
}

function collectInsightProse(cache: InsightCachePayload): string {
  const g = cache.global;
  return [
    g.greeting,
    ...g.sections.map((s) => `${s.title} ${s.body}`),
    g.streamCta ?? "",
  ].join("\n");
}

const HEDGING_PHRASES = [
  "it seems",
  "it seems like",
  "you might want",
  "you might want to consider",
  "perhaps",
  "could be worth",
  "might want to consider",
  "it may be helpful",
  "consider exploring",
  "unlock your potential",
  "journey",
  "try to",
];

const POSTER_PHRASES = [
  "you've got this",
  "keep pushing",
  "amazing progress",
  "crushing it",
];

function findPhrases(text: string, phrases: string[]): string[] {
  const lower = text.toLowerCase();
  return phrases.filter((p) => lower.includes(p));
}

function inferExpectedTheme(title: string): LifeAreaId | "unknown" {
  const t = title.toLowerCase();
  const rules: Array<{ theme: LifeAreaId; pattern: RegExp }> = [
    {
      theme: "people",
      pattern: /\b(winnie|family|children|grandchild|marriage|wife|friend|friendship|romance|daughter|son|zindzi|zenani|protect family bonds|protect those bonds)\b/,
    },
    {
      theme: "becoming",
      pattern:
        /\b(prison|robben|forgiv|reconcil|trc|inner|hope|dignity|spirit|legacy|elders|foundation|purpose|nobel|negotiat|ideal|moral core|conscience|resilience|truth|forgiveness)\b/,
    },
    {
      theme: "health",
      pattern: /\b(health|hospital|prostate|lung|fatigue|rest|appearance|medical|quarry dust)\b/,
    },
    {
      theme: "finance",
      pattern: /\b(money|finance|economic|rdp|housing|deposit|income|assets|debt|poverty|unemployment|redistribution)\b/,
    },
    {
      theme: "work",
      pattern: /\b(law|attorney|anc|president|election|campaign|career|presidency|cabinet|codesa|mk|defiance|law firm|voter)\b/,
    },
  ];
  const matches = rules.filter((r) => r.pattern.test(t));
  if (matches.length === 0) return "unknown";
  if (matches.length === 1) return matches[0]!.theme;
  return matches[0]!.theme;
}

function isRoadmapGoal(goal: GoalRow): boolean {
  return goal.goalType !== "moment" && goal.goalType !== "event";
}

function collectGoalIds(goals: GoalRow[]): Set<string> {
  return new Set(goals.filter(isRoadmapGoal).map((g) => g.id));
}

// ——— Hub resolution ———

const INVALID_HUB_TOKENS = new Set(["", "themes", "theme", "root", "null"]);

const BRAIN_DUMP_THEME_HINTS: Record<string, LifeAreaId> = {
  "01-law-anc": "work",
  "02-winnie-family": "people",
  "03-underground-rivonia": "work",
  "04-robben-early-years": "becoming",
  "05-prison-study-hope": "becoming",
  "06-prisoner-bonds": "people",
  "07-secret-talks": "becoming",
  "08-release": "becoming",
  "09-reconciliation-trc": "becoming",
  "10-election": "work",
  "11-governing-economy": "finance",
  "12-children-grandchildren": "people",
  "13-health-decline": "health",
  "14-legacy-elders": "becoming",
  "15-full-arc-reflection": "becoming",
};

const THEME_DEFAULT_HUB_PREFERENCE: Record<LifeAreaId, string[]> = {
  work: ["Career", "Builds & Launches", "Skills"],
  people: ["Family", "Friendships", "Romance"],
  becoming: ["Purpose & Values", "Mind & Emotions", "Joy & Creativity"],
  health: ["Rest", "Movement", "Nutrition", "Appearance"],
  finance: ["Assets", "Income", "Safety net", "Liabilities"],
};

const ALL_THEMES: LifeAreaId[] = ["work", "becoming", "people", "health", "finance"];

type ThemeScoringRule = {
  theme: LifeAreaId;
  pattern: RegExp;
  weight: number;
  tag: string;
};

const THEME_SCORING_RULES: ThemeScoringRule[] = [
  { theme: "work", pattern: /\b(law|attorney|legal|lawyer|llb)\b/i, weight: 6, tag: "legal" },
  { theme: "work", pattern: /\b(practice|firm|mandela and tambo|tambo)\b/i, weight: 6, tag: "legal-practice" },
  {
    theme: "work",
    pattern:
      /\b(anc|youth league|campaign|election|president|presidency|government|cabinet|negotiation|voter|leadership|movement|mk|defiance|rivonia|underground|sharpeville)\b/i,
    weight: 6,
    tag: "political",
  },
  { theme: "work", pattern: /\b(foundation|46664|elders)\b/i, weight: 4, tag: "institution" },
  { theme: "becoming", pattern: /\b(prison|robben|quarry|island)\b/i, weight: 6, tag: "prison" },
  {
    theme: "becoming",
    pattern: /\b(dignity|resilience|forgiv|reconcil|trc|hope|legacy|nobel|moral|inner life|purpose)\b/i,
    weight: 5,
    tag: "becoming",
  },
  { theme: "becoming", pattern: /\b(ideal alive|keep the ideal|survival|resistance|victor verster)\b/i, weight: 4, tag: "spirit" },
  {
    theme: "becoming",
    pattern: /\b(conscience|explore peace|moral core|inner life)\b/i,
    weight: 5,
    tag: "purpose-strong",
  },
  { theme: "people", pattern: /\b(winnie|marriage|wife|zindzi|zenani)\b/i, weight: 6, tag: "family-person" },
  {
    theme: "people",
    pattern: /\b(grandchild|grandchildren|family gathering|protect those bonds|our daughters|my children)\b/i,
    weight: 5,
    tag: "family-context",
  },
  {
    theme: "people",
    pattern: /\b(friend|comrade|sisulu|kathrada|friendship|brothers on the island)\b/i,
    weight: 5,
    tag: "relationships",
  },
  {
    theme: "people",
    pattern:
      /\b(protect those bonds|protect family bonds|protect family|be present for|preserve those bonds|strengthen those bonds|repair .*relationship)\b/i,
    weight: 6,
    tag: "family-intention",
  },
  { theme: "people", pattern: /\bfamily\b/i, weight: 1, tag: "family-generic" },
  {
    theme: "health",
    pattern: /\b(health|hospital|lung|prostate|fatigue|body|doctors|rest|quarry dust|medical)\b/i,
    weight: 5,
    tag: "health",
  },
  {
    theme: "finance",
    pattern:
      /\b(economy|economic|housing|unemployment|poverty|redistribution|resources|investors|material improvement|rdp)\b/i,
    weight: 5,
    tag: "finance",
  },
];

const PURPOSE_TITLE_LANGUAGE =
  /\b(keep the ideal alive|ideal alive|\bideal\b|moral core|moral|dignity|resilience|forgiveness|reconciliation|truth|hope|inner life|purpose|legacy|conscience|explore peace)\b/i;

const CAREER_PRIMARY_TITLE =
  /\b(legal practice|law firm|attorney|lawyer|voter education|national leadership|build a legal)\b/i;

const FAMILY_INTENTION_LANGUAGE =
  /\b(protect (those )?bonds|protect family bonds|protect family|be present for|be present now|preserve (those )?bonds|strengthen (those )?bonds|repair .*relationship|present for my (children|daughters|family))\b/i;

const TITLE_QUALITY_PREFERRED_LENGTH = 80;

const TRUNCATED_FRAGMENT_END =
  /(?:…|\.\.\.|(?:\b(?:within|while|and|or|that|which|to|for|of|in|on|with|into|from|as|at|by)\s*)$)/i;

function collectTitleQualityWarnings(
  title: string,
  sourceBrainDumpId?: string,
): TitleQualityWarning | null {
  const trimmed = title.trim();
  if (!trimmed) return null;
  const issues: TitleQualityWarning["issues"] = [];
  const detailParts: string[] = [];

  if (trimmed.length > TITLE_QUALITY_PREFERRED_LENGTH) {
    issues.push("over_preferred_length");
    detailParts.push(`${trimmed.length} chars (preferred ≤${TITLE_QUALITY_PREFERRED_LENGTH})`);
  }
  if (/…|\.\.\./.test(trimmed)) {
    issues.push("ellipsis");
    detailParts.push("contains ellipsis");
  }
  if (TRUNCATED_FRAGMENT_END.test(trimmed)) {
    issues.push("truncated_fragment");
    detailParts.push("looks like a truncated sentence fragment");
  }

  if (issues.length === 0) return null;
  return {
    title: trimmed,
    sourceBrainDumpId,
    issues,
    detail: detailParts.join("; "),
  };
}

function mergeTitleQualityWarnings(
  existing: TitleQualityWarning[],
  pursuits: CreatedPursuitRecord[],
): TitleQualityWarning[] {
  const byKey = new Map(existing.map((w) => [`${w.sourceBrainDumpId ?? ""}::${w.title}`, w]));
  for (const p of pursuits) {
    const w = collectTitleQualityWarnings(p.title, p.sourceBrainDumpId);
    if (!w) continue;
    const key = `${w.sourceBrainDumpId ?? ""}::${w.title}`;
    if (!byKey.has(key)) byKey.set(key, w);
  }
  return [...byKey.values()];
}

function reportTitleQualityWarnings(warnings: TitleQualityWarning[]): void {
  if (warnings.length === 0) {
    console.log("  Title quality: no warnings.");
    return;
  }
  console.log(`  Title quality warnings (${warnings.length}, non-blocking):`);
  for (const w of warnings) {
    const src = w.sourceBrainDumpId ? ` [${w.sourceBrainDumpId}]` : "";
    console.log(`    - "${w.title}"${src}: ${w.detail} (${w.issues.join(", ")})`);
  }
}

const STRONG_THEME_SCORE = 6;

type HubIndexEntry = {
  branch: BranchRow;
  categoryId: string;
  name: string;
  label: string;
  normalizedName: string;
  normalizedLabel: string;
  slug: string;
  themeId: LifeAreaId;
};

type HubIndex = {
  byId: Map<string, HubIndexEntry>;
  byNormalizedLabel: Map<string, HubIndexEntry>;
  bySlug: Map<string, HubIndexEntry>;
  byThemeId: Map<LifeAreaId, HubIndexEntry[]>;
};

function isInvalidHubToken(value: string | undefined | null): boolean {
  if (!value?.trim()) return true;
  const trimmed = value.trim().toLowerCase();
  if (INVALID_HUB_TOKENS.has(trimmed)) return true;
  return INVALID_HUB_TOKENS.has(normalizeHubLabelKey(value));
}

function buildHubIndex(branches: BranchRow[]): HubIndex {
  const byId = new Map<string, HubIndexEntry>();
  const byNormalizedLabel = new Map<string, HubIndexEntry>();
  const bySlug = new Map<string, HubIndexEntry>();
  const byThemeId = new Map<LifeAreaId, HubIndexEntry[]>();

  for (const branch of branches.filter((b) => !b.parentCategoryId)) {
    const themeId = branch.limbId as LifeAreaId;
    const label = hubLabelFromBranch(branch);
    const name = (branch.name ?? branch.label ?? label).trim() || label;
    const normalizedLabel = normalizeHubLabelKey(label);
    const normalizedName = normalizeHubLabelKey(name);

    const entry: HubIndexEntry = {
      branch,
      categoryId: branch.id,
      name,
      label,
      normalizedName,
      normalizedLabel,
      slug: normalizedLabel,
      themeId,
    };

    byId.set(branch.id, entry);
    byNormalizedLabel.set(normalizedLabel, entry);
    if (!byNormalizedLabel.has(normalizedName)) {
      byNormalizedLabel.set(normalizedName, entry);
    }
    bySlug.set(normalizedLabel, entry);

    const themeList = byThemeId.get(themeId) ?? [];
    themeList.push(entry);
    byThemeId.set(themeId, themeList);
  }

  return { byId, byNormalizedLabel, bySlug, byThemeId };
}

function pickDefaultHubForTheme(themeId: LifeAreaId, index: HubIndex): HubIndexEntry | null {
  const hubs = index.byThemeId.get(themeId) ?? [];
  for (const pref of THEME_DEFAULT_HUB_PREFERENCE[themeId]) {
    const norm = normalizeHubLabelKey(pref);
    const found = hubs.find((h) => h.normalizedLabel === norm);
    if (found) return found;
  }
  return hubs[0] ?? null;
}

function emptyThemeScores(): Record<LifeAreaId, number> {
  return { work: 0, becoming: 0, people: 0, health: 0, finance: 0 };
}

function scoreThemesForItem(
  item: { title?: string; label?: string; description?: string | null },
  sourceBrainDump: { id: string; text: string },
): { scores: Record<LifeAreaId, number>; hits: Record<LifeAreaId, string[]> } {
  const title = (item.title ?? item.label ?? "").trim();
  const description = (item.description ?? "").trim();
  const scores = emptyThemeScores();
  const hits: Record<LifeAreaId, string[]> = {
    work: [],
    becoming: [],
    people: [],
    health: [],
    finance: [],
  };

  const segments: Array<{ text: string; multiplier: number }> = [
    { text: title, multiplier: 3 },
    { text: description, multiplier: 2 },
    { text: sourceBrainDump.text, multiplier: 1 },
  ];

  for (const rule of THEME_SCORING_RULES) {
    for (const seg of segments) {
      if (!seg.text) continue;
      if (rule.pattern.test(seg.text)) {
        scores[rule.theme] += rule.weight * seg.multiplier;
        hits[rule.theme].push(rule.tag);
      }
    }
  }

  if (PURPOSE_TITLE_LANGUAGE.test(title) && !CAREER_PRIMARY_TITLE.test(title)) {
    scores.becoming += 30;
    hits.becoming.push("purpose-title-override");
  }

  if (FAMILY_INTENTION_LANGUAGE.test(title) || FAMILY_INTENTION_LANGUAGE.test(description)) {
    scores.people += 30;
    hits.people.push("family-intention-override");
  }

  const hint = BRAIN_DUMP_THEME_HINTS[sourceBrainDump.id];
  if (hint) {
    scores[hint] += 2;
    hits[hint].push("brain-dump-hint");
  }

  return { scores, hits };
}

function pickTopScoredTheme(
  scores: Record<LifeAreaId, number>,
): { theme: LifeAreaId | null; score: number; strong: boolean } {
  let bestTheme: LifeAreaId | null = null;
  let bestScore = 0;
  for (const theme of ALL_THEMES) {
    if (scores[theme] > bestScore) {
      bestScore = scores[theme];
      bestTheme = theme;
    }
  }
  return { theme: bestTheme, score: bestScore, strong: bestScore >= STRONG_THEME_SCORE };
}

function resolveHubEntryFromExtracted(extractedRaw: string, index: HubIndex): HubIndexEntry | null {
  if (!extractedRaw || isInvalidHubToken(extractedRaw)) return null;
  if (index.byId.has(extractedRaw)) return index.byId.get(extractedRaw)!;
  const norm = normalizeHubLabelKey(extractedRaw);
  return index.bySlug.get(norm) ?? index.byNormalizedLabel.get(norm) ?? null;
}

function pickHubWithinTheme(themeId: LifeAreaId, text: string, index: HubIndex): HubIndexEntry | null {
  const t = text.toLowerCase();
  const hubs = index.byThemeId.get(themeId) ?? [];
  const rules: Array<{ pattern: RegExp; labels: string[] }> = [
    {
      pattern: /\b(law|attorney|legal|lawyer|practice|firm|anc|president|election|campaign|government|cabinet|negotiat|voter|leadership|movement|rivonia|underground|mk)\b/,
      labels: ["Career", "Builds & Launches", "Skills"],
    },
    {
      pattern: /\b(launch|foundation|46664|institution|builds)\b/,
      labels: ["Builds & Launches", "Purpose"],
    },
    {
      pattern: /\b(winnie|marriage|wife|grandchild|grandchildren|our daughters|my children|family gathering|protect those bonds)\b/,
      labels: ["Family"],
    },
    {
      pattern: /\b(friend|comrade|sisulu|kathrada|friendship|brothers)\b/,
      labels: ["Friendships"],
    },
    {
      pattern: /\b(prison|robben|forgiv|reconcil|trc|inner|hope|dignity|spirit|legacy|elders|purpose|nobel|ideal|ideal alive|moral core|conscience)\b/,
      labels: ["Purpose & Values", "Mind & Emotions"],
    },
    {
      pattern: /\b(health|hospital|prostate|lung|fatigue|body|medical|quarry dust|doctors)\b/,
      labels: ["Rest", "Movement", "Appearance"],
    },
    {
      pattern: /\b(money|finance|economic|rdp|housing|deposit|income|assets|debt|poverty|unemployment|redistribution|investors)\b/,
      labels: ["Assets", "Income", "Safety net", "Liabilities"],
    },
  ];

  for (const rule of rules) {
    if (!rule.pattern.test(t)) continue;
    for (const label of rule.labels) {
      const norm = normalizeHubLabelKey(label);
      const found = hubs.find((h) => h.normalizedLabel === norm);
      if (found) return found;
    }
  }
  return null;
}

function resolveHubForExtractedItem(
  item: { hubId?: string; title?: string; label?: string; description?: string | null },
  index: HubIndex,
  sourceBrainDump: { id: string; label: string; text: string },
): HubResolution {
  const extractedRaw = item.hubId?.trim() ?? "";
  const itemTitle = (item.title ?? item.label ?? "").trim();
  const combined = `${itemTitle} ${item.description ?? ""} ${sourceBrainDump.text}`;
  const { scores } = scoreThemesForItem(item, sourceBrainDump);
  const top = pickTopScoredTheme(scores);
  const extractedEntry = resolveHubEntryFromExtracted(extractedRaw, index);
  const extractedTheme = extractedEntry?.themeId ?? null;

  const familyIntentionProbe = `${itemTitle} ${item.description ?? ""}`.trim();
  if (
    FAMILY_INTENTION_LANGUAGE.test(familyIntentionProbe) ||
    (sourceBrainDump.id === "02-winnie-family" && FAMILY_INTENTION_LANGUAGE.test(sourceBrainDump.text))
  ) {
    const familyHub =
      pickHubWithinTheme("people", combined, index) ?? pickDefaultHubForTheme("people", index);
    if (familyHub) {
      return {
        hubId: familyHub.categoryId,
        hubLabel: familyHub.label,
        themeId: familyHub.themeId,
        confidence: "keyword",
        reason: `Relationship intention language → ${familyHub.label}`,
        inferredTheme: "people",
        extractedTheme,
        conflictOverride: true,
      };
    }
  }

  if (PURPOSE_TITLE_LANGUAGE.test(itemTitle) && !CAREER_PRIMARY_TITLE.test(itemTitle)) {
    const purposeHub =
      pickHubWithinTheme("becoming", itemTitle, index) ?? pickDefaultHubForTheme("becoming", index);
    if (purposeHub) {
      return {
        hubId: purposeHub.categoryId,
        hubLabel: purposeHub.label,
        themeId: purposeHub.themeId,
        confidence: "keyword",
        reason: `Purpose/moral identity language in title overrides extracted ${extractedEntry?.label ?? (extractedRaw || "(missing)")}`,
        inferredTheme: "becoming",
        extractedTheme,
        conflictOverride: true,
      };
    }
  }

  if (extractedEntry && extractedTheme) {
    const extractedScore = scores[extractedTheme];
    const contentWins =
      top.theme != null &&
      top.strong &&
      top.theme !== extractedTheme &&
      top.score > extractedScore + 2;

    if (!contentWins && (!top.strong || !top.theme || extractedScore + 2 >= top.score)) {
      const viaBranchId = index.byId.has(extractedRaw);
      return {
        hubId: extractedEntry.categoryId,
        hubLabel: extractedEntry.label,
        themeId: extractedEntry.themeId,
        confidence: viaBranchId ? "exact" : "alias",
        reason: `Extracted hub ${extractedEntry.label} accepted (score ${extractedTheme}:${extractedScore} vs content ${top.theme ?? "none"}:${top.score})`,
        inferredTheme: top.theme ?? undefined,
        extractedTheme,
        conflictOverride: false,
      };
    }
  }

  let chosenTheme = top.theme;
  let conflictOverride = false;
  let reasonPrefix = "";

  if (chosenTheme && extractedTheme && chosenTheme !== extractedTheme && top.strong) {
    conflictOverride = true;
    reasonPrefix = `Content theme ${chosenTheme} (score ${top.score}) overrides extracted ${extractedTheme} target "${extractedRaw || "(missing)"}"`;
  }

  if (!chosenTheme) {
    chosenTheme = BRAIN_DUMP_THEME_HINTS[sourceBrainDump.id] ?? null;
    if (chosenTheme) {
      reasonPrefix = reasonPrefix || `Brain-dump theme hint ${chosenTheme}`;
    }
  }

  if (chosenTheme) {
    const within = pickHubWithinTheme(chosenTheme, combined, index);
    if (within) {
      return {
        hubId: within.categoryId,
        hubLabel: within.label,
        themeId: within.themeId,
        confidence: conflictOverride ? "keyword" : top.strong ? "keyword" : "fallback",
        reason: reasonPrefix
          ? `${reasonPrefix} → ${within.label}`
          : `Scored theme ${chosenTheme} (score ${top.score}) → ${within.label}`,
        inferredTheme: chosenTheme,
        extractedTheme,
        conflictOverride,
      };
    }

    const themeDefault = pickDefaultHubForTheme(chosenTheme, index);
    if (themeDefault) {
      return {
        hubId: themeDefault.categoryId,
        hubLabel: themeDefault.label,
        themeId: themeDefault.themeId,
        confidence: conflictOverride ? "keyword" : "theme-default",
        reason: reasonPrefix
          ? `${reasonPrefix}; default hub ${themeDefault.label}`
          : `Theme ${chosenTheme} (score ${top.score}); default hub ${themeDefault.label}`,
        inferredTheme: chosenTheme,
        extractedTheme,
        conflictOverride,
      };
    }
  }

  return {
    hubId: null,
    confidence: "unresolved",
    reason: isInvalidHubToken(extractedRaw)
      ? `Invalid or missing hub target "${extractedRaw || "(missing)"}"`
      : `No hub match for "${extractedRaw}" (top theme ${top.theme ?? "none"} score ${top.score})`,
    inferredTheme: top.theme ?? undefined,
    extractedTheme,
  };
}

type ResolvedExtraction = {
  marks: ExtractedMark[];
  pursuits: ExtractedPursuit[];
  milestones: ExtractedMilestone[];
  pursuitUpdates: StreamExtractResponse["pursuitUpdates"];
  milestoneUpdates: StreamExtractResponse["milestoneUpdates"];
  milestoneCompletions: StreamExtractResponse["milestoneCompletions"];
  milestoneDeletes: StreamExtractResponse["milestoneDeletes"];
  resolutionLogs: HubResolutionLog[];
  skippedCount: number;
  skippedStreamMarkCount: number;
  skippedStreamMarks: ExtractedCardLog[];
};

function applyHubResolutionToExtraction(
  extraction: StreamExtractResponse,
  index: HubIndex,
  sourceBrainDump: { id: string; label: string; text: string },
  stats: HubResolutionStats,
): ResolvedExtraction {
  const resolutionLogs: HubResolutionLog[] = [];
  const skippedStreamMarks: ExtractedCardLog[] = [];
  let skippedCount = 0;

  for (const mark of extraction.marks) {
    skippedStreamMarks.push({
      type: "skipped_stream_mark",
      targetHub: mark.hubId ?? "(missing)",
      confidence: "n/a",
      title: mark.title,
    });
    console.log(
      `    [skipped_stream_mark] ${mark.title} — Phase 3 manual marks; Stream mark commit disabled`,
    );
  }

  const resolveItem = <
    T extends { hubId?: string; title?: string; label?: string; description?: string | null },
  >(
    item: T,
    itemType: string,
  ): T | null => {
    const extractedTarget = item.hubId?.trim() || "(missing)";
    const resolution = resolveHubForExtractedItem(item, index, sourceBrainDump);
    bumpResolutionStat(stats, resolution.confidence);

    resolutionLogs.push({
      itemType,
      itemTitle: (item.title ?? item.label ?? "").trim(),
      extractedTarget,
      inferredTheme: resolution.inferredTheme,
      extractedTheme: resolution.extractedTheme,
      resolvedHubId: resolution.hubId,
      resolvedHubLabel: resolution.hubLabel,
      themeId: resolution.themeId,
      confidence: resolution.confidence,
      conflictOverride: resolution.conflictOverride,
      reason: resolution.reason,
    });

    if (resolution.conflictOverride) {
      console.log(
        `    [hub conflict] "${item.title ?? item.label ?? ""}" extracted=${extractedTarget} inferred=${resolution.inferredTheme ?? "?"} → ${resolution.hubLabel} (${resolution.reason})`,
      );
    }

    if (!resolution.hubId) {
      skippedCount += 1;
      console.warn(
        `    [skip unresolved_hub] ${itemType} "${item.title ?? item.label ?? ""}" — ${resolution.reason}`,
      );
      return null;
    }

    return { ...item, hubId: resolution.hubId };
  };

  return {
    marks: [],
    pursuits: extraction.pursuits
      .map((p) => resolveItem(p, "pursuit"))
      .filter((p): p is ExtractedPursuit => p !== null),
    milestones: extraction.milestones
      .map((m) => resolveItem(m, "milestone"))
      .filter((m): m is ExtractedMilestone => m !== null),
    pursuitUpdates: extraction.pursuitUpdates,
    milestoneUpdates: extraction.milestoneUpdates,
    milestoneCompletions: extraction.milestoneCompletions,
    milestoneDeletes: extraction.milestoneDeletes,
    resolutionLogs,
    skippedCount,
    skippedStreamMarkCount: extraction.marks.length,
    skippedStreamMarks,
  };
}

function printBrainDumpsForReview(): void {
  console.log("\n========== BRAIN DUMPS (review) ==========");
  console.log(`Disclaimer: ${BRAIN_DUMP_DISCLAIMER}\n`);
  for (const dump of BRAIN_DUMPS) {
    console.log(`--- ${dump.id}: ${dump.label} ---`);
    console.log(dump.text);
    console.log("");
  }
  console.log("==========================================\n");
}

function logExtractedCards(
  extraction: StreamExtractResponse,
  branchById: Map<string, BranchRow>,
  resolutionLogs?: HubResolutionLog[],
): { committed: ExtractedCardLog[]; unsupported: ExtractedCardLog[] } {
  const committed: ExtractedCardLog[] = [];
  const unsupported: ExtractedCardLog[] = [];
  const resolutionByTitle = new Map(
    (resolutionLogs ?? []).map((r) => [`${r.itemType}::${r.itemTitle}`, r]),
  );

  const pushCommitted = (
    type: string,
    item: { title?: string; label?: string; hubId?: string; titleConfidence?: number; confidence?: number },
  ) => {
    const branch = item.hubId ? branchById.get(item.hubId) : undefined;
    const hub = branch ? `${hubLabelFromBranch(branch)} (${branch.limbId})` : item.hubId ?? "(missing)";
    const conf =
      typeof item.titleConfidence === "number"
        ? item.titleConfidence.toFixed(2)
        : typeof item.confidence === "number"
          ? item.confidence.toFixed(2)
          : "ok";
    const title = (item.title ?? item.label ?? "").trim();
    const resolution = resolutionByTitle.get(`${type}::${title}`);
    const row: ExtractedCardLog = {
      type,
      targetHub: hub,
      confidence: conf,
      title,
      resolvedHub: resolution?.resolvedHubLabel
        ? `${resolution.resolvedHubLabel} (${resolution.themeId ?? "?"}) [${resolution.confidence}]`
        : undefined,
      resolutionConfidence: resolution?.confidence,
    };
    committed.push(row);
    const resolvedNote = row.resolvedHub ? ` | resolved → ${row.resolvedHub}` : "";
    console.log(`    [${type}] ${row.title} → extracted: ${hub} (conf: ${conf})${resolvedNote}`);
  };

  const pushUnsupported = (item: { title?: string; label?: string; hubId?: string; confidence?: number }) => {
    const branch = item.hubId ? branchById.get(item.hubId) : undefined;
    const hub = branch ? `${hubLabelFromBranch(branch)} (${branch.limbId})` : item.hubId ?? "(missing)";
    const conf = typeof item.confidence === "number" ? item.confidence.toFixed(2) : "n/a";
    const row = {
      type: "unsupported_or_uncommitted",
      targetHub: hub,
      confidence: conf,
      title: (item.title ?? item.label ?? "").trim(),
    };
    unsupported.push(row);
    console.log(`    [unsupported_or_uncommitted] ${row.title} → ${hub} (not committed server-side)`);
  };

  for (const m of extraction.marks) pushCommitted("mark", m);
  for (const p of extraction.pursuits) pushCommitted("pursuit", p);
  for (const ms of extraction.milestones) pushCommitted("milestone", ms);
  for (const a of extraction.ambiguous) pushUnsupported(a);
  for (const u of extraction.pursuitUpdates) {
    committed.push({ type: "pursuit_update", targetHub: u.goalId, confidence: "ok", title: u.title ?? u.goalId });
    console.log(`    [pursuit_update] ${u.goalId}${u.title ? `: ${u.title}` : ""}`);
  }
  return { committed, unsupported };
}

function buildGlobalCommitPayload(
  resolved: ResolvedExtraction,
  inputText: string,
  ambiguousCount: number,
): StreamGlobalCommitPayload {
  const itemsAdded =
    resolved.marks.length +
    resolved.pursuits.filter((p) => !p.existingGoalId).length +
    resolved.milestones.length +
    resolved.pursuitUpdates.length +
    resolved.milestoneUpdates.length +
    resolved.milestoneCompletions.length +
    resolved.milestoneDeletes.length;

  return {
    marks: resolved.marks,
    pursuits: resolved.pursuits,
    milestones: resolved.milestones,
    pursuitUpdates: resolved.pursuitUpdates,
    milestoneUpdates: resolved.milestoneUpdates,
    milestoneCompletions: resolved.milestoneCompletions,
    milestoneDeletes: resolved.milestoneDeletes,
    resolvedAmbiguous: [],
    inputText,
    inputMode: "text",
    itemsAdded,
    itemsSkipped: ambiguousCount + resolved.skippedCount + resolved.skippedStreamMarkCount,
  };
}

async function fetchBranchMap(token: string): Promise<{
  branches: BranchRow[];
  goals: GoalRow[];
  branchById: Map<string, BranchRow>;
  hubByLabel: Map<string, BranchRow>;
  hubIndex: HubIndex;
}> {
  const { status, body } = await apiFetch<{ branches?: BranchRow[]; goals?: GoalRow[]; error?: string }>(
    token,
    "/api/branches",
  );
  if (status !== 200) {
    throw new Error(`GET /api/branches failed (${status}): ${body.error ?? "unknown"}`);
  }
  const branches = (body.branches ?? []).filter((b) => !b.parentCategoryId);
  const goals = body.goals ?? [];
  const branchById = new Map(branches.map((b) => [b.id, b]));
  const hubByLabel = new Map<string, BranchRow>();
  for (const b of branches) {
    hubByLabel.set(hubLabelFromBranch(b).toLowerCase(), b);
  }
  return { branches, goals, branchById, hubByLabel, hubIndex: buildHubIndex(branches) };
}

function resolveHub(hubByLabel: Map<string, BranchRow>, label: string): BranchRow {
  const hub = hubByLabel.get(label.trim().toLowerCase());
  if (!hub) {
    throw new Error(`Hub not found for label "${label}". Available: ${[...hubByLabel.keys()].join(", ")}`);
  }
  return hub;
}

function gapReferencesSpecificContent(
  gap: { pursuitTitle: string; body: string },
  ctx: EvalContext,
): boolean {
  const combined = `${gap.pursuitTitle} ${gap.body}`;
  if (titleMatchesAny(gap.pursuitTitle, ctx.pursuitTitles) || titleMatchesAny(gap.body, ctx.pursuitTitles)) {
    return true;
  }
  if (hubOrThemeMatch(combined, ctx.hubLabels, ctx.themeIds)) return true;
  return mandelaContextMatch(combined);
}

function checkFromMatch(
  id: string,
  label: string,
  match: { strength: CheckStrength; pursuitNamed: boolean; detail: string },
): QualityCheck {
  return {
    id,
    label,
    passed: match.strength !== "fail",
    strength: match.strength,
    detail: match.detail,
    pursuitNamed: match.pursuitNamed,
  };
}

// ——— Evaluation (Phase 6) ———

function evaluateStory(story: StoryPayload, ctx: EvalContext): QualityCheck[] {
  const prose = collectProse(story);
  const checks: QualityCheck[] = [];

  checks.push(checkFromMatch("story-opening-names-pursuit", "Opening names created content", matchContent(story.opening, ctx)));

  const strengthsOk =
    story.strengths.length > 0 &&
    story.strengths.every((s) => ctx.pursuitTitles.some((t) => normalizeTitle(t) === normalizeTitle(s.pursuitTitle)));
  checks.push({
    id: "story-strengths",
    label: "Strengths non-empty with real pursuit titles",
    passed: strengthsOk,
    strength: strengthsOk ? "strong" : "fail",
    detail: strengthsOk
      ? `${story.strengths.length} strength section(s) with matching pursuit titles.`
      : "Strengths empty or pursuitTitle mismatch.",
  });

  const gapsOk = story.gaps.length > 0 && story.gaps.every((g) => gapReferencesSpecificContent(g, ctx));
  checks.push({
    id: "story-gaps",
    label: "Gaps reference real pursuits, hubs, themes, or Mandela context",
    passed: gapsOk,
    strength: gapsOk ? "strong" : "fail",
    detail: gapsOk
      ? `${story.gaps.length} gap section(s) with specific references.`
      : "Gaps missing or too generic (body length alone does not pass).",
  });

  const hedges = findPhrases(prose, HEDGING_PHRASES);
  checks.push({
    id: "story-no-hedging",
    label: "No hedging or puffy phrases",
    passed: hedges.length === 0,
    strength: hedges.length === 0 ? "strong" : "fail",
    detail: hedges.length === 0 ? "None found." : `Found: ${hedges.join(", ")}`,
  });

  const posters = findPhrases(prose, POSTER_PHRASES);
  checks.push({
    id: "story-no-poster",
    label: "No motivational poster phrases",
    passed: posters.length === 0,
    strength: posters.length === 0 ? "strong" : "fail",
    detail: posters.length === 0 ? "None found." : `Found: ${posters.join(", ")}`,
  });

  const comparisonOk =
    story.comparison.trim().length > 20 &&
    (/\b(johannesburg|south africa|mvezo|transkei|soweto)\b/i.test(story.comparison) ||
      /\b(\d{2,3}[- ]year|your age|life stage|born)\b/i.test(story.comparison));
  checks.push({
    id: "story-comparison-context",
    label: "Comparison references location or age",
    passed: comparisonOk,
    strength: comparisonOk ? "strong" : "fail",
    detail: comparisonOk
      ? "Comparison includes location/age context."
      : "Comparison missing or lacks location/age anchor.",
  });

  const focusMatch = matchContent(story.focus, ctx);
  checks.push({
    id: "story-focus-specific",
    label: "Focus references created content",
    passed: focusMatch.strength !== "fail",
    strength: focusMatch.strength === "fail" ? "fail" : focusMatch.strength,
    detail: focusMatch.detail,
    pursuitNamed: focusMatch.pursuitNamed,
  });

  return checks;
}

function evaluateInsights(cache: InsightCachePayload, ctx: EvalContext): QualityCheck[] {
  const prose = collectInsightProse(cache);
  const checks: QualityCheck[] = [];
  const greetingMatch = matchContent(cache.global.greeting, ctx);

  checks.push({
    id: "insights-greeting",
    label: "Global greeting references created content",
    passed: greetingMatch.strength !== "fail",
    strength: greetingMatch.strength === "fail" ? "fail" : greetingMatch.strength,
    detail: greetingMatch.detail,
    pursuitNamed: greetingMatch.pursuitNamed,
  });

  checks.push({
    id: "insights-greeting-pursuit-named",
    label: "Global greeting names a real pursuit (reported separately)",
    passed: greetingMatch.pursuitNamed,
    strength: greetingMatch.pursuitNamed ? "strong" : "fail",
    detail: greetingMatch.pursuitNamed
      ? "A created pursuit title appears in the greeting."
      : "No created pursuit title in greeting (weak hub/theme pass may still apply above).",
  });

  const hedges = findPhrases(prose, HEDGING_PHRASES);
  checks.push({
    id: "insights-no-hedging",
    label: "No hedging or puffy phrases in global insight",
    passed: hedges.length === 0,
    strength: hedges.length === 0 ? "strong" : "fail",
    detail: hedges.length === 0 ? "None found." : `Found: ${hedges.join(", ")}`,
  });

  const posters = findPhrases(prose, POSTER_PHRASES);
  checks.push({
    id: "insights-no-poster",
    label: "No poster language in global insight",
    passed: posters.length === 0,
    strength: posters.length === 0 ? "strong" : "fail",
    detail: posters.length === 0 ? "None found." : `Found: ${posters.join(", ")}`,
  });

  const sectionsOk =
    cache.global.sections.length === 0 ||
    cache.global.sections.every((s) => s.body.trim().length > 10);
  checks.push({
    id: "insights-sections-nonempty",
    label: "Insight sections have substantive bodies",
    passed: sectionsOk,
    strength: sectionsOk ? "strong" : "fail",
    detail: sectionsOk
      ? `${cache.global.sections.length} section(s) OK.`
      : "One or more sections too short.",
  });

  return checks;
}

function computeHubRoutingAccuracy(created: CreatedPursuitRecord[]): HubRoutingResult {
  if (created.length === 0) {
    return {
      approximatePercent: 0,
      matched: 0,
      misrouted: 0,
      unknown: 0,
      total: 0,
      detail: "No pursuits to score (heuristic).",
      misroutedExamples: [],
      unknownExamples: [],
    };
  }

  let matched = 0;
  let misrouted = 0;
  let unknown = 0;
  const misroutedExamples: string[] = [];
  const unknownExamples: string[] = [];

  for (const p of created) {
    const expected = inferExpectedTheme(p.title);
    if (expected === "unknown") {
      unknown += 1;
      unknownExamples.push(`"${p.title}" → ${p.limbId} (expected: unknown)`);
      continue;
    }
    if (p.limbId === expected) {
      matched += 1;
    } else {
      misrouted += 1;
      misroutedExamples.push(`"${p.title}" → ${p.limbId}, expected ~${expected} (hub: ${p.hubLabel})`);
    }
  }

  const scorable = matched + misrouted;
  const pct = scorable > 0 ? Math.round((matched / scorable) * 100) : 0;

  return {
    approximatePercent: pct,
    matched,
    misrouted,
    unknown,
    total: created.length,
    detail: `${matched} matched, ${misrouted} misrouted, ${unknown} unknown (heuristic, approximate).`,
    misroutedExamples,
    unknownExamples,
  };
}

function formatCheckLine(c: QualityCheck): string {
  const tag = c.passed ? (c.strength === "weak" ? "WEAK PASS" : "PASS") : "FAIL";
  const pursuitNote = c.pursuitNamed === undefined ? "" : ` | pursuit named: ${c.pursuitNamed ? "yes" : "no"}`;
  return `  [${tag}] ${c.label}: ${c.detail}${pursuitNote}`;
}

function isPhaseSkipped(phase: PhaseStoryResult | PhaseInsightResult | PhaseSkippedResult | undefined): phase is PhaseSkippedResult {
  return Boolean(phase && "skipped" in phase && phase.skipped);
}

function evaluateSmokeHarness(results: SimulationResults): QualityCheck[] {
  const summary = results.streamSummary;
  const pursuits = results.createdPursuits;
  const marks = results.phase3?.marks ?? [];
  const sessions = results.phase2?.sessions ?? [];
  const checks: QualityCheck[] = [];

  checks.push({
    id: "smoke-pursuits-created",
    label: "Pursuits created",
    passed: pursuits.length > 0,
    strength: pursuits.length > 0 ? "strong" : "fail",
    detail: `${pursuits.length} pursuit(s) created.`,
  });

  checks.push({
    id: "smoke-manual-marks",
    label: "Manual marks created (Phase 3)",
    passed: marks.length === 5,
    strength: marks.length === 5 ? "strong" : marks.length > 0 ? "weak" : "fail",
    detail: `${marks.length}/5 manual mark(s) created.`,
  });

  const extracted = summary?.sessionsExtracted ?? 0;
  const committed = summary?.sessionsCommitted ?? 0;
  checks.push({
    id: "smoke-stream-commit",
    label: "Stream commit success",
    passed: committed > 0 && pursuits.length > 0,
    strength: committed > 0 && pursuits.length > 0 ? "strong" : "fail",
    detail: `${committed}/${extracted} session(s) committed with pursuit(s) on map.`,
  });

  const marksSkipped = summary?.extractedMarksSkipped ?? 0;
  const marksCommittedInStream = sessions.reduce((n, s) => n + (s.commitCreated?.marks ?? 0), 0);
  checks.push({
    id: "smoke-stream-marks-skipped",
    label: "Stream marks skipped (not committed via Stream)",
    passed: marksCommittedInStream === 0,
    strength: marksCommittedInStream === 0 ? "strong" : "fail",
    detail: `${marksSkipped} extracted mark(s) skipped; ${marksCommittedInStream} mark(s) committed via Stream (expected 0).`,
  });

  const politicalDumpIds = new Set(["01-law-anc", "03-underground-rivonia"]);
  const familyMisroutes = pursuits.filter(
    (p) => politicalDumpIds.has(p.sourceBrainDumpId) && p.hubLabel === "Family",
  );
  checks.push({
    id: "smoke-political-not-family",
    label: "Law/ANC/Rivonia pursuits not routed to Family",
    passed: familyMisroutes.length === 0,
    strength: familyMisroutes.length === 0 ? "strong" : "fail",
    detail:
      familyMisroutes.length === 0
        ? "No political-session pursuits on Family hub."
        : `Misrouted: ${familyMisroutes.map((p) => `"${p.title}" → ${p.hubLabel}`).join("; ")}`,
  });

  return checks;
}

function skipStoryInsightsPhases(results: SimulationResults): void {
  results.skippedStoryInsights = true;
  if (results.streamSummary) {
    results.streamSummary.skippedStoryInsights = true;
  }
  results.phase4 = { skipped: true, reason: SKIP_STORY_INSIGHTS_REASON };
  results.phase5 = { skipped: true, reason: SKIP_STORY_INSIGHTS_REASON };
  saveCheckpoint(results);
  console.log("\n=== Phase 4: Story === SKIPPED (SKIP_STORY_INSIGHTS=1)");
  console.log(`  ${SKIP_STORY_INSIGHTS_REASON}`);
  console.log("\n=== Phase 5: Insights === SKIPPED (SKIP_STORY_INSIGHTS=1)");
  console.log(`  ${SKIP_STORY_INSIGHTS_REASON}`);
}

// ——— Phases ———

function classifyExtractFailure(
  status: number,
  message: string | null,
): Pick<StreamSessionResult, "extractError" | "extractErrorKind" | "extractValidationPath"> {
  if (status === 200) {
    return { extractError: null, extractErrorKind: null, extractValidationPath: null };
  }

  const msg = message ?? `HTTP ${status}`;
  const pathMatch = /\(at ([^)]+)\)/.exec(msg);
  const validationPath = pathMatch?.[1] ?? null;
  const lower = msg.toLowerCase();

  if (
    lower.includes("too big") ||
    lower.includes("too_big") ||
    lower.includes("expected string to have <=") ||
    lower.includes("field length")
  ) {
    return {
      extractError: msg,
      extractErrorKind: "extract_validation_error",
      extractValidationPath: validationPath,
    };
  }

  if (status === 429 || lower.includes("rate limit") || lower.includes("429")) {
    return { extractError: msg, extractErrorKind: "rate_limit", extractValidationPath: null };
  }

  return { extractError: msg, extractErrorKind: "service_error", extractValidationPath: null };
}

async function phase1ProfileFacts(token: string, results: SimulationResults): Promise<void> {
  console.log("\n=== Phase 1: Profile facts ===");
  const payload = {
    facts: [
      { category: "personal", key: "name", value: "Nelson Mandela" },
      { category: "personal", key: "location", value: "Johannesburg, South Africa" },
      { category: "career", key: "occupation", value: "Lawyer / Activist / President" },
      { category: "relationships", key: "life_stage", value: "Married" },
    ],
  };
  const { status, body } = await apiFetch<{ ok?: boolean; facts?: unknown; error?: string }>(
    token,
    "/api/profile/facts/batch",
    { method: "POST", body: JSON.stringify(payload) },
  );
  if (status !== 200) {
    throw new Error(`Profile facts batch failed (${status}): ${(body as { error?: string }).error}`);
  }
  results.phase1 = { ok: true, factCount: payload.facts.length, response: body };
  saveCheckpoint(results);
  console.log(`  Saved ${payload.facts.length} profile facts.`);
}

async function phase2StreamSessions(
  token: string,
  results: SimulationResults,
  replaySource: SimulationResults | null,
): Promise<void> {
  const replaySessionsById = new Map(
    (replaySource?.phase2?.sessions ?? []).map((s) => [s.id, s]),
  );

  if (REPLAY_STREAM_CHECKPOINT) {
    console.log("\n=== Phase 2: Stream sessions (REPLAY from checkpoint — no extract API calls) ===");
    if (!replaySource?.phase2?.sessions?.length) {
      throw new Error(
        `REPLAY_STREAM_CHECKPOINT=1 but no phase2 sessions in ${RESULTS_PATH}. Run a full extract first.`,
      );
    }
    const sessionsToRun = streamSessionsToRun();
    const missingRaw = sessionsToRun.filter((d) => !replaySessionsById.get(d.id)?.rawExtraction).map((d) => d.id);
    if (missingRaw.length > 0) {
      throw new Error(
        `REPLAY_STREAM_CHECKPOINT=1 but rawExtraction missing for sessions: ${missingRaw.join(", ")}. ` +
          "Re-run once with the updated script to populate rawExtraction in the checkpoint.",
      );
    }
  } else {
    console.log(
      `\n=== Phase 2: Stream sessions (${streamSessionsToRun().length}/${BRAIN_DUMPS.length} brain dumps) ===`,
    );
  }

  const sessionsToRun = streamSessionsToRun();
  const sessions: StreamSessionResult[] = [];
  const skippedBrainDumpIds: string[] = [];
  const hubResolutionStats = emptyHubResolutionStats();
  let sessionsExtracted = 0;
  let sessionsCommitted = 0;
  let cardsSkippedUnresolvedHub = 0;
  let extractedMarksSkipped = 0;

  results.phase2 = { sessions };
  results.createdPursuits = [];

  for (let i = 0; i < sessionsToRun.length; i += 1) {
    const dump = sessionsToRun[i]!;
    console.log(`\n  Session ${i + 1}/${sessionsToRun.length}: ${dump.label}`);

    if (SKIP_BRAIN_DUMP_IDS.has(dump.id)) {
      skippedBrainDumpIds.push(dump.id);
      console.log(`  Skipped: ${SKIP_BRAIN_DUMP_REASON}`);
      sessions.push({
        id: dump.id,
        label: dump.label,
        input: dump.text,
        skipped: true,
        skipReason: SKIP_BRAIN_DUMP_REASON,
        extractStatus: 0,
        extractError: null,
        extractedCards: [],
        unsupportedOrUncommitted: [],
        commitStatus: null,
        commitError: null,
        commitCreated: null,
        pursuitsCreatedThisSession: [],
      });
      saveCheckpoint(results);
      continue;
    }

    const { goals: goalsBefore, branchById: branchesBefore, hubIndex } = await fetchBranchMap(token);
    const idsBefore = collectGoalIds(goalsBefore);

    const sessionResult: StreamSessionResult = {
      id: dump.id,
      label: dump.label,
      input: dump.text,
      extractStatus: 0,
      extractError: null,
      extractedCards: [],
      unsupportedOrUncommitted: [],
      commitStatus: null,
      commitError: null,
      commitCreated: null,
      pursuitsCreatedThisSession: [],
    };

    let extraction: StreamExtractResponse | null = null;

    if (REPLAY_STREAM_CHECKPOINT) {
      const saved = replaySessionsById.get(dump.id)!;
      sessionResult.extractStatus = saved.extractStatus;
      sessionResult.extractError = saved.extractError;
      extraction = saved.rawExtraction ?? null;
      console.log(`  Replay: using saved extraction (${extraction ? "ok" : "missing"})`);
    } else {
      if (i > 0) {
        await waitBeforeAiCall("Waiting before next AI call");
      }
      const extractRes = await apiFetchAi<StreamExtractResponse & { error?: string }>(
        token,
        "/api/stream/extract",
        { method: "POST", body: JSON.stringify({ input: dump.text, inputMode: "text" }) },
        results,
        `stream extract ${dump.id}`,
      );
      results.stats.aiCalls += 1;
      sessionResult.extractStatus = extractRes.status;
      Object.assign(sessionResult, classifyExtractFailure(extractRes.status, extractRes.body.error ?? null));
      if (sessionResult.extractError && sessionResult.extractErrorKind === "extract_validation_error") {
        console.error(
          `  Extract validation error${sessionResult.extractValidationPath ? ` at ${sessionResult.extractValidationPath}` : ""}: ${sessionResult.extractError}`,
        );
      }

      if (extractRes.status === 200 && !extractRes.body.error) {
        extraction = extractRes.body as StreamExtractResponse;
        sessionResult.rawExtraction = extraction;
      }
    }

    if (extraction) {
      sessionsExtracted += 1;
      console.log("  Extracted cards (before hub resolution):");
      const { committed, unsupported } = logExtractedCards(extraction, branchesBefore);
      sessionResult.extractedCards = committed;
      sessionResult.unsupportedOrUncommitted = unsupported;

      const resolved = applyHubResolutionToExtraction(extraction, hubIndex, dump, hubResolutionStats);
      sessionResult.hubResolutionLogs = resolved.resolutionLogs;
      sessionResult.skippedStreamMarks = resolved.skippedStreamMarks;
      cardsSkippedUnresolvedHub += resolved.skippedCount;
      extractedMarksSkipped += resolved.skippedStreamMarkCount;

      console.log("  Resolved cards (commit payload — marks excluded):");
      logExtractedCards(
        {
          ...extraction,
          marks: [],
          pursuits: resolved.pursuits,
          milestones: resolved.milestones,
        },
        branchesBefore,
        resolved.resolutionLogs,
      );

      const commitPayload = buildGlobalCommitPayload(resolved, dump.text, extraction.ambiguous.length);
      const hasItems =
        commitPayload.pursuits.length + commitPayload.milestones.length + commitPayload.pursuitUpdates.length > 0;

      if (!hasItems) {
        sessionResult.commitStatus = 200;
        sessionResult.commitCreated = { marks: 0, pursuits: 0, milestones: 0 };
        if (extraction.marks.length > 0) {
          console.log("  nothing_to_commit_after_mark_filter (marks skipped; no pursuits/milestones)");
        } else {
          console.log("  nothing_to_commit_after_resolution (no pursuits/milestones to commit)");
        }
      } else {
        const commitRes = await apiFetch<{
          ok?: boolean;
          createdMarks?: number;
          createdPursuits?: number;
          createdMilestones?: number;
          error?: string;
        }>(token, "/api/stream/commit", {
          method: "POST",
          body: JSON.stringify(commitPayload),
        });

        sessionResult.commitStatus = commitRes.status;
        if (commitRes.status === 200 && commitRes.body.ok !== false) {
          sessionsCommitted += 1;
          sessionResult.commitCreated = {
            marks: commitRes.body.createdMarks ?? 0,
            pursuits: commitRes.body.createdPursuits ?? 0,
            milestones: commitRes.body.createdMilestones ?? 0,
          };
          console.log(
            `  Committed: ${sessionResult.commitCreated.marks} marks, ${sessionResult.commitCreated.pursuits} pursuits, ${sessionResult.commitCreated.milestones} milestones`,
          );

          const { goals: goalsAfter, branchById: branchesAfter } = await fetchBranchMap(token);
          const newGoals = goalsAfter.filter((g) => isRoadmapGoal(g) && !idsBefore.has(g.id));
          for (const goal of newGoals) {
            const branch = goal.categoryId ? branchesAfter.get(goal.categoryId) : undefined;
            const record: CreatedPursuitRecord = {
              id: goal.id,
              title: goal.title,
              hubLabel: hubLabelFromBranch(branch),
              categoryId: goal.categoryId ?? "",
              limbId: (goal.limbId ?? branch?.limbId ?? "work") as LifeAreaId,
              sourceBrainDumpId: dump.id,
            };
            sessionResult.pursuitsCreatedThisSession.push(record);
            results.createdPursuits.push(record);
            console.log(`  New pursuit: ${record.title} → ${record.hubLabel} (${record.limbId}) [${record.id}]`);
          }
        } else {
          sessionResult.commitError = commitRes.body.error ?? `HTTP ${commitRes.status}`;
          console.error(`  Commit failed: ${sessionResult.commitError}`);
        }
      }
    } else if (!REPLAY_STREAM_CHECKPOINT) {
      console.error(`  Extract failed: ${sessionResult.extractError}`);
    }

    sessions.push(sessionResult);
    saveCheckpoint(results);
  }

  const pursuitsByTheme: Record<string, number> = {};
  const pursuitsByHub: Record<string, number> = {};
  for (const p of results.createdPursuits) {
    pursuitsByTheme[p.limbId] = (pursuitsByTheme[p.limbId] ?? 0) + 1;
    pursuitsByHub[p.hubLabel] = (pursuitsByHub[p.hubLabel] ?? 0) + 1;
  }

  results.streamSummary = {
    sessionsExtracted,
    sessionsCommitted,
    cardsSkippedUnresolvedHub,
    extractedMarksSkipped,
    manualMarksCreated: results.phase3?.marks.length ?? 0,
    hubResolution: hubResolutionStats,
    pursuitsByTheme,
    pursuitsByHub,
    skippedStoryInsights: false,
    skippedBrainDumpIds: skippedBrainDumpIds.length > 0 ? skippedBrainDumpIds : undefined,
    titleQualityWarnings: mergeTitleQualityWarnings([], results.createdPursuits),
  };
  saveCheckpoint(results);

  if (results.streamSummary.titleQualityWarnings?.length) {
    console.log("\n  Title quality warnings (non-blocking):");
    reportTitleQualityWarnings(results.streamSummary.titleQualityWarnings);
  }

  console.log("\n  Hub resolution breakdown:");
  console.log(`    exact: ${hubResolutionStats.exact}`);
  console.log(`    alias: ${hubResolutionStats.alias}`);
  console.log(`    theme-default: ${hubResolutionStats["theme-default"]}`);
  console.log(`    keyword: ${hubResolutionStats.keyword}`);
  console.log(`    fallback: ${hubResolutionStats.fallback}`);
  console.log(`    unresolved/skipped: ${hubResolutionStats.unresolved} (${hubResolutionStats.skipped} cards skipped)`);
}

async function phase3Marks(token: string, results: SimulationResults): Promise<void> {
  console.log("\n=== Phase 3: Marks (5 life events) ===");
  const { hubByLabel } = await fetchBranchMap(token);

  const markSpecs: Array<{ title: string; hub: string; limbId: LifeAreaId; date: string }> = [
    {
      title: "Admitted as an attorney, opened South Africa's first Black law firm",
      hub: "Career",
      limbId: "work",
      date: "1952-08-01",
    },
    {
      title: "Sentenced to life imprisonment at the Rivonia Trial",
      hub: "Purpose",
      limbId: "becoming",
      date: "1964-06-12",
    },
    {
      title: "Walked free from Victor Verster Prison after 27 years",
      hub: "Purpose",
      limbId: "becoming",
      date: "1990-02-11",
    },
    {
      title: "Inaugurated as the first democratically elected President of South Africa",
      hub: "Career",
      limbId: "work",
      date: "1994-05-10",
    },
    {
      title: "Awarded the Nobel Peace Prize",
      hub: "Purpose",
      limbId: "becoming",
      date: "1993-12-10",
    },
  ];

  const marks: MarkRecord[] = [];
  for (let i = 0; i < markSpecs.length; i += 1) {
    const spec = markSpecs[i]!;
    const hub = resolveHub(hubByLabel, spec.hub);
    const { status, body } = await apiFetch<{ mark?: { id: string }; error?: string }>(
      token,
      "/api/marks",
      {
        method: "POST",
        body: JSON.stringify({
          categoryId: hub.id,
          limbId: spec.limbId,
          title: spec.title,
          date: spec.date,
        }),
      },
    );
    if (status !== 200) {
      throw new Error(`POST /api/marks failed (${status}): ${body.error ?? spec.title}`);
    }
    marks.push({
      title: spec.title,
      hubLabel: spec.hub,
      limbId: spec.limbId,
      categoryId: hub.id,
      date: spec.date,
    });
    console.log(`  Mark: ${spec.title} → ${spec.hub}`);
    saveCheckpoint(results);
    if (i < markSpecs.length - 1) {
      await waitWithCountdown("Waiting before next mark write", DB_WRITE_DELAY_MS);
    }
  }
  results.phase3 = { marks };
  if (results.streamSummary) {
    results.streamSummary.manualMarksCreated = marks.length;
  }
  saveCheckpoint(results);
}

async function phase4Story(token: string, results: SimulationResults): Promise<StoryPayload> {
  console.log("\n=== Phase 4: Story ===");
  await waitBeforeAiCall("Waiting before Story generation");
  const gen = await apiFetchAi<{ story?: StoryPayload; error?: string }>(
    token,
    "/api/story",
    { method: "POST", body: JSON.stringify({ force: true }) },
    results,
    "story generate",
  );
  results.stats.aiCalls += 1;
  if (gen.status !== 200 || !gen.body.story) {
    throw new Error(`POST /api/story failed (${gen.status}): ${gen.body.error ?? "no story"}`);
  }
  const fetchRes = await apiFetch<{ story?: StoryPayload; error?: string }>(token, "/api/story");
  results.phase4 = { generate: gen.body, fetch: fetchRes.body };
  saveCheckpoint(results);
  console.log("  Story generated and fetched.");
  return fetchRes.body.story ?? gen.body.story;
}

async function phase5Insights(token: string, results: SimulationResults): Promise<InsightCachePayload> {
  console.log("\n=== Phase 5: Insights ===");
  await waitBeforeAiCall("Waiting before Insights generation");
  const gen = await apiFetchAi<{ cache?: InsightCachePayload; error?: string }>(
    token,
    "/api/insights",
    { method: "POST", body: JSON.stringify({ force: true }) },
    results,
    "insights generate",
  );
  results.stats.aiCalls += 1;
  if (gen.status !== 200 || !gen.body.cache) {
    throw new Error(`POST /api/insights failed (${gen.status}): ${gen.body.error ?? "no cache"}`);
  }
  const fetchRes = await apiFetch<{ cache?: InsightCachePayload; error?: string }>(token, "/api/insights");
  results.phase5 = { generate: gen.body, fetch: fetchRes.body };
  saveCheckpoint(results);
  console.log("  Insights generated and fetched.");
  return fetchRes.body.cache ?? gen.body.cache;
}

function assertPursuitsCreatedOrExit(results: SimulationResults): void {
  if (results.createdPursuits.length > 0) return;

  results.status = "failed";
  results.completedAt = new Date().toISOString();
  results.skippedStoryInsights = true;
  if (results.streamSummary) {
    results.streamSummary.skippedStoryInsights = true;
  }
  saveCheckpoint(results);

  console.error(
    "\nSkipping Story/Insights because no pursuits were created; simulation failed before evaluation.",
  );
  printFinalReport(results);
  process.exit(1);
}

function phase6Evaluate(
  results: SimulationResults,
  story: StoryPayload,
  insights: InsightCachePayload,
): void {
  console.log("\n=== Phase 6: Evaluation (rule-based) ===");
  const ctx = buildEvalContext(results.createdPursuits);
  const storyChecks = evaluateStory(story, ctx);
  const insightChecks = evaluateInsights(insights, ctx);
  const hubRouting = computeHubRoutingAccuracy(results.createdPursuits);

  results.phase6 = { mode: "full", storyChecks, insightChecks, hubRouting };
  saveCheckpoint(results);

  for (const c of storyChecks) console.log(formatCheckLine(c));
  for (const c of insightChecks) console.log(formatCheckLine(c));
  console.log(`  Hub routing (approximate): ${hubRouting.approximatePercent}% — ${hubRouting.detail}`);
  if (hubRouting.misroutedExamples.length > 0) {
    console.log("  Misrouted examples:");
    for (const ex of hubRouting.misroutedExamples.slice(0, 8)) console.log(`    - ${ex}`);
  }
  if (hubRouting.unknownExamples.length > 0) {
    console.log("  Unknown-routing examples:");
    for (const ex of hubRouting.unknownExamples.slice(0, 8)) console.log(`    - ${ex}`);
  }
}

function phase6EvaluateSmoke(results: SimulationResults): void {
  console.log("\n=== Phase 6: Evaluation (smoke harness — no Story/Insights) ===");
  const smokeChecks = evaluateSmokeHarness(results);
  const hubRouting = computeHubRoutingAccuracy(results.createdPursuits);
  const titleQualityWarnings = mergeTitleQualityWarnings(
    results.streamSummary?.titleQualityWarnings ?? [],
    results.createdPursuits,
  );
  if (results.streamSummary) {
    results.streamSummary.titleQualityWarnings = titleQualityWarnings;
  }

  results.phase6 = {
    mode: "smoke",
    storyChecks: [],
    insightChecks: [],
    smokeChecks,
    hubRouting,
    titleQualityWarnings,
  };
  saveCheckpoint(results);

  for (const c of smokeChecks) console.log(formatCheckLine(c));
  reportTitleQualityWarnings(titleQualityWarnings);
  console.log(`  Hub routing (approximate): ${hubRouting.approximatePercent}% — ${hubRouting.detail}`);
  if (hubRouting.misroutedExamples.length > 0) {
    console.log("  Misrouted examples:");
    for (const ex of hubRouting.misroutedExamples.slice(0, 8)) console.log(`    - ${ex}`);
  }
  if (hubRouting.unknownExamples.length > 0) {
    console.log("  Unknown-routing examples:");
    for (const ex of hubRouting.unknownExamples.slice(0, 8)) console.log(`    - ${ex}`);
  }
}

function printFinalReport(results: SimulationResults): void {
  const hubBreakdown = results.streamSummary?.pursuitsByHub ?? {};
  const themeBreakdown = results.streamSummary?.pursuitsByTheme ?? {};
  const hubResolution = results.streamSummary?.hubResolution;

  const storyPassed = results.phase6?.storyChecks.filter((c) => c.passed).length ?? 0;
  const storyStrong = results.phase6?.storyChecks.filter((c) => c.strength === "strong").length ?? 0;
  const storyTotal = results.phase6?.storyChecks.length ?? 0;
  const insightPassed = results.phase6?.insightChecks.filter((c) => c.passed).length ?? 0;
  const insightStrong = results.phase6?.insightChecks.filter((c) => c.strength === "strong").length ?? 0;
  const insightTotal = results.phase6?.insightChecks.length ?? 0;
  const storyFails = results.phase6?.storyChecks.filter((c) => !c.passed).map((c) => c.label) ?? [];
  const insightFails = results.phase6?.insightChecks.filter((c) => !c.passed).map((c) => c.label) ?? [];

  console.log("\n========== FINAL REPORT ==========");
  console.log(`Stream sessions extracted: ${results.streamSummary?.sessionsExtracted ?? "?"}`);
  console.log(`Stream sessions committed: ${results.streamSummary?.sessionsCommitted ?? "?"}`);
  const skippedBrainDumpIds =
    results.streamSummary?.skippedBrainDumpIds ??
    results.phase2?.sessions.filter((s) => s.skipped).map((s) => s.id) ??
    [];
  if (skippedBrainDumpIds.length > 0) {
    console.log(`Skipped brain dumps: ${skippedBrainDumpIds.join(", ")}`);
  }
  console.log(
    `Cards skipped (unresolved hub): ${results.streamSummary?.cardsSkippedUnresolvedHub ?? "?"}`,
  );
  console.log(`Stream marks skipped (not committed): ${results.streamSummary?.extractedMarksSkipped ?? "?"}`);
  console.log(`Manual marks created (Phase 3): ${results.streamSummary?.manualMarksCreated ?? results.phase3?.marks.length ?? "?"}`);
  if (hubResolution) {
    console.log("Hub resolution breakdown:");
    console.log(`  exact: ${hubResolution.exact}`);
    console.log(`  alias: ${hubResolution.alias}`);
    console.log(`  theme-default: ${hubResolution["theme-default"]}`);
    console.log(`  keyword: ${hubResolution.keyword}`);
    console.log(`  fallback: ${hubResolution.fallback}`);
    console.log(`  unresolved/skipped: ${hubResolution.unresolved}`);
  }
  console.log(`Pursuits created: ${results.createdPursuits.length}`);
  for (const p of results.createdPursuits) {
    console.log(`  - "${p.title}" → ${p.hubLabel} (${p.limbId}) [${p.sourceBrainDumpId}]`);
  }
  const titleWarnings =
    results.phase6?.titleQualityWarnings ?? results.streamSummary?.titleQualityWarnings ?? [];
  if (titleWarnings.length > 0) {
    console.log(`Title quality warnings (${titleWarnings.length}, non-blocking):`);
    for (const w of titleWarnings) {
      const src = w.sourceBrainDumpId ? ` [${w.sourceBrainDumpId}]` : "";
      console.log(`  - "${w.title}"${src}: ${w.detail}`);
    }
  }
  if (Object.keys(themeBreakdown).length > 0) {
    console.log("  By theme:");
    for (const [theme, count] of Object.entries(themeBreakdown).sort()) {
      const label = LIFE_AREAS.find((a) => a.id === theme)?.label ?? theme;
      console.log(`    ${label}: ${count}`);
    }
  }
  if (Object.keys(hubBreakdown).length > 0) {
    console.log("  By hub:");
    for (const [hub, count] of Object.entries(hubBreakdown).sort()) {
      console.log(`    ${hub}: ${count}`);
    }
  }
  console.log(`Marks added: ${results.phase3?.marks.length ?? 0}`);
  if (isPhaseSkipped(results.phase4)) {
    console.log(`Story/Insights: SKIPPED (${results.phase4.reason})`);
    console.log(
      `Hub routing (approx): ${results.phase6?.hubRouting.approximatePercent ?? 0}%` +
        ` (${results.phase6?.hubRouting.matched ?? 0} matched, ${results.phase6?.hubRouting.misrouted ?? 0} misrouted, ${results.phase6?.hubRouting.unknown ?? 0} unknown)`,
    );
    const smokeChecks = results.phase6?.smokeChecks ?? [];
    const smokePassed = smokeChecks.filter((c) => c.passed).length;
    const smokeFails = smokeChecks.filter((c) => !c.passed).map((c) => c.label);
    console.log(
      `Smoke harness: ${smokePassed}/${smokeChecks.length} passed` +
        (smokeFails.length ? ` — failed: ${smokeFails.join(", ")}` : ""),
    );
  } else if (results.skippedStoryInsights && results.status === "failed") {
    console.log("Story/Insights: SKIPPED (zero pursuits created — run failed)");
  } else {
    console.log(
      `Hub routing (approx): ${results.phase6?.hubRouting.approximatePercent ?? 0}%` +
        ` (${results.phase6?.hubRouting.matched ?? 0} matched, ${results.phase6?.hubRouting.misrouted ?? 0} misrouted, ${results.phase6?.hubRouting.unknown ?? 0} unknown)`,
    );
    console.log(
      `Story quality: ${storyPassed}/${storyTotal} passed (${storyStrong} strong)${storyFails.length ? ` — failed: ${storyFails.join(", ")}` : ""}`,
    );
    console.log(
      `Insights quality: ${insightPassed}/${insightTotal} passed (${insightStrong} strong)${insightFails.length ? ` — failed: ${insightFails.join(", ")}` : ""}`,
    );
  }
  console.log(`Rate-limit events: ${results.rateLimitEvents.length}`);
  if (results.rateLimitEvents.length > 0) {
    for (const ev of results.rateLimitEvents) {
      console.log(
        `  ${ev.at} ${ev.label} attempt ${ev.attempt} waited ${Math.round(ev.waitMs / 1000)}s` +
          (ev.retryAfterHeader ? ` (Retry-After: ${ev.retryAfterHeader})` : ""),
      );
    }
  }
  console.log(`Total AI calls: ${results.stats.aiCalls}`);
  console.log(`Total runtime: ${Math.round(results.stats.runtimeMs / 1000)}s`);
  console.log(`Run ID: ${results.runId}`);
  console.log(`Status: ${results.status}${results.completedAt ? ` (completed ${results.completedAt})` : ""}`);
  console.log(`Full JSON: ${RESULTS_PATH}`);
  console.log("==================================\n");
}

// ——— Main ———

async function main(): Promise<void> {
  const started = Date.now();
  const runId = createRunId();
  assertWritableResultsPath();

  const replaySource = REPLAY_STREAM_CHECKPOINT ? loadCheckpoint() : null;

  const backupPath = backupResultsCheckpointIfExists();

  console.log(`Results checkpoint: ${RESULTS_PATH}`);
  if (backupPath) {
    console.log(`Existing checkpoint backed up to: ${backupPath}`);
  }
  console.log(`Run ID: ${runId}`);

  if (REPLAY_STREAM_CHECKPOINT) {
    console.log(`Replay mode: Stream extract results loaded from backed-up checkpoint.\n`);
  } else if (backupPath) {
    console.log("");
  }

  const sessionsToRun = streamSessionsToRun();
  const estimatedMinRuntimeMs = estimateMinimumRuntimeMs(sessionsToRun.length);
  console.log(`API base:              ${API_BASE}`);
  console.log(`AI_CALL_DELAY_MS:      ${AI_CALL_DELAY_MS}`);
  console.log(`DB_WRITE_DELAY_MS:     ${DB_WRITE_DELAY_MS}`);
  console.log(`MAX_STREAM_SESSIONS:   ${MAX_STREAM_SESSIONS} (running ${sessionsToRun.length}/${BRAIN_DUMPS.length})`);
  console.log(`SKIP_STORY_INSIGHTS:   ${SKIP_STORY_INSIGHTS ? "yes" : "no"}`);
  console.log(
    `SKIP_BRAIN_DUMP_IDS:   ${SKIP_BRAIN_DUMP_IDS.size > 0 ? [...SKIP_BRAIN_DUMP_IDS].join(", ") : "none"}`,
  );
  console.log(`REPLAY_STREAM_CHECKPOINT: ${REPLAY_STREAM_CHECKPOINT ? "yes" : "no"}`);
  console.log(`Estimated min runtime: ~${Math.round(estimatedMinRuntimeMs / 1000)}s (delays only, excluding AI latency)`);
  console.log(`Account:               ${MANDELA_EMAIL}`);

  printBrainDumpsForReview();

  const session = await loginMobile(MANDELA_EMAIL, MANDELA_PASSWORD);
  console.log(`Authenticated as ${session.email}`);

  const results: SimulationResults = {
    runId,
    status: "running",
    maxStreamSessions: MAX_STREAM_SESSIONS,
    startedAt: new Date().toISOString(),
    email: MANDELA_EMAIL,
    apiBase: API_BASE,
    config: {
      aiCallDelayMs: AI_CALL_DELAY_MS,
      dbWriteDelayMs: DB_WRITE_DELAY_MS,
      estimatedMinRuntimeMs,
      maxStreamSessions: MAX_STREAM_SESSIONS,
      skipStoryInsights: SKIP_STORY_INSIGHTS,
      skipBrainDumpIds: SKIP_BRAIN_DUMP_IDS.size > 0 ? [...SKIP_BRAIN_DUMP_IDS] : undefined,
    },
    rateLimitEvents: [],
    createdPursuits: [],
    stats: { aiCalls: 0, runtimeMs: 0 },
  };
  claimCheckpoint(results);

  await phase1ProfileFacts(session.token, results);
  await phase2StreamSessions(session.token, results, replaySource);
  await phase3Marks(session.token, results);

  assertPursuitsCreatedOrExit(results);

  if (SKIP_STORY_INSIGHTS) {
    skipStoryInsightsPhases(results);
    phase6EvaluateSmoke(results);
  } else {
    const story = await phase4Story(session.token, results);
    const insights = await phase5Insights(session.token, results);
    phase6Evaluate(results, story, insights);
  }

  results.status = "completed";
  results.completedAt = new Date().toISOString();
  results.stats.runtimeMs = Date.now() - started;
  saveCheckpoint(results);
  printFinalReport(results);
  console.log(`Checkpoint saved:      ${RESULTS_PATH}`);
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(entry).href);
}

if (isDirectRun()) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
