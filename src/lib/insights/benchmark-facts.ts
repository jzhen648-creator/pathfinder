import type { FormattedMapContext } from "@/lib/ai/format-map-context";

/** Maintainer-updated — see source comments; not fetched at runtime. */
export const BENCHMARK_FACTS_AS_OF = "2025-26 UK tax year";

export type BenchmarkPursuitRow = {
  id: string;
  themeId: string;
  title: string;
  targetAmount?: number;
  currentAmount?: number;
  unit?: string;
  enrichAnswerCount: number;
};

export type BenchmarkFactsInput = {
  age: number | null;
  location: string | null;
  themeIds: string[];
  pursuits: BenchmarkPursuitRow[];
};

function locationLooksUk(location: string | null | undefined): boolean {
  const text = location?.trim().toLowerCase() ?? "";
  if (!text) return true;
  return (
    text.includes("uk") ||
    text.includes("united kingdom") ||
    text.includes("england") ||
    text.includes("scotland") ||
    text.includes("wales") ||
    text.includes("london") ||
    text.includes("manchester") ||
    text.includes("birmingham") ||
    text.includes("edinburgh") ||
    text.includes("cardiff") ||
    text.includes("belfast")
  );
}

function ageBandLabel(age: number | null): string | null {
  if (age == null) return null;
  if (age < 25) return "under-25";
  if (age <= 34) return "25-34";
  if (age <= 44) return "35-44";
  if (age <= 54) return "45-54";
  return "55+";
}

function pursuitsInTheme(pursuits: BenchmarkPursuitRow[], themeId: string): BenchmarkPursuitRow[] {
  return pursuits.filter((p) => p.themeId === themeId);
}

function themeHasQuantifiedPursuit(pursuits: BenchmarkPursuitRow[]): boolean {
  return pursuits.some(
    (p) => (p.targetAmount ?? 0) > 0 || (p.currentAmount ?? 0) > 0,
  );
}

function financeFacts(age: number | null, pursuits: BenchmarkPursuitRow[]): string[] {
  const lines: string[] = [
    `finance: UK ISA annual subscription limit approx £20,000 (${BENCHMARK_FACTS_AS_OF}).`,
  ];
  const band = ageBandLabel(age);
  if (band === "25-34") {
    lines.push(
      "finance: ONS wealth survey — households with reference person 25-34: median total wealth often quoted in approx £20k-£100k band (rounded; varies by housing and pensions).",
    );
  } else if (band) {
    lines.push(
      `finance: age band ${band} — use rounded ONS/HMRC public norms only; state approx when citing.`,
    );
  }
  if (themeHasQuantifiedPursuit(pursuits)) {
    lines.push(
      "finance: compare user's targetAmount/currentAmount on map to allowance and age-band norms; do not invent percentiles.",
    );
  }
  return lines;
}

function workFacts(_age: number | null, pursuits: BenchmarkPursuitRow[]): string[] {
  const lines = [
    "work: part-time professional qualifications (e.g. CeMAP, DipPFS) often quoted at 6-12 months part-time — use approx ranges only.",
    "work: cite salary bands only when enrichAnswers or pursuit title imply a specific role and user location is known.",
  ];
  if (pursuits.some((p) => p.enrichAnswerCount > 0)) {
    lines.push("work: use answered enrichAnswers (role type, location, employed vs independent) to anchor benchmarks.");
  }
  return lines;
}

function healthFacts(): string[] {
  return [
    "health: couch-to-5k style plans often use approx 8-10 weeks; half-marathon prep commonly quoted at 12-16 weeks from a 5k base — ranges only.",
    "health: compare logged milestone pace to these bands when deadline and completions exist on the map.",
  ];
}

function peopleFacts(): string[] {
  return [
    "people: visa and language-test timelines vary by route — cite only broad process windows when enrichAnswers name a route; omit if unsure.",
  ];
}

function becomingFacts(): string[] {
  return [
    "becoming: course or skill pursuits — use broad completion-time norms only when title/deadline support it; often no defensible stat.",
  ];
}

const THEME_FACT_BUILDERS: Record<
  string,
  (age: number | null, pursuits: BenchmarkPursuitRow[]) => string[]
> = {
  finance: financeFacts,
  work: workFacts,
  health: (_age, _pursuits) => healthFacts(),
  people: (_age, _pursuits) => peopleFacts(),
  becoming: (_age, _pursuits) => becomingFacts(),
};

/** True when theme has enough signal for a Comparison benchmark attempt. */
export function benchmarkFactsApplicable(
  themeId: string,
  pursuits: BenchmarkPursuitRow[],
  age: number | null,
  location: string | null,
): boolean {
  const inTheme = pursuitsInTheme(pursuits, themeId);
  if (inTheme.length === 0) return false;

  const hasProfile = age != null || Boolean(location?.trim());
  if (!hasProfile && !themeHasQuantifiedPursuit(inTheme)) return false;

  if (themeId === "finance" || themeId === "work") {
    return locationLooksUk(location) && (hasProfile || themeHasQuantifiedPursuit(inTheme));
  }
  if (themeId === "health") {
    return inTheme.some((p) => p.enrichAnswerCount > 0 || (p.targetAmount ?? 0) > 0) && hasProfile;
  }
  if (themeId === "people" || themeId === "becoming") {
    return inTheme.some((p) => p.enrichAnswerCount >= 1) && hasProfile;
  }
  return hasProfile && themeHasQuantifiedPursuit(inTheme);
}

/** Compact fact bullets for reflect user message — null when nothing applies. */
export function buildBenchmarkFactsBlock(input: BenchmarkFactsInput): string | null {
  const lines: string[] = [`asOf: ${BENCHMARK_FACTS_AS_OF}`];
  if (input.age != null) lines.push(`userAge: ${input.age}`);
  if (input.location?.trim()) lines.push(`userLocation: ${input.location.trim()}`);

  let addedThemeFacts = false;
  for (const themeId of input.themeIds) {
    if (!benchmarkFactsApplicable(themeId, input.pursuits, input.age, input.location)) {
      continue;
    }
    const builder = THEME_FACT_BUILDERS[themeId];
    if (!builder) continue;
    const themeLines = builder(input.age, pursuitsInTheme(input.pursuits, themeId));
    for (const line of themeLines) {
      lines.push(line);
      addedThemeFacts = true;
    }
  }

  if (!addedThemeFacts) return null;
  lines.push(
    "RULE: contextual (theme) and pursuit comparison fields may cite ONLY these facts plus map quantified fields and enrichAnswers — never invent other statistics.",
  );
  return lines.join("\n");
}

export function flattenBenchmarkPursuitsFromMapContext(
  mapContext: FormattedMapContext,
): BenchmarkPursuitRow[] {
  const rows: BenchmarkPursuitRow[] = [];
  for (const theme of mapContext.themes) {
    for (const category of theme.categories) {
      for (const pursuit of category.pursuits) {
        rows.push({
          id: pursuit.id,
          themeId: theme.id,
          title: pursuit.title,
          targetAmount: pursuit.targetAmount,
          currentAmount: pursuit.currentAmount,
          unit: pursuit.unit,
          enrichAnswerCount: pursuit.enrichAnswers?.length ?? 0,
        });
      }
    }
  }
  return rows;
}

export function parseAgeFromUserContext(userContext: string): number | null {
  const match = /^Age:\s*(\d+)/m.exec(userContext);
  if (!match) return null;
  const age = Number.parseInt(match[1]!, 10);
  return Number.isFinite(age) && age >= 0 ? age : null;
}

export function parseLocationFromUserContext(userContext: string): string | null {
  const match = /^Location:\s*(.+)$/m.exec(userContext);
  const value = match?.[1]?.trim();
  return value || null;
}
