/**
 * Controlled real-provider evaluation for Almanac source extraction.
 * Uses fictional fixtures only. It does not write to the database or persist provider output.
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(process.cwd(), ".env.local"), override: true });
delete process.env.AI_FAKE_PROVIDER;

type Candidate = import("../src/lib/imports/extraction-contract").ImportExtractionCandidate;
type Fixture = import("../src/lib/imports/qa-import-extraction-fixtures").ImportExtractionQaFixture;

type EvaluatedCandidate = Candidate & {
  segmentId: string;
  segmentPosition: number;
};

type FieldCheck = { label: string; pass: boolean };

function normalizedCandidateText(candidate: Candidate): string {
  return [candidate.canonicalKey, candidate.proposedText, candidate.chapterTitle, candidate.rationale]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

function matchesGroups(candidate: Candidate, groups: string[][]): boolean {
  const text = normalizedCandidateText(candidate);
  return groups.every((group) => group.some((term) => text.includes(term.toLocaleLowerCase())));
}

function fieldChecks(
  expectation: Fixture["expectations"][number],
  candidate: Candidate,
): FieldCheck[] {
  const checks: FieldCheck[] = [];
  if (expectation.destinations) {
    checks.push({
      label: "destination",
      pass: expectation.destinations.includes(candidate.memoryDestination),
    });
  }
  if (expectation.informationTypes) {
    checks.push({
      label: "informationType",
      pass: expectation.informationTypes.includes(candidate.informationType),
    });
  }
  if (expectation.subjectTypes) {
    checks.push({ label: "subjectType", pass: expectation.subjectTypes.includes(candidate.subjectType) });
  }
  if (expectation.temporalStates) {
    checks.push({
      label: "temporalState",
      pass: expectation.temporalStates.includes(candidate.temporal.state),
    });
  }
  if (expectation.classifications) {
    checks.push({
      label: "classification",
      pass: expectation.classifications.includes(candidate.classification),
    });
  }
  if (expectation.targetGoalId) {
    checks.push({ label: "targetGoal", pass: candidate.targetGoalIds.includes(expectation.targetGoalId) });
  }
  return checks;
}

function percent(numerator: number, denominator: number): number {
  if (denominator === 0) return 1;
  return numerator / denominator;
}

async function evaluateFixture(fixture: Fixture) {
  const [providerModule, contractModule, segmentationModule, reconciliationModule] = await Promise.all([
    import("../src/lib/imports/ai-import-provider"),
    import("../src/lib/imports/extraction-contract"),
    import("../src/lib/imports/segmentation"),
    import("../src/lib/imports/reconciliation"),
  ]);

  const segments = segmentationModule.segmentImportSource(fixture.sourceText);
  const candidates: EvaluatedCandidate[] = [];
  const contractErrors: Array<{ segment: number; message: string }> = [];

  for (const segment of segments) {
    try {
      const raw = await providerModule.aiImportExtractionProvider.extractSegment({
        userId: "qa-import-provider-eval",
        sourceId: `fixture:${fixture.id}`,
        segmentPosition: segment.position,
        segmentText: segment.text,
        context: fixture.context,
      });
      const normalizedOutput = contractModule.normalizeImportExtractionOutput(raw);
      const schemaResult = contractModule.importExtractionResultSchema.safeParse(normalizedOutput);
      if (!schemaResult.success) {
        const issues = schemaResult.error.issues
          .slice(0, 8)
          .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
          .join(" | ");
        const candidateIndexes = [
          ...new Set(
            schemaResult.error.issues
              .map((issue) => issue.path[0] === "candidates" ? issue.path[1] : null)
              .filter((index): index is number => typeof index === "number"),
          ),
        ];
        const rawCandidates =
          normalizedOutput &&
          typeof normalizedOutput === "object" &&
          Array.isArray((normalizedOutput as { candidates?: unknown }).candidates)
            ? (normalizedOutput as { candidates: unknown[] }).candidates
            : [];
        const shapes = candidateIndexes.map((index) => {
          const candidate = rawCandidates[index];
          if (!candidate || typeof candidate !== "object") return `candidate ${index}: non-object`;
          const shape = candidate as Record<string, unknown>;
          const targets = Array.isArray(shape.targetGoalIds) ? shape.targetGoalIds.join(",") : "missing";
          return `candidate ${index}: classification=${String(shape.classification)} destination=${String(shape.memoryDestination)} informationType=${String(shape.informationType)} subjectType=${String(shape.subjectType)} targets=${targets} chapterTitle=${String(shape.chapterTitle)} primaryThemeId=${String(shape.primaryThemeId)}`;
        });
        contractErrors.push({
          segment: segment.position,
          message: `Provider schema mismatch — ${issues}${
            shapes.length > 0 ? ` | ${shapes.join(" | ")}` : ""
          }`,
        });

        // Evaluation-only salvage: score individually valid candidates while
        // production continues to reject the entire malformed response.
        rawCandidates.forEach((rawCandidate) => {
          const candidateResult = contractModule.importExtractionCandidateSchema.safeParse(rawCandidate);
          if (!candidateResult.success) return;
          try {
            const normalized = contractModule.normalizeExtractionEvidenceOffsets(
              { candidates: [candidateResult.data] },
              segment.text,
            );
            contractModule.assertExtractionEvidenceMatchesSegment(normalized, segment.text);
            candidates.push({
              ...normalized.candidates[0]!,
              segmentId: `${fixture.id}:${segment.position}`,
              segmentPosition: segment.position,
            });
          } catch {
            // Already counted as a contract failure for this segment.
          }
        });
        continue;
      }
      const parsed = contractModule.assertExtractionEvidenceMatchesSegment(
        contractModule.normalizeExtractionEvidenceOffsets(schemaResult.data, segment.text),
        segment.text,
      );
      candidates.push(
        ...parsed.candidates.map((candidate) => ({
          ...candidate,
          segmentId: `${fixture.id}:${segment.position}`,
          segmentPosition: segment.position,
        })),
      );
    } catch (error) {
      contractErrors.push({
        segment: segment.position,
        message: error instanceof Error ? `${error.name}: ${error.message}` : "Unknown provider error",
      });
    }
  }

  const matchedCandidateIndexes = new Set<number>();
  const expectationResults = fixture.expectations.map((expectation) => {
    let best:
      | { index: number; candidate: EvaluatedCandidate; checks: FieldCheck[]; passedFields: number }
      | undefined;
    candidates.forEach((candidate, index) => {
      if (matchedCandidateIndexes.has(index) || !matchesGroups(candidate, expectation.termGroups)) return;
      const checks = fieldChecks(expectation, candidate);
      const passedFields = checks.filter((check) => check.pass).length;
      if (!best || passedFields > best.passedFields) {
        best = { index, candidate, checks, passedFields };
      }
    });
    if (!best) return { expectation, match: null, checks: [] as FieldCheck[] };
    matchedCandidateIndexes.add(best.index);
    return { expectation, match: best.candidate, checks: best.checks };
  });

  const validGoalIds = new Set(fixture.context.goals.map((goal) => goal.id));
  const safetyViolations: string[] = [];
  for (const candidate of candidates) {
    for (const target of candidate.targetGoalIds) {
      if (!validGoalIds.has(target)) {
        safetyViolations.push(`unknown target ${target} from candidate ${candidate.id}`);
      }
    }
    for (const rule of fixture.forbidden) {
      if (matchesGroups(candidate, rule.termGroups) && rule.when(candidate)) {
        safetyViolations.push(`${rule.id}: ${rule.description}`);
      }
    }
  }

  const reconcilable = candidates.map((candidate) => ({
    ...candidate,
    evidence: candidate.evidence.map((evidence) => ({ ...evidence, segmentId: candidate.segmentId })),
  }));
  const partition = reconciliationModule.partitionProposalCandidates(reconcilable);
  const matched = expectationResults.filter((result) => result.match).length;
  const checks = expectationResults.flatMap((result) => result.checks);
  const passedChecks = checks.filter((check) => check.pass).length;
  const contractRate = percent(segments.length - contractErrors.length, segments.length);
  const recallRate = percent(matched, fixture.expectations.length);
  const fieldRate = percent(passedChecks, checks.length);
  const safetyRate = safetyViolations.length === 0 ? 1 : Math.max(0, 1 - safetyViolations.length * 0.25);
  const primaryLimit = fixture.maxPrimary ?? 5;
  const reviewLoadRate = partition.primary.length <= primaryLimit ? 1 : 0;
  const score = Math.round(
    20 * contractRate + 40 * recallRate + 20 * fieldRate + 15 * safetyRate + 5 * reviewLoadRate,
  );
  const pass =
    contractErrors.length === 0 &&
    recallRate >= 0.75 &&
    fieldRate >= 0.8 &&
    safetyViolations.length === 0 &&
    partition.primary.length <= primaryLimit;

  return {
    fixture,
    segments: segments.length,
    candidates,
    contractErrors,
    expectationResults,
    safetyViolations,
    partition,
    rates: { contractRate, recallRate, fieldRate, safetyRate, reviewLoadRate },
    score,
    pass,
  };
}

function conciseCandidate(candidate: EvaluatedCandidate): string {
  const target = candidate.targetGoalIds.length > 0 ? ` → ${candidate.targetGoalIds.join(",")}` : "";
  const key = candidate.canonicalKey ? ` [${candidate.canonicalKey}]` : "";
  return `${candidate.classification}/${candidate.memoryDestination}/${candidate.informationType}/${candidate.temporal.state}${target}${key}: ${candidate.proposedText}`;
}

async function main() {
  const provider = process.env.AI_PROVIDER?.trim().toLocaleLowerCase() || "gemini";
  const keyByProvider: Record<string, string> = {
    gemini: "GEMINI_API_KEY",
    groq: "GROQ_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
  };
  const keyName = keyByProvider[provider];
  if (!keyName || !process.env[keyName]?.trim()) {
    throw new Error(`Real provider ${provider} is not configured for this local evaluation.`);
  }

  const { IMPORT_EXTRACTION_QA_FIXTURES } = await import(
    "../src/lib/imports/qa-import-extraction-fixtures"
  );
  const requestedFixture = process.argv
    .find((argument) => argument.startsWith("--fixture="))
    ?.slice("--fixture=".length);
  const fixtures = requestedFixture
    ? IMPORT_EXTRACTION_QA_FIXTURES.filter((fixture) => fixture.id === requestedFixture)
    : IMPORT_EXTRACTION_QA_FIXTURES;
  if (fixtures.length === 0) throw new Error(`Unknown fixture ${requestedFixture}.`);
  console.log(`Almanac import extraction evaluation — real ${provider} provider, fictional data only`);

  const results = [];
  for (const fixture of fixtures) {
    console.log(`\nEvaluating ${fixture.label}...`);
    results.push(await evaluateFixture(fixture));
  }

  for (const result of results) {
    console.log(`\n=== ${result.fixture.label}: ${result.score}/100 ${result.pass ? "PASS" : "NEEDS WORK"} ===`);
    console.log(
      `segments=${result.segments} candidates=${result.candidates.length} primary=${result.partition.primary.length}/${result.fixture.maxPrimary ?? 5} overflow=${result.partition.overflow.length} retained=${result.partition.retainedOnly.length}`,
    );
    if (result.contractErrors.length > 0) {
      for (const error of result.contractErrors) {
        console.log(`CONTRACT FAIL segment ${error.segment}: ${error.message}`);
      }
    }
    for (const expectation of result.expectationResults) {
      if (!expectation.match) {
        console.log(`MISS ${expectation.expectation.id}: ${expectation.expectation.description}`);
        continue;
      }
      const failed = expectation.checks.filter((check) => !check.pass).map((check) => check.label);
      console.log(
        `${failed.length === 0 ? "OK" : "FIELD"} ${expectation.expectation.id}${
          failed.length > 0 ? ` (wrong: ${failed.join(", ")})` : ""
        }`,
      );
    }
    for (const violation of result.safetyViolations) console.log(`SAFETY ${violation}`);
    console.log("Candidates:");
    for (const candidate of result.candidates) console.log(`- ${conciseCandidate(candidate)}`);
  }

  const average = Math.round(results.reduce((total, result) => total + result.score, 0) / results.length);
  const allPassed = results.every((result) => result.pass);
  console.log(`\nOverall: ${average}/100 — ${allPassed ? "PASS" : "NEEDS WORK"}`);
  process.exitCode = allPassed ? 0 : 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exitCode = 1;
});
