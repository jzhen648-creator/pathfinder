/**
 * Routing quality test — runs hard extraction cases directly against the AI
 * using catalog-only mock contexts (no existing pursuits or marks).
 *
 * Tests whether hub catalog content alone is sufficient for correct routing.
 * All 8 cases target known boundary or ambiguity failures.
 *
 * Run: npx tsx scripts/test-routing-cases.ts
 * Requires: GEMINI_API_KEY in .env.local (no dev server, no login)
 */
import "dotenv/config";
import { config as loadEnv } from "dotenv";
// .env.local overrides .env (base .env may have empty placeholder values)
loadEnv({ path: ".env.local", override: true });

import { runStreamThemeExtract } from "../src/lib/ai/stream-extract";
import { hasGeminiKey } from "../src/lib/gemini";
import { hubPanelCopy } from "../src/lib/hub-catalog";
import { LOCKED_HUB_TEMPLATES, normalizeHubLabelKey } from "../src/lib/taxonomy";
import { getLifeArea } from "../src/lib/life-areas";
import type { LifeAreaId } from "../src/lib/types";
import type { StreamThemeContextInput, StreamThemeHubContextInput } from "../src/types/stream";

// ---------------------------------------------------------------------------
// Mock context builder — catalog-only (no user data)
// ---------------------------------------------------------------------------

const MOCK_BRANCH_ID_COUNTER = { n: 0 };
function mockBranchId(): string {
  return `mock-branch-${++MOCK_BRANCH_ID_COUNTER.n}`;
}

function buildMockThemeContext(themeId: LifeAreaId): StreamThemeContextInput {
  const templates = LOCKED_HUB_TEMPLATES.filter((t) => t.limbId === themeId);
  const hubs: StreamThemeHubContextInput[] = templates.map((t) => {
    const copy = hubPanelCopy(themeId, t.threadType);
    return {
      hubId: normalizeHubLabelKey(t.threadType),
      hubLabel: t.threadType,
      about: copy.about,
      aiRoutingNote: copy.aiRoutingNote,
      belongsHere: copy.belongsHere,
      doesNotBelongHere: copy.doesNotBelongHere,
      examples: copy.examples,
      branchId: mockBranchId(),
      existingPursuits: [],
      existingMarks: [],
      removedPursuits: [],
      removedMarks: [],
    };
  });

  const themeName = getLifeArea(themeId)?.label ?? themeId;
  return { themeId, themeName, hubs, previousThemeSessionContext: "None yet" };
}

// ---------------------------------------------------------------------------
// Test case definitions
// ---------------------------------------------------------------------------

type ExpectedResult =
  | { kind: "hub"; hubSlug: string }
  | { kind: "hubOrAmbiguous"; hubSlug: string }
  | { kind: "ambiguous" };

type RoutingCase = {
  id: string;
  themeId: LifeAreaId;
  input: string;
  expected: ExpectedResult;
  description: string;
};

const CASES: RoutingCase[] = [
  {
    id: "elders-purpose",
    themeId: "becoming",
    input: "Launched The Elders with global peers",
    expected: { kind: "hub", hubSlug: "purpose" },
    description:
      "Values-led civic institution founding — should land on Purpose, not Builds & Launches or Friendships",
  },
  {
    id: "isa-assets",
    themeId: "finance",
    input: "My stocks and shares ISA hit £5,000",
    expected: { kind: "hub", hubSlug: "assets" },
    description: "Investment milestone — should land on Assets, not Safety net",
  },
  {
    id: "spousal-visa-romance",
    themeId: "people",
    input: "Applied for spousal visa, £3,200 total",
    expected: { kind: "hub", hubSlug: "romance" },
    description: "Spousal visa admin — should land on Romance, not Safety net or Liabilities",
  },
  {
    id: "therapy-inner-life",
    themeId: "becoming",
    input: "Started therapy on 20 February",
    expected: { kind: "hub", hubSlug: "mind & emotions" },
    description: "Therapy — should land on Mind & Emotions, not Purpose & Values",
  },
  {
    id: "cemap-skills",
    themeId: "work",
    input: "Finished CeMAP module 1 last Tuesday",
    expected: { kind: "hub", hubSlug: "skills" },
    description: "Professional qualification — should land on Skills, not Career",
  },
  {
    id: "retreat-purpose",
    themeId: "becoming",
    input: "Went on a direction-finding retreat, clarified my north star",
    expected: { kind: "hub", hubSlug: "purpose" },
    description: "Values/direction retreat — should land on Purpose & Values, not Mind & Emotions",
  },
  {
    id: "youtube-builds",
    themeId: "work",
    input: "I launched my YouTube channel on 3 April",
    expected: { kind: "hub", hubSlug: "builds & launches" },
    description: "Published channel launch — should land on Builds & Launches, not Career",
  },
  {
    id: "acne-ambiguous",
    themeId: "health",
    input: "Booked a dermatologist for acne — I've been avoiding photos",
    // Appearance catalog explicitly includes photo flinching / mirror avoidance signals,
    // so a confident Appearance route is catalog-correct; ambiguity is also acceptable
    // when the model emphasizes the Appearance / Inner life boundary.
    expected: { kind: "hubOrAmbiguous", hubSlug: "appearance" },
    description:
      "Photo avoidance + cosmetic appointment — Appearance is acceptable; ambiguity is also acceptable",
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function routingSlugFor(result: Awaited<ReturnType<typeof runStreamThemeExtract>>): string[] {
  const slugs: string[] = [];
  for (const m of result.marks) {
    if (m.hubId) slugs.push(m.hubId);
  }
  for (const p of result.pursuits) {
    if (p.hubId) slugs.push(p.hubId);
  }
  for (const ms of result.milestones) {
    if (ms.hubId) slugs.push(ms.hubId);
  }
  return [...new Set(slugs)];
}

function checkResult(
  tc: RoutingCase,
  result: Awaited<ReturnType<typeof runStreamThemeExtract>>,
): { pass: boolean; actualDescription: string } {
  if (tc.expected.kind === "ambiguous") {
    const pass = result.ambiguous.length > 0;
    const actualDescription =
      result.ambiguous.length > 0
        ? `ambiguous[${result.ambiguous.map((a) => a.label).join(", ")}]`
        : `NOT ambiguous — routed to: ${routingSlugFor(result).join(", ") || "(none)"}`;
    return { pass, actualDescription };
  }

  if (tc.expected.kind === "hubOrAmbiguous") {
    const expected = tc.expected.hubSlug;
    const routed = routingSlugFor(result);
    const pass = result.ambiguous.length > 0 || routed.includes(expected);
    const actualDescription =
      result.ambiguous.length > 0
        ? `ambiguous[${result.ambiguous.map((a) => a.label).join(", ")}]`
        : routed.length > 0
          ? routed.join(", ")
          : "(nothing extracted)";
    return { pass, actualDescription };
  }

  // hub routing expected
  const expected = tc.expected.hubSlug;
  const routed = routingSlugFor(result);
  const pass = routed.includes(expected) && result.ambiguous.length === 0;
  const actualDescription =
    routed.length > 0
      ? routed.join(", ") + (result.ambiguous.length > 0 ? ` + ambiguous(${result.ambiguous.length})` : "")
      : "(nothing extracted)";
  return { pass, actualDescription };
}

async function runWithRetry(
  ctx: StreamThemeContextInput,
  input: string,
  maxAttempts = 4,
): Promise<Awaited<ReturnType<typeof runStreamThemeExtract>>> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await runStreamThemeExtract(ctx, input);
    } catch (err) {
      const is429 = String(err).includes("429");
      if (!is429 || attempt === maxAttempts) throw err;
      const backoffMs = 30000 * attempt; // 30s, 60s, 90s
      console.log(`  [rate limited — retrying in ${backoffMs / 1000}s (attempt ${attempt}/${maxAttempts})]`);
      await new Promise((res) => setTimeout(res, backoffMs));
    }
  }
  throw new Error("Unreachable");
}

async function runCase(
  tc: RoutingCase,
): Promise<{ pass: boolean }> {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`[${tc.id}] ${tc.description}`);
  console.log(`  Input:    "${tc.input}"`);
  const expectedLabel =
    tc.expected.kind === "ambiguous"
      ? "ambiguous"
      : tc.expected.kind === "hubOrAmbiguous"
        ? `${tc.expected.hubSlug} or ambiguous`
        : tc.expected.hubSlug;
  console.log(`  Expected: ${expectedLabel}`);

  const ctx = buildMockThemeContext(tc.themeId);

  let result: Awaited<ReturnType<typeof runStreamThemeExtract>>;
  try {
    result = await runWithRetry(ctx, tc.input);
  } catch (err) {
    console.log(`  Actual:   ERROR — ${String(err)}`);
    console.log(`  Result:   FAIL`);
    return { pass: false };
  }

  const { pass, actualDescription } = checkResult(tc, result);
  console.log(`  Actual:   ${actualDescription}`);
  console.log(`  Result:   ${pass ? "PASS" : "FAIL"}`);
  return { pass };
}

async function main() {
  if (!hasGeminiKey()) {
    console.error("GEMINI_API_KEY not set — add it to .env.local");
    process.exitCode = 1;
    return;
  }

  console.log("Pathfinder — Stream routing quality test");
  console.log(`${CASES.length} cases / catalog-only mock contexts / no existing pursuits\n`);

  const results: Array<{ id: string; pass: boolean }> = [];

  for (let i = 0; i < CASES.length; i++) {
    const tc = CASES[i]!;
    if (i > 0) {
      // Pause between API calls to stay within rate limits
      await new Promise((res) => setTimeout(res, 10000));
    }
    const { pass } = await runCase(tc);
    results.push({ id: tc.id, pass });
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log("SUMMARY");
  console.log("─".repeat(60));

  let failCount = 0;
  for (const r of results) {
    const label = r.pass ? "PASS" : "FAIL";
    console.log(`  ${label}  ${r.id}`);
    if (!r.pass) failCount++;
  }

  const passCount = results.length - failCount;
  console.log(`\n${passCount}/${results.length} cases passed`);

  if (failCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exitCode = 1;
});
