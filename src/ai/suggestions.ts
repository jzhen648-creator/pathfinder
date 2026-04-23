/**
 * AI — Suggestions
 *
 * Shared client for requesting AI-powered branch suggestions.
 */

export async function getSuggestions(payload: unknown) {
  const response = await fetch("/api/life-map/suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.json();
}

