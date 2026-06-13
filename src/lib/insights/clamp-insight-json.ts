/** Max lengths aligned with Zod schemas in insight-types / pursuit-enrich-types. */
export const PURSUIT_INSIGHT_HEADLINE_MAX = 100;
export const PURSUIT_INSIGHT_BODY_MAX = 500;

function truncateString(value: unknown, max: number): unknown {
  if (typeof value !== "string") return value;
  if (value.length <= max) return value;
  return value.slice(0, max).trimEnd();
}

function clampPursuitInsightFields(row: Record<string, unknown>): void {
  if ("headline" in row) {
    row.headline = truncateString(row.headline, PURSUIT_INSIGHT_HEADLINE_MAX);
  }
  if ("body" in row) {
    row.body = truncateString(row.body, PURSUIT_INSIGHT_BODY_MAX);
  }
}

function clampPursuitsMap(pursuits: unknown): void {
  if (!pursuits || typeof pursuits !== "object" || Array.isArray(pursuits)) return;
  for (const entry of Object.values(pursuits as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    if ("headline" in row || "body" in row) {
      clampPursuitInsightFields(row);
    }
    if (row.insight && typeof row.insight === "object" && !Array.isArray(row.insight)) {
      clampPursuitInsightFields(row.insight as Record<string, unknown>);
    }
  }
}

function clampInsightsBranch(insights: unknown): void {
  if (!insights || typeof insights !== "object" || Array.isArray(insights)) return;
  const branch = insights as Record<string, unknown>;
  if (branch.pursuits) {
    clampPursuitsMap(branch.pursuits);
  }
}

/**
 * Clamp Gemini JSON before Zod parse — avoids hard failures when headline/body exceed max length.
 */
export function clampInsightGenerationJson(json: unknown): unknown {
  if (!json || typeof json !== "object" || Array.isArray(json)) return json;
  const root = { ...(json as Record<string, unknown>) };

  if (root.insights) {
    clampInsightsBranch(root.insights);
  }

  clampInsightsBranch(root);
  clampPursuitsMap(root.pursuits);

  return root;
}
