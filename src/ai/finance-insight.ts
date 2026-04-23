/**
 * AI — Finance Insight
 *
 * Shared client for generating short finance reflections.
 */

export async function getFinanceInsight(payload: unknown) {
  const response = await fetch("/api/life-map/finance-reflection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.json();
}

