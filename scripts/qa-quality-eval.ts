/**
 * Layer 6 advisory quality eval — grades fake-provider fixture outputs.
 * Never gates CI. Writes qa-quality-report.json + .md under pathfinder/.
 */
import fs from "node:fs";
import path from "node:path";

import {
  resetFakeProviderState,
  resolveFakeJsonCompletion,
} from "../src/lib/ai/__fixtures__/fake-provider";

const OUT_DIR = path.resolve(__dirname, "..");

const BANNED_FILLER = ["connective tissue", "threads together", "woven through"];

type FixtureReport = {
  id: string;
  flags: string[];
  pass: boolean;
};

function gradeOutput(raw: string): string[] {
  const flags: string[] = [];
  let parsed: { reading?: string; pursuits?: Record<string, { headline?: string; body?: string }> };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    return ["invalid-json"];
  }

  const reading = parsed.reading ?? "";
  for (const phrase of BANNED_FILLER) {
    if (reading.toLowerCase().includes(phrase)) flags.push(`banned-filler:${phrase}`);
  }

  for (const panel of Object.values(parsed.pursuits ?? {})) {
    const headline = panel.headline?.toLowerCase() ?? "";
    if (headline.includes("active pursuit") || headline.includes("maintaining status")) {
      flags.push("status-narration-headline");
    }
  }

  return flags;
}

async function main() {
  process.env.AI_FAKE_PROVIDER = "1";
  resetFakeProviderState();

  const fixtures: Array<{ id: string; user: string }> = [
    {
      id: "sparse-panels",
      user: '<dirty_pursuits>\n["p1"]\n</dirty_pursuits>\nReturn ONLY: { "reading": "", "pursuits": { ... } }',
    },
    {
      id: "dense-panels",
      user: `<dirty_pursuits>\n${JSON.stringify(Array.from({ length: 8 }, (_, i) => `p${i + 1}`))}\n</dirty_pursuits>\nReturn ONLY: { "reading": "", "pursuits": { ... } }`,
    },
  ];

  const reports: FixtureReport[] = [];

  for (const fixture of fixtures) {
    resetFakeProviderState();
    const raw = await resolveFakeJsonCompletion({ user: fixture.user });
    const flags = gradeOutput(raw);
    reports.push({ id: fixture.id, flags, pass: flags.length === 0 });
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
      ...reports.map((r) => `- **${r.id}:** ${r.pass ? "pass" : `flags: ${r.flags.join(", ")}`}`),
      "",
    ].join("\n"),
  );

  console.log(`qa-quality-eval: wrote ${jsonPath}`);
}

void main();
