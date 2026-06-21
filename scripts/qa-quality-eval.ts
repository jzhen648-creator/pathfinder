/**
 * Layer 6 advisory quality eval — grades fake-provider and static fixture outputs.
 * Never gates CI. Writes qa-quality-report.json + .md under pathfinder/.
 */
import fs from "node:fs";
import path from "node:path";

import {
  resetFakeProviderState,
  resolveFakeJsonCompletion,
} from "../src/lib/ai/__fixtures__/fake-provider";
import { gradeInsightQuality } from "../src/lib/qa/insight-quality-grade";
import { STATIC_INSIGHT_QUALITY_FIXTURES } from "../src/lib/qa/insight-quality-fixtures";

const OUT_DIR = path.resolve(__dirname, "..");

type FixtureReport = {
  id: string;
  flags: string[];
  pass: boolean;
  source: "static" | "fake-provider";
};

function gradePayload(payload: Parameters<typeof gradeInsightQuality>[0]): string[] {
  return gradeInsightQuality(payload);
}

async function main() {
  const reports: FixtureReport[] = [];

  for (const fixture of STATIC_INSIGHT_QUALITY_FIXTURES) {
    const flags = gradePayload(fixture.payload);
    const gradedClean = flags.length === 0;
    reports.push({
      id: fixture.id,
      flags,
      pass: gradedClean === fixture.expectPass,
      source: "static",
    });
  }

  process.env.AI_FAKE_PROVIDER = "1";
  resetFakeProviderState();

  const liveFixtures: Array<{ id: string; user: string }> = [
    {
      id: "sparse-panels",
      user: '<dirty_pursuits>\n["p1"]\n</dirty_pursuits>\nReturn ONLY: { "reading": "", "pursuits": { ... } }',
    },
    {
      id: "dense-panels",
      user: `<dirty_pursuits>\n${JSON.stringify(Array.from({ length: 8 }, (_, i) => `p${i + 1}`))}\n</dirty_pursuits>\nReturn ONLY: { "reading": "", "pursuits": { ... } }`,
    },
    {
      id: "full-reflect-themes",
      user: `<dirty_pursuits>\n["p-cemap","p-isa"]\n</dirty_pursuits>\n<dirty_themes>\n["finance","work"]\n</dirty_themes>\nReturn themes and pursuits.`,
    },
  ];

  for (const fixture of liveFixtures) {
    resetFakeProviderState();
    const raw = await resolveFakeJsonCompletion({ user: fixture.user });
    let parsed: Parameters<typeof gradeInsightQuality>[0];
    try {
      parsed = JSON.parse(raw) as Parameters<typeof gradeInsightQuality>[0];
    } catch {
      reports.push({ id: fixture.id, flags: ["invalid-json"], pass: false, source: "fake-provider" });
      continue;
    }
    const flags = gradePayload(parsed);
    reports.push({ id: fixture.id, flags, pass: flags.length === 0, source: "fake-provider" });
  }

  const jsonPath = path.join(OUT_DIR, "qa-quality-report.json");
  const mdPath = path.join(OUT_DIR, "qa-quality-report.md");
  fs.writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2));
  fs.writeFileSync(
    mdPath,
    [
      "# QA quality report (advisory)",
      "",
      `Generated: ${new Date().toISOString()}`,
      "",
      ...reports.map(
        (r) => `- **${r.id}** (${r.source}): ${r.pass ? "pass" : `flags: ${r.flags.join(", ")}`}`,
      ),
      "",
    ].join("\n"),
  );

  console.log(`qa-quality-eval: wrote ${jsonPath}`);
}

void main();
