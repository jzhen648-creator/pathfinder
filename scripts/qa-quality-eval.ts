/**
 * Advisory AI quality eval — never fails CI (see PATHFINDER-QA-PLAN.md §6).
 * Runs deterministic rubric checks on fixture panels; flags B23/B24-style drift.
 *
 * Run: npm run qa:quality-eval
 * Env: AI_FAKE_PROVIDER=1 (optional — no network either way)
 */
import fs from "node:fs";
import path from "node:path";

import {
  buildDenseReflectResponse,
  DENSE_DIRTY_PURSUIT_IDS,
} from "../src/lib/map/__fixtures__/dense-map";

type QualityFlag =
  | "status-narration-headline"
  | "connective-tissue-filler"
  | "evaluative-language"
  | "significance-echo";

type FixtureResult = {
  id: string;
  headline: string;
  body: string;
  flags: QualityFlag[];
};

type QualityReport = {
  generatedAt: string;
  advisory: true;
  fixtureCount: number;
  flaggedCount: number;
  fixtures: FixtureResult[];
};

const STATUS_NARRATION_HEADLINE =
  /\b(is active|in progress|ongoing|currently working|still in progress)\b/i;

const CONNECTIVE_TISSUE =
  /\b(this reflects|overall picture|in terms of|landscape of|journey toward|broader context)\b/i;

const EVALUATIVE_LANGUAGE =
  /\b(demonstrates|shows dedication|reflects commitment|significant achievement|impressive progress|remarkable)\b/i;

const SIGNIFICANCE_ECHO =
  /\b\d\s*\/\s*[35]\b|\bsignificance\s*[:\-]?\s*[1-5]\b/i;

function gradePanel(headline: string, body: string): QualityFlag[] {
  const flags: QualityFlag[] = [];
  const combined = `${headline}\n${body}`;

  if (STATUS_NARRATION_HEADLINE.test(headline)) {
    flags.push("status-narration-headline");
  }
  if (CONNECTIVE_TISSUE.test(body)) {
    flags.push("connective-tissue-filler");
  }
  if (EVALUATIVE_LANGUAGE.test(combined)) {
    flags.push("evaluative-language");
  }
  if (SIGNIFICANCE_ECHO.test(combined)) {
    flags.push("significance-echo");
  }

  return flags;
}

function buildReport(): QualityReport {
  const reflect = buildDenseReflectResponse(DENSE_DIRTY_PURSUIT_IDS.slice(0, 6));
  const fixtures: FixtureResult[] = [];

  for (const [id, panel] of Object.entries(reflect.pursuits)) {
    fixtures.push({
      id,
      headline: panel.headline,
      body: panel.body,
      flags: gradePanel(panel.headline, panel.body),
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    advisory: true,
    fixtureCount: fixtures.length,
    flaggedCount: fixtures.filter((fixture) => fixture.flags.length > 0).length,
    fixtures,
  };
}

function renderMarkdown(report: QualityReport): string {
  const lines = [
    "# QA quality eval (advisory)",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `Fixtures: ${report.fixtureCount} · Flagged: ${report.flaggedCount}`,
    "",
    "| Fixture | Flags |",
    "|---------|-------|",
  ];

  for (const fixture of report.fixtures) {
    const flags = fixture.flags.length > 0 ? fixture.flags.join(", ") : "—";
    lines.push(`| ${fixture.id} | ${flags} |`);
  }

  lines.push("", "_Advisory only — does not fail CI._");
  return lines.join("\n");
}

function main(): void {
  const report = buildReport();
  const root = process.cwd();
  const jsonPath = path.join(root, "qa-quality-report.json");
  const mdPath = path.join(root, "qa-quality-report.md");

  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(mdPath, `${renderMarkdown(report)}\n`, "utf8");

  console.log(`Wrote ${path.relative(root, jsonPath)} (${report.fixtureCount} fixtures)`);
  console.log(`Wrote ${path.relative(root, mdPath)} (${report.flaggedCount} flagged)`);
}

main();
