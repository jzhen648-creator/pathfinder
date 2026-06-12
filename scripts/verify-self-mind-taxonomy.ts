/**
 * Self & Mind taxonomy verification (deterministic + optional Gemini).
 * Run: npx tsx scripts/verify-self-mind-taxonomy.ts
 */
import "dotenv/config";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: true });

import assert from "node:assert/strict";
import {
  STREAM_EXTRACT_GLOBAL_SYSTEM_PROMPT,
  STREAM_EXTRACT_THEME_SYSTEM_PROMPT,
  runStreamGlobalExtract,
  runStreamThemeExtract,
} from "../src/lib/ai/stream-extract";
import type { FormattedMapContext } from "../src/lib/ai/format-map-context";
import { hubPanelCopy } from "../src/lib/category-catalog";
import { hasGeminiKey } from "../src/lib/gemini";
import { pickBestHubSlugForThemeInput } from "../src/lib/stream-theme-context";
import { getLifeArea } from "../src/lib/life-areas";
import {
  LEGACY_HUB_MIGRATIONS,
  LIFE_AREA_IDS,
  LOCKED_CATEGORY_TEMPLATES,
  normalizeCategoryLabelKey,
  categoriesForTheme,
} from "../src/lib/taxonomy";
import { normLabel } from "../src/lib/system-categories";
import { normalizeStreamCategorySlug } from "../src/lib/resolve-category";
import type { LifeAreaId } from "../src/lib/types";
import type { StreamThemeContextInput, StreamThemeHubContextInput } from "../src/types/stream";

function simulateDefaultHubRename(
  label: string,
  themeId: LifeAreaId,
): { label: string; limbId: LifeAreaId; renamed: boolean } {
  const raw = normLabel(label);
  let nextLabel = label.trim();
  let nextLimb = limbId;

  const legacy = LEGACY_HUB_MIGRATIONS[raw];
  if (legacy) {
    nextLimb = legacy.limbId;
    nextLabel = legacy.label;
  }

  const template = LOCKED_CATEGORY_TEMPLATES.find(
    (t) => t.limbId === nextLimb && normLabel(t.threadType) === normLabel(nextLabel),
  );
  if (template) {
    nextLabel = template.threadType;
  }

  return {
    label: nextLabel,
    themeId: nextLimb,
    renamed: nextLabel !== label.trim() || nextLimb !== limbId,
  };
}

function assertHub(input: string, themeId: LifeAreaId, expectedSlug: string) {
  const labels = categoriesForTheme(themeId).map((t) => t.threadType);
  const slug = pickBestHubSlugForThemeInput(input, themeId, labels);
  assert.equal(
    slug,
    expectedSlug,
    `[${themeId}] "${input}" → expected slug "${expectedSlug}", got ${slug ?? "none"}`,
  );
}

function buildCatalogMapContext(): FormattedMapContext {
  return {
    themes: LIFE_AREA_IDS.map((themeId) => ({
      id: themeId,
      label: getLifeArea(themeId)?.label ?? themeId,
      marks: [],
      hubs: categoriesForTheme(themeId).map((t) => ({
        id: `hub-${themeId}-${normalizeCategoryLabelKey(t.threadType)}`,
        label: t.threadType,
        pursuits: [],
      })),
    })),
  };
}

function resolveHubFromMap(
  map: FormattedMapContext,
  hubId: string | undefined,
): { themeId: LifeAreaId; slug: string } | null {
  if (!hubId?.trim()) return null;
  for (const theme of map.themes) {
    const hub = theme.hubs.find((h) => h.id === hubId);
    if (hub) {
      return {
        themeId: theme.id as LifeAreaId,
        slug: normalizeCategoryLabelKey(hub.label),
      };
    }
  }
  const slug = normalizeStreamCategorySlug(hubId);
  for (const theme of map.themes) {
    const hub = theme.hubs.find((h) => normalizeCategoryLabelKey(h.label) === slug);
    if (hub) {
      return { themeId: theme.id as LifeAreaId, slug };
    }
  }
  return null;
}

let mockBranchSeq = 0;
function mockBranchId(): string {
  return `mock-branch-${++mockBranchSeq}`;
}

function buildMockThemeContext(themeId: LifeAreaId): StreamThemeContextInput {
  const hubs: StreamThemeHubContextInput[] = categoriesForTheme(themeId).map((t) => {
    const copy = hubPanelCopy(themeId, t.threadType);
    return {
      categorySlug: normalizeStreamCategorySlug(t.threadType),
      hubLabel: t.threadType,
      about: copy.about,
      aiRoutingNote: copy.aiRoutingNote,
      belongsHere: copy.belongsHere,
      doesNotBelongHere: copy.doesNotBelongHere,
      examples: copy.examples,
      categoryId: mockBranchId(),
      existingPursuits: [],
      existingMarks: [],
      removedPursuits: [],
      removedMarks: [],
    };
  });
  return {
    themeId,
    themeName: getLifeArea(themeId)?.label ?? themeId,
    hubs,
    previousThemeSessionContext: "None yet",
  };
}

function firstRoutedHub(
  result: Awaited<ReturnType<typeof runStreamThemeExtract>>,
): string | undefined {
  return (
    result.pursuits[0]?.hubId ??
    result.marks[0]?.hubId ??
    result.milestones[0]?.hubId
  );
}

async function runDeterministicChecks(): Promise<void> {
  const renames: [string, string][] = [
    ["Purpose", "Purpose & Values"],
    ["Inner life", "Mind & Emotions"],
    ["Joy", "Joy & Creativity"],
  ];
  for (const [before, after] of renames) {
    const out = simulateDefaultHubRename(before, "becoming");
    assert.equal(out.label, after, `rename ${before}`);
    assert.equal(out.limbId, "becoming");
    assert.equal(out.renamed, true);
  }

  const custom = simulateDefaultHubRename("My Therapy Journal", "becoming");
  assert.equal(custom.label, "My Therapy Journal");
  assert.equal(custom.renamed, false);

  assert.equal(normalizeCategoryLabelKey("Purpose"), "purpose & values");
  assert.equal(normalizeCategoryLabelKey("Inner life"), "mind & emotions");
  assert.equal(normalizeCategoryLabelKey("Joy"), "joy & creativity");
  assert.equal(normalizeStreamCategorySlug("purpose"), "purpose & values");

  assert.ok(
    LOCKED_CATEGORY_TEMPLATES.every((t) => t.limbId !== "becoming" || t.threadType !== "Purpose"),
    "template should not use old Purpose label",
  );

  assertHub("I want to manage anxiety better", "becoming", "mind & emotions");
  assertHub("I want to start painting again", "becoming", "joy & creativity");
  assertHub("I want to figure out what I want from life", "becoming", "purpose & values");

  assert.ok(STREAM_EXTRACT_THEME_SYSTEM_PROMPT.includes("Self & Mind theme boundaries"));
  assert.ok(STREAM_EXTRACT_GLOBAL_SYSTEM_PROMPT.includes("Do NOT route to Self & Mind"));

  const becoming = getLifeArea("becoming");
  assert.equal(becoming?.label, "Self & Mind");
  assert.deepEqual(
    categoriesForTheme("becoming").map((t) => t.threadType),
    ["Purpose & Values", "Mind & Emotions", "Joy & Creativity"],
  );

  console.log("Deterministic checks: PASS");
}

async function runGeminiRoutingChecks(): Promise<void> {
  if (!hasGeminiKey()) {
    console.log("Gemini routing checks: SKIPPED (no API key)");
    return;
  }

  try {
    await runGeminiRoutingChecksInner();
    console.log("Gemini routing checks: PASS");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("429") || message.includes("RateLimit")) {
      console.log("Gemini routing checks: SKIPPED (rate limited — re-run later)");
      return;
    }
    throw err;
  }
}

async function runGeminiRoutingChecksInner(): Promise<void> {
  const map = buildCatalogMapContext();

  const becomingCases: Array<{ input: string; slug: string }> = [
    { input: "I want to manage anxiety better", slug: "mind & emotions" },
    { input: "I want to start painting again", slug: "joy & creativity" },
    { input: "I want to figure out what I want from life", slug: "purpose & values" },
  ];

  for (const { input, slug } of becomingCases) {
    const ctx = buildMockThemeContext("becoming");
    const result = await runStreamThemeExtract(ctx, input);
    const hub = firstRoutedHub(result);
    assert.equal(
      hub,
      slug,
      `becoming theme extract: "${input}" → expected hub slug ${slug}, got ${hub}`,
    );
  }

  const globalCases: Array<{
    input: string;
    themeId: LifeAreaId;
    allowedSlugs: string[];
  }> = [
    {
      input: "I want to invest £1,000/month",
      themeId: "finance",
      allowedSlugs: ["income", "assets"],
    },
    {
      input: "I want to lose weight",
      themeId: "health",
      allowedSlugs: ["nutrition", "movement", "appearance"],
    },
    { input: "I want to get promoted", themeId: "work", allowedSlugs: ["career"] },
    {
      input: "I want to improve communication with my partner",
      themeId: "people",
      allowedSlugs: ["romance"],
    },
  ];

  for (const { input, themeId, allowedSlugs } of globalCases) {
    const result = await runStreamGlobalExtract(input, { mapContext: map });
    const items = [...result.pursuits, ...result.marks, ...result.milestones];
    assert.ok(items.length > 0, `global extract produced no items for: ${input}`);
    const resolved = resolveHubFromMap(map, items[0]?.hubId);
    assert.ok(resolved, `could not resolve hub for: ${input}`);
    assert.equal(resolved!.themeId, themeId, `global extract theme for "${input}"`);
    assert.ok(
      allowedSlugs.includes(resolved!.slug),
      `global extract hub for "${input}": got ${resolved!.slug}, expected one of ${allowedSlugs.join(", ")}`,
    );
    assert.notEqual(
      resolved!.themeId,
      "becoming",
      `global extract should not route "${input}" to becoming`,
    );
  }

}

async function main(): Promise<void> {
  await runDeterministicChecks();
  await runGeminiRoutingChecks();
  console.log("verify-self-mind-taxonomy.ts: all checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
