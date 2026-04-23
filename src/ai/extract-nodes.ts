/**
 * AI — Extract Nodes
 *
 * Shared client for converting natural language into structured life-map nodes.
 */

export async function extractNodes(payload: unknown) {
  const response = await fetch("/api/life-map/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.json();
}

