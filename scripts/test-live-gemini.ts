/**
 * Manual pre-deploy check — one live Gemini call with a fixture map.
 * Not for CI (costs a Gemini call).
 *
 * Run: npm run test:live-gemini
 * Requires: GEMINI_API_KEY in pathfinder/.env.local
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(__dirname, "..", ".env.local") });

import { generateJsonCompletion, hasGeminiKey } from "../src/lib/gemini";
import {
  buildStorySystemPrompt,
  countMapPursuits,
} from "../src/lib/story/generate-story";
import { sanitizeStoryGeneration } from "../src/lib/story/sanitize-story";
import { storyGenerationSchema, STORY_SCHEMA_VERSION } from "../src/lib/story/story-types";
import { validateReadingOutput } from "../src/lib/story/validate-reading-output";
import type { FormattedMapContext } from "../src/lib/ai/format-map-context";

const FIXTURE_MAP: FormattedMapContext = {
  themes: [
    {
      id: "work",
      label: "Work & Career",
      marks: [],
      hubs: [
        {
          id: "cat-job",
          label: "Job",
          section: "Job",
          marks: [],
          pursuits: [
            {
              id: "p1",
              title: "£500,000 ISA",
              description: "Long-term savings target",
              status: "ACTIVE",
              significance: 5,
              deadline: "2028-12-31",
              milestones: [],
            },
            {
              id: "p2",
              title: "Product Lead search",
              description: "",
              status: "ACTIVE",
              significance: 4,
              deadline: "2026-09-01",
              milestones: [],
            },
          ],
        },
      ],
    },
  ],
};

function stripMarkdownFence(raw: string): string {
  const t = raw.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(t);
  return m?.[1]?.trim() ?? t;
}

async function main() {
  if (!hasGeminiKey()) {
    console.error("GEMINI_API_KEY is required.");
    process.exitCode = 1;
    return;
  }

  const pursuitTitles = FIXTURE_MAP.themes.flatMap((t) =>
    t.hubs.flatMap((h) => h.pursuits.map((p) => p.title)),
  );
  const totalPursuits = countMapPursuits(FIXTURE_MAP);
  const system = buildStorySystemPrompt(totalPursuits);
  const user = [
    "Name: Alex",
    "Age: 34",
    "Location: London, UK",
    "",
    `Total pursuits on map: ${totalPursuits}`,
    "",
    "Life map JSON:",
    JSON.stringify(FIXTURE_MAP, null, 2),
    "",
    `Return JSON: schemaVersion ("${STORY_SCHEMA_VERSION}"), seasonRead.`,
  ].join("\n");

  console.log(`Calling Gemini (${totalPursuits} pursuits fixture)…`);

  const raw = await generateJsonCompletion({
    system,
    user,
    maxTokens: 2048,
    temperature: 0.5,
    queueKey: "live-gemini-test",
  });

  let json: unknown;
  try {
    json = JSON.parse(stripMarkdownFence(raw));
  } catch (err) {
    console.error("FAIL: invalid JSON from Gemini");
    console.error(raw);
    process.exitCode = 1;
    return;
  }

  const parsed = storyGenerationSchema.safeParse(json);
  if (!parsed.success) {
    console.error("FAIL: schema validation");
    console.error(parsed.error.issues);
    process.exitCode = 1;
    return;
  }

  const story = sanitizeStoryGeneration(parsed.data);
  const quality = validateReadingOutput(story.seasonRead, {
    pursuitTitles,
    depthMode: totalPursuits <= 2 ? "sparse" : "panoramic",
    requireAllTitles: totalPursuits <= 2,
  });

  console.log("\n--- seasonRead ---\n");
  console.log(story.seasonRead);
  console.log("\n--- quality ---\n");
  console.log(`Words: ${quality.wordCount}`);
  if (!quality.ok) {
    console.error("FAIL: reading quality gate");
    for (const issue of quality.issues) {
      console.error(`  [${issue.code}] ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("PASS: live Gemini reading (schema + quality gate)");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
