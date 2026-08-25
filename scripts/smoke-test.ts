/**
 * Read-only smoke test for the persisted Almanac API.
 *
 * Requires SMOKE_EMAIL/SMOKE_PASSWORD (or SMOKE_COOKIE) and SMOKE_BASE_URL.
 * It never creates, updates or deletes user data.
 */
import { z } from "zod";
import {
  apiFetch,
  defaultScriptCredentials,
  getApiBaseUrl,
  loginWithCredentials,
} from "./lib/script-http";

const projectionSchema = z.object({
  atlas: z.object({
    places: z.array(z.object({ id: z.string(), name: z.string() }).passthrough()),
    updates: z.array(
      z
        .object({
          id: z.string(),
          importId: z.string(),
          placeId: z.string(),
          text: z.string(),
        })
        .passthrough(),
    ),
    imports: z.array(
      z.object({ id: z.string(), rawPacket: z.string() }).passthrough(),
    ),
  }),
});

async function main() {
  const base = getApiBaseUrl();
  const healthResponse = await fetch(`${base}/api/health`);
  const health = (await healthResponse.json()) as { ok?: boolean; db?: string };
  if (!healthResponse.ok || !health.ok || health.db !== "up") {
    throw new Error(`Health failed: HTTP ${healthResponse.status}, db=${health.db ?? "unknown"}`);
  }
  console.log("PASS  GET /api/health");

  const { email, password } = defaultScriptCredentials();
  const session = await loginWithCredentials(email, password);
  console.log("PASS  credentials session");

  const response = await apiFetch(session, "/api/almanac");
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`GET /api/almanac failed: HTTP ${response.status}`);
  }
  const parsed = projectionSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(
      `GET /api/almanac returned an invalid projection: ${parsed.error.issues[0]?.message}`,
    );
  }
  console.log(
    `PASS  GET /api/almanac (${parsed.data.atlas.places.length} subjects, ${parsed.data.atlas.updates.length} updates, ${parsed.data.atlas.imports.length} responses)`,
  );
}

void main().catch((error) => {
  console.error("Almanac smoke FAILED:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
